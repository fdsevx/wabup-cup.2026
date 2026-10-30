import 'dotenv/config';
import { pool } from './config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { isB2Configured, deleteB2Objects } from './b2';
import { ensureMediaColumns } from './db/mediaSchema';

export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`scrypt$${salt}$${derivedKey.toString('hex')}`);
    });
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  if (!hash.startsWith('scrypt$')) {
    return password === hash;
  }
  return new Promise((resolve, reject) => {
    const parts = hash.split('$');
    if (parts.length !== 3) return resolve(false);
    const salt = parts[1];
    const key = parts[2];
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      try {
        const keyBuffer = Buffer.from(key, 'hex');
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch (e) {
        resolve(false);
      }
    });
  });
}

// Hash tiruan valid untuk menyetarakan waktu komputasi saat username tidak ditemukan (mencegah timing attack & enumerasi)
export const DUMMY_SCRYPT_HASH = 'scrypt$d04130089e0ad78f5664d99e557224f8$20412e8b2b73bc367408d6d6719b22a07d32a0c7eb16c87e45214ad6e87f2ffbe88dbd144ba972e35a1a1e7b8c73b062aa48d6728da5e02e860959eeea50c58a';

import {
  DEFAULT_ADMIN_USERS,
  DEFAULT_CATEGORIES,
  DEFAULT_TOURNAMENT_CONFIG,
  DEFAULT_SECTIONS_VISIBILITY,
} from './defaultSystemData';
import {
  CategoryDetail,
  MatchItem,
  RegistrationItem,
  SponsorItem,
  TournamentConfig,
  AdminUser,
  CommitteeContact,
  CommitteeBankAccount,
  DownloadableDoc,
  PlayerItem,
  TeamStandingItem,
  GroupStageItem,
} from '../src/types';
import { generateUniqueRegCode } from '../src/utils/registrationCode';

// In-Memory Storage Fallback (used when MySQL host is not configured or in preview mode)
export interface AppMediaItem {
  id: string;
  category: string; // 'REG_DOC' | 'TEAM_LOGO' | 'CMS_WALLPAPER' | 'SPONSOR_LOGO' | 'GENERAL'
  refId?: string;
  subKey?: string;
  filename: string;
  contentType: string;
  fileSize: number;
  fileData: string;
  storage?: 'db' | 'b2'; // 'b2' = file ada di Backblaze B2, file_data kosong
  fileKey?: string; // key objek di B2
  createdAt?: string;
  updatedAt?: string;
}

class MemoryStore {
  config: TournamentConfig = { ...DEFAULT_TOURNAMENT_CONFIG };
  categories: CategoryDetail[] = [...DEFAULT_CATEGORIES];
  registrations: RegistrationItem[] = [];
  matches: MatchItem[] = [];
  sponsors: SponsorItem[] = [];
  adminUsers: AdminUser[] = [...DEFAULT_ADMIN_USERS];
  players: PlayerItem[] = [];
  groups: GroupStageItem[] = [];
  media: Map<string, AppMediaItem> = new Map();
}

const memStore = new MemoryStore();

// In-Memory caches with short TTL to drastically reduce TiDB Cloud RU consumption
let categoriesCache: { data: CategoryDetail[]; timestamp: number } | null = null;
let categoryQuotasCache: { data: Array<{ id: string; maxTeams: number; registeredTeamsCount: number }>; timestamp: number } | null = null;
let matchesCache: { data: MatchItem[]; timestamp: number } | null = null;
let playersCache: Map<string, { data: PlayerItem[]; timestamp: number }> = new Map();
let standingsDbCache: Map<string, { data: Record<string, TeamStandingItem[]>; timestamp: number }> = new Map();
let publicRegistrationsCache: { data: any[]; timestamp: number } | null = null;
let configCache: { data: TournamentConfig; timestamp: number } | null = null;
let sponsorsCache: { data: SponsorItem[]; timestamp: number } | null = null;
let groupsCache: Map<string, { data: GroupStageItem[]; timestamp: number }> = new Map();
let mediaMetaCache: Map<string, { data: Omit<AppMediaItem, 'fileData'> | null; timestamp: number }> = new Map();

export function invalidateCategoriesCache() {
  categoriesCache = null;
  categoryQuotasCache = null;
}

export function invalidateMatchesCache() {
  matchesCache = null;
}

export function invalidatePlayersCache() {
  playersCache.clear();
}

export function invalidateStandingsCache() {
  standingsDbCache.clear();
}

export function invalidatePublicRegistrationsCache() {
  publicRegistrationsCache = null;
}

export function invalidateConfigCache() {
  configCache = null;
}

export function invalidateSponsorsCache() {
  sponsorsCache = null;
}

export function invalidateGroupsCache() {
  groupsCache.clear();
}

export function invalidateMediaMetaCache(id?: string) {
  if (id) {
    mediaMetaCache.delete(id);
  } else {
    mediaMetaCache.clear();
  }
}

export function loadLocalStore(): void {}
export function persistLocalStore(): void {}
let isMySqlConnected = false;
let mySqlError: string | null = null;

export function getMySqlStatus() {
  return {
    connected: isMySqlConnected,
    host: process.env.TIDB_HOST || 'From ENV',
    database: process.env.TIDB_DATABASE || 'wabupcup2026',
    error: mySqlError,
    mode: isMySqlConnected ? 'MYSQL_REAL' : 'MEMORY_FALLBACK',
    stats: {
      categoriesCount: memStore.categories.length,
      registrationsCount: memStore.registrations.length,
      matchesCount: memStore.matches.length,
      sponsorsCount: memStore.sponsors.length,
      adminsCount: memStore.adminUsers.length,
    },
  };
}

let dbInitPromise: Promise<boolean> | null = null;

export async function ensureDbConnected(): Promise<boolean> {
  if (isMySqlConnected) return true;
  if (!dbInitPromise) {
    dbInitPromise = initDatabaseConnection().finally(() => { dbInitPromise = null; });
  }
  try {
    return await dbInitPromise;
  } catch {
    return isMySqlConnected;
  }
}

export async function initDatabaseConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    isMySqlConnected = true;
    mySqlError = null;
    await autoMigrateTables();
    return true;
  } catch (err: any) {
    isMySqlConnected = false;
    mySqlError = err?.message || 'Failed to connect to TiDB';
    console.error('[MySQL Warning] Could not connect:', mySqlError);
    return false;
  }
}

let isSchemaChecked = false;

async function autoMigrateTables() {
  if (!pool || !isMySqlConnected || isSchemaChecked) return;

  try {
    // Only run schema initialization once per process lifecycle to prevent repetitive DDL on cold starts
    await runFullSchemaInit();
    await ensureMediaColumns(pool);
    isSchemaChecked = true;
  } catch (err) {
    console.error('[MySQL] Error checking tables:', err);
  }
}

/**
 * 4c. Penyemaian admin awal:
 * Hanya jika tabel admin_users KOSONG dan env INITIAL_ADMIN_USERNAME dan INITIAL_ADMIN_PASSWORD (minimal 12 karakter) terisi.
 * Membuat SATU akun SUPERADMIN dengan password di-hash scrypt (hashPassword).
 * Jika env tidak lengkap, jangan menyemai apa pun dan cetak peringatan tanpa nilai rahasia.
 */
export async function seedInitialAdminIfConfigured(): Promise<boolean> {
  const initUser = (process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase();
  const initPass = (process.env.INITIAL_ADMIN_PASSWORD || '').trim();

  if (!initUser || !initPass) {
    console.warn('[Security] Tabel admin_users kosong dan INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD tidak dikonfigurasi. Tidak ada akun admin bawaan yang dibuat.');
    return false;
  }

  if (initPass.length < 12) {
    console.warn('[Security] INITIAL_ADMIN_PASSWORD kurang dari 12 karakter. Penyemaian admin awal dibatalkan demi keamanan.');
    return false;
  }

  const passHash = await hashPassword(initPass);
  const adminId = `adm-${Date.now()}`;

  if (pool && isMySqlConnected) {
    try {
      await pool.query(
        `INSERT INTO admin_users (id, username, password_hash, full_name, role, email, phone, avatar_color)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adminId,
          initUser,
          passHash,
          'Administrator Utama',
          'SUPERADMIN',
          null,
          null,
          'bg-red-600',
        ]
      );
      console.log(`[Security] Berhasil menyemai 1 akun SUPERADMIN awal (${initUser}) dengan scrypt password hash.`);
    } catch (err: any) {
      console.error('[Security] Gagal menyemai admin awal ke MySQL:', err?.message || err);
      return false;
    }
  }

  const safeAdmin: AdminUser = {
    id: adminId,
    username: initUser,
    fullName: 'Administrator Utama',
    role: 'SUPERADMIN',
    email: '',
    phone: '',
    avatarColor: 'bg-red-600',
    createdAt: new Date().toISOString().split('T')[0],
  };
  const memIdx = memStore.adminUsers.findIndex(a => a.username.toLowerCase() === initUser);
  if (memIdx >= 0) {
    memStore.adminUsers[memIdx] = safeAdmin;
  } else {
    memStore.adminUsers.push(safeAdmin);
  }

  return true;
}

export async function runFullSchemaInit() {
  if (!pool || !isMySqlConnected) {
    return { success: true, message: 'In-memory data reloaded successfully' };
  }

  try {
    await pool.query('SET FOREIGN_KEY_CHECKS = 0;');
  } catch {}

  const queries = [
    `CREATE TABLE IF NOT EXISTS categories (
      id VARCHAR(32) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      badge_title VARCHAR(100) NULL,
      age_restriction VARCHAR(100) NOT NULL,
      max_teams INT NOT NULL DEFAULT 16,
      registered_teams_count INT NOT NULL DEFAULT 0,
      registration_fee DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      total_prize DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      description TEXT NULL,
      prizes_json JSON NULL,
      rules_json JSON NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS registrations (
      id VARCHAR(64) PRIMARY KEY,
      reg_code VARCHAR(32) NOT NULL UNIQUE,
      category_id VARCHAR(32) NOT NULL,
      team_name VARCHAR(150) NOT NULL,
      team_logo LONGTEXT NULL,
      institution_name VARCHAR(200) NOT NULL,
      coach_name VARCHAR(150) NOT NULL,
      coach_phone VARCHAR(50) NOT NULL,
      coach_email VARCHAR(150) NULL,
      player_count INT NOT NULL DEFAULT 18,
      official_count INT NOT NULL DEFAULT 3,
      registration_date VARCHAR(50) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'PENDING_PAYMENT',
      payment_status VARCHAR(32) NOT NULL DEFAULT 'UNPAID',
      payment_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      rejection_reason TEXT NULL,
      admin_notes TEXT NULL,
      documents_json JSON NULL,
      last_updated VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS matches (
      id VARCHAR(64) PRIMARY KEY,
      match_number INT NOT NULL,
      category_id VARCHAR(32) NOT NULL,
      round_name VARCHAR(100) NOT NULL,
      round_index INT NOT NULL DEFAULT 1,
      group_name VARCHAR(50) NULL,
      team_a_name VARCHAR(150) NOT NULL,
      team_a_institution VARCHAR(200) NULL,
      team_a_logo LONGTEXT NULL,
      team_a_score INT NULL,
      team_a_penalties INT NULL,
      team_b_name VARCHAR(150) NOT NULL,
      team_b_institution VARCHAR(200) NULL,
      team_b_logo LONGTEXT NULL,
      team_b_score INT NULL,
      team_b_penalties INT NULL,
      match_date VARCHAR(20) NOT NULL,
      match_time VARCHAR(20) NOT NULL,
      pitch VARCHAR(100) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'UPCOMING',
      live_minute VARCHAR(20) NULL,
      events_json JSON NULL,
      winner_id VARCHAR(10) NULL,
      next_match_id VARCHAR(64) NULL,
      next_match_slot VARCHAR(10) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS sponsors (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      tier VARCHAR(50) NOT NULL DEFAULT 'GOLD',
      logo_text VARCHAR(100) NOT NULL,
      logo_url LONGTEXT NULL,
      website_url VARCHAR(255) NULL,
      description TEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS admin_users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(150) NOT NULL,
      role VARCHAR(64) NOT NULL DEFAULT 'PANITIA_INTI',
      email VARCHAR(150) NULL,
      phone VARCHAR(50) NULL,
      avatar_color VARCHAR(30) NOT NULL DEFAULT 'bg-red-600',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS tournament_config (
      config_key VARCHAR(64) PRIMARY KEY,
      config_value LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS app_media_storage (
      id VARCHAR(64) PRIMARY KEY,
      category VARCHAR(32) NOT NULL,
      ref_id VARCHAR(64) NULL,
      sub_key VARCHAR(64) NULL,
      filename VARCHAR(255) NOT NULL,
      content_type VARCHAR(100) NOT NULL,
      file_size INT NOT NULL,
      file_data LONGTEXT NOT NULL,
      storage VARCHAR(8) NOT NULL DEFAULT 'db',
      file_key VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_category (category),
      INDEX idx_ref_id (ref_id),
      INDEX idx_sub_key (sub_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS table_players (
      id VARCHAR(64) PRIMARY KEY,
      team_id VARCHAR(64) NULL,
      team_name VARCHAR(150) NOT NULL,
      category_id VARCHAR(32) NOT NULL,
      name VARCHAR(150) NOT NULL,
      jersey_number INT NOT NULL DEFAULT 0,
      position VARCHAR(50) NOT NULL DEFAULT 'Flank',
      goals INT NOT NULL DEFAULT 0,
      yellow_cards INT NOT NULL DEFAULT 0,
      red_cards INT NOT NULL DEFAULT 0,
      photo_url LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_team (team_name),
      INDEX idx_category (category_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS tournament_groups (
      id VARCHAR(64) PRIMARY KEY,
      category_id VARCHAR(32) NOT NULL,
      group_name VARCHAR(50) NOT NULL,
      teams_json JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cat_group (category_id, group_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS table_standings (
      id VARCHAR(128) PRIMARY KEY,
      category_id VARCHAR(32) NOT NULL,
      group_name VARCHAR(50) NOT NULL,
      team_name VARCHAR(150) NOT NULL,
      team_id VARCHAR(64) NULL,
      institution_name VARCHAR(200) NULL,
      team_logo LONGTEXT NULL,
      position INT NOT NULL DEFAULT 0,
      played INT NOT NULL DEFAULT 0,
      won INT NOT NULL DEFAULT 0,
      drawn INT NOT NULL DEFAULT 0,
      lost INT NOT NULL DEFAULT 0,
      goals_for INT NOT NULL DEFAULT 0,
      goals_against INT NOT NULL DEFAULT 0,
      goal_difference INT NOT NULL DEFAULT 0,
      points INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_standing_cat_group (category_id, group_name),
      INDEX idx_standing_team (team_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS admin_login_attempts (
      key_hash VARCHAR(64) PRIMARY KEY,
      failed_count INT NOT NULL DEFAULT 0,
      first_failed_at DATETIME NOT NULL,
      locked_until DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
  ];

  for (const q of queries) {
    try {
      await pool.query(q);
    } catch (qErr: any) {
      console.warn('[MySQL Schema Init] Non-blocking notice for query:', qErr?.message || qErr);
    }
  }

  try {
    await pool.query('SET FOREIGN_KEY_CHECKS = 1;');
  } catch {}

  // Seed default categories if empty
  const [catRows]: any = await pool.query('SELECT COUNT(*) as count FROM categories');
  if (catRows[0].count === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await pool.query(
        `INSERT INTO categories (id, name, badge_title, age_restriction, max_teams, registered_teams_count, registration_fee, total_prize, description, prizes_json, rules_json) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cat.id,
          cat.name,
          cat.badgeTitle || '',
          cat.ageRestriction,
          cat.maxTeams,
          cat.registeredTeamsCount,
          cat.registrationFee,
          cat.totalPrize,
          cat.description || '',
          JSON.stringify(cat.prizes),
          JSON.stringify(cat.rules),
        ]
      );
    }
  }

  // Seed initial admin user only if table is empty and env is provided
  const [admRows]: any = await pool.query('SELECT COUNT(*) as count FROM admin_users');
  if (admRows[0].count === 0) {
    await seedInitialAdminIfConfigured();
  }

  // Seed default config if empty
  const [cfgRows]: any = await pool.query('SELECT COUNT(*) as count FROM tournament_config');
  if (cfgRows[0].count === 0) {
    await pool.query(
      `INSERT INTO tournament_config (config_key, config_value) VALUES (?, ?)`,
      ['main_config', JSON.stringify(DEFAULT_TOURNAMENT_CONFIG)]
    );
  }

  return { success: true, message: 'MySQL Database Tables Initialized and Seeded Successfully' };
}

// ----------------------------------------------------
// DATABASE SERVICE METHODS (WITH AUTOMATIC HYBRID RESOLVER)
// ----------------------------------------------------

function sanitizeRegistrationDocuments(rawDocs: any, regId: string): Record<string, any> {
  const docs = typeof rawDocs === 'string' ? JSON.parse(rawDocs) : (rawDocs || {});
  const sanitized: Record<string, any> = {};

  for (const [key, doc] of Object.entries(docs)) {
    if (!doc || typeof doc !== 'object') continue;
    const d = doc as any;

    let url = d.url;
    if (!url && typeof d.fileData === 'string' && (d.fileData.startsWith('/api/') || d.fileData.startsWith('http://') || d.fileData.startsWith('https://'))) {
      url = d.fileData;
    }
    if (!url && typeof d.previewUrl === 'string' && (d.previewUrl.startsWith('/api/') || d.previewUrl.startsWith('http://') || d.previewUrl.startsWith('https://'))) {
      url = d.previewUrl;
    }
    // Fallback: If doc has raw base64 and no URL, point to on-demand stream endpoint
    if (!url && d.fileData && (d.fileData.startsWith('data:') || d.fileData.length > 200)) {
      url = `/api/registrations/${regId}/doc/${key}`;
    }

    sanitized[key] = {
      name: d.name || 'Dokumen',
      size: d.size || 'Ukuran tidak diketahui',
      uploadDate: d.uploadDate || '',
      type: d.type || 'application/pdf',
      url: url || undefined,
      // CRITICAL FOR FOT: Never send heavy base64 strings in the registrations list!
      // Setting fileData to the url ensures components that read doc.fileData still work without re-downloading base64!
      fileData: url || undefined,
    };
  }

  return sanitized;
}

/**
 * Hapus objek B2 milik baris app_media_storage yang akan dihapus.
 * Dipanggil SEBELUM DELETE ke database; kegagalan tidak boleh menghalangi penghapusan baris.
 */
async function purgeB2Objects(where: string, params: any[]): Promise<void> {
  if (!pool || !isMySqlConnected || !isB2Configured()) return;
  try {
    const [rows]: any = await pool.query(
      `SELECT file_key FROM app_media_storage WHERE storage = 'b2' AND file_key IS NOT NULL AND (${where})`,
      params
    );
    const keys = (rows as any[]).map((r) => String(r.file_key)).filter(Boolean);
    if (keys.length) await deleteB2Objects(keys);
  } catch (err) {
    console.warn('[purgeB2Objects] dilewati:', (err as any)?.message || err);
  }
}

function sanitizeAdminUser(admin: any): AdminUser {
  if (!admin) return admin;
  const { password, password_hash, ...rest } = admin;
  return rest as AdminUser;
}

export const Database = {
  // Config
  async getConfig(forceRefresh = false): Promise<TournamentConfig> {
    if (!forceRefresh && configCache && Date.now() - configCache.timestamp < 120000) {
      return configCache.data;
    }
    await ensureDbConnected();
    let result: TournamentConfig = {
      ...memStore.config,
      sectionsVisibility: {
        ...DEFAULT_SECTIONS_VISIBILITY,
        ...(memStore.config.sectionsVisibility || {}),
      },
    };
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT config_value FROM tournament_config WHERE config_key = ?', ['main_config']);
        if (rows.length > 0) {
          const parsed = JSON.parse(rows[0].config_value);
          result = {
            ...DEFAULT_TOURNAMENT_CONFIG,
            ...parsed,
            sectionsVisibility: {
              ...DEFAULT_SECTIONS_VISIBILITY,
              ...(parsed.sectionsVisibility || {}),
            },
          };
        }
      } catch (err) {
        console.error('Error fetching config from MySQL:', err);
      }
    }
    configCache = { data: result, timestamp: Date.now() };
    return result;
  },

  async updateConfig(newConfig: Partial<TournamentConfig>): Promise<TournamentConfig> {
    invalidateConfigCache();
    await ensureDbConnected();
    const current = await this.getConfig();
    const updated: TournamentConfig = {
      ...current,
      ...newConfig,
      bankAccounts:
        newConfig.bankAccounts !== undefined
          ? newConfig.bankAccounts
          : current.bankAccounts || [],
      bankAccount:
        newConfig.bankAccount !== undefined
          ? newConfig.bankAccount
          : current.bankAccount,
      committeeContacts:
        newConfig.committeeContacts !== undefined
          ? newConfig.committeeContacts
          : current.committeeContacts || [],
      committeeEmails:
        newConfig.committeeEmails !== undefined
          ? newConfig.committeeEmails
          : current.committeeEmails || [],
      downloadableDocs:
        newConfig.downloadableDocs !== undefined
          ? newConfig.downloadableDocs
          : current.downloadableDocs || [],
      sectionsBackgrounds: {
        ...(current.sectionsBackgrounds || {}),
        ...(newConfig.sectionsBackgrounds || {}),
      },
      sectionsVisibility: {
        ...DEFAULT_SECTIONS_VISIBILITY,
        ...(current.sectionsVisibility || {}),
        ...(newConfig.sectionsVisibility || {}),
      },
    };

    // Offload any large Base64 data URIs from config into app_media_storage table
    // so tournament_config JSON stays tiny (<20KB) and NEVER breaches TiDB max entry size limit (6MB)
    const offloadMedia = async (
      dataUri: string | undefined,
      category: string,
      filename: string,
      refId: string,
      subKey: string
    ): Promise<string | undefined> => {
      if (!dataUri || !dataUri.startsWith('data:') || dataUri.length < 200) {
        return dataUri;
      }
      try {
        const id = `med-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        const mimeMatch = dataUri.match(/^data:([^;]+);base64,/);
        const contentType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        const base64Content = dataUri.replace(/^data:[^;]+;base64,/, '');
        const fileSize = Math.round((base64Content.length * 3) / 4);

        await Database.saveMedia({
          id,
          category,
          refId,
          subKey,
          filename,
          contentType,
          fileSize,
          fileData: dataUri,
        });

        return `/api/media/view/${id}`;
      } catch (err) {
        console.error('Failed to offload Base64 to app_media_storage:', err);
        return dataUri;
      }
    };

    // 1. Offload downloadable documents
    if (updated.downloadableDocs && updated.downloadableDocs.length > 0) {
      for (let i = 0; i < updated.downloadableDocs.length; i++) {
        const doc = updated.downloadableDocs[i];
        if (doc.fileUrl && doc.fileUrl.startsWith('data:')) {
          const offloadedUrl = await offloadMedia(
            doc.fileUrl,
            'CMS_DOC',
            doc.fileName || `${(doc.title || 'dokumen').replace(/\s+/g, '_')}.${(doc.fileType || 'pdf').toLowerCase()}`,
            'config_doc',
            doc.id || `doc_${i}`
          );
          if (offloadedUrl) doc.fileUrl = offloadedUrl;
        }
      }
    }

    // 2. Offload primary template URLs
    if (updated.formulirTemplateUrl && updated.formulirTemplateUrl.startsWith('data:')) {
      const offloaded = await offloadMedia(
        updated.formulirTemplateUrl,
        'CMS_DOC',
        'Formulir_Pendaftaran.pdf',
        'config_template',
        'formulir'
      );
      if (offloaded) updated.formulirTemplateUrl = offloaded;
    }

    if (updated.suratPernyataanTemplateUrl && updated.suratPernyataanTemplateUrl.startsWith('data:')) {
      const offloaded = await offloadMedia(
        updated.suratPernyataanTemplateUrl,
        'CMS_DOC',
        'Surat_Pernyataan.pdf',
        'config_template',
        'surat_pernyataan'
      );
      if (offloaded) updated.suratPernyataanTemplateUrl = offloaded;
    }

    if (updated.regulasiPdfUrl && updated.regulasiPdfUrl.startsWith('data:')) {
      const offloaded = await offloadMedia(
        updated.regulasiPdfUrl,
        'CMS_DOC',
        'Buku_Regulasi.pdf',
        'config_template',
        'regulasi'
      );
      if (offloaded) updated.regulasiPdfUrl = offloaded;
    }

    // 3. Offload bank QRIS images
    const legacyBankAccount = updated.bankAccount as any;
    if (legacyBankAccount?.qrisImageUrl && typeof legacyBankAccount.qrisImageUrl === 'string' && legacyBankAccount.qrisImageUrl.startsWith('data:')) {
      const offloaded = await offloadMedia(
        legacyBankAccount.qrisImageUrl,
        'CMS_WALLPAPER',
        'QRIS_Bank.jpg',
        'config_bank',
        'qris'
      );
      if (offloaded) legacyBankAccount.qrisImageUrl = offloaded;
    }

    if (updated.bankAccounts && updated.bankAccounts.length > 0) {
      for (const b of updated.bankAccounts) {
        if (b.qrisImageUrl && b.qrisImageUrl.startsWith('data:')) {
          const offloaded = await offloadMedia(
            b.qrisImageUrl,
            'CMS_WALLPAPER',
            `QRIS_${b.id}.jpg`,
            'config_bank',
            b.id
          );
          if (offloaded) b.qrisImageUrl = offloaded;
        }
      }
    }

    // 4. Offload section background wallpapers
    if (updated.sectionsBackgrounds) {
      for (const [secKey, secBg] of Object.entries(updated.sectionsBackgrounds)) {
        if (secBg?.desktopImage && secBg.desktopImage.startsWith('data:')) {
          const offloaded = await offloadMedia(
            secBg.desktopImage,
            'CMS_WALLPAPER',
            `bg_${secKey}_desktop.jpg`,
            'config_bg',
            `${secKey}_desktop`
          );
          if (offloaded) secBg.desktopImage = offloaded;
        }
        if (secBg?.mobileImage && secBg.mobileImage.startsWith('data:')) {
          const offloaded = await offloadMedia(
            secBg.mobileImage,
            'CMS_WALLPAPER',
            `bg_${secKey}_mobile.jpg`,
            'config_bg',
            `${secKey}_mobile`
          );
          if (offloaded) secBg.mobileImage = offloaded;
        }
      }
    }

    memStore.config = updated;
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO tournament_config (config_key, config_value) VALUES (?, ?) 
           ON DUPLICATE KEY UPDATE config_value = ?`,
          ['main_config', JSON.stringify(updated), JSON.stringify(updated)]
        );
      } catch (err) {
        console.error('Error saving config to MySQL:', err);
      }
    }
    return updated;
  },

  // Memory caches to drastically reduce TiDB Cloud RU usage
  // Categories
  async getCategories(forceRefresh = false): Promise<CategoryDetail[]> {
    if (!forceRefresh && categoriesCache && Date.now() - categoriesCache.timestamp < 30000) {
      return categoriesCache.data;
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query(`
          SELECT c.*,
            COALESCE(r.actual_count, 0) AS actual_count
          FROM categories c
          LEFT JOIN (
            SELECT category_id, COUNT(*) AS actual_count
            FROM registrations
            WHERE status IN ('PENDING_PAYMENT', 'PENDING', 'APPROVED', 'REJECTED')
            GROUP BY category_id
          ) r ON (r.category_id = c.id)
          ORDER BY c.sort_order ASC, c.id ASC
        `);
        const result = rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          badgeTitle: r.badge_title,
          ageRestriction: r.age_restriction,
          maxTeams: r.max_teams,
          registeredTeamsCount: Number(r.actual_count !== undefined && r.actual_count !== null ? r.actual_count : (r.registered_teams_count || 0)),
          registrationFee: Number(r.registration_fee),
          totalPrize: Number(r.total_prize),
          description: r.description,
          prizes: typeof r.prizes_json === 'string' ? JSON.parse(r.prizes_json) : (r.prizes_json || []),
          rules: typeof r.rules_json === 'string' ? JSON.parse(r.rules_json) : (r.rules_json || []),
        }));
        categoriesCache = { data: result, timestamp: Date.now() };
        return result;
      } catch (err) {
        console.error('Error getting categories from MySQL:', err);
      }
    }
    return memStore.categories.map(c => {
      const actualCount = memStore.registrations.filter(r => 
        (r.category === c.id || (c.name && r.category === c.name)) &&
        ['PENDING_PAYMENT', 'PENDING', 'APPROVED', 'REJECTED'].includes(r.status)
      ).length;
      return {
        ...c,
        registeredTeamsCount: actualCount > 0 ? actualCount : (c.registeredTeamsCount || 0),
      };
    });
  },

  async getCategoryQuotas(forceRefresh = false): Promise<Array<{ id: string; maxTeams: number; registeredTeamsCount: number }>> {
    if (!forceRefresh && categoryQuotasCache && Date.now() - categoryQuotasCache.timestamp < 30000) {
      return categoryQuotasCache.data;
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query(`
          SELECT 
            c.id, 
            c.max_teams, 
            c.registered_teams_count,
            COALESCE(r.actual_count, 0) AS actual_count
          FROM categories c
          LEFT JOIN (
            SELECT category_id, COUNT(*) AS actual_count
            FROM registrations
            WHERE status IN ('PENDING_PAYMENT', 'PENDING', 'APPROVED', 'REJECTED')
            GROUP BY category_id
          ) r ON (r.category_id = c.id)
          ORDER BY c.sort_order ASC, c.id ASC
        `);
        if (Array.isArray(rows)) {
          const result = rows.map((r: any) => ({
            id: r.id,
            maxTeams: Number(r.max_teams || 0),
            registeredTeamsCount: Number(r.actual_count !== undefined && r.actual_count !== null ? r.actual_count : (r.registered_teams_count || 0)),
          }));
          categoryQuotasCache = { data: result, timestamp: Date.now() };
          return result;
        }
      } catch (err) {
        console.error('Error getting category quotas from MySQL:', err);
      }
    }
    return memStore.categories.map(c => {
      const actualCount = memStore.registrations.filter(r => 
        (r.category === c.id || (c.name && r.category === c.name)) &&
        ['PENDING_PAYMENT', 'PENDING', 'APPROVED', 'REJECTED'].includes(r.status)
      ).length;
      return {
        id: c.id,
        maxTeams: Number(c.maxTeams || 0),
        registeredTeamsCount: actualCount > 0 ? actualCount : Number(c.registeredTeamsCount || 0),
      };
    });
  },

  async saveCategory(cat: CategoryDetail): Promise<CategoryDetail> {
    await ensureDbConnected();
    const idx = memStore.categories.findIndex(c => c.id === cat.id);
    if (idx >= 0) {
      memStore.categories[idx] = cat;
    } else {
      memStore.categories.push(cat);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO categories (id, name, badge_title, age_restriction, max_teams, registered_teams_count, registration_fee, total_prize, description, prizes_json, rules_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=?, badge_title=?, age_restriction=?, max_teams=?, registration_fee=?, total_prize=?, description=?, prizes_json=?, rules_json=?`,
          // registered_teams_count is intentionally NOT updated here: it is owned by the
          // pessimistic-lock transactions in routes.ts and /categories/sync-counts.
          [
            cat.id, cat.name, cat.badgeTitle || '', cat.ageRestriction, cat.maxTeams, cat.registeredTeamsCount, cat.registrationFee, cat.totalPrize, cat.description || '', JSON.stringify(cat.prizes), JSON.stringify(cat.rules),
            cat.name, cat.badgeTitle || '', cat.ageRestriction, cat.maxTeams, cat.registrationFee, cat.totalPrize, cat.description || '', JSON.stringify(cat.prizes), JSON.stringify(cat.rules),
          ]
        );
      } catch (err) {
        console.error('Error saving category to MySQL:', err);
      }
    }
    return cat;
  },

  async deleteCategory(categoryId: string): Promise<boolean> {
    await ensureDbConnected();
    memStore.categories = memStore.categories.filter(c => c.id !== categoryId);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM categories WHERE id = ?', [categoryId]);
      } catch (err) {
        console.error('Error deleting category from MySQL:', err);
      }
    }
    return true;
  },

  async reorderCategories(categories: CategoryDetail[]): Promise<CategoryDetail[]> {
    await ensureDbConnected();
    memStore.categories = [...categories];
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await Promise.all(categories.map(async (cat, i) => {
          await pool.query(
            `INSERT INTO categories (id, name, badge_title, age_restriction, max_teams, registered_teams_count, registration_fee, total_prize, description, prizes_json, rules_json, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE sort_order = ?, name = ?, max_teams = ?, registration_fee = ?, total_prize = ?`,
            [
              cat.id, cat.name, cat.badgeTitle || '', cat.ageRestriction, cat.maxTeams, cat.registeredTeamsCount, cat.registrationFee, cat.totalPrize, cat.description || '', JSON.stringify(cat.prizes), JSON.stringify(cat.rules), i,
              i, cat.name, cat.maxTeams, cat.registrationFee, cat.totalPrize,
            ]
          );
        }));
      } catch (err) {
        console.error('Error reordering categories in MySQL:', err);
      }
    }
    return categories;
  },

  async syncCategoryRegisteredCounts(): Promise<void> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        // Hapus filter status (hitung SEMUA status tim)
        const [counts]: any = await pool.query(`
          SELECT category_id, category, COUNT(*) as count 
          FROM registrations 
          GROUP BY category_id, category
        `);
        
        await pool.query('UPDATE categories SET registered_teams_count = 0');
        
        await Promise.all(counts.map(async (row: any) => {
          await pool.query(
            'UPDATE categories SET registered_teams_count = ? WHERE name = ? OR id = ?',
            [row.count, row.category, row.category_id || row.category]
          );
        }));
      } catch (err) {
        console.error('Error syncing category registered counts:', err);
      }
    }
  },

  // Registrations
  async getRegistrations(): Promise<RegistrationItem[]> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM registrations ORDER BY created_at DESC');
        if (Array.isArray(rows)) {
          return rows.map((r: any) => ({
            id: r.id,
            regCode: r.reg_code,
            category: r.category_id,
            teamName: r.team_name,
            teamLogo: r.team_logo || undefined,
            institutionName: r.institution_name,
            coachName: r.coach_name,
            coachPhone: r.coach_phone,
            coachEmail: r.coach_email || '',
            playerCount: r.player_count,
            officialCount: r.official_count,
            registrationDate: r.registration_date,
            status: r.status,
            paymentStatus: r.payment_status,
            paymentAmount: Number(r.payment_amount),
            rejectionReason: r.rejection_reason || undefined,
            adminNotes: r.admin_notes || undefined,
            documents: sanitizeRegistrationDocuments(r.documents_json, r.id),
            lastUpdated: r.last_updated || r.registration_date,
          }));
        }
      } catch (err) {
        console.error('Error fetching registrations from MySQL:', err);
      }
    }
    return memStore.registrations.map(r => ({
      ...r,
      documents: sanitizeRegistrationDocuments(r.documents, r.id),
    }));
  },

  async getPublicRegistrations(forceRefresh = false): Promise<any[]> {
    if (!forceRefresh && publicRegistrationsCache && Date.now() - publicRegistrationsCache.timestamp < 60000) {
      return publicRegistrationsCache.data;
    }
    await ensureDbConnected();
    let result: any[] = [];
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query(
          'SELECT id, reg_code, category_id, team_name, team_logo, institution_name, status FROM registrations ORDER BY created_at DESC'
        );
        if (Array.isArray(rows)) {
          result = rows.map((r: any) => ({
            id: r.id,
            regCode: r.reg_code,
            category: r.category_id,
            teamName: r.team_name,
            teamLogo: r.team_logo || null,
            institutionName: r.institution_name,
            status: r.status,
          }));
        }
      } catch (err) {
        console.error('Error fetching public registrations from MySQL:', err);
      }
    } else {
      result = memStore.registrations.map(r => ({
        id: r.id,
        regCode: r.regCode,
        category: r.category,
        teamName: r.teamName,
        teamLogo: r.teamLogo || null,
        institutionName: r.institutionName,
        status: r.status,
      }));
    }
    publicRegistrationsCache = { data: result, timestamp: Date.now() };
    return result;
  },

  async getRegistrationById(id: string): Promise<RegistrationItem | null> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM registrations WHERE id = ? LIMIT 1', [id]);
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            regCode: r.reg_code,
            category: r.category_id,
            teamName: r.team_name,
            teamLogo: r.team_logo || undefined,
            institutionName: r.institution_name,
            coachName: r.coach_name,
            coachPhone: r.coach_phone,
            coachEmail: r.coach_email || '',
            playerCount: r.player_count,
            officialCount: r.official_count,
            registrationDate: r.registration_date,
            status: r.status,
            paymentStatus: r.payment_status,
            paymentAmount: Number(r.payment_amount),
            rejectionReason: r.rejection_reason || undefined,
            adminNotes: r.admin_notes || undefined,
            documents: sanitizeRegistrationDocuments(r.documents_json, r.id),
            lastUpdated: r.last_updated || r.registration_date,
          };
        }
        return null;
      } catch (err) {
        console.error('Error fetching registration by id from MySQL:', err);
      }
    }
    const found = memStore.registrations.find(r => r.id === id);
    if (!found) return null;
    return {
      ...found,
      documents: sanitizeRegistrationDocuments(found.documents, found.id),
    };
  },

  async getRegistrationDocument(regId: string, docKey: string): Promise<any | null> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT documents_json FROM registrations WHERE id = ?', [regId]);
        if (Array.isArray(rows) && rows.length > 0) {
          const raw = rows[0].documents_json;
          const docs = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
          const target = docs[docKey];
          if (target) {
            return target.fileData || target.previewUrl || target.url || null;
          }
        }
      } catch (err) {
        console.error('Error fetching registration document from MySQL:', err);
      }
    }
    const memItem = memStore.registrations.find(r => r.id === regId);
    if (memItem && memItem.documents) {
      const target = (memItem.documents as any)[docKey];
      if (target) {
        return target.fileData || target.previewUrl || target.url || null;
      }
    }
    return null;
  },

  async saveRegistration(item: RegistrationItem): Promise<RegistrationItem> {
    invalidatePublicRegistrationsCache();
    await ensureDbConnected();

    // Normalize teamLogo if it contains full domain or raw media ID
    if (item.teamLogo) {
      const trimmedLogo = item.teamLogo.trim();
      if (trimmedLogo.includes('/api/media/view/')) {
        item.teamLogo = trimmedLogo.substring(trimmedLogo.indexOf('/api/media/view/'));
      } else if (/^med-\d+-[a-zA-Z0-9_-]+$/i.test(trimmedLogo)) {
        item.teamLogo = `/api/media/view/${trimmedLogo}`;
      }
    }

    // Check if another registration in memory is already using this regCode with a different id
    const codeConflictMem = memStore.registrations.find(
      r => r.id !== item.id && r.regCode && item.regCode && r.regCode.trim().toUpperCase() === item.regCode.trim().toUpperCase()
    );
    if (codeConflictMem) {
      item.regCode = generateUniqueRegCode(item.category, memStore.registrations);
    }

    const idx = memStore.registrations.findIndex(r => r.id === item.id);
    if (idx >= 0) {
      memStore.registrations[idx] = item;
    } else {
      memStore.registrations.unshift(item);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        // 1. Check if record with this specific ID already exists in MySQL
        const [existingById]: any = await pool.query('SELECT id, reg_code FROM registrations WHERE id = ?', [item.id]);
        
        if (Array.isArray(existingById) && existingById.length > 0) {
          // UPDATE existing record strictly by PRIMARY KEY id
          await pool.execute(
            `UPDATE registrations SET
              reg_code=?, category_id=?, team_name=?, team_logo=?, institution_name=?,
              coach_name=?, coach_phone=?, coach_email=?, player_count=?, official_count=?,
              status=?, payment_status=?, payment_amount=?, rejection_reason=?, admin_notes=?,
              documents_json=?, last_updated=?
             WHERE id = ?`,
            [
              item.regCode, item.category, item.teamName, item.teamLogo || null, item.institutionName,
              item.coachName, item.coachPhone, item.coachEmail || '', item.playerCount, item.officialCount,
              item.status, item.paymentStatus, item.paymentAmount, item.rejectionReason || null, item.adminNotes || null,
              JSON.stringify(item.documents || {}), item.lastUpdated,
              item.id,
            ]
          );
        } else {
          // 2. INSERT new registration.
          // First check if another row in MySQL already holds this reg_code
          const [existingByCode]: any = await pool.query('SELECT id, reg_code FROM registrations WHERE reg_code = ?', [item.regCode]);
          if (Array.isArray(existingByCode) && existingByCode.length > 0) {
            // Code already in use by another team in MySQL! Retrieve all codes in category to find next unique
            const [allCatRows]: any = await pool.query('SELECT reg_code FROM registrations WHERE category_id = ?', [item.category]);
            const existingCatCodes = Array.isArray(allCatRows) ? allCatRows.map((r: any) => ({ regCode: r.reg_code })) : [];
            item.regCode = generateUniqueRegCode(item.category, [...memStore.registrations, ...existingCatCodes]);
            
            // Sync updated regCode to memStore
            const mIdx = memStore.registrations.findIndex(r => r.id === item.id);
            if (mIdx >= 0) memStore.registrations[mIdx].regCode = item.regCode;
            persistLocalStore();
          }

          try {
            await pool.execute(
              `INSERT INTO registrations (
                id, reg_code, category_id, team_name, team_logo, institution_name,
                coach_name, coach_phone, coach_email, player_count, official_count,
                registration_date, status, payment_status, payment_amount,
                rejection_reason, admin_notes, documents_json, last_updated
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id, item.regCode, item.category, item.teamName, item.teamLogo || null, item.institutionName,
                item.coachName, item.coachPhone, item.coachEmail || '', item.playerCount, item.officialCount,
                item.registrationDate, item.status, item.paymentStatus, item.paymentAmount,
                item.rejectionReason || null, item.adminNotes || null, JSON.stringify(item.documents || {}), item.lastUpdated,
              ]
            );
          } catch (insertErr: any) {
            // If duplicate entry error occurs, regenerate code and retry once
            if (insertErr?.code === 'ER_DUP_ENTRY' || insertErr?.errno === 1062) {
              console.warn('[Database] Duplicate entry caught on insert, regenerating unique reg_code...');
              const [allRows]: any = await pool.query('SELECT reg_code FROM registrations WHERE category_id = ?', [item.category]);
              const existingCodes = Array.isArray(allRows) ? allRows.map((r: any) => ({ regCode: r.reg_code })) : [];
              item.regCode = generateUniqueRegCode(item.category, existingCodes);
              
              const mIdx = memStore.registrations.findIndex(r => r.id === item.id);
              if (mIdx >= 0) memStore.registrations[mIdx].regCode = item.regCode;
              persistLocalStore();

              await pool.execute(
                `INSERT INTO registrations (
                  id, reg_code, category_id, team_name, team_logo, institution_name,
                  coach_name, coach_phone, coach_email, player_count, official_count,
                  registration_date, status, payment_status, payment_amount,
                  rejection_reason, admin_notes, documents_json, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  item.id, item.regCode, item.category, item.teamName, item.teamLogo || null, item.institutionName,
                  item.coachName, item.coachPhone, item.coachEmail || '', item.playerCount, item.officialCount,
                  item.registrationDate, item.status, item.paymentStatus, item.paymentAmount,
                  item.rejectionReason || null, item.adminNotes || null, JSON.stringify(item.documents || {}), item.lastUpdated,
                ]
              );
            } else {
              throw insertErr;
            }
          }
        }
      } catch (err) {
        console.error('[Database] Error saving registration to MySQL:', err);
      }
    }

    // Cascade logo & institution name updates to matches, groups, and standings
    if (item.teamLogo || item.teamName) {
      const normName = (item.teamName || '').trim().toLowerCase();
      const normInst = (item.institutionName || '').trim().toLowerCase();

      // 1. In-memory cascades
      for (const m of memStore.matches) {
        if (m.teamA?.name?.trim().toLowerCase() === normName || (normInst && m.teamA?.institution?.trim().toLowerCase() === normInst)) {
          if (item.teamLogo) m.teamA.logo = item.teamLogo;
          if (item.institutionName) m.teamA.institution = item.institutionName;
        }
        if (m.teamB?.name?.trim().toLowerCase() === normName || (normInst && m.teamB?.institution?.trim().toLowerCase() === normInst)) {
          if (item.teamLogo) m.teamB.logo = item.teamLogo;
          if (item.institutionName) m.teamB.institution = item.institutionName;
        }
      }

      for (const g of memStore.groups) {
        if (Array.isArray(g.teams)) {
          for (const t of g.teams) {
            if (t.name?.trim().toLowerCase() === normName || (normInst && t.institution?.trim().toLowerCase() === normInst)) {
              if (item.teamLogo) t.logo = item.teamLogo;
              if (item.institutionName) t.institution = item.institutionName;
            }
          }
        }
      }
      persistLocalStore();

      // 2. MySQL cascades
      if (pool && isMySqlConnected) {
        try {
          if (item.teamLogo) {
            await pool.query(
              `UPDATE matches SET team_a_logo = ? WHERE LOWER(TRIM(team_a_name)) = ? OR (team_a_institution IS NOT NULL AND LOWER(TRIM(team_a_institution)) = ?)`,
              [item.teamLogo, normName, normInst || normName]
            );
            await pool.query(
              `UPDATE matches SET team_b_logo = ? WHERE LOWER(TRIM(team_b_name)) = ? OR (team_b_institution IS NOT NULL AND LOWER(TRIM(team_b_institution)) = ?)`,
              [item.teamLogo, normName, normInst || normName]
            );
            await pool.query(
              `UPDATE table_standings SET team_logo = ? WHERE LOWER(TRIM(team_name)) = ? OR (institution_name IS NOT NULL AND LOWER(TRIM(institution_name)) = ?)`,
              [item.teamLogo, normName, normInst || normName]
            );

            // Also update tournament_groups teams_json in MySQL so calculateStandings retains the logo
            try {
              const [grpRows]: any = await pool.query('SELECT id, teams_json FROM tournament_groups WHERE category_id = ?', [item.category]);
              if (Array.isArray(grpRows)) {
                for (const grp of grpRows) {
                  let teams = [];
                  try {
                    teams = typeof grp.teams_json === 'string' ? JSON.parse(grp.teams_json) : (grp.teams_json || []);
                  } catch {}
                  if (Array.isArray(teams)) {
                    let changed = false;
                    for (const t of teams) {
                      if (t.name?.trim().toLowerCase() === normName || (normInst && t.institution?.trim().toLowerCase() === normInst)) {
                        t.logo = item.teamLogo;
                        if (item.institutionName) t.institution = item.institutionName;
                        changed = true;
                      }
                    }
                    if (changed) {
                      await pool.query('UPDATE tournament_groups SET teams_json = ? WHERE id = ?', [JSON.stringify(teams), grp.id]);
                    }
                  }
                }
              }
            } catch (grpCascadeErr) {
              console.warn('[Database] Error cascading logo to tournament_groups in MySQL:', grpCascadeErr);
            }
          }
        } catch (cascadeErr) {
          console.warn('[Database] Error cascading logo update to MySQL:', cascadeErr);
        }
      }
    }

    // Automatically recalculate standings for this category so table_standings has fresh data
    try {
      await this.calculateStandings(item.category);
    } catch (err) {
      console.warn('Error recalculating standings on saveRegistration:', err);
    }

    return item;
  },

  async deleteRegistration(id: string): Promise<boolean> {
    invalidatePublicRegistrationsCache();
    await ensureDbConnected();

    // 1. Locate registration before deletion to extract all linked media IDs
    let localReg = memStore.registrations.find(r => r.id === id || r.regCode === id);
    let mySqlRow: any = null;

    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM registrations WHERE id = ? OR reg_code = ? LIMIT 1', [id, id]);
        if (Array.isArray(rows) && rows.length > 0) {
          mySqlRow = rows[0];
          if (!localReg) {
            localReg = {
              id: mySqlRow.id,
              regCode: mySqlRow.reg_code,
              category: mySqlRow.category_id,
              teamName: mySqlRow.team_name,
              teamLogo: mySqlRow.team_logo,
              institutionName: mySqlRow.institution_name,
              coachName: mySqlRow.coach_name,
              coachPhone: mySqlRow.coach_phone,
              coachEmail: mySqlRow.coach_email,
              playerCount: Number(mySqlRow.player_count),
              officialCount: Number(mySqlRow.official_count),
              registrationDate: mySqlRow.registration_date,
              status: mySqlRow.status,
              paymentStatus: mySqlRow.payment_status,
              paymentAmount: Number(mySqlRow.payment_amount),
              rejectionReason: mySqlRow.rejection_reason,
              adminNotes: mySqlRow.admin_notes,
              documents: typeof mySqlRow.documents_json === 'string' ? JSON.parse(mySqlRow.documents_json) : (mySqlRow.documents_json || {}),
              lastUpdated: mySqlRow.last_updated,
            };
          }
        }
      } catch (err) {
        console.warn('[deleteRegistration] Error fetching registration for cascading media cleanup:', err);
      }
    }

    const regId = localReg?.id || (mySqlRow?.id ? String(mySqlRow.id) : id);
    const regCode = localReg?.regCode || (mySqlRow?.reg_code ? String(mySqlRow.reg_code) : undefined);

    // 2. Collect all media IDs associated with this registration
    const mediaIdsToDelete = new Set<string>();

    const scanForMedia = (data: any) => {
      if (!data) return;
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      const viewMatches = str.match(/\/api\/media\/view\/([a-zA-Z0-9_-]+)/g);
      if (viewMatches) {
        for (const m of viewMatches) {
          const mId = m.replace('/api/media/view/', '').split(/[?#]/)[0];
          if (mId) mediaIdsToDelete.add(mId);
        }
      }
      const directMatches = str.match(/\bmed-\d+-[a-zA-Z0-9_-]+\b/g);
      if (directMatches) {
        for (const m of directMatches) {
          mediaIdsToDelete.add(m);
        }
      }
    };

    if (localReg) {
      scanForMedia(localReg.teamLogo);
      scanForMedia(localReg.documents);
    }
    if (mySqlRow) {
      scanForMedia(mySqlRow.team_logo);
      scanForMedia(mySqlRow.documents_json);
    }

    // Check in-memory media storage for matching ref_id
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === regId || mItem.refId === id || (regCode && mItem.refId === regCode)) {
        mediaIdsToDelete.add(mId);
      }
    }

    // 3. Perform database cascading deletions in MySQL / TiDB Cloud
    if (pool && isMySqlConnected) {
      try {
        const refParams = [regId, id];
        if (regCode) refParams.push(regCode);
        const refPlaceholders = refParams.map(() => '?').join(',');

        // Find any media rows in app_media_storage tagged with ref_id
        const [dbMediaRows]: any = await pool.query(
          `SELECT id FROM app_media_storage WHERE ref_id IN (${refPlaceholders})`,
          refParams
        );
        if (Array.isArray(dbMediaRows)) {
          for (const row of dbMediaRows) {
            if (row.id) mediaIdsToDelete.add(row.id);
          }
        }

        // A0. Hapus objek B2 terkait (jika ada) sebelum baris database dihapus
        await purgeB2Objects(`ref_id IN (${refPlaceholders})`, refParams);
        if (mediaIdsToDelete.size > 0) {
          const ids0 = Array.from(mediaIdsToDelete);
          await purgeB2Objects(`id IN (${ids0.map(() => '?').join(',')})`, ids0);
        }

        // A. Cascading delete from app_media_storage by ref_id
        await pool.query(
          `DELETE FROM app_media_storage WHERE ref_id IN (${refPlaceholders})`,
          refParams
        );

        // B. Cascading delete from app_media_storage by collected media IDs (in case ref_id was NULL)
        if (mediaIdsToDelete.size > 0) {
          const idList = Array.from(mediaIdsToDelete);
          const idPlaceholders = idList.map(() => '?').join(',');
          await pool.query(
            `DELETE FROM app_media_storage WHERE id IN (${idPlaceholders})`,
            idList
          );
        }

        // C. Delete registration record from registrations table
        await pool.execute(
          'DELETE FROM registrations WHERE id = ? OR id = ? OR reg_code = ?',
          [regId, id, regCode || id]
        );

        console.log(`[Storage Cleanup] Successfully deleted registration ${regId} (${regCode || 'no-code'}) and ${mediaIdsToDelete.size} associated files (${Array.from(mediaIdsToDelete).join(', ')}) from TiDB app_media_storage`);
      } catch (err) {
        console.error('[Storage Cleanup] Error deleting registration and associated media from MySQL:', err);
      }
    }

    // 4. Clean up in-memory cache
    for (const mId of mediaIdsToDelete) {
      memStore.media.delete(mId);
    }
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === regId || mItem.refId === id || (regCode && mItem.refId === regCode)) {
        memStore.media.delete(mId);
      }
    }

    memStore.registrations = memStore.registrations.filter(
      r => r.id !== regId && r.id !== id && (!regCode || r.regCode !== regCode)
    );
    persistLocalStore();

    return true;
  },

  // Matches
  async getMatches(forceRefresh = false): Promise<MatchItem[]> {
    if (!forceRefresh && matchesCache && Date.now() - matchesCache.timestamp < 15000) {
      return matchesCache.data;
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM matches ORDER BY match_date ASC, match_time ASC, match_number ASC');
        if (Array.isArray(rows)) {
          const result = rows.map((r: any) => ({
            id: r.id,
            matchNumber: r.match_number,
            category: r.category_id,
            round: r.round_name,
            roundIndex: r.round_index,
            group: r.group_name || undefined,
            teamA: {
              name: r.team_a_name,
              institution: r.team_a_institution || undefined,
              logo: r.team_a_logo || undefined,
              score: r.team_a_score !== null ? Number(r.team_a_score) : undefined,
              penalties: r.team_a_penalties !== null ? Number(r.team_a_penalties) : undefined,
            },
            teamB: {
              name: r.team_b_name,
              institution: r.team_b_institution || undefined,
              logo: r.team_b_logo || undefined,
              score: r.team_b_score !== null ? Number(r.team_b_score) : undefined,
              penalties: r.team_b_penalties !== null ? Number(r.team_b_penalties) : undefined,
            },
            date: r.match_date,
            time: r.match_time,
            pitch: r.pitch,
            status: r.status,
            liveMinute: r.live_minute || undefined,
            events: typeof r.events_json === 'string' ? JSON.parse(r.events_json) : (r.events_json || []),
            winnerId: r.winner_id || undefined,
            nextMatchId: r.next_match_id || undefined,
            nextMatchSlot: r.next_match_slot || undefined,
          }));
          matchesCache = { data: result, timestamp: Date.now() };
          return result;
        }
      } catch (err) {
        console.error('Error fetching matches from MySQL:', err);
      }
    }
    return memStore.matches;
  },

  async saveMatch(match: MatchItem): Promise<MatchItem> {
    invalidateMatchesCache();
    await ensureDbConnected();
    const idx = memStore.matches.findIndex(m => m.id === match.id);
    if (idx >= 0) {
      memStore.matches[idx] = match;
    } else {
      memStore.matches.push(match);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO matches (id, match_number, category_id, round_name, round_index, group_name, team_a_name, team_a_institution, team_a_logo, team_a_score, team_a_penalties, team_b_name, team_b_institution, team_b_logo, team_b_score, team_b_penalties, match_date, match_time, pitch, status, live_minute, events_json, winner_id, next_match_id, next_match_slot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE match_number=?, category_id=?, round_name=?, round_index=?, group_name=?, team_a_name=?, team_a_institution=?, team_a_logo=?, team_a_score=?, team_a_penalties=?, team_b_name=?, team_b_institution=?, team_b_logo=?, team_b_score=?, team_b_penalties=?, match_date=?, match_time=?, pitch=?, status=?, live_minute=?, events_json=?, winner_id=?, next_match_id=?, next_match_slot=?`,
          [
            match.id, match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
            match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
          ]
        );
      } catch (err) {
        console.error('Error saving match to MySQL:', err);
      }
    }

    // Automatically recalculate standings so table_standings is immediately fresh
    try {
      await this.calculateStandings(match.category);
    } catch (err) {
      console.warn('Error recalculating standings on saveMatch:', err);
    }

    // Automatically synchronize player stats (goals & cards) only if match has events
    if (match.events && Array.isArray(match.events) && match.events.length > 0) {
      try {
        await this.syncPlayerStatsFromMatches(match.category);
      } catch (err) {
        console.warn('Error syncing player stats on saveMatch:', err);
      }
    }

    return match;
  },

  async deleteMatch(matchId: string): Promise<boolean> {
    invalidateMatchesCache();
    await ensureDbConnected();
    const targetMatch = memStore.matches.find(m => m.id === matchId);
    const cat = targetMatch?.category;
    memStore.matches = memStore.matches.filter(m => m.id !== matchId);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM matches WHERE id = ?', [matchId]);
      } catch (err) {
        console.error('Error deleting match from MySQL:', err);
      }
    }

    try {
      await this.calculateStandings(cat);
      if (targetMatch?.events && Array.isArray(targetMatch.events) && targetMatch.events.length > 0) {
        await this.syncPlayerStatsFromMatches(cat);
      }
    } catch (err) {
      console.warn('Error updating standings/stats on deleteMatch:', err);
    }

    return true;
  },

  async replaceCategoryMatches(category: string, newMatches: MatchItem[]): Promise<MatchItem[]> {
    invalidateMatchesCache();
    await ensureDbConnected();
    // 1. Update in-memory store
    memStore.matches = memStore.matches.filter(m => m.category !== category).concat(newMatches);
    persistLocalStore();

    // 2. Update MySQL database
    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM matches WHERE category_id = ?', [category]);
        for (const match of newMatches) {
          await pool.query(
            `INSERT INTO matches (id, match_number, category_id, round_name, round_index, group_name, team_a_name, team_a_institution, team_a_logo, team_a_score, team_a_penalties, team_b_name, team_b_institution, team_b_logo, team_b_score, team_b_penalties, match_date, match_time, pitch, status, live_minute, events_json, winner_id, next_match_id, next_match_slot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              match.id, match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
            ]
          );
        }
      } catch (err) {
        console.error('Error replacing category matches in MySQL:', err);
      }
    }

    try {
      await this.calculateStandings(category);
      const hasEvents = newMatches.some(m => Array.isArray(m.events) && m.events.length > 0);
      if (hasEvents) {
        await this.syncPlayerStatsFromMatches(category);
      }
    } catch (err) {
      console.warn('Error updating standings/stats on replaceCategoryMatches:', err);
    }

    return newMatches;
  },

  async saveMatchesBatch(matchesToSave: MatchItem[]): Promise<MatchItem[]> {
    invalidateMatchesCache();
    await ensureDbConnected();
    const categoriesAffected = new Set<string>();
    for (const match of matchesToSave) {
      categoriesAffected.add(match.category);
      const idx = memStore.matches.findIndex(m => m.id === match.id);
      if (idx >= 0) {
        memStore.matches[idx] = match;
      } else {
        memStore.matches.push(match);
      }

      if (pool && isMySqlConnected) {
        try {
          await pool.query(
            `INSERT INTO matches (id, match_number, category_id, round_name, round_index, group_name, team_a_name, team_a_institution, team_a_logo, team_a_score, team_a_penalties, team_b_name, team_b_institution, team_b_logo, team_b_score, team_b_penalties, match_date, match_time, pitch, status, live_minute, events_json, winner_id, next_match_id, next_match_slot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE match_number=?, category_id=?, round_name=?, round_index=?, group_name=?, team_a_name=?, team_a_institution=?, team_a_logo=?, team_a_score=?, team_a_penalties=?, team_b_name=?, team_b_institution=?, team_b_logo=?, team_b_score=?, team_b_penalties=?, match_date=?, match_time=?, pitch=?, status=?, live_minute=?, events_json=?, winner_id=?, next_match_id=?, next_match_slot=?`,
            [
              match.id, match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
              match.matchNumber, match.category, match.round, match.roundIndex, match.group || null, match.teamA.name, match.teamA.institution || null, match.teamA.logo || null, match.teamA.score !== undefined ? match.teamA.score : null, match.teamA.penalties !== undefined ? match.teamA.penalties : null, match.teamB.name, match.teamB.institution || null, match.teamB.logo || null, match.teamB.score !== undefined ? match.teamB.score : null, match.teamB.penalties !== undefined ? match.teamB.penalties : null, match.date, match.time, match.pitch, match.status, match.liveMinute || null, JSON.stringify(match.events || []), match.winnerId || null, match.nextMatchId || null, match.nextMatchSlot || null,
            ]
          );
        } catch (err) {
          console.error('Error saving batch match item in MySQL:', err);
        }
      }
    }

    const categoriesWithEvents = new Set<string>();
    for (const match of matchesToSave) {
      if (Array.isArray(match.events) && match.events.length > 0) {
        categoriesWithEvents.add(match.category);
      }
    }

    for (const cat of categoriesAffected) {
      try {
        await this.calculateStandings(cat);
        if (categoriesWithEvents.has(cat)) {
          await this.syncPlayerStatsFromMatches(cat);
        }
      } catch (err) {
        console.warn('Error updating standings/stats on saveMatchesBatch:', err);
      }
    }

    return matchesToSave;
  },

  // Sponsors
  async getSponsors(forceRefresh = false): Promise<SponsorItem[]> {
    if (!forceRefresh && sponsorsCache && Date.now() - sponsorsCache.timestamp < 300000) {
      return sponsorsCache.data;
    }
    await ensureDbConnected();
    let result: SponsorItem[] = [...memStore.sponsors];
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM sponsors WHERE is_active = TRUE ORDER BY sort_order ASC');
        if (Array.isArray(rows)) {
          result = rows.map((r: any) => ({
            id: r.id,
            name: r.name,
            tier: r.tier,
            logoText: r.logo_text,
            logoUrl: r.logo_url || undefined,
            websiteUrl: r.website_url || undefined,
            description: r.description || undefined,
          }));
        }
      } catch (err) {
        console.error('Error fetching sponsors from MySQL:', err);
      }
    }
    sponsorsCache = { data: result, timestamp: Date.now() };
    return result;
  },

  async saveSponsor(sponsor: SponsorItem): Promise<SponsorItem> {
    invalidateSponsorsCache();
    await ensureDbConnected();
    const idx = memStore.sponsors.findIndex(s => s.id === sponsor.id);
    if (idx >= 0) {
      memStore.sponsors[idx] = sponsor;
    } else {
      memStore.sponsors.push(sponsor);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO sponsors (id, name, tier, logo_text, logo_url, website_url, description)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name=?, tier=?, logo_text=?, logo_url=?, website_url=?, description=?`,
          [
            sponsor.id, sponsor.name, sponsor.tier, sponsor.logoText, sponsor.logoUrl || null, sponsor.websiteUrl || null, sponsor.description || null,
            sponsor.name, sponsor.tier, sponsor.logoText, sponsor.logoUrl || null, sponsor.websiteUrl || null, sponsor.description || null,
          ]
        );
      } catch (err) {
        console.error('Error saving sponsor to MySQL:', err);
      }
    }
    return sponsor;
  },

  async deleteSponsor(id: string): Promise<boolean> {
    invalidateSponsorsCache();
    await ensureDbConnected();
    memStore.sponsors = memStore.sponsors.filter(s => s.id !== id);
    persistLocalStore();
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === id) {
        memStore.media.delete(mId);
      }
    }

    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM sponsors WHERE id = ?', [id]);
        // Cascading delete: Automatically remove sponsor logo from TiDB app_media_storage
        await purgeB2Objects('ref_id = ? AND category = ?', [id, 'SPONSOR_LOGO']);
        await pool.query('DELETE FROM app_media_storage WHERE ref_id = ? AND category = ?', [id, 'SPONSOR_LOGO']);
        console.log(`[Storage Cleanup] Deleted sponsor logo for ${id} from TiDB Cloud`);
      } catch (err) {
        console.error('Error deleting sponsor from MySQL:', err);
      }
    }
    return true;
  },

  // Admin Users
  async getAdmins(): Promise<AdminUser[]> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query('SELECT id, username, full_name, role, email, phone, avatar_color, created_at FROM admin_users ORDER BY created_at ASC');
        if (Array.isArray(rows) && rows.length > 0) {
          const list = rows.map((r: any) => ({
            id: r.id,
            username: r.username,
            fullName: r.full_name,
            role: r.role,
            email: r.email || '',
            phone: r.phone || '',
            avatarColor: r.avatar_color,
            createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '2026-08-01',
          }));
          memStore.adminUsers = list;
          return list;
        } else if (Array.isArray(rows) && rows.length === 0) {
          // Table exists in MySQL but has 0 rows -> Seed initial admin only if configured
          await seedInitialAdminIfConfigured();
          const [recheck]: any = await pool.query('SELECT id, username, full_name, role, email, phone, avatar_color, created_at FROM admin_users ORDER BY created_at ASC');
          if (Array.isArray(recheck) && recheck.length > 0) {
            const list = recheck.map((r: any) => ({
              id: r.id,
              username: r.username,
              fullName: r.full_name,
              role: r.role,
              email: r.email || '',
              phone: r.phone || '',
              avatarColor: r.avatar_color,
              createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '2026-08-01',
            }));
            memStore.adminUsers = list;
            return list;
          }
          memStore.adminUsers = [];
          return [];
        }
      } catch (err) {
        console.error('Error fetching admins from MySQL:', err);
      }
    }
    return memStore.adminUsers.map(sanitizeAdminUser);
  },

  async saveAdmin(admin: AdminUser, password?: string): Promise<AdminUser> {
    await ensureDbConnected();

    let passHash: string | null = null;
    const cleanPass = (password || admin.password || '').trim();
    if (cleanPass.length > 0) {
      passHash = await hashPassword(cleanPass);
    }
    const roleToSave = admin.role || 'PANITIA_INTI';
    const { password: _p, ...cleanAdmin } = admin;

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO admin_users (id, username, password_hash, full_name, role, email, phone, avatar_color, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE 
             username = VALUES(username),
             full_name = VALUES(full_name),
             role = VALUES(role),
             email = VALUES(email),
             phone = VALUES(phone),
             avatar_color = VALUES(avatar_color),
             password_hash = COALESCE(?, password_hash)`,
          [
            admin.id,
            admin.username,
            passHash || '',
            admin.fullName,
            roleToSave,
            admin.email || null,
            admin.phone || null,
            admin.avatarColor || 'bg-red-600',
            admin.createdAt ? new Date(admin.createdAt) : new Date(),
            passHash,
          ]
        );

        // Keep local memory store cache in sync with MySQL
        const idx = memStore.adminUsers.findIndex(a => a.id === admin.id);
        if (idx >= 0) {
          memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...cleanAdmin, role: roleToSave };
        } else {
          memStore.adminUsers.push({ ...cleanAdmin, role: roleToSave });
        }
      } catch (err: any) {
        console.error('Error saving admin user to MySQL:', err);
        const errMsg = String(err?.message || '');
        // Auto-heal: If MySQL has an older schema with ENUM or short VARCHAR causing Error 1265 (WARN_DATA_TRUNCATED)
        if (
          err?.code === 'WARN_DATA_TRUNCATED' ||
          err?.errno === 1265 ||
          errMsg.includes('role') ||
          errMsg.includes('Data truncated')
        ) {
          try {
            console.log('[MySQL Auto-Migration] Migrating column role in admin_users to VARCHAR(64)...');
            await pool.query("ALTER TABLE admin_users MODIFY COLUMN role VARCHAR(64) NOT NULL DEFAULT 'PANITIA_INTI'");
            // Retry the query
            await pool.query(
              `INSERT INTO admin_users (id, username, password_hash, full_name, role, email, phone, avatar_color, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE 
                 username = VALUES(username),
                 full_name = VALUES(full_name),
                 role = VALUES(role),
                 email = VALUES(email),
                 phone = VALUES(phone),
                 avatar_color = VALUES(avatar_color),
                 password_hash = COALESCE(?, password_hash)`,
              [
                admin.id,
                admin.username,
                passHash || '',
                admin.fullName,
                roleToSave,
                admin.email || null,
                admin.phone || null,
                admin.avatarColor || 'bg-red-600',
                admin.createdAt ? new Date(admin.createdAt) : new Date(),
                passHash,
              ]
            );
            console.log('[MySQL Auto-Migration] Successfully saved admin user after column role auto-migration!');
            const idx = memStore.adminUsers.findIndex(a => a.id === admin.id);
            if (idx >= 0) {
              memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...admin, role: roleToSave };
            } else {
              memStore.adminUsers.push({ ...admin, role: roleToSave });
            }
            return sanitizeAdminUser({ ...admin, role: roleToSave });
          } catch (retryErr: any) {
            console.error('[MySQL Auto-Migration] Retry after role migration failed:', retryErr);
          }
        }
        throw new Error(`Gagal menyimpan data admin ke database MySQL: ${err?.message || err}`);
      }
    } else {
      // Memory Store fallback when MySQL is not connected
      const idx = memStore.adminUsers.findIndex(a => a.id === admin.id || a.username.toLowerCase() === admin.username.toLowerCase());
      if (idx >= 0) {
        memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...admin };
      } else {
        memStore.adminUsers.push(admin);
      }
    }

    return sanitizeAdminUser(admin);
  },

  async deleteAdmin(id: string): Promise<boolean> {
    await ensureDbConnected();
    // Protect master superadmin from deletion
    const target = memStore.adminUsers.find(a => a.id === id);
    if (target && target.username.toLowerCase() === 'superadmin') {
      return false;
    }
    memStore.adminUsers = memStore.adminUsers.filter(a => a.id !== id);
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM admin_users WHERE id = ? AND username != 'superadmin'", [id]);
      } catch (err: any) {
        console.error('Error deleting admin from MySQL:', err);
        throw new Error(`Gagal menghapus admin dari MySQL: ${err?.message || err}`);
      }
    }
    return true;
  },

  async verifyAdminLogin(username: string, pass: string): Promise<{ success: boolean; user?: AdminUser; error?: string; statusCode?: number }> {
    await ensureDbConnected();
    const cleanUser = (username || '').trim().toLowerCase();
    const targetUser = cleanUser === 'admin' ? 'superadmin' : cleanUser;

    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.query(
          'SELECT * FROM admin_users WHERE LOWER(username) = ? OR LOWER(username) = ?',
          [cleanUser, targetUser]
        );
        if (rows && rows.length > 0) {
          const row = rows[0];
          const passHash = row.password_hash;
          
          const isMatch = await verifyPassword(pass, passHash);
          if (isMatch) {
            // Opportunistic Hashing: jika password di DB belum ter-hash scrypt
            if (!passHash || !passHash.startsWith('scrypt$')) {
              const newHash = await hashPassword(pass);
              await pool.query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [newHash, row.id]).catch(() => console.warn('Failed to hash password opportunistically'));
            }
            const userObj: AdminUser = {
              id: row.id,
              username: row.username,
              fullName: row.full_name,
              role: row.role,
              email: row.email || '',
              phone: row.phone || '',
              avatarColor: row.avatar_color || 'bg-red-600',
              createdAt: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : '2026-08-01',
            };
            return { success: true, user: userObj };
          } else {
            return { success: false, error: 'Username atau password salah.' };
          }
        } else {
          // User tidak ditemukan: eksekusi hash tiruan agar waktu respons setara dengan user yang ada (mencegah timing attack)
          await verifyPassword(pass, DUMMY_SCRYPT_HASH).catch(() => false);
          return { success: false, error: 'Username atau password salah.' };
        }
      } catch (err) {
        console.error('Error verifying admin login with MySQL:', err);
        return { success: false, error: 'Terjadi kesalahan saat memeriksa database' };
      }
    }

    // 4e. Database tidak terhubung:
    // Di NODE_ENV=production, JANGAN PERNAH mengautentikasi terhadap memStore (fail-closed)
    if (process.env.NODE_ENV === 'production') {
      return {
        success: false,
        error: 'Layanan sementara tidak tersedia. Basis data sedang tidak terhubung.',
        statusCode: 503,
      };
    }

    // Non-production memory mode fallback: hanya izinkan akun dari INITIAL_ADMIN_* (jika ada)
    const initUser = (process.env.INITIAL_ADMIN_USERNAME || '').trim().toLowerCase();
    const initPass = (process.env.INITIAL_ADMIN_PASSWORD || '').trim();
    if (initUser && initPass && (cleanUser === initUser || targetUser === initUser)) {
      const isMatch = pass === initPass;
      if (isMatch) {
        return {
          success: true,
          user: {
            id: 'adm-env-local',
            username: initUser,
            fullName: 'Administrator Lokal',
            role: 'SUPERADMIN',
            email: '',
            phone: '',
            avatarColor: 'bg-red-600',
            createdAt: new Date().toISOString().split('T')[0],
          },
        };
      }
    }

    await verifyPassword(pass, DUMMY_SCRYPT_HASH).catch(() => false);
    return { success: false, error: 'Username atau password salah.' };
  },

  // Generate complete SQL Export dump
  async exportFullSqlDump(): Promise<string> {
    await ensureDbConnected();
    const categories = await this.getCategories();
    const registrations = await this.getRegistrations();
    const matches = await this.getMatches();
    const sponsors = await this.getSponsors();
    const admins = await this.getAdmins();
    const config = await this.getConfig();

    const timestamp = new Date().toISOString();

    let sql = `-- ==========================================================\n`;
    sql += `-- WABUP CUP 2026 COMPLETE DATABASE BACKUP & EXPORT\n`;
    sql += `-- Generated at: ${timestamp}\n`;
    sql += `-- Target: MySQL 5.7+ / 8.0+ / MariaDB / Cloud SQL / phpMyAdmin\n`;
    sql += `-- ==========================================================\n\n`;

    sql += `CREATE DATABASE IF NOT EXISTS \`wabupcup2026\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`;
    sql += `USE \`wabupcup2026\`;\n\n`;

    const escapeSql = (val: any): string => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return isNaN(val) ? '0' : String(val);
      if (typeof val === 'boolean') return val ? '1' : '0';
      return `'${String(val).replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
        switch (char) {
          case "\0": return "\\0";
          case "\x08": return "\\b";
          case "\x09": return "\\t";
          case "\x1a": return "\\z";
          case "\n": return "\\n";
          case "\r": return "\\r";
          case "\"":
          case "'":
          case "\\":
          case "%":
            return "\\" + char;
          default:
            return char;
        }
      })}'`;
    };

    sql += `-- 1. CONFIG\n`;
    sql += `INSERT INTO \`tournament_config\` (\`config_key\`, \`config_value\`) VALUES ('main_config', ${escapeSql(JSON.stringify(config))}) ON DUPLICATE KEY UPDATE \`config_value\`=VALUES(\`config_value\`);\n\n`;

    sql += `-- 2. CATEGORIES\n`;
    for (const c of categories) {
      sql += `INSERT INTO \`categories\` (\`id\`, \`name\`, \`badge_title\`, \`age_restriction\`, \`max_teams\`, \`registered_teams_count\`, \`registration_fee\`, \`total_prize\`, \`description\`, \`prizes_json\`, \`rules_json\`) VALUES (${escapeSql(c.id)}, ${escapeSql(c.name)}, ${escapeSql(c.badgeTitle || '')}, ${escapeSql(c.ageRestriction)}, ${c.maxTeams || 0}, ${c.registeredTeamsCount || 0}, ${c.registrationFee || 0}, ${c.totalPrize || 0}, ${escapeSql(c.description || '')}, ${escapeSql(JSON.stringify(c.prizes || []))}, ${escapeSql(JSON.stringify(c.rules || []))}) ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 3. REGISTRATIONS\n`;
    for (const r of registrations) {
      sql += `INSERT INTO \`registrations\` (\`id\`, \`reg_code\`, \`category_id\`, \`team_name\`, \`institution_name\`, \`coach_name\`, \`coach_phone\`, \`coach_email\`, \`player_count\`, \`official_count\`, \`registration_date\`, \`status\`, \`payment_status\`, \`payment_amount\`, \`documents_json\`, \`last_updated\`) VALUES (${escapeSql(r.id)}, ${escapeSql(r.regCode)}, ${escapeSql(r.category)}, ${escapeSql(r.teamName)}, ${escapeSql(r.institutionName)}, ${escapeSql(r.coachName)}, ${escapeSql(r.coachPhone)}, ${escapeSql(r.coachEmail)}, ${r.playerCount || 0}, ${r.officialCount || 0}, ${escapeSql(r.registrationDate)}, ${escapeSql(r.status)}, ${escapeSql(r.paymentStatus)}, ${r.paymentAmount || 0}, ${escapeSql(JSON.stringify(r.documents || {}))}, ${escapeSql(r.lastUpdated)}) ON DUPLICATE KEY UPDATE \`team_name\`=VALUES(\`team_name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 4. MATCHES\n`;
    for (const m of matches) {
      sql += `INSERT INTO \`matches\` (\`id\`, \`match_number\`, \`category_id\`, \`round_name\`, \`round_index\`, \`team_a_name\`, \`team_a_institution\`, \`team_a_score\`, \`team_b_name\`, \`team_b_institution\`, \`team_b_score\`, \`match_date\`, \`match_time\`, \`pitch\`, \`status\`, \`live_minute\`, \`events_json\`, \`winner_id\`) VALUES (${escapeSql(m.id)}, ${m.matchNumber || 0}, ${escapeSql(m.category)}, ${escapeSql(m.round)}, ${m.roundIndex || 0}, ${escapeSql(m.teamA.name)}, ${escapeSql(m.teamA.institution || '')}, ${m.teamA.score !== undefined ? m.teamA.score : 'NULL'}, ${escapeSql(m.teamB.name)}, ${escapeSql(m.teamB.institution || '')}, ${m.teamB.score !== undefined ? m.teamB.score : 'NULL'}, ${escapeSql(m.date)}, ${escapeSql(m.time)}, ${escapeSql(m.pitch)}, ${escapeSql(m.status)}, ${m.liveMinute ? escapeSql(m.liveMinute) : 'NULL'}, ${escapeSql(JSON.stringify(m.events || []))}, ${m.winnerId ? escapeSql(m.winnerId) : 'NULL'}) ON DUPLICATE KEY UPDATE \`team_a_name\`=VALUES(\`team_a_name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 5. SPONSORS\n`;
    for (const s of sponsors) {
      sql += `INSERT INTO \`sponsors\` (\`id\`, \`name\`, \`tier\`, \`logo_text\`, \`website_url\`, \`description\`) VALUES (${escapeSql(s.id)}, ${escapeSql(s.name)}, ${escapeSql(s.tier)}, ${escapeSql(s.logoText)}, ${escapeSql(s.websiteUrl || '')}, ${escapeSql(s.description || '')}) ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 6. ADMIN USERS\n`;
    for (const a of admins) {
      sql += `INSERT INTO \`admin_users\` (\`id\`, \`username\`, \`password_hash\`, \`full_name\`, \`role\`, \`email\`, \`phone\`, \`avatar_color\`) VALUES (${escapeSql(a.id)}, ${escapeSql(a.username)}, 'REDACTED_PASSWORD_PROTECTED', ${escapeSql(a.fullName)}, ${escapeSql(a.role)}, ${escapeSql(a.email)}, ${escapeSql(a.phone)}, ${escapeSql(a.avatarColor)}) ON DUPLICATE KEY UPDATE \`full_name\`=VALUES(\`full_name\`);\n`;
    }
    sql += `\n`;

    sql += `-- 7. PLAYERS (table_players)\n`;
    const allPlayers = await this.getPlayers();
    for (const p of allPlayers) {
      sql += `INSERT INTO \`table_players\` (\`id\`, \`team_id\`, \`team_name\`, \`category_id\`, \`name\`, \`jersey_number\`, \`position\`, \`goals\`, \`yellow_cards\`, \`red_cards\`, \`photo_url\`) VALUES (${escapeSql(p.id)}, ${p.teamId ? escapeSql(p.teamId) : 'NULL'}, ${escapeSql(p.teamName)}, ${escapeSql(p.category)}, ${escapeSql(p.name)}, ${p.jerseyNumber || 0}, ${escapeSql(p.position || 'Flank')}, ${p.goals || 0}, ${p.yellowCards || 0}, ${p.redCards || 0}, ${p.photoUrl ? escapeSql(p.photoUrl) : 'NULL'}) ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`), \`jersey_number\`=VALUES(\`jersey_number\`), \`goals\`=VALUES(\`goals\`);\n`;
    }
    sql += `\n`;

    sql += `-- 8. STANDINGS (table_standings)\n`;
    const standingsMap: Record<string, TeamStandingItem[]> = await this.calculateStandings();
    for (const key of Object.keys(standingsMap)) {
      const items = standingsMap[key] || [];
      for (const item of items) {
        const stdId = `std-${item.category}-${item.groupName}-${item.teamName}`.toLowerCase().replace(/[^a-z0-9-]/g, '_');
        sql += `INSERT INTO \`table_standings\` (\`id\`, \`category_id\`, \`group_name\`, \`team_name\`, \`institution_name\`, \`team_logo\`, \`position\`, \`played\`, \`won\`, \`drawn\`, \`lost\`, \`goals_for\`, \`goals_against\`, \`goal_difference\`, \`points\`) VALUES (${escapeSql(stdId)}, ${escapeSql(item.category)}, ${escapeSql(item.groupName)}, ${escapeSql(item.teamName)}, ${item.institution ? escapeSql(item.institution) : 'NULL'}, ${item.teamLogo ? escapeSql(item.teamLogo) : 'NULL'}, ${item.position}, ${item.played}, ${item.won}, ${item.drawn}, ${item.lost}, ${item.goalsFor}, ${item.goalsAgainst}, ${item.goalDifference}, ${item.points}) ON DUPLICATE KEY UPDATE \`position\`=VALUES(\`position\`), \`points\`=VALUES(\`points\`), \`played\`=VALUES(\`played\`);\n`;
      }
    }
    sql += `\n`;

    return sql;
  },

  // Centralized Media Storage (TiDB Cloud)
  async saveMedia(item: AppMediaItem): Promise<AppMediaItem> {
    await ensureDbConnected();
    memStore.media.set(item.id, item);

    if (pool && isMySqlConnected && item.storage === 'b2' && item.fileKey) {
      try {
        await pool.execute(
          `INSERT INTO app_media_storage (id, category, ref_id, sub_key, filename, content_type, file_size, file_data, storage, file_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, '', 'b2', ?)
           ON DUPLICATE KEY UPDATE category=?, ref_id=?, sub_key=?, filename=?, content_type=?, file_size=?, storage='b2', file_key=?`,
          [
            item.id, item.category, item.refId || null, item.subKey || null, item.filename, item.contentType, item.fileSize, item.fileKey,
            item.category, item.refId || null, item.subKey || null, item.filename, item.contentType, item.fileSize, item.fileKey,
          ]
        );
      } catch (err) {
        console.error('Error saving B2 media metadata to TiDB app_media_storage:', err);
        throw err;
      }
    } else if (pool && isMySqlConnected) {
      try {
        await pool.execute(
          `INSERT INTO app_media_storage (id, category, ref_id, sub_key, filename, content_type, file_size, file_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE category=?, ref_id=?, sub_key=?, filename=?, content_type=?, file_size=?, file_data=?`,
          [
            item.id, item.category, item.refId || null, item.subKey || null, item.filename, item.contentType, item.fileSize, item.fileData,
            item.category, item.refId || null, item.subKey || null, item.filename, item.contentType, item.fileSize, item.fileData,
          ]
        );
      } catch (err) {
        console.error('Error saving media to TiDB app_media_storage:', err);
      }
    }
    return item;
  },

  async getMedia(id: string): Promise<AppMediaItem | null> {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.execute('SELECT * FROM app_media_storage WHERE id = ? LIMIT 1', [id]);
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            category: r.category,
            refId: r.ref_id || undefined,
            subKey: r.sub_key || undefined,
            filename: r.filename,
            contentType: r.content_type,
            fileSize: Number(r.file_size),
            fileData: r.file_data,
            storage: r.storage === 'b2' ? 'b2' : 'db',
            fileKey: r.file_key || undefined,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
          };
        }
      } catch (err) {
        console.error('Error fetching media from TiDB app_media_storage:', err);
      }
    }
    return memStore.media.get(id) || null;
  },

  /**
   * Metadata saja (TANPA file_data). Dipakai untuk cek ETag/304 dan redirect B2
   * supaya isi file tidak ikut dibaca dari TiDB.
   */
  async getMediaMeta(id: string, forceRefresh = false): Promise<Omit<AppMediaItem, 'fileData'> | null> {
    if (!forceRefresh && mediaMetaCache.has(id)) {
      const cached = mediaMetaCache.get(id)!;
      if (Date.now() - cached.timestamp < 600000) { // 10 minutes in-memory cache
        return cached.data;
      }
    }
    await ensureDbConnected();
    let meta: Omit<AppMediaItem, 'fileData'> | null = null;
    if (pool && isMySqlConnected) {
      try {
        const [rows]: any = await pool.execute(
          'SELECT id, category, ref_id, sub_key, filename, content_type, file_size, storage, file_key FROM app_media_storage WHERE id = ? LIMIT 1',
          [id]
        );
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          meta = {
            id: r.id,
            category: r.category,
            refId: r.ref_id || undefined,
            subKey: r.sub_key || undefined,
            filename: r.filename,
            contentType: r.content_type,
            fileSize: Number(r.file_size),
            storage: r.storage === 'b2' ? 'b2' : 'db',
            fileKey: r.file_key || undefined,
          };
        }
      } catch (err) {
        console.error('Error fetching media meta from TiDB app_media_storage:', err);
      }
    }
    if (!meta) {
      const mem = memStore.media.get(id);
      if (mem) {
        const { fileData: _omit, ...m } = mem;
        meta = m;
      }
    }
    mediaMetaCache.set(id, { data: meta, timestamp: Date.now() });
    return meta;
  },

  async deleteMedia(id: string): Promise<boolean> {
    invalidateMediaMetaCache(id);
    await ensureDbConnected();
    memStore.media.delete(id);
    if (pool && isMySqlConnected) {
      try {
        await purgeB2Objects('id = ?', [id]);
        await pool.execute('DELETE FROM app_media_storage WHERE id = ?', [id]);
      } catch (err) {
        console.error('Error deleting media from TiDB app_media_storage:', err);
      }
    }
    return true;
  },

  async deleteMediaByRef(refId: string, category?: string): Promise<boolean> {
    invalidateMediaMetaCache();
    await ensureDbConnected();
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === refId && (!category || mItem.category === category)) {
        memStore.media.delete(mId);
      }
    }

    if (pool && isMySqlConnected) {
      try {
        if (category) {
          await purgeB2Objects('ref_id = ? AND category = ?', [refId, category]);
          await pool.execute('DELETE FROM app_media_storage WHERE ref_id = ? AND category = ?', [refId, category]);
        } else {
          await purgeB2Objects('ref_id = ?', [refId]);
          await pool.execute('DELETE FROM app_media_storage WHERE ref_id = ?', [refId]);
        }
      } catch (err) {
        console.error('Error deleting media by ref from TiDB app_media_storage:', err);
      }
    }
    return true;
  },

  async updateMediaRef(id: string, refId: string, subKey?: string): Promise<boolean> {
    invalidateMediaMetaCache(id);
    await ensureDbConnected();
    const memItem = memStore.media.get(id);
    if (memItem) {
      memItem.refId = refId;
      if (subKey) memItem.subKey = subKey;
    }

    if (subKey) {
      // Purge any prior in-memory media with the same refId and subKey
      for (const [mId, m] of memStore.media.entries()) {
        if (m.refId === refId && m.subKey === subKey && mId !== id) {
          memStore.media.delete(mId);
        }
      }
    }

    if (pool && isMySqlConnected) {
      try {
        if (subKey) {
          // Cascading cleanup: delete prior media file for the same ref_id and sub_key if id is different
          await purgeB2Objects('ref_id = ? AND sub_key = ? AND id != ?', [refId, subKey, id]);
          await pool.execute(
            'DELETE FROM app_media_storage WHERE ref_id = ? AND sub_key = ? AND id != ?',
            [refId, subKey, id]
          );
          await pool.execute('UPDATE app_media_storage SET ref_id = ?, sub_key = ? WHERE id = ?', [refId, subKey, id]);
        } else {
          await pool.execute('UPDATE app_media_storage SET ref_id = ? WHERE id = ?', [refId, id]);
        }
      } catch (err) {
        console.error('Error updating media ref in TiDB app_media_storage:', err);
      }
    }
    return true;
  },

  // 12. Players (table_players)
  async getPlayers(category?: string, teamName?: string, forceRefresh = false, hasStats = false): Promise<PlayerItem[]> {
    const cacheKey = `${category || 'all'}:::${teamName || 'all'}:::${hasStats ? 'stats' : 'all'}`;
    const cached = playersCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < 30000) {
      return cached.data;
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        let query = 'SELECT * FROM table_players WHERE 1=1';
        const params: any[] = [];
        if (category) {
          query += ' AND category_id = ?';
          params.push(category);
        }
        if (teamName) {
          query += ' AND team_name = ?';
          params.push(teamName);
        }
        if (hasStats) {
          query += ' AND (goals > 0 OR yellow_cards > 0 OR red_cards > 0)';
        }
        query += ' ORDER BY goals DESC, team_name ASC, jersey_number ASC';
        const [rows]: any = await pool.query(query, params);
        if (Array.isArray(rows)) {
          const result = rows.map((r: any) => ({
            id: r.id,
            teamId: r.team_id || undefined,
            teamName: r.team_name,
            category: r.category_id,
            name: r.name,
            jerseyNumber: Number(r.jersey_number) || 0,
            position: r.position || 'Flank',
            goals: Number(r.goals) || 0,
            yellowCards: Number(r.yellow_cards) || 0,
            redCards: Number(r.red_cards) || 0,
            photoUrl: r.photo_url || undefined,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          }));
          playersCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (err) {
        console.error('Error fetching players from MySQL:', err);
      }
    }
    let list = [...memStore.players];
    if (category) list = list.filter(p => p.category === category);
    if (teamName) list = list.filter(p => p.teamName === teamName);
    if (hasStats) list = list.filter(p => (p.goals || 0) > 0 || (p.yellowCards || 0) > 0 || (p.redCards || 0) > 0);
    return list;
  },

  async savePlayer(player: PlayerItem): Promise<PlayerItem> {
    invalidatePlayersCache();
    await ensureDbConnected();

    // Sanitize every field with defaults to guarantee NO undefined is passed to mysql2
    const sanitizedPlayer: PlayerItem = {
      id: player.id && String(player.id).trim() !== '' ? String(player.id).trim() : `ply-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      teamId: player.teamId || undefined,
      teamName: String(player.teamName || 'Tim').trim(),
      category: (player.category || 'SMA') as any,
      name: String(player.name || 'Pemain').trim(),
      jerseyNumber: Number(player.jerseyNumber) || 0,
      position: String(player.position || 'Flank').trim(),
      goals: Number(player.goals) || 0,
      yellowCards: Number(player.yellowCards) || 0,
      redCards: Number(player.redCards) || 0,
      photoUrl: player.photoUrl || undefined,
      createdAt: player.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const idx = memStore.players.findIndex(p => p.id === sanitizedPlayer.id);
    if (idx >= 0) {
      memStore.players[idx] = sanitizedPlayer;
    } else {
      memStore.players.push(sanitizedPlayer);
    }
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query(
          `INSERT INTO table_players (id, team_id, team_name, category_id, name, jersey_number, position, goals, yellow_cards, red_cards, photo_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE team_id=?, team_name=?, category_id=?, name=?, jersey_number=?, position=?, goals=?, yellow_cards=?, red_cards=?, photo_url=?`,
          [
            sanitizedPlayer.id, sanitizedPlayer.teamId || null, sanitizedPlayer.teamName, sanitizedPlayer.category, sanitizedPlayer.name, sanitizedPlayer.jerseyNumber, sanitizedPlayer.position, sanitizedPlayer.goals, sanitizedPlayer.yellowCards, sanitizedPlayer.redCards, sanitizedPlayer.photoUrl || null,
            sanitizedPlayer.teamId || null, sanitizedPlayer.teamName, sanitizedPlayer.category, sanitizedPlayer.name, sanitizedPlayer.jerseyNumber, sanitizedPlayer.position, sanitizedPlayer.goals, sanitizedPlayer.yellowCards, sanitizedPlayer.redCards, sanitizedPlayer.photoUrl || null,
          ]
        );
      } catch (err: any) {
        console.error('Error saving player to MySQL table_players:', err);
        // If table doesn't exist yet, auto-create table_players and retry
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || String(err.message || '').includes("doesn't exist"))) {
          try {
            await pool.query(`CREATE TABLE IF NOT EXISTS table_players (
              id VARCHAR(64) PRIMARY KEY,
              team_id VARCHAR(64) NULL,
              team_name VARCHAR(150) NOT NULL,
              category_id VARCHAR(32) NOT NULL,
              name VARCHAR(150) NOT NULL,
              jersey_number INT NOT NULL DEFAULT 0,
              position VARCHAR(50) NOT NULL DEFAULT 'Flank',
              goals INT NOT NULL DEFAULT 0,
              yellow_cards INT NOT NULL DEFAULT 0,
              red_cards INT NOT NULL DEFAULT 0,
              photo_url LONGTEXT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_team (team_name),
              INDEX idx_category (category_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

            await pool.query(
              `INSERT INTO table_players (id, team_id, team_name, category_id, name, jersey_number, position, goals, yellow_cards, red_cards, photo_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE team_id=?, team_name=?, category_id=?, name=?, jersey_number=?, position=?, goals=?, yellow_cards=?, red_cards=?, photo_url=?`,
              [
                sanitizedPlayer.id, sanitizedPlayer.teamId || null, sanitizedPlayer.teamName, sanitizedPlayer.category, sanitizedPlayer.name, sanitizedPlayer.jerseyNumber, sanitizedPlayer.position, sanitizedPlayer.goals, sanitizedPlayer.yellowCards, sanitizedPlayer.redCards, sanitizedPlayer.photoUrl || null,
                sanitizedPlayer.teamId || null, sanitizedPlayer.teamName, sanitizedPlayer.category, sanitizedPlayer.name, sanitizedPlayer.jerseyNumber, sanitizedPlayer.position, sanitizedPlayer.goals, sanitizedPlayer.yellowCards, sanitizedPlayer.redCards, sanitizedPlayer.photoUrl || null,
              ]
            );
          } catch (retryErr) {
            console.error('Retry saving player to MySQL failed:', retryErr);
          }
        }
      }
    }
    return sanitizedPlayer;
  },

  async savePlayersBatch(players: PlayerItem[]): Promise<PlayerItem[]> {
    invalidatePlayersCache();
    await ensureDbConnected();
    const sanitizedBatch: PlayerItem[] = [];

    for (const p of players) {
      const sp: PlayerItem = {
        id: p.id && String(p.id).trim() !== '' ? String(p.id).trim() : `ply-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        teamId: p.teamId || undefined,
        teamName: String(p.teamName || 'Tim').trim(),
        category: (p.category || 'SMA') as any,
        name: String(p.name || 'Pemain').trim(),
        jerseyNumber: Number(p.jerseyNumber) || 0,
        position: String(p.position || 'Flank').trim(),
        goals: Number(p.goals) || 0,
        yellowCards: Number(p.yellowCards) || 0,
        redCards: Number(p.redCards) || 0,
        photoUrl: p.photoUrl || undefined,
        createdAt: p.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const idx = memStore.players.findIndex(item => item.id === sp.id);
      if (idx >= 0) {
        memStore.players[idx] = sp;
      } else {
        memStore.players.push(sp);
      }
      sanitizedBatch.push(sp);
    }
    persistLocalStore();

    if (pool && isMySqlConnected && sanitizedBatch.length > 0) {
      try {
        for (const p of sanitizedBatch) {
          await pool.query(
            `INSERT INTO table_players (id, team_id, team_name, category_id, name, jersey_number, position, goals, yellow_cards, red_cards, photo_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE team_id=?, team_name=?, category_id=?, name=?, jersey_number=?, position=?, goals=?, yellow_cards=?, red_cards=?, photo_url=?`,
            [
              p.id, p.teamId || null, p.teamName, p.category, p.name, p.jerseyNumber, p.position, p.goals, p.yellowCards, p.redCards, p.photoUrl || null,
              p.teamId || null, p.teamName, p.category, p.name, p.jerseyNumber, p.position, p.goals, p.yellowCards, p.redCards, p.photoUrl || null,
            ]
          );
        }
      } catch (err: any) {
        console.error('Error saving batch players to MySQL table_players:', err);
      }
    }
    return sanitizedBatch;
  },

  async deletePlayer(id: string): Promise<boolean> {
    invalidatePlayersCache();
    await ensureDbConnected();
    memStore.players = memStore.players.filter(p => p.id !== id);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM table_players WHERE id = ?', [id]);
      } catch (err) {
        console.error('Error deleting player from MySQL:', err);
      }
    }
    return true;
  },

  // 13. Groups (tournament_groups)
  async getGroupStages(category?: string, forceRefresh = false): Promise<GroupStageItem[]> {
    const cacheKey = category || '__ALL__';
    if (!forceRefresh && groupsCache.has(cacheKey)) {
      const cached = groupsCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < 60000) {
        return cached.data;
      }
    }
    await ensureDbConnected();
    let list: GroupStageItem[] = [];
    if (pool && isMySqlConnected) {
      try {
        let query = 'SELECT * FROM tournament_groups WHERE 1=1';
        const params: any[] = [];
        if (category) {
          query += ' AND category_id = ?';
          params.push(category);
        }
        query += ' ORDER BY group_name ASC';
        const [rows]: any = await pool.query(query, params);
        if (Array.isArray(rows)) {
          list = rows.map((r: any) => ({
            id: r.id,
            category: r.category_id,
            groupName: r.group_name,
            teams: typeof r.teams_json === 'string' ? JSON.parse(r.teams_json) : (r.teams_json || []),
          }));
        }
      } catch (err) {
        console.error('Error fetching group stages from MySQL:', err);
      }
    } else {
      list = [...memStore.groups];
      if (category) list = list.filter(g => g.category === category);
    }
    groupsCache.set(cacheKey, { data: list, timestamp: Date.now() });
    return list;
  },

  async saveGroupStages(category: string, groups: GroupStageItem[]): Promise<GroupStageItem[]> {
    invalidateGroupsCache();
    await ensureDbConnected();
    memStore.groups = memStore.groups.filter(g => g.category !== category).concat(groups);
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM tournament_groups WHERE category_id = ?', [category]);
        for (const g of groups) {
          await pool.query(
            `INSERT INTO tournament_groups (id, category_id, group_name, teams_json)
             VALUES (?, ?, ?, ?)`,
            [g.id, g.category, g.groupName, JSON.stringify(g.teams || [])]
          );
        }
      } catch (err) {
        console.error('Error saving group stages to MySQL:', err);
      }
    }

    // Automatically recalculate standings and prune deleted/renamed teams
    try {
      await this.calculateStandings(category);
    } catch (err) {
      console.warn('Error recalculating standings on saveGroupStages:', err);
    }

    return groups;
  },

  async resetCategoryGroupsAndMatches(category: string): Promise<{ success: boolean; message: string }> {
    invalidateGroupsCache();
    await ensureDbConnected();
    memStore.groups = memStore.groups.filter(g => g.category !== category);
    memStore.matches = memStore.matches.filter(m => m.category !== category);
    persistLocalStore();

    if (pool && isMySqlConnected) {
      try {
        await pool.query('DELETE FROM tournament_groups WHERE category_id = ?', [category]);
        await pool.query('DELETE FROM matches WHERE category_id = ?', [category]);
        await pool.query('DELETE FROM table_standings WHERE category_id = ?', [category]);
        invalidateStandingsCache();
      } catch (err) {
        console.error('Error resetting category groups and matches from MySQL:', err);
      }
    }
    return {
      success: true,
      message: `Grup, jadwal pertandingan, dan klasemen untuk kategori ${category} berhasil dikosongkan.`,
    };
  },

  // 14. Real-time Standings Calculator (Operates purely on matches & groups without touching registrations table)
  async calculateStandings(category?: string): Promise<Record<string, TeamStandingItem[]>> {
    await ensureDbConnected();
    const allMatches = await this.getMatches();
    const allGroups = await this.getGroupStages(category);

    const result: Record<string, TeamStandingItem[]> = {};

    const targetMatches = allMatches.filter(m => {
      if (category && m.category !== category) return false;
      return !!m.group;
    });

    // Group by category + group_name
    const groupKeys = new Set<string>();
    for (const g of allGroups) {
      groupKeys.add(`${g.category}:::${g.groupName}`);
    }
    for (const m of targetMatches) {
      if (m.group) {
        groupKeys.add(`${m.category}:::${m.group}`);
      }
    }

    for (const key of groupKeys) {
      const [cat, grpName] = key.split(':::');
      const grpMatches = targetMatches.filter(m => m.category === cat && m.group === grpName);
      const grpObj = allGroups.find(g => g.category === cat && g.groupName === grpName);

      // Collect team names
      const teamMap = new Map<string, TeamStandingItem>();

      // Seed teams from group definitions
      if (grpObj && Array.isArray(grpObj.teams)) {
        for (const t of grpObj.teams) {
          const resolvedLogo = t.logo || '';
          const resolvedInst = t.institution || '';

          if (!teamMap.has(t.name)) {
            teamMap.set(t.name, {
              position: 0,
              teamName: t.name,
              institution: resolvedInst,
              teamLogo: resolvedLogo,
              groupName: grpName,
              category: cat,
              played: 0,
              won: 0,
              drawn: 0,
              lost: 0,
              goalsFor: 0,
              goalsAgainst: 0,
              goalDifference: 0,
              points: 0,
            });
          } else {
            const item = teamMap.get(t.name)!;
            if (resolvedLogo && !item.teamLogo) {
              item.teamLogo = resolvedLogo;
            }
            if (resolvedInst && !item.institution) {
              item.institution = resolvedInst;
            }
          }
        }
      }

      // Add teams from matches
      for (const m of grpMatches) {
        for (const team of [m.teamA, m.teamB]) {
          const resolvedLogo = team.logo || '';
          const resolvedInst = team.institution || '';

          if (!teamMap.has(team.name)) {
            teamMap.set(team.name, {
              position: 0,
              teamName: team.name,
              institution: resolvedInst,
              teamLogo: resolvedLogo,
              groupName: grpName,
              category: cat,
              played: 0,
              won: 0,
              drawn: 0,
              lost: 0,
              goalsFor: 0,
              goalsAgainst: 0,
              goalDifference: 0,
              points: 0,
            });
          } else {
            const item = teamMap.get(team.name)!;
            if (resolvedLogo && !item.teamLogo) {
              item.teamLogo = resolvedLogo;
            }
            if (resolvedInst && !item.institution) {
              item.institution = resolvedInst;
            }
          }
        }

        // Calculate statistics for finished or live matches (or matches with scores)
        const hasScore = m.status !== 'UPCOMING' && m.teamA.score !== undefined && m.teamB.score !== undefined;
        if (hasScore) {
          const itemA = teamMap.get(m.teamA.name)!;
          const itemB = teamMap.get(m.teamB.name)!;

          const sA = Number(m.teamA.score) || 0;
          const sB = Number(m.teamB.score) || 0;

          itemA.played += 1;
          itemB.played += 1;

          itemA.goalsFor += sA;
          itemA.goalsAgainst += sB;
          itemB.goalsFor += sB;
          itemB.goalsAgainst += sA;

          if (sA > sB) {
            itemA.won += 1;
            itemA.points += 3;
            itemB.lost += 1;
          } else if (sA < sB) {
            itemB.won += 1;
            itemB.points += 3;
            itemA.lost += 1;
          } else {
            itemA.drawn += 1;
            itemA.points += 1;
            itemB.drawn += 1;
            itemB.points += 1;
          }

          itemA.goalDifference = itemA.goalsFor - itemA.goalsAgainst;
          itemB.goalDifference = itemB.goalsFor - itemB.goalsAgainst;
        }
      }

      // Sort standing items
      const sorted = Array.from(teamMap.values()).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        return a.teamName.localeCompare(b.teamName);
      });

      sorted.forEach((item, idx) => {
        item.position = idx + 1;
      });

      result[key] = sorted;
    }

    // Persist all calculated group standings into MySQL table_standings
    if (pool && isMySqlConnected) {
      try {
        const allItems: TeamStandingItem[] = [];
        for (const k of Object.keys(result)) {
          const items = result[k] || [];
          for (const item of items) {
            allItems.push(item);
          }
        }

        // Auto-prune orphaned standings: delete rows in table_standings that no longer exist in current groups/matches
        const validIds = allItems.map(item =>
          `std-${item.category}-${item.groupName}-${item.teamName}`.toLowerCase().replace(/[^a-z0-9-]/g, '_')
        );

        if (category) {
          if (validIds.length > 0) {
            const placeholders = validIds.map(() => '?').join(', ');
            await pool.query(
              `DELETE FROM table_standings WHERE category_id = ? AND id NOT IN (${placeholders})`,
              [category, ...validIds]
            );
          } else {
            await pool.query('DELETE FROM table_standings WHERE category_id = ?', [category]);
          }
        } else {
          if (validIds.length > 0) {
            const placeholders = validIds.map(() => '?').join(', ');
            await pool.query(
              `DELETE FROM table_standings WHERE id NOT IN (${placeholders})`,
              validIds
            );
          }
        }

        if (allItems.length > 0) {
          // Batch insert in chunks of 50 to avoid query size / parameter limits
          const chunkSize = 50;
          for (let i = 0; i < allItems.length; i += chunkSize) {
            const chunk = allItems.slice(i, i + chunkSize);
            const valuePlaceholders: string[] = [];
            const params: any[] = [];

            for (const item of chunk) {
              const standingId = `std-${item.category}-${item.groupName}-${item.teamName}`.toLowerCase().replace(/[^a-z0-9-]/g, '_');
              valuePlaceholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
              params.push(
                standingId, item.category, item.groupName, item.teamName, null, item.institution || null, item.teamLogo || null,
                item.position, item.played, item.won, item.drawn, item.lost, item.goalsFor, item.goalsAgainst, item.goalDifference, item.points
              );
            }

            const sql = `
              INSERT INTO table_standings (
                id, category_id, group_name, team_name, team_id, institution_name, team_logo,
                position, played, won, drawn, lost, goals_for, goals_against, goal_difference, points
              ) VALUES ${valuePlaceholders.join(', ')}
              ON DUPLICATE KEY UPDATE
                position = VALUES(position),
                played = VALUES(played),
                won = VALUES(won),
                drawn = VALUES(drawn),
                lost = VALUES(lost),
                goals_for = VALUES(goals_for),
                goals_against = VALUES(goals_against),
                goal_difference = VALUES(goal_difference),
                points = VALUES(points),
                institution_name = VALUES(institution_name),
                team_logo = VALUES(team_logo)
            `;

            await pool.query(sql, params);
          }
        }
        invalidateStandingsCache();
      } catch (err: any) {
        console.error('Error persisting standings to table_standings in MySQL:', err);
      }
    }

    return result;
  },

  async getStandingsFromDb(category?: string, forceRefresh = false): Promise<Record<string, TeamStandingItem[]>> {
    const cacheKey = category || '__ALL__';
    if (!forceRefresh && standingsDbCache.has(cacheKey)) {
      const cached = standingsDbCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < 15000) {
        return cached.data;
      }
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        let query = 'SELECT * FROM table_standings WHERE 1=1';
        const params: any[] = [];
        if (category) {
          query += ' AND category_id = ?';
          params.push(category);
        }
        query += ' ORDER BY category_id ASC, group_name ASC, position ASC, points DESC, goal_difference DESC';
        const [rows]: any = await pool.query(query, params);
        if (Array.isArray(rows) && rows.length > 0) {
          const map: Record<string, TeamStandingItem[]> = {};
          for (const r of rows) {
            const key = `${r.category_id}:::${r.group_name}`;
            if (!map[key]) map[key] = [];
            map[key].push({
              position: Number(r.position) || 0,
              teamName: r.team_name,
              institution: r.institution_name || undefined,
              teamLogo: r.team_logo || undefined,
              groupName: r.group_name,
              category: r.category_id,
              played: Number(r.played) || 0,
              won: Number(r.won) || 0,
              drawn: Number(r.drawn) || 0,
              lost: Number(r.lost) || 0,
              goalsFor: Number(r.goals_for) || 0,
              goalsAgainst: Number(r.goals_against) || 0,
              goalDifference: Number(r.goal_difference) || 0,
              points: Number(r.points) || 0,
            });
          }
          standingsDbCache.set(cacheKey, { data: map, timestamp: Date.now() });
          return map;
        }
      } catch (err) {
        console.error('Error fetching standings from table_standings:', err);
      }
    }
    // Fallback to real-time calculation if table_standings is not populated yet
    const calculated = await this.calculateStandings(category);
    standingsDbCache.set(cacheKey, { data: calculated, timestamp: Date.now() });
    return calculated;
  },

  async syncPlayerStatsFromMatches(category?: string): Promise<void> {
    await ensureDbConnected();
    const matches = await this.getMatches();
    const relevantMatches = category ? matches.filter(m => m.category === category) : matches;

    // Tally stats per player: key = `${category}:::${playerName.toLowerCase()}`
    const statsMap = new Map<string, { goals: number; yellow: number; red: number }>();
    for (const m of relevantMatches) {
      if (m.events && Array.isArray(m.events)) {
        for (const ev of m.events) {
          if (!ev.playerName) continue;
          const pName = ev.playerName.trim();
          const key = `${m.category}:::${pName.toLowerCase()}`;
          const current = statsMap.get(key) || { goals: 0, yellow: 0, red: 0 };
          if (ev.type === 'GOAL') current.goals += 1;
          if (ev.type === 'YELLOW') current.yellow += 1;
          if (ev.type === 'RED') current.red += 1;
          statsMap.set(key, current);
        }
      }
    }

    // Update in-memory player store
    for (const p of memStore.players) {
      if (!category || p.category === category) {
        const key = `${p.category}:::${p.name.trim().toLowerCase()}`;
        const stats = statsMap.get(key);
        p.goals = stats ? stats.goals : 0;
        p.yellowCards = stats ? stats.yellow : 0;
        p.redCards = stats ? stats.red : 0;
      }
    }
    persistLocalStore();

    // Update MySQL table_players
    if (pool && isMySqlConnected) {
      try {
        let fetchQuery = 'SELECT id, category_id, name, goals, yellow_cards, red_cards FROM table_players WHERE 1=1';
        const params: any[] = [];
        if (category) {
          fetchQuery += ' AND category_id = ?';
          params.push(category);
        }
        const [rows]: any = await pool.query(fetchQuery, params);
        if (Array.isArray(rows)) {
          const playersToUpdate: { id: string; goals: number; yellow: number; red: number }[] = [];
          for (const r of rows) {
            const key = `${r.category_id}:::${String(r.name).trim().toLowerCase()}`;
            const stats = statsMap.get(key);
            const goals = stats ? stats.goals : 0;
            const yellow = stats ? stats.yellow : 0;
            const red = stats ? stats.red : 0;
            const curGoals = Number(r.goals) || 0;
            const curYellow = Number(r.yellow_cards) || 0;
            const curRed = Number(r.red_cards) || 0;

            if (curGoals !== goals || curYellow !== yellow || curRed !== red) {
              playersToUpdate.push({ id: r.id, goals, yellow, red });
            }
          }

          if (playersToUpdate.length > 0) {
            // Update only players whose stats actually changed in parallel
            await Promise.all(
              playersToUpdate.map(p =>
                pool.query(
                  'UPDATE table_players SET goals = ?, yellow_cards = ?, red_cards = ? WHERE id = ?',
                  [p.goals, p.yellow, p.red, p.id]
                )
              )
            );
          }
        }
      } catch (err) {
        console.error('Error syncing player stats in MySQL:', err);
      }
    }
  },
};
