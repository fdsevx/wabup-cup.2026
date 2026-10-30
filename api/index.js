// server/serverless.ts
import express from "express";
import compression from "compression";

// server/routes.ts
import { Router as Router4 } from "express";

// server/db.ts
import "dotenv/config";

// server/config.ts
import "dotenv/config";
import mysql from "mysql2/promise";
import cors from "cors";
var dbUrl = process.env.DATABASE_URL;
var tidbHost = process.env.TIDB_HOST || process.env.MYSQL_HOST;
var tidbPort = process.env.TIDB_PORT || process.env.MYSQL_PORT || "4000";
var tidbUser = process.env.TIDB_USER || process.env.MYSQL_USER;
var tidbPassword = process.env.TIDB_PASSWORD || process.env.MYSQL_PASSWORD;
var tidbDatabase = process.env.TIDB_DATABASE || process.env.MYSQL_DATABASE;
if (!dbUrl) {
  if (!tidbHost) throw new Error("Missing env TIDB_HOST or MYSQL_HOST");
  if (!tidbUser) throw new Error("Missing env TIDB_USER or MYSQL_USER");
  if (!tidbPassword) throw new Error("Missing env TIDB_PASSWORD or MYSQL_PASSWORD");
  if (!tidbDatabase) throw new Error("Missing env TIDB_DATABASE or MYSQL_DATABASE");
}
var sslOptions = {
  minVersion: "TLSv1.2",
  rejectUnauthorized: true
};
var cleanedDbUrl = dbUrl ? dbUrl.replace(/([?&])sslaccept=[^&]*(&|$)/g, (_m, p1, p2) => p1 === "?" && p2 ? "?" : "").replace(/[?&]$/, "") : dbUrl;
var poolConfig = cleanedDbUrl ? {
  uri: cleanedDbUrl,
  ssl: sslOptions,
  connectionLimit: 5,
  enableKeepAlive: true,
  idleTimeout: 6e4
} : {
  host: tidbHost,
  port: parseInt(tidbPort, 10),
  user: tidbUser,
  password: tidbPassword,
  database: tidbDatabase,
  ssl: sslOptions,
  connectionLimit: 5,
  enableKeepAlive: true,
  idleTimeout: 6e4
};
var pool = mysql.createPool(poolConfig);
var corsMiddleware = (req, res, next) => {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  if (!allowedOriginsEnv || !allowedOriginsEnv.trim()) {
    return next();
  }
  const origins = allowedOriginsEnv.split(",").map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0) {
    return next();
  }
  return cors({
    origin: origins,
    credentials: true
  })(req, res, next);
};

// server/db.ts
import crypto from "crypto";

// server/b2.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var client = null;
function isB2Configured() {
  return Boolean(
    process.env.B2_KEY_ID && process.env.B2_APP_KEY && process.env.B2_REGION && process.env.B2_BUCKET
  );
}
function getClient() {
  if (client) return client;
  const region = String(process.env.B2_REGION);
  client = new S3Client({
    region,
    endpoint: process.env.B2_ENDPOINT || `https://s3.${region}.backblazeb2.com`,
    credentials: {
      accessKeyId: String(process.env.B2_KEY_ID),
      secretAccessKey: String(process.env.B2_APP_KEY)
    },
    // B2 belum mendukung header checksum default AWS SDK v3 terbaru.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED"
  });
  return client;
}
var bucket = () => String(process.env.B2_BUCKET);
async function presignPut(key, contentType, contentLength, expiresIn = 600) {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: contentLength }),
    { expiresIn }
  );
}
async function presignGet(key, opts = {}) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: opts.disposition
    }),
    { expiresIn: opts.expiresIn ?? 600 }
  );
}
async function getB2ObjectStream(key) {
  return await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
}
async function deleteB2Objects(keys) {
  if (!isB2Configured() || keys.length === 0) return;
  await Promise.allSettled(
    keys.map((Key) => getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key })))
  );
}

// server/db/mediaSchema.ts
async function ensureMediaColumns(pool2) {
  try {
    const [rows] = await pool2.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_media_storage'`
    );
    const have = new Set(rows.map((r) => String(r.COLUMN_NAME).toLowerCase()));
    if (have.size === 0) return;
    if (!have.has("storage")) {
      await pool2.query("ALTER TABLE app_media_storage ADD COLUMN storage VARCHAR(8) NOT NULL DEFAULT 'db'");
    }
    if (!have.has("file_key")) {
      await pool2.query("ALTER TABLE app_media_storage ADD COLUMN file_key VARCHAR(255) NULL");
    }
  } catch (err) {
    console.warn("[ensureMediaColumns] gagal menambah kolom:", err?.message || err);
  }
}

// server/defaultSystemData.ts
var DEFAULT_SECTIONS_VISIBILITY = {
  hero: true,
  liveScore: true,
  categories: true,
  bracket: true,
  venue: true,
  sponsors: true,
  klasemenLanding: true,
  standaloneKlasemen: true,
  registrationButton: true
};
var DEFAULT_TOURNAMENT_CONFIG = {
  name: "WabupCup",
  edition: "2026",
  tagline: "Turnamen Futsal Perebutan Piala Wakil Bupati",
  registrationDeadline: "2026-10-15",
  tournamentStartDate: "2026-10-24",
  tournamentEndDate: "2026-11-08",
  venueName: "Gedung Utama GOR Tawang Alun Banyuwangi",
  venueAddress: "Jl. Wijaya Kusuma, Lingkungan Cuking Rw., Mojopanggung, Kec. Giri, Kabupaten Banyuwangi, Jawa Timur 68425, Kabupaten Banyuwangi",
  venueCity: "Kabupaten Banyuwangi",
  googleMapsEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3948.921835941096!2d114.34936872662414!3d-8.210615691821596!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2dd14545d37030e3%3A0x3f601cc59d28c3c8!2sGedung%20Utama%20GOR%20Tawang%20Alun%20Banyuwangi!5e0!3m2!1sid!2sid!4v1788166952611!5m2!1sid!2sid",
  totalPrizePool: 58e6,
  adminContactPhone: "6285233909898",
  adminContactEmail: "infinityorganizer01.22@gmail.com",
  bankAccounts: [],
  downloadableDocs: [],
  committeeContacts: [],
  committeeEmails: [],
  committeeChairmanName: "AHMAT IQBAL FIRDAUS",
  committeeChairmanTitle: "Ketua Panitia Pelaksana Wabup Cup 2026",
  registrationButtonMode: "INTERNAL_FORM",
  registrationCustomLink: "",
  registrationCustomButtonText: "",
  registrationCustomLinkNewTab: true,
  sectionsVisibility: { ...DEFAULT_SECTIONS_VISIBILITY },
  sectionsBackgrounds: {
    hero: {
      mode: "DEFAULT",
      bgColor: "#020617",
      desktopImage: "",
      mobileImage: "",
      overlayColor: "#000000",
      overlayOpacity: 60,
      overlayBlur: false,
      textColorMode: "LIGHT"
    },
    liveScore: {
      mode: "DEFAULT",
      bgColor: "#0f172a",
      desktopImage: "",
      mobileImage: "",
      overlayColor: "#000000",
      overlayOpacity: 60,
      overlayBlur: false,
      textColorMode: "AUTO"
    },
    categories: {
      mode: "DEFAULT",
      bgColor: "#0b0f19",
      desktopImage: "",
      mobileImage: "",
      overlayColor: "#000000",
      overlayOpacity: 60,
      overlayBlur: false,
      textColorMode: "AUTO"
    },
    bracket: {
      mode: "DEFAULT",
      bgColor: "#0f172a",
      desktopImage: "",
      mobileImage: "",
      overlayColor: "#000000",
      overlayOpacity: 60,
      overlayBlur: false,
      textColorMode: "AUTO"
    },
    venue: {
      mode: "DEFAULT",
      bgColor: "#020617",
      desktopImage: "",
      mobileImage: "",
      overlayColor: "#000000",
      overlayOpacity: 60,
      overlayBlur: false,
      textColorMode: "AUTO"
    },
    sponsors: {
      mode: "DEFAULT",
      bgColor: "#020617",
      desktopImage: "",
      mobileImage: "",
      overlayColor: "#000000",
      overlayOpacity: 60,
      overlayBlur: false,
      textColorMode: "AUTO"
    },
    footer: {
      mode: "DEFAULT",
      bgColor: "#020617",
      desktopImage: "",
      mobileImage: "",
      overlayColor: "#000000",
      overlayOpacity: 70,
      overlayBlur: false,
      textColorMode: "AUTO"
    }
  }
};
var DEFAULT_CATEGORIES = [];
var DEFAULT_ADMIN_USERS = [];

// src/utils/registrationCode.ts
function generateUniqueRegCode(category, existingList = []) {
  const normCat = (category || "UMUM").trim().toUpperCase();
  const prefix = `WBC-${normCat}-`;
  const existingCodes = /* @__PURE__ */ new Set();
  let maxSeq = 0;
  if (Array.isArray(existingList)) {
    for (const item of existingList) {
      if (!item) continue;
      const code = typeof item.regCode === "string" ? item.regCode.trim().toUpperCase() : "";
      if (!code) continue;
      existingCodes.add(code);
      if (code.startsWith(prefix)) {
        const numPart = code.slice(prefix.length);
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed) && parsed > maxSeq) {
          maxSeq = parsed;
        }
      }
    }
  }
  let nextSeq = maxSeq + 1;
  let candidate = `${prefix}${String(nextSeq).padStart(3, "0")}`;
  while (existingCodes.has(candidate)) {
    nextSeq++;
    candidate = `${prefix}${String(nextSeq).padStart(3, "0")}`;
  }
  return candidate;
}

// server/db.ts
async function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`scrypt$${salt}$${derivedKey.toString("hex")}`);
    });
  });
}
async function verifyPassword(password, hash) {
  if (!hash) return false;
  if (!hash.startsWith("scrypt$")) {
    return password === hash;
  }
  return new Promise((resolve, reject) => {
    const parts = hash.split("$");
    if (parts.length !== 3) return resolve(false);
    const salt = parts[1];
    const key = parts[2];
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      try {
        const keyBuffer = Buffer.from(key, "hex");
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch (e) {
        resolve(false);
      }
    });
  });
}
var DUMMY_SCRYPT_HASH = "scrypt$d04130089e0ad78f5664d99e557224f8$20412e8b2b73bc367408d6d6719b22a07d32a0c7eb16c87e45214ad6e87f2ffbe88dbd144ba972e35a1a1e7b8c73b062aa48d6728da5e02e860959eeea50c58a";
var MemoryStore = class {
  constructor() {
    this.config = { ...DEFAULT_TOURNAMENT_CONFIG };
    this.categories = [...DEFAULT_CATEGORIES];
    this.registrations = [];
    this.matches = [];
    this.sponsors = [];
    this.adminUsers = [...DEFAULT_ADMIN_USERS];
    this.players = [];
    this.groups = [];
    this.media = /* @__PURE__ */ new Map();
  }
};
var memStore = new MemoryStore();
var categoriesCache = null;
var categoryQuotasCache = null;
var matchesCache = null;
var playersCache = /* @__PURE__ */ new Map();
var standingsDbCache = /* @__PURE__ */ new Map();
var publicRegistrationsCache = null;
var configCache = null;
var sponsorsCache = null;
var groupsCache = /* @__PURE__ */ new Map();
var mediaMetaCache = /* @__PURE__ */ new Map();
function invalidateMatchesCache() {
  matchesCache = null;
}
function invalidatePlayersCache() {
  playersCache.clear();
}
function invalidateStandingsCache() {
  standingsDbCache.clear();
}
function invalidatePublicRegistrationsCache() {
  publicRegistrationsCache = null;
}
function invalidateConfigCache() {
  configCache = null;
}
function invalidateSponsorsCache() {
  sponsorsCache = null;
}
function invalidateGroupsCache() {
  groupsCache.clear();
}
function invalidateMediaMetaCache(id) {
  if (id) {
    mediaMetaCache.delete(id);
  } else {
    mediaMetaCache.clear();
  }
}
function persistLocalStore() {
}
var isMySqlConnected = false;
var mySqlError = null;
function getMySqlStatus() {
  return {
    connected: isMySqlConnected,
    host: process.env.TIDB_HOST || "From ENV",
    database: process.env.TIDB_DATABASE || "wabupcup2026",
    error: mySqlError,
    mode: isMySqlConnected ? "MYSQL_REAL" : "MEMORY_FALLBACK",
    stats: {
      categoriesCount: memStore.categories.length,
      registrationsCount: memStore.registrations.length,
      matchesCount: memStore.matches.length,
      sponsorsCount: memStore.sponsors.length,
      adminsCount: memStore.adminUsers.length
    }
  };
}
var dbInitPromise = null;
async function ensureDbConnected() {
  if (isMySqlConnected) return true;
  if (!dbInitPromise) {
    dbInitPromise = initDatabaseConnection().finally(() => {
      dbInitPromise = null;
    });
  }
  try {
    return await dbInitPromise;
  } catch {
    return isMySqlConnected;
  }
}
async function initDatabaseConnection() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    isMySqlConnected = true;
    mySqlError = null;
    await autoMigrateTables();
    return true;
  } catch (err) {
    isMySqlConnected = false;
    mySqlError = err?.message || "Failed to connect to TiDB";
    console.error("[MySQL Warning] Could not connect:", mySqlError);
    return false;
  }
}
var isSchemaChecked = false;
async function autoMigrateTables() {
  if (!pool || !isMySqlConnected || isSchemaChecked) return;
  try {
    await runFullSchemaInit();
    await ensureMediaColumns(pool);
    isSchemaChecked = true;
  } catch (err) {
    console.error("[MySQL] Error checking tables:", err);
  }
}
async function seedInitialAdminIfConfigured() {
  const initUser = (process.env.INITIAL_ADMIN_USERNAME || "").trim().toLowerCase();
  const initPass = (process.env.INITIAL_ADMIN_PASSWORD || "").trim();
  if (!initUser || !initPass) {
    console.warn("[Security] Tabel admin_users kosong dan INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD tidak dikonfigurasi. Tidak ada akun admin bawaan yang dibuat.");
    return false;
  }
  if (initPass.length < 12) {
    console.warn("[Security] INITIAL_ADMIN_PASSWORD kurang dari 12 karakter. Penyemaian admin awal dibatalkan demi keamanan.");
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
          "Administrator Utama",
          "SUPERADMIN",
          null,
          null,
          "bg-red-600"
        ]
      );
      console.log(`[Security] Berhasil menyemai 1 akun SUPERADMIN awal (${initUser}) dengan scrypt password hash.`);
    } catch (err) {
      console.error("[Security] Gagal menyemai admin awal ke MySQL:", err?.message || err);
      return false;
    }
  }
  const safeAdmin = {
    id: adminId,
    username: initUser,
    fullName: "Administrator Utama",
    role: "SUPERADMIN",
    email: "",
    phone: "",
    avatarColor: "bg-red-600",
    createdAt: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  };
  const memIdx = memStore.adminUsers.findIndex((a) => a.username.toLowerCase() === initUser);
  if (memIdx >= 0) {
    memStore.adminUsers[memIdx] = safeAdmin;
  } else {
    memStore.adminUsers.push(safeAdmin);
  }
  return true;
}
async function runFullSchemaInit() {
  if (!pool || !isMySqlConnected) {
    return { success: true, message: "In-memory data reloaded successfully" };
  }
  try {
    await pool.query("SET FOREIGN_KEY_CHECKS = 0;");
  } catch {
  }
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
  ];
  for (const q of queries) {
    try {
      await pool.query(q);
    } catch (qErr) {
      console.warn("[MySQL Schema Init] Non-blocking notice for query:", qErr?.message || qErr);
    }
  }
  try {
    await pool.query("SET FOREIGN_KEY_CHECKS = 1;");
  } catch {
  }
  const [catRows] = await pool.query("SELECT COUNT(*) as count FROM categories");
  if (catRows[0].count === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      await pool.query(
        `INSERT INTO categories (id, name, badge_title, age_restriction, max_teams, registered_teams_count, registration_fee, total_prize, description, prizes_json, rules_json) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cat.id,
          cat.name,
          cat.badgeTitle || "",
          cat.ageRestriction,
          cat.maxTeams,
          cat.registeredTeamsCount,
          cat.registrationFee,
          cat.totalPrize,
          cat.description || "",
          JSON.stringify(cat.prizes),
          JSON.stringify(cat.rules)
        ]
      );
    }
  }
  const [admRows] = await pool.query("SELECT COUNT(*) as count FROM admin_users");
  if (admRows[0].count === 0) {
    await seedInitialAdminIfConfigured();
  }
  const [cfgRows] = await pool.query("SELECT COUNT(*) as count FROM tournament_config");
  if (cfgRows[0].count === 0) {
    await pool.query(
      `INSERT INTO tournament_config (config_key, config_value) VALUES (?, ?)`,
      ["main_config", JSON.stringify(DEFAULT_TOURNAMENT_CONFIG)]
    );
  }
  return { success: true, message: "MySQL Database Tables Initialized and Seeded Successfully" };
}
function sanitizeRegistrationDocuments(rawDocs, regId) {
  const docs = typeof rawDocs === "string" ? JSON.parse(rawDocs) : rawDocs || {};
  const sanitized = {};
  for (const [key, doc] of Object.entries(docs)) {
    if (!doc || typeof doc !== "object") continue;
    const d = doc;
    let url = d.url;
    if (!url && typeof d.fileData === "string" && (d.fileData.startsWith("/api/") || d.fileData.startsWith("http://") || d.fileData.startsWith("https://"))) {
      url = d.fileData;
    }
    if (!url && typeof d.previewUrl === "string" && (d.previewUrl.startsWith("/api/") || d.previewUrl.startsWith("http://") || d.previewUrl.startsWith("https://"))) {
      url = d.previewUrl;
    }
    if (!url && d.fileData && (d.fileData.startsWith("data:") || d.fileData.length > 200)) {
      url = `/api/registrations/${regId}/doc/${key}`;
    }
    sanitized[key] = {
      name: d.name || "Dokumen",
      size: d.size || "Ukuran tidak diketahui",
      uploadDate: d.uploadDate || "",
      type: d.type || "application/pdf",
      url: url || void 0,
      // CRITICAL FOR FOT: Never send heavy base64 strings in the registrations list!
      // Setting fileData to the url ensures components that read doc.fileData still work without re-downloading base64!
      fileData: url || void 0
    };
  }
  return sanitized;
}
async function purgeB2Objects(where, params) {
  if (!pool || !isMySqlConnected || !isB2Configured()) return;
  try {
    const [rows] = await pool.query(
      `SELECT file_key FROM app_media_storage WHERE storage = 'b2' AND file_key IS NOT NULL AND (${where})`,
      params
    );
    const keys = rows.map((r) => String(r.file_key)).filter(Boolean);
    if (keys.length) await deleteB2Objects(keys);
  } catch (err) {
    console.warn("[purgeB2Objects] dilewati:", err?.message || err);
  }
}
function sanitizeAdminUser(admin) {
  if (!admin) return admin;
  const { password, password_hash, ...rest } = admin;
  return rest;
}
var Database = {
  // Config
  async getConfig(forceRefresh = false) {
    if (!forceRefresh && configCache && Date.now() - configCache.timestamp < 12e4) {
      return configCache.data;
    }
    await ensureDbConnected();
    let result = {
      ...memStore.config,
      sectionsVisibility: {
        ...DEFAULT_SECTIONS_VISIBILITY,
        ...memStore.config.sectionsVisibility || {}
      }
    };
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query("SELECT config_value FROM tournament_config WHERE config_key = ?", ["main_config"]);
        if (rows.length > 0) {
          const parsed = JSON.parse(rows[0].config_value);
          result = {
            ...DEFAULT_TOURNAMENT_CONFIG,
            ...parsed,
            sectionsVisibility: {
              ...DEFAULT_SECTIONS_VISIBILITY,
              ...parsed.sectionsVisibility || {}
            }
          };
        }
      } catch (err) {
        console.error("Error fetching config from MySQL:", err);
      }
    }
    configCache = { data: result, timestamp: Date.now() };
    return result;
  },
  async updateConfig(newConfig) {
    invalidateConfigCache();
    await ensureDbConnected();
    const current = await this.getConfig();
    const updated = {
      ...current,
      ...newConfig,
      bankAccounts: newConfig.bankAccounts !== void 0 ? newConfig.bankAccounts : current.bankAccounts || [],
      bankAccount: newConfig.bankAccount !== void 0 ? newConfig.bankAccount : current.bankAccount,
      committeeContacts: newConfig.committeeContacts !== void 0 ? newConfig.committeeContacts : current.committeeContacts || [],
      committeeEmails: newConfig.committeeEmails !== void 0 ? newConfig.committeeEmails : current.committeeEmails || [],
      downloadableDocs: newConfig.downloadableDocs !== void 0 ? newConfig.downloadableDocs : current.downloadableDocs || [],
      sectionsBackgrounds: {
        ...current.sectionsBackgrounds || {},
        ...newConfig.sectionsBackgrounds || {}
      },
      sectionsVisibility: {
        ...DEFAULT_SECTIONS_VISIBILITY,
        ...current.sectionsVisibility || {},
        ...newConfig.sectionsVisibility || {}
      }
    };
    const offloadMedia = async (dataUri, category, filename, refId, subKey) => {
      if (!dataUri || !dataUri.startsWith("data:") || dataUri.length < 200) {
        return dataUri;
      }
      try {
        const id = `med-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
        const mimeMatch = dataUri.match(/^data:([^;]+);base64,/);
        const contentType = mimeMatch ? mimeMatch[1] : "application/octet-stream";
        const base64Content = dataUri.replace(/^data:[^;]+;base64,/, "");
        const fileSize = Math.round(base64Content.length * 3 / 4);
        await Database.saveMedia({
          id,
          category,
          refId,
          subKey,
          filename,
          contentType,
          fileSize,
          fileData: dataUri
        });
        return `/api/media/view/${id}`;
      } catch (err) {
        console.error("Failed to offload Base64 to app_media_storage:", err);
        return dataUri;
      }
    };
    if (updated.downloadableDocs && updated.downloadableDocs.length > 0) {
      for (let i = 0; i < updated.downloadableDocs.length; i++) {
        const doc = updated.downloadableDocs[i];
        if (doc.fileUrl && doc.fileUrl.startsWith("data:")) {
          const offloadedUrl = await offloadMedia(
            doc.fileUrl,
            "CMS_DOC",
            doc.fileName || `${(doc.title || "dokumen").replace(/\s+/g, "_")}.${(doc.fileType || "pdf").toLowerCase()}`,
            "config_doc",
            doc.id || `doc_${i}`
          );
          if (offloadedUrl) doc.fileUrl = offloadedUrl;
        }
      }
    }
    if (updated.formulirTemplateUrl && updated.formulirTemplateUrl.startsWith("data:")) {
      const offloaded = await offloadMedia(
        updated.formulirTemplateUrl,
        "CMS_DOC",
        "Formulir_Pendaftaran.pdf",
        "config_template",
        "formulir"
      );
      if (offloaded) updated.formulirTemplateUrl = offloaded;
    }
    if (updated.suratPernyataanTemplateUrl && updated.suratPernyataanTemplateUrl.startsWith("data:")) {
      const offloaded = await offloadMedia(
        updated.suratPernyataanTemplateUrl,
        "CMS_DOC",
        "Surat_Pernyataan.pdf",
        "config_template",
        "surat_pernyataan"
      );
      if (offloaded) updated.suratPernyataanTemplateUrl = offloaded;
    }
    if (updated.regulasiPdfUrl && updated.regulasiPdfUrl.startsWith("data:")) {
      const offloaded = await offloadMedia(
        updated.regulasiPdfUrl,
        "CMS_DOC",
        "Buku_Regulasi.pdf",
        "config_template",
        "regulasi"
      );
      if (offloaded) updated.regulasiPdfUrl = offloaded;
    }
    const legacyBankAccount = updated.bankAccount;
    if (legacyBankAccount?.qrisImageUrl && typeof legacyBankAccount.qrisImageUrl === "string" && legacyBankAccount.qrisImageUrl.startsWith("data:")) {
      const offloaded = await offloadMedia(
        legacyBankAccount.qrisImageUrl,
        "CMS_WALLPAPER",
        "QRIS_Bank.jpg",
        "config_bank",
        "qris"
      );
      if (offloaded) legacyBankAccount.qrisImageUrl = offloaded;
    }
    if (updated.bankAccounts && updated.bankAccounts.length > 0) {
      for (const b of updated.bankAccounts) {
        if (b.qrisImageUrl && b.qrisImageUrl.startsWith("data:")) {
          const offloaded = await offloadMedia(
            b.qrisImageUrl,
            "CMS_WALLPAPER",
            `QRIS_${b.id}.jpg`,
            "config_bank",
            b.id
          );
          if (offloaded) b.qrisImageUrl = offloaded;
        }
      }
    }
    if (updated.sectionsBackgrounds) {
      for (const [secKey, secBg] of Object.entries(updated.sectionsBackgrounds)) {
        if (secBg?.desktopImage && secBg.desktopImage.startsWith("data:")) {
          const offloaded = await offloadMedia(
            secBg.desktopImage,
            "CMS_WALLPAPER",
            `bg_${secKey}_desktop.jpg`,
            "config_bg",
            `${secKey}_desktop`
          );
          if (offloaded) secBg.desktopImage = offloaded;
        }
        if (secBg?.mobileImage && secBg.mobileImage.startsWith("data:")) {
          const offloaded = await offloadMedia(
            secBg.mobileImage,
            "CMS_WALLPAPER",
            `bg_${secKey}_mobile.jpg`,
            "config_bg",
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
          ["main_config", JSON.stringify(updated), JSON.stringify(updated)]
        );
      } catch (err) {
        console.error("Error saving config to MySQL:", err);
      }
    }
    return updated;
  },
  // Memory caches to drastically reduce TiDB Cloud RU usage
  // Categories
  async getCategories(forceRefresh = false) {
    if (!forceRefresh && categoriesCache && Date.now() - categoriesCache.timestamp < 3e4) {
      return categoriesCache.data;
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query(`
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
        const result = rows.map((r) => ({
          id: r.id,
          name: r.name,
          badgeTitle: r.badge_title,
          ageRestriction: r.age_restriction,
          maxTeams: r.max_teams,
          registeredTeamsCount: Number(r.actual_count !== void 0 && r.actual_count !== null ? r.actual_count : r.registered_teams_count || 0),
          registrationFee: Number(r.registration_fee),
          totalPrize: Number(r.total_prize),
          description: r.description,
          prizes: typeof r.prizes_json === "string" ? JSON.parse(r.prizes_json) : r.prizes_json || [],
          rules: typeof r.rules_json === "string" ? JSON.parse(r.rules_json) : r.rules_json || []
        }));
        categoriesCache = { data: result, timestamp: Date.now() };
        return result;
      } catch (err) {
        console.error("Error getting categories from MySQL:", err);
      }
    }
    return memStore.categories.map((c) => {
      const actualCount = memStore.registrations.filter(
        (r) => (r.category === c.id || c.name && r.category === c.name) && ["PENDING_PAYMENT", "PENDING", "APPROVED", "REJECTED"].includes(r.status)
      ).length;
      return {
        ...c,
        registeredTeamsCount: actualCount > 0 ? actualCount : c.registeredTeamsCount || 0
      };
    });
  },
  async getCategoryQuotas(forceRefresh = false) {
    if (!forceRefresh && categoryQuotasCache && Date.now() - categoryQuotasCache.timestamp < 3e4) {
      return categoryQuotasCache.data;
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query(`
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
          const result = rows.map((r) => ({
            id: r.id,
            maxTeams: Number(r.max_teams || 0),
            registeredTeamsCount: Number(r.actual_count !== void 0 && r.actual_count !== null ? r.actual_count : r.registered_teams_count || 0)
          }));
          categoryQuotasCache = { data: result, timestamp: Date.now() };
          return result;
        }
      } catch (err) {
        console.error("Error getting category quotas from MySQL:", err);
      }
    }
    return memStore.categories.map((c) => {
      const actualCount = memStore.registrations.filter(
        (r) => (r.category === c.id || c.name && r.category === c.name) && ["PENDING_PAYMENT", "PENDING", "APPROVED", "REJECTED"].includes(r.status)
      ).length;
      return {
        id: c.id,
        maxTeams: Number(c.maxTeams || 0),
        registeredTeamsCount: actualCount > 0 ? actualCount : Number(c.registeredTeamsCount || 0)
      };
    });
  },
  async saveCategory(cat) {
    await ensureDbConnected();
    const idx = memStore.categories.findIndex((c) => c.id === cat.id);
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
            cat.id,
            cat.name,
            cat.badgeTitle || "",
            cat.ageRestriction,
            cat.maxTeams,
            cat.registeredTeamsCount,
            cat.registrationFee,
            cat.totalPrize,
            cat.description || "",
            JSON.stringify(cat.prizes),
            JSON.stringify(cat.rules),
            cat.name,
            cat.badgeTitle || "",
            cat.ageRestriction,
            cat.maxTeams,
            cat.registrationFee,
            cat.totalPrize,
            cat.description || "",
            JSON.stringify(cat.prizes),
            JSON.stringify(cat.rules)
          ]
        );
      } catch (err) {
        console.error("Error saving category to MySQL:", err);
      }
    }
    return cat;
  },
  async deleteCategory(categoryId) {
    await ensureDbConnected();
    memStore.categories = memStore.categories.filter((c) => c.id !== categoryId);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM categories WHERE id = ?", [categoryId]);
      } catch (err) {
        console.error("Error deleting category from MySQL:", err);
      }
    }
    return true;
  },
  async reorderCategories(categories) {
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
              cat.id,
              cat.name,
              cat.badgeTitle || "",
              cat.ageRestriction,
              cat.maxTeams,
              cat.registeredTeamsCount,
              cat.registrationFee,
              cat.totalPrize,
              cat.description || "",
              JSON.stringify(cat.prizes),
              JSON.stringify(cat.rules),
              i,
              i,
              cat.name,
              cat.maxTeams,
              cat.registrationFee,
              cat.totalPrize
            ]
          );
        }));
      } catch (err) {
        console.error("Error reordering categories in MySQL:", err);
      }
    }
    return categories;
  },
  async syncCategoryRegisteredCounts() {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [counts] = await pool.query(`
          SELECT category_id, category, COUNT(*) as count 
          FROM registrations 
          GROUP BY category_id, category
        `);
        await pool.query("UPDATE categories SET registered_teams_count = 0");
        await Promise.all(counts.map(async (row) => {
          await pool.query(
            "UPDATE categories SET registered_teams_count = ? WHERE name = ? OR id = ?",
            [row.count, row.category, row.category_id || row.category]
          );
        }));
      } catch (err) {
        console.error("Error syncing category registered counts:", err);
      }
    }
  },
  // Registrations
  async getRegistrations() {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query("SELECT * FROM registrations ORDER BY created_at DESC");
        if (Array.isArray(rows)) {
          return rows.map((r) => ({
            id: r.id,
            regCode: r.reg_code,
            category: r.category_id,
            teamName: r.team_name,
            teamLogo: r.team_logo || void 0,
            institutionName: r.institution_name,
            coachName: r.coach_name,
            coachPhone: r.coach_phone,
            coachEmail: r.coach_email || "",
            playerCount: r.player_count,
            officialCount: r.official_count,
            registrationDate: r.registration_date,
            status: r.status,
            paymentStatus: r.payment_status,
            paymentAmount: Number(r.payment_amount),
            rejectionReason: r.rejection_reason || void 0,
            adminNotes: r.admin_notes || void 0,
            documents: sanitizeRegistrationDocuments(r.documents_json, r.id),
            lastUpdated: r.last_updated || r.registration_date
          }));
        }
      } catch (err) {
        console.error("Error fetching registrations from MySQL:", err);
      }
    }
    return memStore.registrations.map((r) => ({
      ...r,
      documents: sanitizeRegistrationDocuments(r.documents, r.id)
    }));
  },
  async getPublicRegistrations(forceRefresh = false) {
    if (!forceRefresh && publicRegistrationsCache && Date.now() - publicRegistrationsCache.timestamp < 6e4) {
      return publicRegistrationsCache.data;
    }
    await ensureDbConnected();
    let result = [];
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query(
          "SELECT id, reg_code, category_id, team_name, team_logo, institution_name, status FROM registrations ORDER BY created_at DESC"
        );
        if (Array.isArray(rows)) {
          result = rows.map((r) => ({
            id: r.id,
            regCode: r.reg_code,
            category: r.category_id,
            teamName: r.team_name,
            teamLogo: r.team_logo || null,
            institutionName: r.institution_name,
            status: r.status
          }));
        }
      } catch (err) {
        console.error("Error fetching public registrations from MySQL:", err);
      }
    } else {
      result = memStore.registrations.map((r) => ({
        id: r.id,
        regCode: r.regCode,
        category: r.category,
        teamName: r.teamName,
        teamLogo: r.teamLogo || null,
        institutionName: r.institutionName,
        status: r.status
      }));
    }
    publicRegistrationsCache = { data: result, timestamp: Date.now() };
    return result;
  },
  async getRegistrationById(id) {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query("SELECT * FROM registrations WHERE id = ? LIMIT 1", [id]);
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            regCode: r.reg_code,
            category: r.category_id,
            teamName: r.team_name,
            teamLogo: r.team_logo || void 0,
            institutionName: r.institution_name,
            coachName: r.coach_name,
            coachPhone: r.coach_phone,
            coachEmail: r.coach_email || "",
            playerCount: r.player_count,
            officialCount: r.official_count,
            registrationDate: r.registration_date,
            status: r.status,
            paymentStatus: r.payment_status,
            paymentAmount: Number(r.payment_amount),
            rejectionReason: r.rejection_reason || void 0,
            adminNotes: r.admin_notes || void 0,
            documents: sanitizeRegistrationDocuments(r.documents_json, r.id),
            lastUpdated: r.last_updated || r.registration_date
          };
        }
        return null;
      } catch (err) {
        console.error("Error fetching registration by id from MySQL:", err);
      }
    }
    const found = memStore.registrations.find((r) => r.id === id);
    if (!found) return null;
    return {
      ...found,
      documents: sanitizeRegistrationDocuments(found.documents, found.id)
    };
  },
  async getRegistrationDocument(regId, docKey) {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query("SELECT documents_json FROM registrations WHERE id = ?", [regId]);
        if (Array.isArray(rows) && rows.length > 0) {
          const raw = rows[0].documents_json;
          const docs = typeof raw === "string" ? JSON.parse(raw) : raw || {};
          const target = docs[docKey];
          if (target) {
            return target.fileData || target.previewUrl || target.url || null;
          }
        }
      } catch (err) {
        console.error("Error fetching registration document from MySQL:", err);
      }
    }
    const memItem = memStore.registrations.find((r) => r.id === regId);
    if (memItem && memItem.documents) {
      const target = memItem.documents[docKey];
      if (target) {
        return target.fileData || target.previewUrl || target.url || null;
      }
    }
    return null;
  },
  async saveRegistration(item) {
    invalidatePublicRegistrationsCache();
    await ensureDbConnected();
    if (item.teamLogo) {
      const trimmedLogo = item.teamLogo.trim();
      if (trimmedLogo.includes("/api/media/view/")) {
        item.teamLogo = trimmedLogo.substring(trimmedLogo.indexOf("/api/media/view/"));
      } else if (/^med-\d+-[a-zA-Z0-9_-]+$/i.test(trimmedLogo)) {
        item.teamLogo = `/api/media/view/${trimmedLogo}`;
      }
    }
    const codeConflictMem = memStore.registrations.find(
      (r) => r.id !== item.id && r.regCode && item.regCode && r.regCode.trim().toUpperCase() === item.regCode.trim().toUpperCase()
    );
    if (codeConflictMem) {
      item.regCode = generateUniqueRegCode(item.category, memStore.registrations);
    }
    const idx = memStore.registrations.findIndex((r) => r.id === item.id);
    if (idx >= 0) {
      memStore.registrations[idx] = item;
    } else {
      memStore.registrations.unshift(item);
    }
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        const [existingById] = await pool.query("SELECT id, reg_code FROM registrations WHERE id = ?", [item.id]);
        if (Array.isArray(existingById) && existingById.length > 0) {
          await pool.execute(
            `UPDATE registrations SET
              reg_code=?, category_id=?, team_name=?, team_logo=?, institution_name=?,
              coach_name=?, coach_phone=?, coach_email=?, player_count=?, official_count=?,
              status=?, payment_status=?, payment_amount=?, rejection_reason=?, admin_notes=?,
              documents_json=?, last_updated=?
             WHERE id = ?`,
            [
              item.regCode,
              item.category,
              item.teamName,
              item.teamLogo || null,
              item.institutionName,
              item.coachName,
              item.coachPhone,
              item.coachEmail || "",
              item.playerCount,
              item.officialCount,
              item.status,
              item.paymentStatus,
              item.paymentAmount,
              item.rejectionReason || null,
              item.adminNotes || null,
              JSON.stringify(item.documents || {}),
              item.lastUpdated,
              item.id
            ]
          );
        } else {
          const [existingByCode] = await pool.query("SELECT id, reg_code FROM registrations WHERE reg_code = ?", [item.regCode]);
          if (Array.isArray(existingByCode) && existingByCode.length > 0) {
            const [allCatRows] = await pool.query("SELECT reg_code FROM registrations WHERE category_id = ?", [item.category]);
            const existingCatCodes = Array.isArray(allCatRows) ? allCatRows.map((r) => ({ regCode: r.reg_code })) : [];
            item.regCode = generateUniqueRegCode(item.category, [...memStore.registrations, ...existingCatCodes]);
            const mIdx = memStore.registrations.findIndex((r) => r.id === item.id);
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
                item.id,
                item.regCode,
                item.category,
                item.teamName,
                item.teamLogo || null,
                item.institutionName,
                item.coachName,
                item.coachPhone,
                item.coachEmail || "",
                item.playerCount,
                item.officialCount,
                item.registrationDate,
                item.status,
                item.paymentStatus,
                item.paymentAmount,
                item.rejectionReason || null,
                item.adminNotes || null,
                JSON.stringify(item.documents || {}),
                item.lastUpdated
              ]
            );
          } catch (insertErr) {
            if (insertErr?.code === "ER_DUP_ENTRY" || insertErr?.errno === 1062) {
              console.warn("[Database] Duplicate entry caught on insert, regenerating unique reg_code...");
              const [allRows] = await pool.query("SELECT reg_code FROM registrations WHERE category_id = ?", [item.category]);
              const existingCodes = Array.isArray(allRows) ? allRows.map((r) => ({ regCode: r.reg_code })) : [];
              item.regCode = generateUniqueRegCode(item.category, existingCodes);
              const mIdx = memStore.registrations.findIndex((r) => r.id === item.id);
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
                  item.id,
                  item.regCode,
                  item.category,
                  item.teamName,
                  item.teamLogo || null,
                  item.institutionName,
                  item.coachName,
                  item.coachPhone,
                  item.coachEmail || "",
                  item.playerCount,
                  item.officialCount,
                  item.registrationDate,
                  item.status,
                  item.paymentStatus,
                  item.paymentAmount,
                  item.rejectionReason || null,
                  item.adminNotes || null,
                  JSON.stringify(item.documents || {}),
                  item.lastUpdated
                ]
              );
            } else {
              throw insertErr;
            }
          }
        }
      } catch (err) {
        console.error("[Database] Error saving registration to MySQL:", err);
      }
    }
    if (item.teamLogo || item.teamName) {
      const normName = (item.teamName || "").trim().toLowerCase();
      const normInst = (item.institutionName || "").trim().toLowerCase();
      for (const m of memStore.matches) {
        if (m.teamA?.name?.trim().toLowerCase() === normName || normInst && m.teamA?.institution?.trim().toLowerCase() === normInst) {
          if (item.teamLogo) m.teamA.logo = item.teamLogo;
          if (item.institutionName) m.teamA.institution = item.institutionName;
        }
        if (m.teamB?.name?.trim().toLowerCase() === normName || normInst && m.teamB?.institution?.trim().toLowerCase() === normInst) {
          if (item.teamLogo) m.teamB.logo = item.teamLogo;
          if (item.institutionName) m.teamB.institution = item.institutionName;
        }
      }
      for (const g of memStore.groups) {
        if (Array.isArray(g.teams)) {
          for (const t of g.teams) {
            if (t.name?.trim().toLowerCase() === normName || normInst && t.institution?.trim().toLowerCase() === normInst) {
              if (item.teamLogo) t.logo = item.teamLogo;
              if (item.institutionName) t.institution = item.institutionName;
            }
          }
        }
      }
      persistLocalStore();
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
            try {
              const [grpRows] = await pool.query("SELECT id, teams_json FROM tournament_groups WHERE category_id = ?", [item.category]);
              if (Array.isArray(grpRows)) {
                for (const grp of grpRows) {
                  let teams = [];
                  try {
                    teams = typeof grp.teams_json === "string" ? JSON.parse(grp.teams_json) : grp.teams_json || [];
                  } catch {
                  }
                  if (Array.isArray(teams)) {
                    let changed = false;
                    for (const t of teams) {
                      if (t.name?.trim().toLowerCase() === normName || normInst && t.institution?.trim().toLowerCase() === normInst) {
                        t.logo = item.teamLogo;
                        if (item.institutionName) t.institution = item.institutionName;
                        changed = true;
                      }
                    }
                    if (changed) {
                      await pool.query("UPDATE tournament_groups SET teams_json = ? WHERE id = ?", [JSON.stringify(teams), grp.id]);
                    }
                  }
                }
              }
            } catch (grpCascadeErr) {
              console.warn("[Database] Error cascading logo to tournament_groups in MySQL:", grpCascadeErr);
            }
          }
        } catch (cascadeErr) {
          console.warn("[Database] Error cascading logo update to MySQL:", cascadeErr);
        }
      }
    }
    try {
      await this.calculateStandings(item.category);
    } catch (err) {
      console.warn("Error recalculating standings on saveRegistration:", err);
    }
    return item;
  },
  async deleteRegistration(id) {
    invalidatePublicRegistrationsCache();
    await ensureDbConnected();
    let localReg = memStore.registrations.find((r) => r.id === id || r.regCode === id);
    let mySqlRow = null;
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query("SELECT * FROM registrations WHERE id = ? OR reg_code = ? LIMIT 1", [id, id]);
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
              documents: typeof mySqlRow.documents_json === "string" ? JSON.parse(mySqlRow.documents_json) : mySqlRow.documents_json || {},
              lastUpdated: mySqlRow.last_updated
            };
          }
        }
      } catch (err) {
        console.warn("[deleteRegistration] Error fetching registration for cascading media cleanup:", err);
      }
    }
    const regId = localReg?.id || (mySqlRow?.id ? String(mySqlRow.id) : id);
    const regCode = localReg?.regCode || (mySqlRow?.reg_code ? String(mySqlRow.reg_code) : void 0);
    const mediaIdsToDelete = /* @__PURE__ */ new Set();
    const scanForMedia = (data) => {
      if (!data) return;
      const str = typeof data === "string" ? data : JSON.stringify(data);
      const viewMatches = str.match(/\/api\/media\/view\/([a-zA-Z0-9_-]+)/g);
      if (viewMatches) {
        for (const m of viewMatches) {
          const mId = m.replace("/api/media/view/", "").split(/[?#]/)[0];
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
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === regId || mItem.refId === id || regCode && mItem.refId === regCode) {
        mediaIdsToDelete.add(mId);
      }
    }
    if (pool && isMySqlConnected) {
      try {
        const refParams = [regId, id];
        if (regCode) refParams.push(regCode);
        const refPlaceholders = refParams.map(() => "?").join(",");
        const [dbMediaRows] = await pool.query(
          `SELECT id FROM app_media_storage WHERE ref_id IN (${refPlaceholders})`,
          refParams
        );
        if (Array.isArray(dbMediaRows)) {
          for (const row of dbMediaRows) {
            if (row.id) mediaIdsToDelete.add(row.id);
          }
        }
        await purgeB2Objects(`ref_id IN (${refPlaceholders})`, refParams);
        if (mediaIdsToDelete.size > 0) {
          const ids0 = Array.from(mediaIdsToDelete);
          await purgeB2Objects(`id IN (${ids0.map(() => "?").join(",")})`, ids0);
        }
        await pool.query(
          `DELETE FROM app_media_storage WHERE ref_id IN (${refPlaceholders})`,
          refParams
        );
        if (mediaIdsToDelete.size > 0) {
          const idList = Array.from(mediaIdsToDelete);
          const idPlaceholders = idList.map(() => "?").join(",");
          await pool.query(
            `DELETE FROM app_media_storage WHERE id IN (${idPlaceholders})`,
            idList
          );
        }
        await pool.execute(
          "DELETE FROM registrations WHERE id = ? OR id = ? OR reg_code = ?",
          [regId, id, regCode || id]
        );
        console.log(`[Storage Cleanup] Successfully deleted registration ${regId} (${regCode || "no-code"}) and ${mediaIdsToDelete.size} associated files (${Array.from(mediaIdsToDelete).join(", ")}) from TiDB app_media_storage`);
      } catch (err) {
        console.error("[Storage Cleanup] Error deleting registration and associated media from MySQL:", err);
      }
    }
    for (const mId of mediaIdsToDelete) {
      memStore.media.delete(mId);
    }
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === regId || mItem.refId === id || regCode && mItem.refId === regCode) {
        memStore.media.delete(mId);
      }
    }
    memStore.registrations = memStore.registrations.filter(
      (r) => r.id !== regId && r.id !== id && (!regCode || r.regCode !== regCode)
    );
    persistLocalStore();
    return true;
  },
  // Matches
  async getMatches(forceRefresh = false) {
    if (!forceRefresh && matchesCache && Date.now() - matchesCache.timestamp < 15e3) {
      return matchesCache.data;
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query("SELECT * FROM matches ORDER BY match_date ASC, match_time ASC, match_number ASC");
        if (Array.isArray(rows)) {
          const result = rows.map((r) => ({
            id: r.id,
            matchNumber: r.match_number,
            category: r.category_id,
            round: r.round_name,
            roundIndex: r.round_index,
            group: r.group_name || void 0,
            teamA: {
              name: r.team_a_name,
              institution: r.team_a_institution || void 0,
              logo: r.team_a_logo || void 0,
              score: r.team_a_score !== null ? Number(r.team_a_score) : void 0,
              penalties: r.team_a_penalties !== null ? Number(r.team_a_penalties) : void 0
            },
            teamB: {
              name: r.team_b_name,
              institution: r.team_b_institution || void 0,
              logo: r.team_b_logo || void 0,
              score: r.team_b_score !== null ? Number(r.team_b_score) : void 0,
              penalties: r.team_b_penalties !== null ? Number(r.team_b_penalties) : void 0
            },
            date: r.match_date,
            time: r.match_time,
            pitch: r.pitch,
            status: r.status,
            liveMinute: r.live_minute || void 0,
            events: typeof r.events_json === "string" ? JSON.parse(r.events_json) : r.events_json || [],
            winnerId: r.winner_id || void 0,
            nextMatchId: r.next_match_id || void 0,
            nextMatchSlot: r.next_match_slot || void 0
          }));
          matchesCache = { data: result, timestamp: Date.now() };
          return result;
        }
      } catch (err) {
        console.error("Error fetching matches from MySQL:", err);
      }
    }
    return memStore.matches;
  },
  async saveMatch(match) {
    invalidateMatchesCache();
    await ensureDbConnected();
    const idx = memStore.matches.findIndex((m) => m.id === match.id);
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
            match.id,
            match.matchNumber,
            match.category,
            match.round,
            match.roundIndex,
            match.group || null,
            match.teamA.name,
            match.teamA.institution || null,
            match.teamA.logo || null,
            match.teamA.score !== void 0 ? match.teamA.score : null,
            match.teamA.penalties !== void 0 ? match.teamA.penalties : null,
            match.teamB.name,
            match.teamB.institution || null,
            match.teamB.logo || null,
            match.teamB.score !== void 0 ? match.teamB.score : null,
            match.teamB.penalties !== void 0 ? match.teamB.penalties : null,
            match.date,
            match.time,
            match.pitch,
            match.status,
            match.liveMinute || null,
            JSON.stringify(match.events || []),
            match.winnerId || null,
            match.nextMatchId || null,
            match.nextMatchSlot || null,
            match.matchNumber,
            match.category,
            match.round,
            match.roundIndex,
            match.group || null,
            match.teamA.name,
            match.teamA.institution || null,
            match.teamA.logo || null,
            match.teamA.score !== void 0 ? match.teamA.score : null,
            match.teamA.penalties !== void 0 ? match.teamA.penalties : null,
            match.teamB.name,
            match.teamB.institution || null,
            match.teamB.logo || null,
            match.teamB.score !== void 0 ? match.teamB.score : null,
            match.teamB.penalties !== void 0 ? match.teamB.penalties : null,
            match.date,
            match.time,
            match.pitch,
            match.status,
            match.liveMinute || null,
            JSON.stringify(match.events || []),
            match.winnerId || null,
            match.nextMatchId || null,
            match.nextMatchSlot || null
          ]
        );
      } catch (err) {
        console.error("Error saving match to MySQL:", err);
      }
    }
    try {
      await this.calculateStandings(match.category);
    } catch (err) {
      console.warn("Error recalculating standings on saveMatch:", err);
    }
    if (match.events && Array.isArray(match.events) && match.events.length > 0) {
      try {
        await this.syncPlayerStatsFromMatches(match.category);
      } catch (err) {
        console.warn("Error syncing player stats on saveMatch:", err);
      }
    }
    return match;
  },
  async deleteMatch(matchId) {
    invalidateMatchesCache();
    await ensureDbConnected();
    const targetMatch = memStore.matches.find((m) => m.id === matchId);
    const cat = targetMatch?.category;
    memStore.matches = memStore.matches.filter((m) => m.id !== matchId);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM matches WHERE id = ?", [matchId]);
      } catch (err) {
        console.error("Error deleting match from MySQL:", err);
      }
    }
    try {
      await this.calculateStandings(cat);
      if (targetMatch?.events && Array.isArray(targetMatch.events) && targetMatch.events.length > 0) {
        await this.syncPlayerStatsFromMatches(cat);
      }
    } catch (err) {
      console.warn("Error updating standings/stats on deleteMatch:", err);
    }
    return true;
  },
  async replaceCategoryMatches(category, newMatches) {
    invalidateMatchesCache();
    await ensureDbConnected();
    memStore.matches = memStore.matches.filter((m) => m.category !== category).concat(newMatches);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM matches WHERE category_id = ?", [category]);
        for (const match of newMatches) {
          await pool.query(
            `INSERT INTO matches (id, match_number, category_id, round_name, round_index, group_name, team_a_name, team_a_institution, team_a_logo, team_a_score, team_a_penalties, team_b_name, team_b_institution, team_b_logo, team_b_score, team_b_penalties, match_date, match_time, pitch, status, live_minute, events_json, winner_id, next_match_id, next_match_slot)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              match.id,
              match.matchNumber,
              match.category,
              match.round,
              match.roundIndex,
              match.group || null,
              match.teamA.name,
              match.teamA.institution || null,
              match.teamA.logo || null,
              match.teamA.score !== void 0 ? match.teamA.score : null,
              match.teamA.penalties !== void 0 ? match.teamA.penalties : null,
              match.teamB.name,
              match.teamB.institution || null,
              match.teamB.logo || null,
              match.teamB.score !== void 0 ? match.teamB.score : null,
              match.teamB.penalties !== void 0 ? match.teamB.penalties : null,
              match.date,
              match.time,
              match.pitch,
              match.status,
              match.liveMinute || null,
              JSON.stringify(match.events || []),
              match.winnerId || null,
              match.nextMatchId || null,
              match.nextMatchSlot || null
            ]
          );
        }
      } catch (err) {
        console.error("Error replacing category matches in MySQL:", err);
      }
    }
    try {
      await this.calculateStandings(category);
      const hasEvents = newMatches.some((m) => Array.isArray(m.events) && m.events.length > 0);
      if (hasEvents) {
        await this.syncPlayerStatsFromMatches(category);
      }
    } catch (err) {
      console.warn("Error updating standings/stats on replaceCategoryMatches:", err);
    }
    return newMatches;
  },
  async saveMatchesBatch(matchesToSave) {
    invalidateMatchesCache();
    await ensureDbConnected();
    const categoriesAffected = /* @__PURE__ */ new Set();
    for (const match of matchesToSave) {
      categoriesAffected.add(match.category);
      const idx = memStore.matches.findIndex((m) => m.id === match.id);
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
              match.id,
              match.matchNumber,
              match.category,
              match.round,
              match.roundIndex,
              match.group || null,
              match.teamA.name,
              match.teamA.institution || null,
              match.teamA.logo || null,
              match.teamA.score !== void 0 ? match.teamA.score : null,
              match.teamA.penalties !== void 0 ? match.teamA.penalties : null,
              match.teamB.name,
              match.teamB.institution || null,
              match.teamB.logo || null,
              match.teamB.score !== void 0 ? match.teamB.score : null,
              match.teamB.penalties !== void 0 ? match.teamB.penalties : null,
              match.date,
              match.time,
              match.pitch,
              match.status,
              match.liveMinute || null,
              JSON.stringify(match.events || []),
              match.winnerId || null,
              match.nextMatchId || null,
              match.nextMatchSlot || null,
              match.matchNumber,
              match.category,
              match.round,
              match.roundIndex,
              match.group || null,
              match.teamA.name,
              match.teamA.institution || null,
              match.teamA.logo || null,
              match.teamA.score !== void 0 ? match.teamA.score : null,
              match.teamA.penalties !== void 0 ? match.teamA.penalties : null,
              match.teamB.name,
              match.teamB.institution || null,
              match.teamB.logo || null,
              match.teamB.score !== void 0 ? match.teamB.score : null,
              match.teamB.penalties !== void 0 ? match.teamB.penalties : null,
              match.date,
              match.time,
              match.pitch,
              match.status,
              match.liveMinute || null,
              JSON.stringify(match.events || []),
              match.winnerId || null,
              match.nextMatchId || null,
              match.nextMatchSlot || null
            ]
          );
        } catch (err) {
          console.error("Error saving batch match item in MySQL:", err);
        }
      }
    }
    const categoriesWithEvents = /* @__PURE__ */ new Set();
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
        console.warn("Error updating standings/stats on saveMatchesBatch:", err);
      }
    }
    return matchesToSave;
  },
  // Sponsors
  async getSponsors(forceRefresh = false) {
    if (!forceRefresh && sponsorsCache && Date.now() - sponsorsCache.timestamp < 3e5) {
      return sponsorsCache.data;
    }
    await ensureDbConnected();
    let result = [...memStore.sponsors];
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query("SELECT * FROM sponsors WHERE is_active = TRUE ORDER BY sort_order ASC");
        if (Array.isArray(rows)) {
          result = rows.map((r) => ({
            id: r.id,
            name: r.name,
            tier: r.tier,
            logoText: r.logo_text,
            logoUrl: r.logo_url || void 0,
            websiteUrl: r.website_url || void 0,
            description: r.description || void 0
          }));
        }
      } catch (err) {
        console.error("Error fetching sponsors from MySQL:", err);
      }
    }
    sponsorsCache = { data: result, timestamp: Date.now() };
    return result;
  },
  async saveSponsor(sponsor) {
    invalidateSponsorsCache();
    await ensureDbConnected();
    const idx = memStore.sponsors.findIndex((s) => s.id === sponsor.id);
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
            sponsor.id,
            sponsor.name,
            sponsor.tier,
            sponsor.logoText,
            sponsor.logoUrl || null,
            sponsor.websiteUrl || null,
            sponsor.description || null,
            sponsor.name,
            sponsor.tier,
            sponsor.logoText,
            sponsor.logoUrl || null,
            sponsor.websiteUrl || null,
            sponsor.description || null
          ]
        );
      } catch (err) {
        console.error("Error saving sponsor to MySQL:", err);
      }
    }
    return sponsor;
  },
  async deleteSponsor(id) {
    invalidateSponsorsCache();
    await ensureDbConnected();
    memStore.sponsors = memStore.sponsors.filter((s) => s.id !== id);
    persistLocalStore();
    for (const [mId, mItem] of memStore.media.entries()) {
      if (mItem.refId === id) {
        memStore.media.delete(mId);
      }
    }
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM sponsors WHERE id = ?", [id]);
        await purgeB2Objects("ref_id = ? AND category = ?", [id, "SPONSOR_LOGO"]);
        await pool.query("DELETE FROM app_media_storage WHERE ref_id = ? AND category = ?", [id, "SPONSOR_LOGO"]);
        console.log(`[Storage Cleanup] Deleted sponsor logo for ${id} from TiDB Cloud`);
      } catch (err) {
        console.error("Error deleting sponsor from MySQL:", err);
      }
    }
    return true;
  },
  // Admin Users
  async getAdmins() {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query("SELECT id, username, full_name, role, email, phone, avatar_color, created_at FROM admin_users ORDER BY created_at ASC");
        if (Array.isArray(rows) && rows.length > 0) {
          const list = rows.map((r) => ({
            id: r.id,
            username: r.username,
            fullName: r.full_name,
            role: r.role,
            email: r.email || "",
            phone: r.phone || "",
            avatarColor: r.avatar_color,
            createdAt: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "2026-08-01"
          }));
          memStore.adminUsers = list;
          return list;
        } else if (Array.isArray(rows) && rows.length === 0) {
          await seedInitialAdminIfConfigured();
          const [recheck] = await pool.query("SELECT id, username, full_name, role, email, phone, avatar_color, created_at FROM admin_users ORDER BY created_at ASC");
          if (Array.isArray(recheck) && recheck.length > 0) {
            const list = recheck.map((r) => ({
              id: r.id,
              username: r.username,
              fullName: r.full_name,
              role: r.role,
              email: r.email || "",
              phone: r.phone || "",
              avatarColor: r.avatar_color,
              createdAt: r.created_at ? new Date(r.created_at).toISOString().split("T")[0] : "2026-08-01"
            }));
            memStore.adminUsers = list;
            return list;
          }
          memStore.adminUsers = [];
          return [];
        }
      } catch (err) {
        console.error("Error fetching admins from MySQL:", err);
      }
    }
    return memStore.adminUsers.map(sanitizeAdminUser);
  },
  async saveAdmin(admin, password) {
    await ensureDbConnected();
    let passHash = null;
    const cleanPass = (password || admin.password || "").trim();
    if (cleanPass.length > 0) {
      passHash = await hashPassword(cleanPass);
    }
    const roleToSave = admin.role || "PANITIA_INTI";
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
            passHash || "",
            admin.fullName,
            roleToSave,
            admin.email || null,
            admin.phone || null,
            admin.avatarColor || "bg-red-600",
            admin.createdAt ? new Date(admin.createdAt) : /* @__PURE__ */ new Date(),
            passHash
          ]
        );
        const idx = memStore.adminUsers.findIndex((a) => a.id === admin.id);
        if (idx >= 0) {
          memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...cleanAdmin, role: roleToSave };
        } else {
          memStore.adminUsers.push({ ...cleanAdmin, role: roleToSave });
        }
      } catch (err) {
        console.error("Error saving admin user to MySQL:", err);
        const errMsg = String(err?.message || "");
        if (err?.code === "WARN_DATA_TRUNCATED" || err?.errno === 1265 || errMsg.includes("role") || errMsg.includes("Data truncated")) {
          try {
            console.log("[MySQL Auto-Migration] Migrating column role in admin_users to VARCHAR(64)...");
            await pool.query("ALTER TABLE admin_users MODIFY COLUMN role VARCHAR(64) NOT NULL DEFAULT 'PANITIA_INTI'");
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
                passHash || "",
                admin.fullName,
                roleToSave,
                admin.email || null,
                admin.phone || null,
                admin.avatarColor || "bg-red-600",
                admin.createdAt ? new Date(admin.createdAt) : /* @__PURE__ */ new Date(),
                passHash
              ]
            );
            console.log("[MySQL Auto-Migration] Successfully saved admin user after column role auto-migration!");
            const idx = memStore.adminUsers.findIndex((a) => a.id === admin.id);
            if (idx >= 0) {
              memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...admin, role: roleToSave };
            } else {
              memStore.adminUsers.push({ ...admin, role: roleToSave });
            }
            return sanitizeAdminUser({ ...admin, role: roleToSave });
          } catch (retryErr) {
            console.error("[MySQL Auto-Migration] Retry after role migration failed:", retryErr);
          }
        }
        throw new Error(`Gagal menyimpan data admin ke database MySQL: ${err?.message || err}`);
      }
    } else {
      const idx = memStore.adminUsers.findIndex((a) => a.id === admin.id || a.username.toLowerCase() === admin.username.toLowerCase());
      if (idx >= 0) {
        memStore.adminUsers[idx] = { ...memStore.adminUsers[idx], ...admin };
      } else {
        memStore.adminUsers.push(admin);
      }
    }
    return sanitizeAdminUser(admin);
  },
  async deleteAdmin(id) {
    await ensureDbConnected();
    const target = memStore.adminUsers.find((a) => a.id === id);
    if (target && target.username.toLowerCase() === "superadmin") {
      return false;
    }
    memStore.adminUsers = memStore.adminUsers.filter((a) => a.id !== id);
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM admin_users WHERE id = ? AND username != 'superadmin'", [id]);
      } catch (err) {
        console.error("Error deleting admin from MySQL:", err);
        throw new Error(`Gagal menghapus admin dari MySQL: ${err?.message || err}`);
      }
    }
    return true;
  },
  async verifyAdminLogin(username, pass) {
    await ensureDbConnected();
    const cleanUser = (username || "").trim().toLowerCase();
    const targetUser = cleanUser === "admin" ? "superadmin" : cleanUser;
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.query(
          "SELECT * FROM admin_users WHERE LOWER(username) = ? OR LOWER(username) = ?",
          [cleanUser, targetUser]
        );
        if (rows && rows.length > 0) {
          const row = rows[0];
          const passHash = row.password_hash;
          const isMatch = await verifyPassword(pass, passHash);
          if (isMatch) {
            if (!passHash || !passHash.startsWith("scrypt$")) {
              const newHash = await hashPassword(pass);
              await pool.query("UPDATE admin_users SET password_hash = ? WHERE id = ?", [newHash, row.id]).catch(() => console.warn("Failed to hash password opportunistically"));
            }
            const userObj = {
              id: row.id,
              username: row.username,
              fullName: row.full_name,
              role: row.role,
              email: row.email || "",
              phone: row.phone || "",
              avatarColor: row.avatar_color || "bg-red-600",
              createdAt: row.created_at ? new Date(row.created_at).toISOString().split("T")[0] : "2026-08-01"
            };
            return { success: true, user: userObj };
          } else {
            return { success: false, error: "Username atau password salah." };
          }
        } else {
          await verifyPassword(pass, DUMMY_SCRYPT_HASH).catch(() => false);
          return { success: false, error: "Username atau password salah." };
        }
      } catch (err) {
        console.error("Error verifying admin login with MySQL:", err);
        return { success: false, error: "Terjadi kesalahan saat memeriksa database" };
      }
    }
    if (process.env.NODE_ENV === "production") {
      return {
        success: false,
        error: "Layanan sementara tidak tersedia. Basis data sedang tidak terhubung.",
        statusCode: 503
      };
    }
    const initUser = (process.env.INITIAL_ADMIN_USERNAME || "").trim().toLowerCase();
    const initPass = (process.env.INITIAL_ADMIN_PASSWORD || "").trim();
    if (initUser && initPass && (cleanUser === initUser || targetUser === initUser)) {
      const isMatch = pass === initPass;
      if (isMatch) {
        return {
          success: true,
          user: {
            id: "adm-env-local",
            username: initUser,
            fullName: "Administrator Lokal",
            role: "SUPERADMIN",
            email: "",
            phone: "",
            avatarColor: "bg-red-600",
            createdAt: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
          }
        };
      }
    }
    await verifyPassword(pass, DUMMY_SCRYPT_HASH).catch(() => false);
    return { success: false, error: "Username atau password salah." };
  },
  // Generate complete SQL Export dump
  async exportFullSqlDump() {
    await ensureDbConnected();
    const categories = await this.getCategories();
    const registrations = await this.getRegistrations();
    const matches = await this.getMatches();
    const sponsors = await this.getSponsors();
    const admins = await this.getAdmins();
    const config = await this.getConfig();
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    let sql = `-- ==========================================================
`;
    sql += `-- WABUP CUP 2026 COMPLETE DATABASE BACKUP & EXPORT
`;
    sql += `-- Generated at: ${timestamp}
`;
    sql += `-- Target: MySQL 5.7+ / 8.0+ / MariaDB / Cloud SQL / phpMyAdmin
`;
    sql += `-- ==========================================================

`;
    sql += `CREATE DATABASE IF NOT EXISTS \`wabupcup2026\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`;
    sql += `USE \`wabupcup2026\`;

`;
    const escapeSql = (val) => {
      if (val === null || val === void 0) return "NULL";
      if (typeof val === "number") return isNaN(val) ? "0" : String(val);
      if (typeof val === "boolean") return val ? "1" : "0";
      return `'${String(val).replace(/[\0\x08\x09\x1a\n\r"'\\\%]/g, (char) => {
        switch (char) {
          case "\0":
            return "\\0";
          case "\b":
            return "\\b";
          case "	":
            return "\\t";
          case "":
            return "\\z";
          case "\n":
            return "\\n";
          case "\r":
            return "\\r";
          case '"':
          case "'":
          case "\\":
          case "%":
            return "\\" + char;
          default:
            return char;
        }
      })}'`;
    };
    sql += `-- 1. CONFIG
`;
    sql += `INSERT INTO \`tournament_config\` (\`config_key\`, \`config_value\`) VALUES ('main_config', ${escapeSql(JSON.stringify(config))}) ON DUPLICATE KEY UPDATE \`config_value\`=VALUES(\`config_value\`);

`;
    sql += `-- 2. CATEGORIES
`;
    for (const c of categories) {
      sql += `INSERT INTO \`categories\` (\`id\`, \`name\`, \`badge_title\`, \`age_restriction\`, \`max_teams\`, \`registered_teams_count\`, \`registration_fee\`, \`total_prize\`, \`description\`, \`prizes_json\`, \`rules_json\`) VALUES (${escapeSql(c.id)}, ${escapeSql(c.name)}, ${escapeSql(c.badgeTitle || "")}, ${escapeSql(c.ageRestriction)}, ${c.maxTeams || 0}, ${c.registeredTeamsCount || 0}, ${c.registrationFee || 0}, ${c.totalPrize || 0}, ${escapeSql(c.description || "")}, ${escapeSql(JSON.stringify(c.prizes || []))}, ${escapeSql(JSON.stringify(c.rules || []))}) ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`);
`;
    }
    sql += `
`;
    sql += `-- 3. REGISTRATIONS
`;
    for (const r of registrations) {
      sql += `INSERT INTO \`registrations\` (\`id\`, \`reg_code\`, \`category_id\`, \`team_name\`, \`institution_name\`, \`coach_name\`, \`coach_phone\`, \`coach_email\`, \`player_count\`, \`official_count\`, \`registration_date\`, \`status\`, \`payment_status\`, \`payment_amount\`, \`documents_json\`, \`last_updated\`) VALUES (${escapeSql(r.id)}, ${escapeSql(r.regCode)}, ${escapeSql(r.category)}, ${escapeSql(r.teamName)}, ${escapeSql(r.institutionName)}, ${escapeSql(r.coachName)}, ${escapeSql(r.coachPhone)}, ${escapeSql(r.coachEmail)}, ${r.playerCount || 0}, ${r.officialCount || 0}, ${escapeSql(r.registrationDate)}, ${escapeSql(r.status)}, ${escapeSql(r.paymentStatus)}, ${r.paymentAmount || 0}, ${escapeSql(JSON.stringify(r.documents || {}))}, ${escapeSql(r.lastUpdated)}) ON DUPLICATE KEY UPDATE \`team_name\`=VALUES(\`team_name\`);
`;
    }
    sql += `
`;
    sql += `-- 4. MATCHES
`;
    for (const m of matches) {
      sql += `INSERT INTO \`matches\` (\`id\`, \`match_number\`, \`category_id\`, \`round_name\`, \`round_index\`, \`team_a_name\`, \`team_a_institution\`, \`team_a_score\`, \`team_b_name\`, \`team_b_institution\`, \`team_b_score\`, \`match_date\`, \`match_time\`, \`pitch\`, \`status\`, \`live_minute\`, \`events_json\`, \`winner_id\`) VALUES (${escapeSql(m.id)}, ${m.matchNumber || 0}, ${escapeSql(m.category)}, ${escapeSql(m.round)}, ${m.roundIndex || 0}, ${escapeSql(m.teamA.name)}, ${escapeSql(m.teamA.institution || "")}, ${m.teamA.score !== void 0 ? m.teamA.score : "NULL"}, ${escapeSql(m.teamB.name)}, ${escapeSql(m.teamB.institution || "")}, ${m.teamB.score !== void 0 ? m.teamB.score : "NULL"}, ${escapeSql(m.date)}, ${escapeSql(m.time)}, ${escapeSql(m.pitch)}, ${escapeSql(m.status)}, ${m.liveMinute ? escapeSql(m.liveMinute) : "NULL"}, ${escapeSql(JSON.stringify(m.events || []))}, ${m.winnerId ? escapeSql(m.winnerId) : "NULL"}) ON DUPLICATE KEY UPDATE \`team_a_name\`=VALUES(\`team_a_name\`);
`;
    }
    sql += `
`;
    sql += `-- 5. SPONSORS
`;
    for (const s of sponsors) {
      sql += `INSERT INTO \`sponsors\` (\`id\`, \`name\`, \`tier\`, \`logo_text\`, \`website_url\`, \`description\`) VALUES (${escapeSql(s.id)}, ${escapeSql(s.name)}, ${escapeSql(s.tier)}, ${escapeSql(s.logoText)}, ${escapeSql(s.websiteUrl || "")}, ${escapeSql(s.description || "")}) ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`);
`;
    }
    sql += `
`;
    sql += `-- 6. ADMIN USERS
`;
    for (const a of admins) {
      sql += `INSERT INTO \`admin_users\` (\`id\`, \`username\`, \`password_hash\`, \`full_name\`, \`role\`, \`email\`, \`phone\`, \`avatar_color\`) VALUES (${escapeSql(a.id)}, ${escapeSql(a.username)}, 'REDACTED_PASSWORD_PROTECTED', ${escapeSql(a.fullName)}, ${escapeSql(a.role)}, ${escapeSql(a.email)}, ${escapeSql(a.phone)}, ${escapeSql(a.avatarColor)}) ON DUPLICATE KEY UPDATE \`full_name\`=VALUES(\`full_name\`);
`;
    }
    sql += `
`;
    sql += `-- 7. PLAYERS (table_players)
`;
    const allPlayers = await this.getPlayers();
    for (const p of allPlayers) {
      sql += `INSERT INTO \`table_players\` (\`id\`, \`team_id\`, \`team_name\`, \`category_id\`, \`name\`, \`jersey_number\`, \`position\`, \`goals\`, \`yellow_cards\`, \`red_cards\`, \`photo_url\`) VALUES (${escapeSql(p.id)}, ${p.teamId ? escapeSql(p.teamId) : "NULL"}, ${escapeSql(p.teamName)}, ${escapeSql(p.category)}, ${escapeSql(p.name)}, ${p.jerseyNumber || 0}, ${escapeSql(p.position || "Flank")}, ${p.goals || 0}, ${p.yellowCards || 0}, ${p.redCards || 0}, ${p.photoUrl ? escapeSql(p.photoUrl) : "NULL"}) ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`), \`jersey_number\`=VALUES(\`jersey_number\`), \`goals\`=VALUES(\`goals\`);
`;
    }
    sql += `
`;
    sql += `-- 8. STANDINGS (table_standings)
`;
    const standingsMap = await this.calculateStandings();
    for (const key of Object.keys(standingsMap)) {
      const items = standingsMap[key] || [];
      for (const item of items) {
        const stdId = `std-${item.category}-${item.groupName}-${item.teamName}`.toLowerCase().replace(/[^a-z0-9-]/g, "_");
        sql += `INSERT INTO \`table_standings\` (\`id\`, \`category_id\`, \`group_name\`, \`team_name\`, \`institution_name\`, \`team_logo\`, \`position\`, \`played\`, \`won\`, \`drawn\`, \`lost\`, \`goals_for\`, \`goals_against\`, \`goal_difference\`, \`points\`) VALUES (${escapeSql(stdId)}, ${escapeSql(item.category)}, ${escapeSql(item.groupName)}, ${escapeSql(item.teamName)}, ${item.institution ? escapeSql(item.institution) : "NULL"}, ${item.teamLogo ? escapeSql(item.teamLogo) : "NULL"}, ${item.position}, ${item.played}, ${item.won}, ${item.drawn}, ${item.lost}, ${item.goalsFor}, ${item.goalsAgainst}, ${item.goalDifference}, ${item.points}) ON DUPLICATE KEY UPDATE \`position\`=VALUES(\`position\`), \`points\`=VALUES(\`points\`), \`played\`=VALUES(\`played\`);
`;
      }
    }
    sql += `
`;
    return sql;
  },
  // Centralized Media Storage (TiDB Cloud)
  async saveMedia(item) {
    await ensureDbConnected();
    memStore.media.set(item.id, item);
    if (pool && isMySqlConnected && item.storage === "b2" && item.fileKey) {
      try {
        await pool.execute(
          `INSERT INTO app_media_storage (id, category, ref_id, sub_key, filename, content_type, file_size, file_data, storage, file_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, '', 'b2', ?)
           ON DUPLICATE KEY UPDATE category=?, ref_id=?, sub_key=?, filename=?, content_type=?, file_size=?, storage='b2', file_key=?`,
          [
            item.id,
            item.category,
            item.refId || null,
            item.subKey || null,
            item.filename,
            item.contentType,
            item.fileSize,
            item.fileKey,
            item.category,
            item.refId || null,
            item.subKey || null,
            item.filename,
            item.contentType,
            item.fileSize,
            item.fileKey
          ]
        );
      } catch (err) {
        console.error("Error saving B2 media metadata to TiDB app_media_storage:", err);
        throw err;
      }
    } else if (pool && isMySqlConnected) {
      try {
        await pool.execute(
          `INSERT INTO app_media_storage (id, category, ref_id, sub_key, filename, content_type, file_size, file_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE category=?, ref_id=?, sub_key=?, filename=?, content_type=?, file_size=?, file_data=?`,
          [
            item.id,
            item.category,
            item.refId || null,
            item.subKey || null,
            item.filename,
            item.contentType,
            item.fileSize,
            item.fileData,
            item.category,
            item.refId || null,
            item.subKey || null,
            item.filename,
            item.contentType,
            item.fileSize,
            item.fileData
          ]
        );
      } catch (err) {
        console.error("Error saving media to TiDB app_media_storage:", err);
      }
    }
    return item;
  },
  async getMedia(id) {
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.execute("SELECT * FROM app_media_storage WHERE id = ? LIMIT 1", [id]);
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          return {
            id: r.id,
            category: r.category,
            refId: r.ref_id || void 0,
            subKey: r.sub_key || void 0,
            filename: r.filename,
            contentType: r.content_type,
            fileSize: Number(r.file_size),
            fileData: r.file_data,
            storage: r.storage === "b2" ? "b2" : "db",
            fileKey: r.file_key || void 0,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : void 0,
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : void 0
          };
        }
      } catch (err) {
        console.error("Error fetching media from TiDB app_media_storage:", err);
      }
    }
    return memStore.media.get(id) || null;
  },
  /**
   * Metadata saja (TANPA file_data). Dipakai untuk cek ETag/304 dan redirect B2
   * supaya isi file tidak ikut dibaca dari TiDB.
   */
  async getMediaMeta(id, forceRefresh = false) {
    if (!forceRefresh && mediaMetaCache.has(id)) {
      const cached = mediaMetaCache.get(id);
      if (Date.now() - cached.timestamp < 6e5) {
        return cached.data;
      }
    }
    await ensureDbConnected();
    let meta = null;
    if (pool && isMySqlConnected) {
      try {
        const [rows] = await pool.execute(
          "SELECT id, category, ref_id, sub_key, filename, content_type, file_size, storage, file_key FROM app_media_storage WHERE id = ? LIMIT 1",
          [id]
        );
        if (Array.isArray(rows) && rows.length > 0) {
          const r = rows[0];
          meta = {
            id: r.id,
            category: r.category,
            refId: r.ref_id || void 0,
            subKey: r.sub_key || void 0,
            filename: r.filename,
            contentType: r.content_type,
            fileSize: Number(r.file_size),
            storage: r.storage === "b2" ? "b2" : "db",
            fileKey: r.file_key || void 0
          };
        }
      } catch (err) {
        console.error("Error fetching media meta from TiDB app_media_storage:", err);
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
  async deleteMedia(id) {
    invalidateMediaMetaCache(id);
    await ensureDbConnected();
    memStore.media.delete(id);
    if (pool && isMySqlConnected) {
      try {
        await purgeB2Objects("id = ?", [id]);
        await pool.execute("DELETE FROM app_media_storage WHERE id = ?", [id]);
      } catch (err) {
        console.error("Error deleting media from TiDB app_media_storage:", err);
      }
    }
    return true;
  },
  async deleteMediaByRef(refId, category) {
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
          await purgeB2Objects("ref_id = ? AND category = ?", [refId, category]);
          await pool.execute("DELETE FROM app_media_storage WHERE ref_id = ? AND category = ?", [refId, category]);
        } else {
          await purgeB2Objects("ref_id = ?", [refId]);
          await pool.execute("DELETE FROM app_media_storage WHERE ref_id = ?", [refId]);
        }
      } catch (err) {
        console.error("Error deleting media by ref from TiDB app_media_storage:", err);
      }
    }
    return true;
  },
  async updateMediaRef(id, refId, subKey) {
    invalidateMediaMetaCache(id);
    await ensureDbConnected();
    const memItem = memStore.media.get(id);
    if (memItem) {
      memItem.refId = refId;
      if (subKey) memItem.subKey = subKey;
    }
    if (subKey) {
      for (const [mId, m] of memStore.media.entries()) {
        if (m.refId === refId && m.subKey === subKey && mId !== id) {
          memStore.media.delete(mId);
        }
      }
    }
    if (pool && isMySqlConnected) {
      try {
        if (subKey) {
          await purgeB2Objects("ref_id = ? AND sub_key = ? AND id != ?", [refId, subKey, id]);
          await pool.execute(
            "DELETE FROM app_media_storage WHERE ref_id = ? AND sub_key = ? AND id != ?",
            [refId, subKey, id]
          );
          await pool.execute("UPDATE app_media_storage SET ref_id = ?, sub_key = ? WHERE id = ?", [refId, subKey, id]);
        } else {
          await pool.execute("UPDATE app_media_storage SET ref_id = ? WHERE id = ?", [refId, id]);
        }
      } catch (err) {
        console.error("Error updating media ref in TiDB app_media_storage:", err);
      }
    }
    return true;
  },
  // 12. Players (table_players)
  async getPlayers(category, teamName, forceRefresh = false, hasStats = false) {
    const cacheKey = `${category || "all"}:::${teamName || "all"}:::${hasStats ? "stats" : "all"}`;
    const cached = playersCache.get(cacheKey);
    if (!forceRefresh && cached && Date.now() - cached.timestamp < 3e4) {
      return cached.data;
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        let query = "SELECT * FROM table_players WHERE 1=1";
        const params = [];
        if (category) {
          query += " AND category_id = ?";
          params.push(category);
        }
        if (teamName) {
          query += " AND team_name = ?";
          params.push(teamName);
        }
        if (hasStats) {
          query += " AND (goals > 0 OR yellow_cards > 0 OR red_cards > 0)";
        }
        query += " ORDER BY goals DESC, team_name ASC, jersey_number ASC";
        const [rows] = await pool.query(query, params);
        if (Array.isArray(rows)) {
          const result = rows.map((r) => ({
            id: r.id,
            teamId: r.team_id || void 0,
            teamName: r.team_name,
            category: r.category_id,
            name: r.name,
            jerseyNumber: Number(r.jersey_number) || 0,
            position: r.position || "Flank",
            goals: Number(r.goals) || 0,
            yellowCards: Number(r.yellow_cards) || 0,
            redCards: Number(r.red_cards) || 0,
            photoUrl: r.photo_url || void 0,
            createdAt: r.created_at,
            updatedAt: r.updated_at
          }));
          playersCache.set(cacheKey, { data: result, timestamp: Date.now() });
          return result;
        }
      } catch (err) {
        console.error("Error fetching players from MySQL:", err);
      }
    }
    let list = [...memStore.players];
    if (category) list = list.filter((p) => p.category === category);
    if (teamName) list = list.filter((p) => p.teamName === teamName);
    if (hasStats) list = list.filter((p) => (p.goals || 0) > 0 || (p.yellowCards || 0) > 0 || (p.redCards || 0) > 0);
    return list;
  },
  async savePlayer(player) {
    invalidatePlayersCache();
    await ensureDbConnected();
    const sanitizedPlayer = {
      id: player.id && String(player.id).trim() !== "" ? String(player.id).trim() : `ply-${Date.now()}-${Math.floor(Math.random() * 1e3)}`,
      teamId: player.teamId || void 0,
      teamName: String(player.teamName || "Tim").trim(),
      category: player.category || "SMA",
      name: String(player.name || "Pemain").trim(),
      jerseyNumber: Number(player.jerseyNumber) || 0,
      position: String(player.position || "Flank").trim(),
      goals: Number(player.goals) || 0,
      yellowCards: Number(player.yellowCards) || 0,
      redCards: Number(player.redCards) || 0,
      photoUrl: player.photoUrl || void 0,
      createdAt: player.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const idx = memStore.players.findIndex((p) => p.id === sanitizedPlayer.id);
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
            sanitizedPlayer.id,
            sanitizedPlayer.teamId || null,
            sanitizedPlayer.teamName,
            sanitizedPlayer.category,
            sanitizedPlayer.name,
            sanitizedPlayer.jerseyNumber,
            sanitizedPlayer.position,
            sanitizedPlayer.goals,
            sanitizedPlayer.yellowCards,
            sanitizedPlayer.redCards,
            sanitizedPlayer.photoUrl || null,
            sanitizedPlayer.teamId || null,
            sanitizedPlayer.teamName,
            sanitizedPlayer.category,
            sanitizedPlayer.name,
            sanitizedPlayer.jerseyNumber,
            sanitizedPlayer.position,
            sanitizedPlayer.goals,
            sanitizedPlayer.yellowCards,
            sanitizedPlayer.redCards,
            sanitizedPlayer.photoUrl || null
          ]
        );
      } catch (err) {
        console.error("Error saving player to MySQL table_players:", err);
        if (err && (err.code === "ER_NO_SUCH_TABLE" || String(err.message || "").includes("doesn't exist"))) {
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
                sanitizedPlayer.id,
                sanitizedPlayer.teamId || null,
                sanitizedPlayer.teamName,
                sanitizedPlayer.category,
                sanitizedPlayer.name,
                sanitizedPlayer.jerseyNumber,
                sanitizedPlayer.position,
                sanitizedPlayer.goals,
                sanitizedPlayer.yellowCards,
                sanitizedPlayer.redCards,
                sanitizedPlayer.photoUrl || null,
                sanitizedPlayer.teamId || null,
                sanitizedPlayer.teamName,
                sanitizedPlayer.category,
                sanitizedPlayer.name,
                sanitizedPlayer.jerseyNumber,
                sanitizedPlayer.position,
                sanitizedPlayer.goals,
                sanitizedPlayer.yellowCards,
                sanitizedPlayer.redCards,
                sanitizedPlayer.photoUrl || null
              ]
            );
          } catch (retryErr) {
            console.error("Retry saving player to MySQL failed:", retryErr);
          }
        }
      }
    }
    return sanitizedPlayer;
  },
  async savePlayersBatch(players) {
    invalidatePlayersCache();
    await ensureDbConnected();
    const sanitizedBatch = [];
    for (const p of players) {
      const sp = {
        id: p.id && String(p.id).trim() !== "" ? String(p.id).trim() : `ply-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        teamId: p.teamId || void 0,
        teamName: String(p.teamName || "Tim").trim(),
        category: p.category || "SMA",
        name: String(p.name || "Pemain").trim(),
        jerseyNumber: Number(p.jerseyNumber) || 0,
        position: String(p.position || "Flank").trim(),
        goals: Number(p.goals) || 0,
        yellowCards: Number(p.yellowCards) || 0,
        redCards: Number(p.redCards) || 0,
        photoUrl: p.photoUrl || void 0,
        createdAt: p.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const idx = memStore.players.findIndex((item) => item.id === sp.id);
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
              p.id,
              p.teamId || null,
              p.teamName,
              p.category,
              p.name,
              p.jerseyNumber,
              p.position,
              p.goals,
              p.yellowCards,
              p.redCards,
              p.photoUrl || null,
              p.teamId || null,
              p.teamName,
              p.category,
              p.name,
              p.jerseyNumber,
              p.position,
              p.goals,
              p.yellowCards,
              p.redCards,
              p.photoUrl || null
            ]
          );
        }
      } catch (err) {
        console.error("Error saving batch players to MySQL table_players:", err);
      }
    }
    return sanitizedBatch;
  },
  async deletePlayer(id) {
    invalidatePlayersCache();
    await ensureDbConnected();
    memStore.players = memStore.players.filter((p) => p.id !== id);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM table_players WHERE id = ?", [id]);
      } catch (err) {
        console.error("Error deleting player from MySQL:", err);
      }
    }
    return true;
  },
  // 13. Groups (tournament_groups)
  async getGroupStages(category, forceRefresh = false) {
    const cacheKey = category || "__ALL__";
    if (!forceRefresh && groupsCache.has(cacheKey)) {
      const cached = groupsCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 6e4) {
        return cached.data;
      }
    }
    await ensureDbConnected();
    let list = [];
    if (pool && isMySqlConnected) {
      try {
        let query = "SELECT * FROM tournament_groups WHERE 1=1";
        const params = [];
        if (category) {
          query += " AND category_id = ?";
          params.push(category);
        }
        query += " ORDER BY group_name ASC";
        const [rows] = await pool.query(query, params);
        if (Array.isArray(rows)) {
          list = rows.map((r) => ({
            id: r.id,
            category: r.category_id,
            groupName: r.group_name,
            teams: typeof r.teams_json === "string" ? JSON.parse(r.teams_json) : r.teams_json || []
          }));
        }
      } catch (err) {
        console.error("Error fetching group stages from MySQL:", err);
      }
    } else {
      list = [...memStore.groups];
      if (category) list = list.filter((g) => g.category === category);
    }
    groupsCache.set(cacheKey, { data: list, timestamp: Date.now() });
    return list;
  },
  async saveGroupStages(category, groups) {
    invalidateGroupsCache();
    await ensureDbConnected();
    memStore.groups = memStore.groups.filter((g) => g.category !== category).concat(groups);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM tournament_groups WHERE category_id = ?", [category]);
        for (const g of groups) {
          await pool.query(
            `INSERT INTO tournament_groups (id, category_id, group_name, teams_json)
             VALUES (?, ?, ?, ?)`,
            [g.id, g.category, g.groupName, JSON.stringify(g.teams || [])]
          );
        }
      } catch (err) {
        console.error("Error saving group stages to MySQL:", err);
      }
    }
    try {
      await this.calculateStandings(category);
    } catch (err) {
      console.warn("Error recalculating standings on saveGroupStages:", err);
    }
    return groups;
  },
  async resetCategoryGroupsAndMatches(category) {
    invalidateGroupsCache();
    await ensureDbConnected();
    memStore.groups = memStore.groups.filter((g) => g.category !== category);
    memStore.matches = memStore.matches.filter((m) => m.category !== category);
    persistLocalStore();
    if (pool && isMySqlConnected) {
      try {
        await pool.query("DELETE FROM tournament_groups WHERE category_id = ?", [category]);
        await pool.query("DELETE FROM matches WHERE category_id = ?", [category]);
        await pool.query("DELETE FROM table_standings WHERE category_id = ?", [category]);
        invalidateStandingsCache();
      } catch (err) {
        console.error("Error resetting category groups and matches from MySQL:", err);
      }
    }
    return {
      success: true,
      message: `Grup, jadwal pertandingan, dan klasemen untuk kategori ${category} berhasil dikosongkan.`
    };
  },
  // 14. Real-time Standings Calculator (Operates purely on matches & groups without touching registrations table)
  async calculateStandings(category) {
    await ensureDbConnected();
    const allMatches = await this.getMatches();
    const allGroups = await this.getGroupStages(category);
    const result = {};
    const targetMatches = allMatches.filter((m) => {
      if (category && m.category !== category) return false;
      return !!m.group;
    });
    const groupKeys = /* @__PURE__ */ new Set();
    for (const g of allGroups) {
      groupKeys.add(`${g.category}:::${g.groupName}`);
    }
    for (const m of targetMatches) {
      if (m.group) {
        groupKeys.add(`${m.category}:::${m.group}`);
      }
    }
    for (const key of groupKeys) {
      const [cat, grpName] = key.split(":::");
      const grpMatches = targetMatches.filter((m) => m.category === cat && m.group === grpName);
      const grpObj = allGroups.find((g) => g.category === cat && g.groupName === grpName);
      const teamMap = /* @__PURE__ */ new Map();
      if (grpObj && Array.isArray(grpObj.teams)) {
        for (const t of grpObj.teams) {
          const resolvedLogo = t.logo || "";
          const resolvedInst = t.institution || "";
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
              points: 0
            });
          } else {
            const item = teamMap.get(t.name);
            if (resolvedLogo && !item.teamLogo) {
              item.teamLogo = resolvedLogo;
            }
            if (resolvedInst && !item.institution) {
              item.institution = resolvedInst;
            }
          }
        }
      }
      for (const m of grpMatches) {
        for (const team of [m.teamA, m.teamB]) {
          const resolvedLogo = team.logo || "";
          const resolvedInst = team.institution || "";
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
              points: 0
            });
          } else {
            const item = teamMap.get(team.name);
            if (resolvedLogo && !item.teamLogo) {
              item.teamLogo = resolvedLogo;
            }
            if (resolvedInst && !item.institution) {
              item.institution = resolvedInst;
            }
          }
        }
        const hasScore = m.status !== "UPCOMING" && m.teamA.score !== void 0 && m.teamB.score !== void 0;
        if (hasScore) {
          const itemA = teamMap.get(m.teamA.name);
          const itemB = teamMap.get(m.teamB.name);
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
    if (pool && isMySqlConnected) {
      try {
        const allItems = [];
        for (const k of Object.keys(result)) {
          const items = result[k] || [];
          for (const item of items) {
            allItems.push(item);
          }
        }
        const validIds = allItems.map(
          (item) => `std-${item.category}-${item.groupName}-${item.teamName}`.toLowerCase().replace(/[^a-z0-9-]/g, "_")
        );
        if (category) {
          if (validIds.length > 0) {
            const placeholders = validIds.map(() => "?").join(", ");
            await pool.query(
              `DELETE FROM table_standings WHERE category_id = ? AND id NOT IN (${placeholders})`,
              [category, ...validIds]
            );
          } else {
            await pool.query("DELETE FROM table_standings WHERE category_id = ?", [category]);
          }
        } else {
          if (validIds.length > 0) {
            const placeholders = validIds.map(() => "?").join(", ");
            await pool.query(
              `DELETE FROM table_standings WHERE id NOT IN (${placeholders})`,
              validIds
            );
          }
        }
        if (allItems.length > 0) {
          const chunkSize = 50;
          for (let i = 0; i < allItems.length; i += chunkSize) {
            const chunk = allItems.slice(i, i + chunkSize);
            const valuePlaceholders = [];
            const params = [];
            for (const item of chunk) {
              const standingId = `std-${item.category}-${item.groupName}-${item.teamName}`.toLowerCase().replace(/[^a-z0-9-]/g, "_");
              valuePlaceholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
              params.push(
                standingId,
                item.category,
                item.groupName,
                item.teamName,
                null,
                item.institution || null,
                item.teamLogo || null,
                item.position,
                item.played,
                item.won,
                item.drawn,
                item.lost,
                item.goalsFor,
                item.goalsAgainst,
                item.goalDifference,
                item.points
              );
            }
            const sql = `
              INSERT INTO table_standings (
                id, category_id, group_name, team_name, team_id, institution_name, team_logo,
                position, played, won, drawn, lost, goals_for, goals_against, goal_difference, points
              ) VALUES ${valuePlaceholders.join(", ")}
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
      } catch (err) {
        console.error("Error persisting standings to table_standings in MySQL:", err);
      }
    }
    return result;
  },
  async getStandingsFromDb(category, forceRefresh = false) {
    const cacheKey = category || "__ALL__";
    if (!forceRefresh && standingsDbCache.has(cacheKey)) {
      const cached = standingsDbCache.get(cacheKey);
      if (Date.now() - cached.timestamp < 15e3) {
        return cached.data;
      }
    }
    await ensureDbConnected();
    if (pool && isMySqlConnected) {
      try {
        let query = "SELECT * FROM table_standings WHERE 1=1";
        const params = [];
        if (category) {
          query += " AND category_id = ?";
          params.push(category);
        }
        query += " ORDER BY category_id ASC, group_name ASC, position ASC, points DESC, goal_difference DESC";
        const [rows] = await pool.query(query, params);
        if (Array.isArray(rows) && rows.length > 0) {
          const map = {};
          for (const r of rows) {
            const key = `${r.category_id}:::${r.group_name}`;
            if (!map[key]) map[key] = [];
            map[key].push({
              position: Number(r.position) || 0,
              teamName: r.team_name,
              institution: r.institution_name || void 0,
              teamLogo: r.team_logo || void 0,
              groupName: r.group_name,
              category: r.category_id,
              played: Number(r.played) || 0,
              won: Number(r.won) || 0,
              drawn: Number(r.drawn) || 0,
              lost: Number(r.lost) || 0,
              goalsFor: Number(r.goals_for) || 0,
              goalsAgainst: Number(r.goals_against) || 0,
              goalDifference: Number(r.goal_difference) || 0,
              points: Number(r.points) || 0
            });
          }
          standingsDbCache.set(cacheKey, { data: map, timestamp: Date.now() });
          return map;
        }
      } catch (err) {
        console.error("Error fetching standings from table_standings:", err);
      }
    }
    const calculated = await this.calculateStandings(category);
    standingsDbCache.set(cacheKey, { data: calculated, timestamp: Date.now() });
    return calculated;
  },
  async syncPlayerStatsFromMatches(category) {
    await ensureDbConnected();
    const matches = await this.getMatches();
    const relevantMatches = category ? matches.filter((m) => m.category === category) : matches;
    const statsMap = /* @__PURE__ */ new Map();
    for (const m of relevantMatches) {
      if (m.events && Array.isArray(m.events)) {
        for (const ev of m.events) {
          if (!ev.playerName) continue;
          const pName = ev.playerName.trim();
          const key = `${m.category}:::${pName.toLowerCase()}`;
          const current = statsMap.get(key) || { goals: 0, yellow: 0, red: 0 };
          if (ev.type === "GOAL") current.goals += 1;
          if (ev.type === "YELLOW") current.yellow += 1;
          if (ev.type === "RED") current.red += 1;
          statsMap.set(key, current);
        }
      }
    }
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
    if (pool && isMySqlConnected) {
      try {
        let fetchQuery = "SELECT id, category_id, name, goals, yellow_cards, red_cards FROM table_players WHERE 1=1";
        const params = [];
        if (category) {
          fetchQuery += " AND category_id = ?";
          params.push(category);
        }
        const [rows] = await pool.query(fetchQuery, params);
        if (Array.isArray(rows)) {
          const playersToUpdate = [];
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
            await Promise.all(
              playersToUpdate.map(
                (p) => pool.query(
                  "UPDATE table_players SET goals = ?, yellow_cards = ?, red_cards = ? WHERE id = ?",
                  [p.goals, p.yellow, p.red, p.id]
                )
              )
            );
          }
        }
      } catch (err) {
        console.error("Error syncing player stats in MySQL:", err);
      }
    }
  }
};

// src/shared/constants.ts
var COUNTED_STATUSES = ["PENDING_PAYMENT", "PENDING", "APPROVED", "REJECTED"];

// src/shared/registrationRules.ts
function isSuratKeteranganRequired(categoryIdOrName) {
  if (!categoryIdOrName) return true;
  const normalized = categoryIdOrName.trim().toUpperCase();
  if (normalized === "UMUM") {
    return false;
  }
  return true;
}

// server/blob.ts
import { Router } from "express";
import { handleUpload } from "@vercel/blob/client";
var blobRouter = Router();
blobRouter.post("/blob/upload", async (req, res) => {
  const body = req.body;
  const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_BLOB_READ_WRITE_TOKEN || Object.entries(process.env).find(([k]) => k.includes("BLOB") && k.includes("TOKEN"))?.[1];
  if (!token) {
    return res.status(503).json({
      error: "BLOB_READ_WRITE_TOKEN belum aktif pada deployment saat ini. Harap lakukan Redeploy di dashboard Vercel."
    });
  }
  try {
    const jsonResponse = await handleUpload({
      token,
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
        const isAllowed = allowedExtensions.some((ext) => pathname.toLowerCase().endsWith(ext));
        if (!isAllowed) {
          throw new Error("Ekstensi berkas tidak diizinkan. Hanya menerima PDF dan Gambar (JPG/PNG/WEBP).");
        }
        return {
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp"
          ],
          maximumSizeInBytes: 15 * 1024 * 1024,
          // Allow up to 15MB direct to Vercel Blob
          tokenPayload: JSON.stringify({ timestamp: Date.now() })
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("[Vercel Blob Completed]", blob.url, tokenPayload);
      }
    });
    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("[Vercel Blob Upload Token Error]", error);
    return res.status(400).json({ error: error.message || "Gagal memproses token upload" });
  }
});

// server/r2.ts
import { Router as Router2 } from "express";
import { S3Client as S3Client2, PutObjectCommand as PutObjectCommand2 } from "@aws-sdk/client-s3";
import { getSignedUrl as getSignedUrl2 } from "@aws-sdk/s3-request-presigner";
var r2Router = Router2();
var s3ClientInstance = null;
function getR2Client() {
  if (s3ClientInstance) return s3ClientInstance;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }
  s3ClientInstance = new S3Client2({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
  return s3ClientInstance;
}
r2Router.post("/storage/presigned-url", async (req, res) => {
  try {
    const { filename, contentType, folder = "registrations" } = req.body;
    if (!filename || !contentType) {
      return res.status(400).json({ error: "Filename and contentType are required" });
    }
    const s3 = getR2Client();
    const bucketName = process.env.R2_BUCKET_NAME || "wabupcup-storage";
    const publicDomain = (process.env.R2_PUBLIC_DOMAIN || "").replace(/\/+$/, "");
    if (!s3 || !publicDomain) {
      return res.status(503).json({
        error: "Cloudflare R2 belum dikonfigurasi di Environment Variables.",
        configured: false
      });
    }
    const timestamp = Date.now();
    const sanitizedName = String(filename).replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${folder}/${timestamp}-${sanitizedName}`;
    const command = new PutObjectCommand2({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType
    });
    const uploadUrl = await getSignedUrl2(s3, command, { expiresIn: 900 });
    const publicUrl = `${publicDomain}/${key}`;
    return res.status(200).json({
      uploadUrl,
      publicUrl,
      key
    });
  } catch (error) {
    console.error("[Cloudflare R2 Presign Error]", error);
    return res.status(500).json({ error: error.message || "Failed to generate upload URL" });
  }
});

// server/mediaRoutes.ts
import { Router as Router3 } from "express";
import crypto3 from "crypto";

// server/auth.ts
import crypto2 from "crypto";
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    let [name, ...rest] = cookie.split("=");
    name = name?.trim();
    if (!name) return;
    const value = rest.join("=").trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}
function getAdminSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.trim().length < 32) {
    return null;
  }
  return secret.trim();
}
function generateToken(adminId, role) {
  const secret = getAdminSecret();
  if (!secret) {
    throw new Error("CONFIG_INCOMPLETE: ADMIN_SESSION_SECRET is missing or less than 32 characters");
  }
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: adminId,
    role,
    exp: Math.floor(Date.now() / 1e3) + 12 * 60 * 60
    // 12 hours
  })).toString("base64url");
  const signature = crypto2.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
function verifyToken(token) {
  const secret = getAdminSecret();
  if (!secret) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSig = crypto2.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expectedSigBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedSigBuf.length || !crypto2.timingSafeEqual(sigBuf, expectedSigBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp && data.exp < Math.floor(Date.now() / 1e3)) return null;
    return data;
  } catch {
    return null;
  }
}
function buildSessionCookie(token, req, maxAgeSeconds = 12 * 60 * 60) {
  const isHttps = req ? req.secure || req.headers["x-forwarded-proto"] === "https" : false;
  const isLocal = req ? req.hostname === "localhost" || req.hostname === "127.0.0.1" : false;
  const isProd = process.env.NODE_ENV === "production";
  const useSecure = isHttps || isProd && !isLocal;
  return `admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${useSecure ? "; Secure" : ""}`;
}
function buildClearSessionCookie(req) {
  const isHttps = req ? req.secure || req.headers["x-forwarded-proto"] === "https" : false;
  const isLocal = req ? req.hostname === "localhost" || req.hostname === "127.0.0.1" : false;
  const isProd = process.env.NODE_ENV === "production";
  const useSecure = isHttps || isProd && !isLocal;
  return `admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${useSecure ? "; Secure" : ""}`;
}
function getAdminFromRequest(req) {
  if (!getAdminSecret()) {
    return null;
  }
  const cookies = parseCookies(req);
  const authHeader = req.headers?.authorization;
  const bearerToken = authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = cookies["admin_session"] || bearerToken;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      return decoded;
    }
  }
  return null;
}
var requireAdmin = (req, res, next) => {
  if (!getAdminSecret()) {
    return res.status(500).json({
      success: false,
      error: "Konfigurasi server otentikasi belum lengkap (ADMIN_SESSION_SECRET)."
    });
  }
  const cookies = parseCookies(req);
  const authHeader = req.headers?.authorization;
  const bearerToken = authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const token = cookies["admin_session"] || bearerToken;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.adminUser = decoded;
      return next();
    }
  }
  return res.status(401).json({
    success: false,
    error: "Sesi tidak valid atau telah berakhir. Harap login kembali."
  });
};
var requireSuperAdmin = (req, res, next) => {
  requireAdmin(req, res, () => {
    const user = req.adminUser;
    if (!user || user.role !== "SUPERADMIN") {
      return res.status(403).json({
        success: false,
        error: "Akses ditolak. Tindakan ini membutuhkan level SUPERADMIN."
      });
    }
    next();
  });
};

// server/registrationGate.ts
function isPublicRegistrationOpen(config) {
  if (!config) {
    return true;
  }
  const rawMode = config.registrationButtonMode;
  const isHiddenByVis = config.sectionsVisibility?.registrationButton === false;
  let mode = "INTERNAL_FORM";
  if (rawMode === "HIDDEN" || rawMode === void 0 && isHiddenByVis) {
    mode = "HIDDEN";
  } else if (rawMode === "CUSTOM_LINK") {
    mode = "CUSTOM_LINK";
  } else if (rawMode === "INTERNAL_FORM") {
    mode = "INTERNAL_FORM";
  } else {
    if (config.registrationCustomLink && config.registrationCustomLink.trim() !== "") {
      mode = "CUSTOM_LINK";
    } else {
      mode = "INTERNAL_FORM";
    }
  }
  return mode === "INTERNAL_FORM";
}
var cachedEntry = null;
var CACHE_TTL_MS = 1e4;
function clearRegistrationGateCache() {
  cachedEntry = null;
}
async function getRegistrationConfigWithCache() {
  const now = Date.now();
  if (cachedEntry && now - cachedEntry.timestamp < CACHE_TTL_MS) {
    return cachedEntry.config;
  }
  try {
    const config = await Database.getConfig();
    cachedEntry = {
      config,
      timestamp: now
    };
    return config;
  } catch (err) {
    console.warn("[RegistrationGate] Gagal membaca konfigurasi turnamen dari basis data, menerapkan fail-open (pendaftaran dianggap terbuka):", err);
    return null;
  }
}
async function checkPublicRegistrationOpen() {
  try {
    const config = await getRegistrationConfigWithCache();
    return isPublicRegistrationOpen(config);
  } catch (err) {
    console.warn("[RegistrationGate] Galat dalam checkPublicRegistrationOpen, menerapkan fail-open:", err);
    return true;
  }
}
var REGISTRATION_CLOSED_RESPONSE = {
  success: false,
  code: "REGISTRATION_CLOSED",
  error: "Pendaftaran sedang ditutup atau dialihkan ke tautan resmi."
};
function validateRegistrationConfig(body) {
  if (!body || typeof body !== "object") {
    return { valid: true };
  }
  if (body.registrationCustomLink !== void 0 && body.registrationCustomLink !== null) {
    if (typeof body.registrationCustomLink !== "string") {
      return { valid: false, error: "registrationCustomLink harus berupa teks (string)." };
    }
    const trimmed = body.registrationCustomLink.trim();
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      return { valid: false, error: "registrationCustomLink tidak boleh mengandung karakter kontrol." };
    }
    if (trimmed.length > 2048) {
      return { valid: false, error: "registrationCustomLink melebihi batas maksimal 2048 karakter." };
    }
    const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    if (schemeMatch) {
      const scheme = schemeMatch[1].toLowerCase();
      const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"];
      if (!ALLOWED_SCHEMES.includes(scheme)) {
        return {
          valid: false,
          error: `Skema URL '${scheme}:' ditolak. Hanya protokol http, https, mailto, dan tel yang diterima.`
        };
      }
    }
  }
  if (body.registrationCustomButtonText !== void 0 && body.registrationCustomButtonText !== null) {
    if (typeof body.registrationCustomButtonText !== "string") {
      return { valid: false, error: "registrationCustomButtonText harus berupa teks (string)." };
    }
    const trimmed = body.registrationCustomButtonText.trim();
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      return { valid: false, error: "registrationCustomButtonText tidak boleh mengandung karakter kontrol." };
    }
    if (trimmed.length > 60) {
      return { valid: false, error: "registrationCustomButtonText melebihi batas maksimal 60 karakter." };
    }
  }
  if (body.registrationButtonMode !== void 0 && body.registrationButtonMode !== null) {
    const ALLOWED_MODES = ["INTERNAL_FORM", "CUSTOM_LINK", "HIDDEN"];
    if (!ALLOWED_MODES.includes(body.registrationButtonMode)) {
      return {
        valid: false,
        error: `registrationButtonMode '${body.registrationButtonMode}' tidak valid. Pilihan yang sah: INTERNAL_FORM, CUSTOM_LINK, atau HIDDEN.`
      };
    }
  }
  if (body.registrationCustomLinkNewTab !== void 0 && body.registrationCustomLinkNewTab !== null) {
    if (typeof body.registrationCustomLinkNewTab !== "boolean") {
      return { valid: false, error: "registrationCustomLinkNewTab harus berupa boolean (true atau false)." };
    }
  }
  return { valid: true };
}

// server/mediaRoutes.ts
var mediaRouter = Router3();
function decodeBase64File(fileData) {
  const matches = fileData.match(/^data:([A-Za-z0-9-+/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    return { buffer, mimeType };
  }
  return { buffer: Buffer.from(fileData, "base64") };
}
function verifyMagicBytes(buffer, mimeType) {
  if (!buffer || buffer.length < 12) return false;
  const type = mimeType.toLowerCase();
  if (type === "application/pdf") {
    return buffer[0] === 37 && buffer[1] === 80 && buffer[2] === 68 && buffer[3] === 70 && buffer[4] === 45;
  }
  if (type === "image/jpeg" || type === "image/jpg") {
    return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  }
  if (type === "image/png") {
    return buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71;
  }
  if (type === "image/webp") {
    const isRiff = buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70;
    const isWebp = buffer[8] === 87 && buffer[9] === 69 && buffer[10] === 66 && buffer[11] === 80;
    return isRiff && isWebp;
  }
  return false;
}
mediaRouter.post("/media/upload", async (req, res) => {
  try {
    const { filename, contentType, fileData, category, refId, subKey } = req.body;
    const ALLOWED_CATEGORIES = ["REG_DOC", "TEAM_LOGO", "SPONSOR_LOGO", "CMS_WALLPAPER", "CMS_DOC"];
    if (!category || typeof category !== "string" || !ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: "Kategori media tidak dikenali." });
    }
    if (category === "SPONSOR_LOGO" || category === "CMS_WALLPAPER" || category === "CMS_DOC") {
      const admin = getAdminFromRequest(req);
      if (!admin) {
        return res.status(401).json({
          success: false,
          error: "Sesi tidak valid atau telah berakhir. Harap login kembali."
        });
      }
    }
    if (category === "REG_DOC" || category === "TEAM_LOGO") {
      const isAdmin = Boolean(getAdminFromRequest(req));
      if (!isAdmin) {
        const isOpen = await checkPublicRegistrationOpen();
        if (!isOpen) {
          return res.status(403).json(REGISTRATION_CLOSED_RESPONSE);
        }
      }
    }
    if (!filename || !fileData) {
      return res.status(400).json({ error: "Filename and fileData are required" });
    }
    const { buffer, mimeType } = decodeBase64File(fileData);
    const resolvedContentType = contentType || mimeType || "application/octet-stream";
    const fileSize = buffer.length;
    if (category === "REG_DOC") {
      if (isB2Configured() && req.headers["x-upload-fallback"] !== "b2-failed") {
        return res.status(409).json({ error: "Gunakan unggahan langsung." });
      }
      const MAX_REG_DOC_BYTES = Math.floor(1.2 * 1024 * 1024);
      if (fileSize > MAX_REG_DOC_BYTES) {
        return res.status(413).json({ error: "Ukuran berkas melebihi batas 1.2MB untuk jalur cadangan." });
      }
      const ALLOWED_REG_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
      if (!ALLOWED_REG_DOC_TYPES.includes(resolvedContentType)) {
        return res.status(400).json({ error: "Tipe berkas tidak diizinkan. Hanya PDF, JPEG, PNG, atau WEBP." });
      }
      if (!verifyMagicBytes(buffer, resolvedContentType)) {
        return res.status(400).json({ error: "Isi berkas tidak valid atau tidak cocok dengan format yang dideklarasikan." });
      }
    }
    if (category === "TEAM_LOGO") {
      const MAX_TEAM_LOGO_BYTES = Math.floor(1.2 * 1024 * 1024);
      if (fileSize > MAX_TEAM_LOGO_BYTES) {
        return res.status(413).json({ success: false, error: "Ukuran logo tim melebihi batas 1.2MB." });
      }
      const ALLOWED_TEAM_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
      if (!ALLOWED_TEAM_LOGO_TYPES.includes(resolvedContentType)) {
        return res.status(400).json({ success: false, error: "Tipe berkas tidak diizinkan. Hanya JPEG, PNG, atau WEBP." });
      }
      if (!verifyMagicBytes(buffer, resolvedContentType)) {
        return res.status(400).json({ success: false, error: "Isi berkas tidak valid atau tidak cocok dengan format yang dideklarasikan." });
      }
    }
    if (fileSize > 4 * 1024 * 1024) {
      return res.status(413).json({
        error: "Ukuran berkas melebihi batas 4MB. Untuk file PDF/dokumen di atas 4MB, silakan kompres terlebih dahulu atau gunakan tautan Google Drive."
      });
    }
    const id = `med-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const mediaItem = {
      id,
      category,
      refId: refId || void 0,
      subKey: subKey || void 0,
      filename,
      contentType: resolvedContentType,
      fileSize,
      fileData
    };
    if (refId && subKey) {
      try {
        const existingList = await Database.getMedia(id);
      } catch {
      }
    }
    await Database.saveMedia(mediaItem);
    const sizeInKb = (fileSize / 1024).toFixed(1);
    const sizeFormatted = fileSize > 1024 * 1024 ? `${(fileSize / (1024 * 1024)).toFixed(2)} MB` : `${sizeInKb} KB`;
    return res.status(201).json({
      id,
      url: `/api/media/view/${id}`,
      filename,
      contentType: resolvedContentType,
      fileSize,
      sizeFormatted
    });
  } catch (err) {
    console.error("[Media Upload Error]", err);
    return res.status(500).json({ error: err?.message || "Gagal mengunggah berkas ke TiDB Cloud" });
  }
});
var B2_ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
var B2_MAX_BYTES = 3 * 1024 * 1024;
var SAFE_INLINE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
mediaRouter.post("/media/presign", async (req, res) => {
  try {
    const { filename, contentType, fileSize, category = "REG_DOC" } = req.body || {};
    if (category === "REG_DOC" || category === "TEAM_LOGO") {
      const isAdmin = Boolean(getAdminFromRequest(req));
      if (!isAdmin) {
        const isOpen = await checkPublicRegistrationOpen();
        if (!isOpen) {
          return res.status(403).json(REGISTRATION_CLOSED_RESPONSE);
        }
      }
    }
    if (!isB2Configured()) {
      return res.status(503).json({ error: "Backblaze B2 belum dikonfigurasi", configured: false });
    }
    const type = String(contentType || "").toLowerCase();
    const size = Number(fileSize);
    if (category !== "REG_DOC") {
      return res.status(400).json({ error: "Unggah langsung hanya untuk dokumen pendaftar (REG_DOC)" });
    }
    if (!filename || !B2_ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: "Tipe berkas tidak diizinkan. Hanya PDF, JPG, PNG, WEBP." });
    }
    if (!Number.isFinite(size) || size <= 0 || size > B2_MAX_BYTES) {
      return res.status(413).json({ error: "Ukuran berkas melebihi batas 3MB." });
    }
    const sanitizedFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const id = `med-${Date.now()}-${crypto3.randomBytes(9).toString("hex")}`;
    const fileKey = `reg-docs/${id}`;
    await Database.saveMedia({
      id,
      category,
      filename: sanitizedFilename,
      contentType: type,
      fileSize: size,
      fileData: "",
      storage: "b2",
      fileKey
    });
    const uploadUrl = await presignPut(fileKey, type, size, 600);
    return res.status(201).json({
      id,
      url: `/api/media/view/${id}`,
      uploadUrl,
      contentType: type,
      filename: sanitizedFilename,
      fileSize: size
    });
  } catch (err) {
    console.error("[Media Presign Error]", err);
    return res.status(500).json({ error: err?.message || "Gagal menyiapkan unggahan" });
  }
});
async function handleMediaServe(req, res, forceDownload = false) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).send("ID media diperlukan");
    }
    const meta = await Database.getMediaMeta(id);
    if (!meta) {
      return res.status(404).send("Berkas tidak ditemukan");
    }
    if (meta.category === "REG_DOC") {
      const admin = getAdminFromRequest(req);
      if (!admin) {
        return res.status(401).json({
          success: false,
          error: "Sesi tidak valid atau telah berakhir."
        });
      }
    }
    const isDownload = forceDownload || req.query.download === "1" || req.query.download === "true" || req.query.dl === "1";
    const rawType = (meta.contentType || "application/octet-stream").toLowerCase();
    const isSafeInline = !isDownload && SAFE_INLINE_MIME_TYPES.includes(rawType);
    const servedType = isSafeInline ? rawType : rawType || "application/octet-stream";
    const cleanFilename = (meta.filename || "berkas").replace(/^.*[\\\/]/, "").replace(/["\r\n\\]/g, "").replace(/[^\x20-\x7E]/g, "_").trim() || "berkas";
    let finalFilename = cleanFilename;
    if (!finalFilename.includes(".")) {
      if (rawType.includes("pdf")) finalFilename += ".pdf";
      else if (rawType.includes("png")) finalFilename += ".png";
      else if (rawType.includes("jpeg") || rawType.includes("jpg")) finalFilename += ".jpg";
      else if (rawType.includes("webp")) finalFilename += ".webp";
    }
    const contentDisposition = `${isSafeInline ? "inline" : "attachment"}; filename="${finalFilename}"`;
    const isPrivateDoc = meta.category === "REG_DOC";
    const cacheControl = isPrivateDoc ? "private, max-age=86400" : "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";
    if (meta.storage === "b2" && meta.fileKey) {
      if (!isB2Configured()) {
        return res.status(503).send("Penyimpanan berkas belum dikonfigurasi");
      }
      const allowStream = process.env.B2_STREAM_DOWNLOADS === "1" && Boolean(getAdminFromRequest(req));
      if (isDownload && allowStream) {
        try {
          const b2Res = await getB2ObjectStream(meta.fileKey);
          if (b2Res && b2Res.Body) {
            res.setHeader("Content-Disposition", contentDisposition);
            res.setHeader("Content-Type", servedType);
            if (b2Res.ContentLength) {
              res.setHeader("Content-Length", b2Res.ContentLength);
            }
            res.setHeader("Cache-Control", "private, no-cache");
            res.setHeader("X-Content-Type-Options", "nosniff");
            b2Res.Body.pipe(res);
            return;
          }
        } catch (b2StreamErr) {
          console.error("[B2 Download Stream Error, fallback to presigned redirect]", b2StreamErr);
        }
      }
      const url = await presignGet(meta.fileKey, {
        contentType: servedType,
        disposition: contentDisposition,
        expiresIn: isPrivateDoc ? 600 : 604800
      });
      res.setHeader("Cache-Control", isPrivateDoc ? "private, max-age=300" : cacheControl);
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.redirect(302, url);
    }
    const etag = `"${id}-${meta.fileSize}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", cacheControl);
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }
    const media = await Database.getMedia(id);
    if (!media || !media.fileData) {
      return res.status(404).send("Berkas tidak ditemukan");
    }
    const { buffer } = decodeBase64File(media.fileData);
    const total = buffer.length;
    res.setHeader("Content-Disposition", contentDisposition);
    res.setHeader("Content-Type", servedType);
    const range = req.headers.range;
    if (range && range.startsWith("bytes=")) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      if (isNaN(start) || start >= total || end >= total || start > end) {
        res.setHeader("Content-Range", `bytes */${total}`);
        return res.status(416).send("Requested range not satisfiable");
      }
      const chunk = buffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", chunk.length);
      return res.end(chunk);
    }
    res.status(200);
    res.setHeader("Content-Length", total);
    return res.end(buffer);
  } catch (err) {
    console.error("[Media View/Download Error]", err);
    return res.status(500).send("Gagal memuat berkas");
  }
}
mediaRouter.get("/media/view/:id", (req, res) => handleMediaServe(req, res, false));
mediaRouter.get("/media/download/:id", (req, res) => handleMediaServe(req, res, true));
mediaRouter.delete("/media/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "ID media diperlukan" });
    }
    await Database.deleteMedia(id);
    return res.json({ success: true, message: "Berkas berhasil dihapus dari TiDB Cloud" });
  } catch (err) {
    console.error("[Media Delete Error]", err);
    return res.status(500).json({ error: err?.message || "Gagal menghapus berkas dari TiDB Cloud" });
  }
});
mediaRouter.delete("/media/ref/:refId", requireAdmin, async (req, res) => {
  try {
    const { refId } = req.params;
    if (!refId) {
      return res.status(400).json({ error: "Reference ID diperlukan" });
    }
    await Database.deleteMediaByRef(refId);
    return res.json({ success: true, message: `Seluruh berkas terkait ${refId} berhasil dihapus dari TiDB Cloud` });
  } catch (err) {
    console.error("[Media Delete By Ref Error]", err);
    return res.status(500).json({ error: err?.message || "Gagal menghapus berkas dari TiDB Cloud" });
  }
});
mediaRouter.get("/media/status", async (req, res) => {
  try {
    res.json({
      status: "ready",
      storageEngine: "TiDB_CLOUD_DATABASE_MEDIA_STORAGE",
      table: "app_media_storage",
      description: "Penyimpanan terpusat logo tim, berkas formulir PDF, gambar wallpaper CMS di TiDB Cloud"
    });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// server/sitemap.ts
function escapeXml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function getBaseUrl(req) {
  if (process.env.APP_URL && process.env.APP_URL.trim() !== "") {
    return process.env.APP_URL.trim().replace(/\/+$/, "");
  }
  const forwardedProto = req.headers["x-forwarded-proto"] || "";
  const proto = forwardedProto.split(",")[0].trim() || req.protocol || "https";
  const forwardedHost = req.headers["x-forwarded-host"] || "";
  const host = forwardedHost.split(",")[0].trim() || req.get("host") || "localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}
function toW3CDate(dateStr) {
  if (!dateStr) return (/* @__PURE__ */ new Date()).toISOString();
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {
  }
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function generateSitemapXml(baseUrl) {
  const [config, categories, matches] = await Promise.all([
    Database.getConfig().catch(() => null),
    Database.getCategories().catch(() => []),
    Database.getMatches().catch(() => [])
  ]);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
`;
  xml += `        xmlns:xhtml="http://www.w3.org/1999/xhtml"
`;
  xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
`;
  xml += `  <!-- 1. LANDING PAGE -->
`;
  xml += `  <url>
`;
  xml += `    <loc>${escapeXml(`${baseUrl}/`)}</loc>
`;
  xml += `    <lastmod>${nowIso}</lastmod>
`;
  xml += `    <changefreq>daily</changefreq>
`;
  xml += `    <priority>1.0</priority>
`;
  if (config?.wabupLogoUrl) {
    const logoUrl = config.wabupLogoUrl.startsWith("/") ? `${baseUrl}${config.wabupLogoUrl}` : config.wabupLogoUrl;
    if (logoUrl.startsWith("http")) {
      xml += `    <image:image>
`;
      xml += `      <image:loc>${escapeXml(logoUrl)}</image:loc>
`;
      xml += `      <image:title>${escapeXml(config.name || "WabupCup 2026")}</image:title>
`;
      xml += `    </image:image>
`;
    }
  }
  xml += `  </url>

`;
  xml += `  <!-- 2. STANDINGS (KLASEMEN & STATISTIK) -->
`;
  xml += `  <url>
`;
  xml += `    <loc>${escapeXml(`${baseUrl}/klasemen`)}</loc>
`;
  xml += `    <lastmod>${nowIso}</lastmod>
`;
  xml += `    <changefreq>hourly</changefreq>
`;
  xml += `    <priority>0.9</priority>
`;
  xml += `  </url>
`;
  if (Array.isArray(categories) && categories.length > 0) {
    for (const cat of categories) {
      if (!cat?.id) continue;
      const catUrl = `${baseUrl}/klasemen?category=${encodeURIComponent(cat.id)}`;
      xml += `  <url>
`;
      xml += `    <loc>${escapeXml(catUrl)}</loc>
`;
      xml += `    <lastmod>${nowIso}</lastmod>
`;
      xml += `    <changefreq>hourly</changefreq>
`;
      xml += `    <priority>0.8</priority>
`;
      xml += `  </url>
`;
    }
  }
  xml += `
`;
  xml += `  <!-- 3. PUBLIC TOURNAMENT MATCHES -->
`;
  if (Array.isArray(matches) && matches.length > 0) {
    for (const match of matches) {
      if (!match?.id) continue;
      const matchUrl = `${baseUrl}/match/${encodeURIComponent(match.id)}`;
      const matchLastMod = toW3CDate(match.date);
      let changefreq = "weekly";
      let priority = "0.6";
      if (match.status === "LIVE") {
        changefreq = "always";
        priority = "0.9";
      } else if (match.status === "UPCOMING") {
        changefreq = "hourly";
        priority = "0.8";
      } else if (match.status === "FINISHED") {
        changefreq = "weekly";
        priority = "0.7";
      }
      xml += `  <url>
`;
      xml += `    <loc>${escapeXml(matchUrl)}</loc>
`;
      xml += `    <lastmod>${matchLastMod}</lastmod>
`;
      xml += `    <changefreq>${changefreq}</changefreq>
`;
      xml += `    <priority>${priority}</priority>
`;
      if (match.teamA?.logo && typeof match.teamA.logo === "string") {
        const logoA = match.teamA.logo.startsWith("/") ? `${baseUrl}${match.teamA.logo}` : match.teamA.logo;
        if (logoA.startsWith("http")) {
          xml += `    <image:image>
`;
          xml += `      <image:loc>${escapeXml(logoA)}</image:loc>
`;
          xml += `      <image:title>${escapeXml(`Logo ${match.teamA.name || "Tim A"}`)}</image:title>
`;
          xml += `    </image:image>
`;
        }
      }
      if (match.teamB?.logo && typeof match.teamB.logo === "string") {
        const logoB = match.teamB.logo.startsWith("/") ? `${baseUrl}${match.teamB.logo}` : match.teamB.logo;
        if (logoB.startsWith("http")) {
          xml += `    <image:image>
`;
          xml += `      <image:loc>${escapeXml(logoB)}</image:loc>
`;
          xml += `      <image:title>${escapeXml(`Logo ${match.teamB.name || "Tim B"}`)}</image:title>
`;
          xml += `    </image:image>
`;
        }
      }
      xml += `  </url>
`;
    }
  }
  xml += `</urlset>`;
  return xml;
}
async function sitemapHandler(req, res) {
  try {
    const baseUrl = getBaseUrl(req);
    const xml = await generateSitemapXml(baseUrl);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600, s-maxage=1800");
    res.setHeader("X-Robots-Tag", "noindex, follow");
    res.send(xml);
  } catch (err) {
    console.error("[Sitemap] Error generating sitemap.xml:", err);
    res.status(500).setHeader("Content-Type", "text/plain").send("Error generating dynamic sitemap.xml");
  }
}
function robotsHandler(req, res) {
  const baseUrl = getBaseUrl(req);
  const robots = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "",
    `Sitemap: ${baseUrl}/sitemap.xml`,
    ""
  ].join("\n");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(robots);
}

// server/loginRateLimiter.ts
import crypto4 from "crypto";
function getClientIp(req) {
  const xReal = req.headers["x-real-ip"];
  if (typeof xReal === "string" && xReal.trim()) {
    return xReal.trim();
  }
  const xVercel = req.headers["x-vercel-forwarded-for"];
  if (typeof xVercel === "string" && xVercel.trim()) {
    return xVercel.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
}
function computeAttemptKeys(ip, username) {
  const cleanUser = (username || "").trim().toLowerCase().slice(0, 64);
  const userKey = crypto4.createHash("sha256").update(`${ip}|${cleanUser}`).digest("hex");
  const ipKey = crypto4.createHash("sha256").update(`${ip}|*`).digest("hex");
  return { userKey, ipKey };
}
async function checkLoginRateLimit(ip, username) {
  try {
    const { userKey, ipKey } = computeAttemptKeys(ip, username);
    const [rows] = await pool.query(
      `SELECT key_hash, failed_count, first_failed_at, locked_until,
              (locked_until > NOW()) as is_locked,
              TIMESTAMPDIFF(SECOND, NOW(), locked_until) as retry_after
       FROM admin_login_attempts WHERE key_hash IN (?, ?)`,
      [userKey, ipKey]
    );
    if (Array.isArray(rows) && rows.length > 0) {
      for (const r of rows) {
        if (Number(r.is_locked) === 1) {
          const retryAfterSeconds = Math.max(1, Number(r.retry_after) || 900);
          return { locked: true, retryAfterSeconds };
        }
      }
    }
    return { locked: false };
  } catch (err) {
    console.warn("[RateLimiter] Gagal memeriksa rate limit (fail-open):", err?.message || err);
    return { locked: false };
  }
}
async function recordLoginFailure(ip, username) {
  try {
    const { userKey, ipKey } = computeAttemptKeys(ip, username);
    const upsertSql = `
      INSERT INTO admin_login_attempts (key_hash, failed_count, first_failed_at, locked_until)
      VALUES (?, 1, NOW(), NULL)
      ON DUPLICATE KEY UPDATE
        failed_count = IF(first_failed_at < NOW() - INTERVAL 15 MINUTE, 1, failed_count + 1),
        locked_until = IF(
          first_failed_at < NOW() - INTERVAL 15 MINUTE,
          NULL,
          IF(failed_count >= ?, NOW() + INTERVAL 15 MINUTE, locked_until)
        ),
        first_failed_at = IF(first_failed_at < NOW() - INTERVAL 15 MINUTE, NOW(), first_failed_at)
    `;
    await pool.query(upsertSql, [userKey, 5]);
    await pool.query(upsertSql, [ipKey, 20]);
    await pool.query(
      "DELETE FROM admin_login_attempts WHERE updated_at < NOW() - INTERVAL 24 HOUR LIMIT 10"
    ).catch(() => {
    });
  } catch (err) {
    console.warn("[RateLimiter] Gagal mencatat kegagalan login:", err?.message || err);
  }
}
async function recordLoginSuccess(ip, username) {
  try {
    const { userKey } = computeAttemptKeys(ip, username);
    await pool.query("DELETE FROM admin_login_attempts WHERE key_hash = ?", [userKey]).catch(() => {
    });
  } catch (err) {
    console.warn("[RateLimiter] Gagal membersihkan riwayat login berhasil:", err?.message || err);
  }
}

// server/routes.ts
var COMMON_WEAK_PASSWORDS = /* @__PURE__ */ new Set([
  ["adm", "in", "123"].join(""),
  "password",
  "12345678",
  "123456789",
  "wabupcup2026",
  "admin2026",
  "superadmin",
  ["panitia", "2026"].join("")
]);
function validateAdminPassword(password, username) {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password wajib diisi." };
  }
  const trimmed = password.trim();
  if (trimmed.length < 10) {
    return { valid: false, error: "Password minimal 10 karakter." };
  }
  if (username && trimmed.toLowerCase() === username.trim().toLowerCase()) {
    return { valid: false, error: "Password tidak boleh sama dengan username." };
  }
  if (COMMON_WEAK_PASSWORDS.has(trimmed.toLowerCase())) {
    return { valid: false, error: "Password terlalu umum dan mudah ditebak. Gunakan password yang lebih kuat." };
  }
  return { valid: true };
}
function sanitizeAdmin(user) {
  if (!user) return user;
  const { password, password_hash, ...safe } = user;
  return safe;
}
var cdnCache = (sMaxAge = 10, swr = 30) => (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    return next();
  }
  res.setHeader("Cache-Control", `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`);
  next();
};
var apiRouter = Router4();
apiRouter.get("/sitemap.xml", sitemapHandler);
apiRouter.get("/robots.txt", robotsHandler);
apiRouter.use(mediaRouter);
apiRouter.use(r2Router);
apiRouter.use(blobRouter);
function extractMediaIds(data) {
  const ids = /* @__PURE__ */ new Set();
  if (!data) return [];
  const checkStr = (str) => {
    if (!str || typeof str !== "string") return;
    const viewMatches = str.match(/\/api\/media\/view\/([a-zA-Z0-9_-]+)/g);
    if (viewMatches) {
      for (const m of viewMatches) {
        const id = m.replace("/api/media/view/", "").split(/[?#]/)[0];
        if (id) ids.add(id);
      }
    }
    const directMatches = str.match(/\bmed-\d+-[a-zA-Z0-9_-]+\b/g);
    if (directMatches) {
      for (const m of directMatches) {
        ids.add(m);
      }
    }
  };
  const walk = (item) => {
    if (!item) return;
    if (typeof item === "string") {
      checkStr(item);
    } else if (Array.isArray(item)) {
      for (const x of item) walk(x);
    } else if (typeof item === "object") {
      for (const v of Object.values(item)) walk(v);
    }
  };
  walk(data);
  return Array.from(ids);
}
async function linkRegistrationMedia(regId, teamLogo, documents) {
  try {
    if (!regId) return;
    if (teamLogo) {
      const logoIds = extractMediaIds(teamLogo);
      for (const id of logoIds) {
        await Database.updateMediaRef(id, regId, "teamLogo");
      }
    }
    if (documents) {
      const docsObj = typeof documents === "string" ? (() => {
        try {
          return JSON.parse(documents);
        } catch {
          return {};
        }
      })() : documents;
      if (docsObj && typeof docsObj === "object") {
        for (const [key, val] of Object.entries(docsObj)) {
          const docIds = extractMediaIds(val);
          for (const id of docIds) {
            await Database.updateMediaRef(id, regId, key);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[linkRegistrationMedia warning]", err);
  }
}
async function linkSponsorMedia(sponsorId, logoUrl) {
  try {
    if (logoUrl && logoUrl.includes("/api/media/view/")) {
      const match = logoUrl.match(/\/api\/media\/view\/([^/?#]+)/);
      if (match && match[1]) {
        await Database.updateMediaRef(match[1], sponsorId, "sponsorLogo");
      }
    }
  } catch (err) {
    console.warn("[linkSponsorMedia warning]", err);
  }
}
apiRouter.get("/health", cdnCache(60, 180), async (req, res) => {
  await ensureDbConnected();
  const status = getMySqlStatus();
  res.json({
    status: "online",
    system: "WabupCup 2026 Full-Stack Engine",
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    database: status
  });
});
apiRouter.post("/database/init", requireSuperAdmin, async (req, res) => {
  try {
    const result = await runFullSchemaInit();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err?.message || "Database init failed" });
  }
});
apiRouter.post("/database/reconnect", requireSuperAdmin, async (req, res) => {
  try {
    const connected = await initDatabaseConnection();
    const status = getMySqlStatus();
    res.json({
      success: connected,
      status,
      error: !connected ? status.error || "Tidak dapat terhubung ke MySQL server. Periksa konfigurasi .env" : void 0
    });
  } catch (err) {
    const status = getMySqlStatus();
    res.json({
      success: false,
      error: err?.message || "Gagal memeriksa koneksi database",
      status
    });
  }
});
apiRouter.post("/database/connect", requireSuperAdmin, async (req, res) => {
  try {
    const config = req.body || {};
    const connected = await initDatabaseConnection();
    const status = getMySqlStatus();
    if (connected) {
      res.json({
        success: true,
        message: "Koneksi database MySQL/TiDB Cloud berhasil terhubung dan tabel telah tersinkronisasi!",
        status
      });
    } else {
      res.json({
        success: false,
        error: status.error || "Gagal terhubung ke MySQL dengan konfigurasi yang diberikan. Periksa kredensial/koneksi.",
        status
      });
    }
  } catch (err) {
    res.json({
      success: false,
      error: err?.message || "Terjadi kesalahan saat menghubungkan database",
      status: getMySqlStatus()
    });
  }
});
apiRouter.get("/database/export-sql", requireAdmin, async (req, res) => {
  try {
    const sqlDump = await Database.exportFullSqlDump();
    res.setHeader("Content-Type", "application/sql");
    res.setHeader("Content-Disposition", 'attachment; filename="wabupcup_2026_backup.sql"');
    res.send(sqlDump);
  } catch (err) {
    res.status(500).send(`-- Error generating SQL dump: ${err?.message}`);
  }
});
apiRouter.get("/config", cdnCache(120, 300), async (req, res) => {
  const config = await Database.getConfig();
  res.json(config);
});
apiRouter.put("/config", requireAdmin, async (req, res) => {
  try {
    const validation = validateRegistrationConfig(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const updated = await Database.updateConfig(req.body);
    clearRegistrationGateCache();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.get("/categories", cdnCache(30, 60), async (req, res) => {
  const categories = await Database.getCategories();
  res.json(categories);
});
apiRouter.get("/categories/quota", cdnCache(30, 60), async (_req, res) => {
  try {
    const quotas = await Database.getCategoryQuotas();
    res.json(quotas);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal memuat kuota kategori" });
  }
});
apiRouter.post("/categories", requireAdmin, async (req, res) => {
  try {
    const saved = await Database.saveCategory(req.body);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/categories/reorder", requireAdmin, async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body : req.body.categories;
    const saved = await Database.reorderCategories(list || []);
    res.json({ success: true, categories: saved });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/categories/sync-counts", requireAdmin, async (req, res) => {
  try {
    const categories = await Database.getCategories();
    const runInBatches = async (items, batchSize) => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(async (cat) => {
          const conn = await pool.getConnection();
          try {
            await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
            await conn.query("BEGIN PESSIMISTIC");
            await conn.query("SELECT id FROM categories WHERE id = ? FOR UPDATE", [cat.id]);
            const [rows] = await conn.query(
              `SELECT COUNT(*) AS n FROM registrations WHERE category_id = ? AND status IN (?)`,
              [cat.id, COUNTED_STATUSES]
            );
            const count = rows[0]?.n || 0;
            await conn.query("UPDATE categories SET registered_teams_count = ? WHERE id = ?", [count, cat.id]);
            await conn.commit();
          } catch (e) {
            await conn.rollback().catch(() => {
            });
            console.error(`Failed to sync count for category ${cat.id}`, e);
          } finally {
            conn.release();
          }
        }));
      }
    };
    await runInBatches(categories, 3);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.put("/categories/:id", requireAdmin, async (req, res) => {
  try {
    const saved = await Database.saveCategory(req.body);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.delete("/categories/:id", requireAdmin, async (req, res) => {
  try {
    await Database.deleteCategory(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.get("/registrations/public", cdnCache(60, 180), async (req, res) => {
  try {
    const publicData = await Database.getPublicRegistrations();
    res.json(publicData);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.get("/registrations", requireAdmin, async (req, res) => {
  const list = await Database.getRegistrations();
  res.json(list);
});
apiRouter.get("/registrations/:id/doc/:docKey", requireAdmin, async (req, res) => {
  try {
    const { id, docKey } = req.params;
    const fileSource = await Database.getRegistrationDocument(id, docKey);
    if (!fileSource) {
      return res.status(404).send("Dokumen tidak ditemukan");
    }
    if (typeof fileSource === "string" && (fileSource.startsWith("http://") || fileSource.startsWith("https://") || fileSource.startsWith("/api/media/"))) {
      return res.redirect(fileSource);
    }
    const { buffer, mimeType } = decodeBase64File(fileSource);
    const contentType = mimeType || "application/pdf";
    const total = buffer.length;
    const etag = `"${id}-${docKey}-${total}"`;
    if (req.headers["if-none-match"] === etag) {
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      return res.status(304).end();
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.setHeader("Content-Type", contentType);
    const range = req.headers.range;
    if (range && range.startsWith("bytes=")) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      if (isNaN(start) || start >= total || end >= total || start > end) {
        res.setHeader("Content-Range", `bytes */${total}`);
        return res.status(416).send("Requested range not satisfiable");
      }
      const chunk = buffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", chunk.length);
      return res.end(chunk);
    }
    res.status(200);
    res.setHeader("Content-Length", total);
    return res.end(buffer);
  } catch (err) {
    console.error("[Registration Doc Stream Error]", err);
    return res.status(500).send("Gagal memuat dokumen");
  }
});
apiRouter.post("/registrations", async (req, res) => {
  try {
    const isAdmin = Boolean(getAdminFromRequest(req));
    if (!isAdmin) {
      const isOpen = await checkPublicRegistrationOpen();
      if (!isOpen) {
        return res.status(403).json(REGISTRATION_CLOSED_RESPONSE);
      }
    }
    const data = req.body;
    if (!data || !data.teamName || !data.category || !data.coachName || !data.coachPhone) {
      return res.status(400).json({
        error: "Data tidak lengkap. Field wajib: teamName, category, coachName, coachPhone."
      });
    }
    const now = /* @__PURE__ */ new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const candidateId = typeof data.id === "string" ? data.id.trim() : "";
    const id = candidateId || `reg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const candidateCode = typeof data.regCode === "string" ? data.regCode.trim().toUpperCase() : "";
    const RETRYABLE = /* @__PURE__ */ new Set([9007, 8002, 1213, 1205]);
    let saved = null;
    for (let attempt = 1; attempt <= 3 && !saved; attempt++) {
      const conn = await pool.getConnection();
      try {
        await conn.query("SET SESSION innodb_lock_wait_timeout = 5");
        await conn.query("BEGIN PESSIMISTIC");
        const [catRows] = await conn.execute(
          "SELECT id FROM categories WHERE id = ? OR name = ? LIMIT 1 FOR UPDATE",
          [data.category, data.category]
        );
        if (!Array.isArray(catRows) || catRows.length === 0) {
          await conn.rollback();
          return res.status(400).json({ code: "INVALID_CATEGORY", error: "Kategori perlombaan tidak valid atau tidak ditemukan." });
        }
        const categoryId = catRows[0].id;
        if (isSuratKeteranganRequired(categoryId) && !data.documents?.suratKeterangan) {
          await conn.rollback();
          return res.status(400).json({ code: "SURAT_KETERANGAN_REQUIRED", error: "Surat Keterangan wajib diunggah untuk kategori ini." });
        }
        const [upd] = await conn.execute(
          `UPDATE categories SET registered_teams_count = registered_teams_count + 1
           WHERE id = ? AND (max_teams <= 0 OR registered_teams_count < max_teams)`,
          [categoryId]
        );
        if (upd.affectedRows === 0) {
          await conn.rollback();
          return res.status(409).json({ code: "QUOTA_FULL", error: "Mohon maaf, pendaftaran ditolak karena kuota untuk kategori ini telah terisi penuh." });
        }
        const [codeRows] = await conn.execute("SELECT reg_code FROM registrations WHERE category_id = ?", [categoryId]);
        const existingCodes = codeRows.map((r) => ({ regCode: r.reg_code, category: categoryId }));
        const codeInUse = candidateCode !== "" && existingCodes.some((r) => String(r.regCode).toUpperCase() === candidateCode);
        const regCode = !candidateCode || codeInUse ? generateUniqueRegCode(categoryId, existingCodes) : candidateCode;
        const newReg = {
          ...data,
          id,
          regCode,
          category: categoryId,
          registrationDate: data.registrationDate || formattedDate,
          status: "PENDING_PAYMENT",
          paymentStatus: "UNPAID",
          lastUpdated: formattedDate
        };
        await conn.execute(
          `INSERT INTO registrations (
            id, reg_code, category_id, team_name, team_logo, institution_name,
            coach_name, coach_phone, coach_email, player_count, official_count,
            registration_date, status, payment_status, payment_amount,
            rejection_reason, admin_notes, documents_json, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newReg.id,
            newReg.regCode,
            newReg.category,
            newReg.teamName,
            newReg.teamLogo || null,
            newReg.institutionName,
            newReg.coachName,
            newReg.coachPhone,
            newReg.coachEmail || "",
            newReg.playerCount,
            newReg.officialCount,
            newReg.registrationDate,
            newReg.status,
            newReg.paymentStatus,
            newReg.paymentAmount,
            null,
            null,
            JSON.stringify(newReg.documents || {}),
            newReg.lastUpdated
          ]
        );
        await conn.commit();
        saved = newReg;
      } catch (err) {
        await conn.rollback().catch(() => {
        });
        const errno = Number(err?.errno);
        if (errno === 1062) {
          if (String(err?.message || "").includes("idx_unique_team_category")) {
            return res.status(409).json({ code: "DUPLICATE_TEAM", error: "Nama tim ini sudah terdaftar di kategori tersebut." });
          }
          if (String(err?.message || "").includes("PRIMARY")) {
            return res.status(409).json({ code: "DUPLICATE_SUBMISSION", error: "Pendaftaran ini sudah terkirim sebelumnya." });
          }
        }
        if (RETRYABLE.has(errno) || errno === 1062) {
          if (attempt >= 3) {
            return res.status(503).json({ code: "BUSY_RETRY", error: "Sistem sedang sibuk. Silakan coba lagi beberapa saat." });
          }
          await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
          continue;
        }
        throw err;
      } finally {
        conn.release();
      }
    }
    if (!saved) {
      return res.status(503).json({ code: "BUSY_RETRY", error: "Sistem sedang sibuk. Silakan coba lagi beberapa saat." });
    }
    await linkRegistrationMedia(saved.id, saved.teamLogo, saved.documents).catch(() => {
    });
    res.status(201).json(saved);
  } catch (err) {
    console.error("[API] Error in POST /api/registrations:", err);
    res.status(500).json({ code: "SERVER_ERROR", error: "Gagal menyimpan pendaftaran. Silakan coba lagi." });
  }
});
apiRouter.put("/registrations/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "ID pendaftaran diperlukan." });
    }
    const current = await Database.getRegistrationById(id);
    if (!current) {
      return res.status(404).json({ error: "Data pendaftaran tidak ditemukan." });
    }
    const now = /* @__PURE__ */ new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const updatedItem = {
      ...current,
      ...req.body,
      id,
      // Preserve ID
      regCode: current.regCode,
      // Preserve original regCode
      lastUpdated: formattedDate
    };
    const oldMediaIds = /* @__PURE__ */ new Set([
      ...extractMediaIds(current.teamLogo),
      ...extractMediaIds(current.documents)
    ]);
    const newMediaIds = /* @__PURE__ */ new Set([
      ...extractMediaIds(updatedItem.teamLogo),
      ...extractMediaIds(updatedItem.documents)
    ]);
    for (const oldId of oldMediaIds) {
      if (!newMediaIds.has(oldId)) {
        await Database.deleteMedia(oldId);
        console.log(`[Storage Cleanup] Replaced/removed old media file ${oldId} deleted from TiDB Cloud for registration ${id}`);
      }
    }
    const saved = await Database.saveRegistration(updatedItem);
    await linkRegistrationMedia(id, updatedItem.teamLogo, updatedItem.documents);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal memperbarui pendaftaran" });
  }
});
apiRouter.patch("/registrations/:id/status", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason, notes } = req.body;
    const item = await Database.getRegistrationById(id);
    if (!item) {
      return res.status(404).json({ error: "Registration not found" });
    }
    const updated = {
      ...item,
      status,
      rejectionReason: reason !== void 0 ? reason : item.rejectionReason,
      adminNotes: notes !== void 0 ? notes : item.adminNotes,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 16)
    };
    await Database.saveRegistration(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.patch("/registrations/:id/payment", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    const item = await Database.getRegistrationById(id);
    if (!item) {
      return res.status(404).json({ error: "Registration not found" });
    }
    const newStatus = paymentStatus === "PAID" && item.status === "PENDING_PAYMENT" ? "APPROVED" : item.status;
    const updated = {
      ...item,
      paymentStatus,
      status: newStatus,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 16)
    };
    await Database.saveRegistration(updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.delete("/registrations/:id", requireAdmin, async (req, res) => {
  try {
    const regId = req.params.id;
    const reg = await Database.getRegistrationById(regId);
    if (!reg) {
      return res.status(404).json({ error: "Registration not found" });
    }
    const conn = await pool.getConnection();
    try {
      await conn.query("BEGIN PESSIMISTIC");
      if (COUNTED_STATUSES.includes(reg.status)) {
        await conn.query(
          `UPDATE categories SET registered_teams_count = GREATEST(0, registered_teams_count - 1) WHERE id = ?`,
          [reg.category]
          // The property is reg.category in RegistrationItem type
        );
      }
      await conn.query(`DELETE FROM registrations WHERE id = ?`, [regId]);
      await conn.commit();
      await Database.deleteRegistration(regId).catch(() => {
      });
    } catch (e) {
      await conn.rollback().catch(() => {
      });
      throw e;
    } finally {
      conn.release();
    }
    res.json({ success: true, id: regId });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.get("/matches", cdnCache(30, 60), async (req, res) => {
  const matches = await Database.getMatches();
  res.json(matches);
});
apiRouter.post("/matches", requireAdmin, async (req, res) => {
  try {
    const id = req.body.id || `match-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
    const saved = await Database.saveMatch({ ...req.body, id });
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/matches/replace-category", requireAdmin, async (req, res) => {
  try {
    const { category, matches } = req.body;
    if (!category || !Array.isArray(matches)) {
      return res.status(400).json({ error: "category and matches array are required" });
    }
    const saved = await Database.replaceCategoryMatches(category, matches);
    res.json({ success: true, count: saved.length, matches: saved });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/matches/batch", requireAdmin, async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body : req.body.matches;
    const saved = await Database.saveMatchesBatch(list || []);
    res.json({ success: true, count: saved.length, matches: saved });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.put("/matches/:id", requireAdmin, async (req, res) => {
  try {
    const saved = await Database.saveMatch(req.body);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.delete("/matches/:id", requireAdmin, async (req, res) => {
  try {
    await Database.deleteMatch(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
function validateSponsorUrl(rawUrl) {
  if (rawUrl === void 0 || rawUrl === null) {
    return { valid: true, normalized: null };
  }
  if (typeof rawUrl !== "string") {
    return { valid: false, normalized: null, error: "websiteUrl harus berupa teks." };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: true, normalized: null };
  }
  if (trimmed.length > 2048) {
    return { valid: false, normalized: null, error: "Panjang websiteUrl tidak boleh melebihi 2048 karakter." };
  }
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, normalized: null, error: "websiteUrl mengandung karakter kontrol yang tidak valid." };
  }
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*)\s*:/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== "http" && scheme !== "https") {
      return { valid: false, normalized: null, error: "Hanya protokol http:// atau https:// yang diizinkan untuk tautan sponsor." };
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { valid: false, normalized: null, error: "Protokol URL tidak valid." };
      }
    } catch {
      return { valid: false, normalized: null, error: "Format URL http/https tidak valid." };
    }
  }
  return { valid: true, normalized: trimmed };
}
apiRouter.get("/sponsors", cdnCache(300, 600), async (req, res) => {
  const list = await Database.getSponsors();
  res.json(list);
});
apiRouter.post("/sponsors", requireAdmin, async (req, res) => {
  try {
    const urlValidation = validateSponsorUrl(req.body.websiteUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({ success: false, error: urlValidation.error });
    }
    const id = req.body.id || `sp-${Date.now()}`;
    const saved = await Database.saveSponsor({ ...req.body, id, websiteUrl: urlValidation.normalized });
    await linkSponsorMedia(id, saved.logoUrl);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.put("/sponsors/:id", requireAdmin, async (req, res) => {
  try {
    const urlValidation = validateSponsorUrl(req.body.websiteUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({ success: false, error: urlValidation.error });
    }
    const saved = await Database.saveSponsor({ ...req.body, id: req.params.id, websiteUrl: urlValidation.normalized });
    await linkSponsorMedia(req.params.id, saved.logoUrl);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.delete("/sponsors/:id", requireAdmin, async (req, res) => {
  try {
    await Database.deleteSponsor(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.get("/admins", requireAdmin, async (req, res) => {
  try {
    const admins = await Database.getAdmins();
    res.json(admins.map(sanitizeAdmin));
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/admins", requireSuperAdmin, async (req, res) => {
  try {
    const { username, fullName, role, email, phone, avatarColor, password } = req.body;
    if (!username || !fullName) {
      return res.status(400).json({ error: "Username dan Nama Lengkap wajib diisi" });
    }
    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, "");
    if (!password) {
      return res.status(400).json({ error: "Password wajib diisi saat membuat admin baru (minimal 10 karakter)." });
    }
    const passCheck = validateAdminPassword(password, cleanUsername);
    if (!passCheck.valid) {
      return res.status(400).json({ error: passCheck.error });
    }
    const existingList = await Database.getAdmins();
    if (existingList.some((a) => a.username.toLowerCase() === cleanUsername)) {
      return res.status(400).json({ error: "Username sudah digunakan oleh akun lain." });
    }
    const newAdmin = {
      id: `adm-${Date.now()}`,
      username: cleanUsername,
      fullName: fullName.trim(),
      role: role || "PANITIA_INTI",
      email: email ? email.trim() : "",
      phone: phone ? phone.trim() : "",
      avatarColor: avatarColor || "bg-red-600",
      createdAt: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    };
    const saved = await Database.saveAdmin(newAdmin, password);
    const dbStatus = getMySqlStatus();
    res.status(201).json({
      success: true,
      ...sanitizeAdmin(saved),
      savedToDatabase: dbStatus.connected,
      databaseMode: dbStatus.mode,
      databaseHost: dbStatus.host
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal menambahkan admin" });
  }
});
apiRouter.put("/admins/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { username, fullName, role, email, phone, avatarColor, password } = req.body;
    const existingList = await Database.getAdmins();
    const target = existingList.find((a) => a.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: "Admin dengan ID tersebut tidak ditemukan" });
    }
    const cleanUsername = username ? username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, "") : target.username;
    if (username && cleanUsername !== target.username.toLowerCase()) {
      if (existingList.some((a) => a.id !== target.id && a.username.toLowerCase() === cleanUsername)) {
        return res.status(400).json({ error: "Username sudah digunakan oleh akun lain." });
      }
    }
    if (password && typeof password === "string" && password.trim() !== "") {
      const passCheck = validateAdminPassword(password, cleanUsername);
      if (!passCheck.valid) {
        return res.status(400).json({ error: passCheck.error });
      }
    }
    const updatedAdmin = {
      ...target,
      username: cleanUsername,
      fullName: fullName !== void 0 ? fullName.trim() : target.fullName,
      role: role || target.role,
      email: email !== void 0 ? email.trim() : target.email,
      phone: phone !== void 0 ? phone.trim() : target.phone,
      avatarColor: avatarColor || target.avatarColor
    };
    const saved = await Database.saveAdmin(updatedAdmin, password);
    const dbStatus = getMySqlStatus();
    res.json({
      success: true,
      ...sanitizeAdmin(saved),
      savedToDatabase: dbStatus.connected,
      databaseMode: dbStatus.mode,
      databaseHost: dbStatus.host
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal memperbarui admin" });
  }
});
apiRouter.delete("/admins/:id", requireSuperAdmin, async (req, res) => {
  try {
    const success = await Database.deleteAdmin(req.params.id);
    if (!success) {
      return res.status(400).json({ error: "Akun Superadmin utama tidak dapat dihapus demi keamanan sistem." });
    }
    const dbStatus = getMySqlStatus();
    res.json({ success: true, id: req.params.id, savedToDatabase: dbStatus.connected });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal menghapus admin" });
  }
});
apiRouter.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username dan password wajib diisi" });
    }
    const clientIp = getClientIp(req);
    const rateCheck = await checkLoginRateLimit(clientIp, username);
    if (rateCheck.locked) {
      const retryAfter = rateCheck.retryAfterSeconds || 900;
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        authenticated: false,
        message: "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
      });
    }
    const result = await Database.verifyAdminLogin(username, password);
    if (result.statusCode === 503) {
      return res.status(503).json({
        success: false,
        authenticated: false,
        message: result.error || "Layanan sementara tidak tersedia."
      });
    }
    if (result.success && result.user) {
      await recordLoginSuccess(clientIp, username);
      const safeUser = sanitizeAdmin(result.user);
      const token = generateToken(safeUser.id, safeUser.role || "PANITIA_INTI");
      res.setHeader("Set-Cookie", buildSessionCookie(token, req));
      return res.json({ success: true, authenticated: true, user: safeUser });
    }
    await recordLoginFailure(clientIp, username);
    res.status(401).json({
      success: false,
      authenticated: false,
      message: result.error || "Username atau password salah."
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      authenticated: false,
      message: err?.message || "Gagal memproses login"
    });
  }
});
apiRouter.post("/auth/logout", async (req, res) => {
  res.setHeader("Set-Cookie", buildClearSessionCookie(req));
  res.json({ success: true, authenticated: false, message: "Logged out" });
});
apiRouter.get("/auth/me", async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const authHeader = req.headers?.authorization;
    const bearerToken = authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const token = cookies["admin_session"] || bearerToken;
    if (!token) return res.status(401).json({ authenticated: false, success: false, error: "Not authenticated" });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ authenticated: false, success: false, error: "Invalid token" });
    const admins = await Database.getAdmins();
    const user = admins.find((a) => a.id === decoded.sub);
    if (user) {
      return res.json({ authenticated: true, success: true, user: sanitizeAdmin(user) });
    }
    return res.status(404).json({ authenticated: false, success: false, error: "User not found" });
  } catch (err) {
    return res.status(500).json({ authenticated: false, success: false, error: "Server error" });
  }
});
apiRouter.get("/players", cdnCache(30, 60), async (req, res) => {
  try {
    const { category, teamName, hasStats } = req.query;
    const players = await Database.getPlayers(
      category,
      teamName,
      false,
      hasStats === "true" || hasStats === "1"
    );
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal memuat data pemain" });
  }
});
apiRouter.post("/players", requireAdmin, async (req, res) => {
  try {
    const id = req.body.id || `ply-${Date.now()}-${Math.floor(Math.random() * 1e3)}`;
    const saved = await Database.savePlayer({ ...req.body, id });
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal menyimpan pemain" });
  }
});
apiRouter.post("/players/batch", requireAdmin, async (req, res) => {
  try {
    const rawList = Array.isArray(req.body) ? req.body : req.body.players;
    if (!Array.isArray(rawList)) {
      return res.status(400).json({ error: "Array pemain wajib disertakan" });
    }
    const formatted = rawList.map((p, idx) => ({
      id: p.id || `ply-${Date.now()}-${idx}-${Math.floor(Math.random() * 1e3)}`,
      teamId: p.teamId,
      teamName: p.teamName || "Tim",
      category: p.category || "SMA",
      name: p.name || "Pemain",
      jerseyNumber: Number(p.jerseyNumber) || 0,
      position: p.position || "Flank",
      goals: Number(p.goals) || 0,
      yellowCards: Number(p.yellowCards) || 0,
      redCards: Number(p.redCards) || 0,
      photoUrl: p.photoUrl
    }));
    const saved = await Database.savePlayersBatch(formatted);
    res.json({ success: true, count: saved.length, players: saved });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal import pemain batch" });
  }
});
apiRouter.put("/players/:id", requireAdmin, async (req, res) => {
  try {
    const id = req.params.id || req.body.id;
    const saved = await Database.savePlayer({ ...req.body, id });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal memperbarui pemain" });
  }
});
apiRouter.delete("/players/:id", requireAdmin, async (req, res) => {
  try {
    await Database.deletePlayer(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal menghapus pemain" });
  }
});
apiRouter.get("/players/top-scorers", cdnCache(60, 120), async (req, res) => {
  try {
    const { category } = req.query;
    const players = await Database.getPlayers(category, void 0, false, true);
    const topScorers = [...players].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || a.yellowCards - b.yellowCards);
    res.json(topScorers);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.get("/groups", cdnCache(60, 180), async (req, res) => {
  try {
    const { category } = req.query;
    const groups = await Database.getGroupStages(category);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/groups", requireAdmin, async (req, res) => {
  try {
    const { category, groups } = req.body;
    if (!category || !Array.isArray(groups)) {
      return res.status(400).json({ error: "category and groups array are required" });
    }
    const saved = await Database.saveGroupStages(category, groups);
    res.json({ success: true, count: saved.length, groups: saved });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/groups/replace", requireAdmin, async (req, res) => {
  try {
    const { category, groups } = req.body;
    if (!category || !Array.isArray(groups)) {
      return res.status(400).json({ error: "category and groups array are required" });
    }
    const saved = await Database.saveGroupStages(category, groups);
    res.json({ success: true, count: saved.length, groups: saved });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/groups/reset", requireAdmin, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ error: "category is required" });
    }
    const result = await Database.resetCategoryGroupsAndMatches(category);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Gagal mereset grup dan jadwal" });
  }
});
apiRouter.get("/standings", cdnCache(60, 180), async (req, res) => {
  try {
    const { category, recalculate } = req.query;
    if (recalculate === "true") {
      const standings = await Database.calculateStandings(category);
      return res.json(standings);
    }
    const dbStandings = await Database.getStandingsFromDb(category);
    res.json(dbStandings);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});
apiRouter.post("/standings/recalculate", async (req, res) => {
  try {
    const { category } = req.body || {};
    const standings = await Database.calculateStandings(category);
    res.json({ success: true, standings });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// server/serverless.ts
var app = express();
app.use(compression());
app.use(corsMiddleware);
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true, limit: "4mb" }));
app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({
      success: false,
      code: "PAYLOAD_TOO_LARGE",
      message: "Ukuran payload data melebihi batas 4MB Vercel. Gunakan unggah berkas langsung ke cloud storage."
    });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({
      success: false,
      code: "INVALID_JSON",
      message: "Format payload JSON tidak valid."
    });
  }
  next(err);
});
app.use((req, res, next) => {
  ensureDbConnected().catch((err) => {
    console.warn("[Vercel Serverless Auto-DB]", err?.message || err);
  });
  next();
});
app.use("/api", apiRouter);
app.use("/", apiRouter);
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `API Route Not Found: ${req.method} ${req.originalUrl || req.url}`
  });
});
app.use((err, req, res, next) => {
  console.error("[API Serverless Error]", err);
  res.status(500).json({
    success: false,
    error: err?.message || "Internal Server Error"
  });
});
if (typeof process !== "undefined") {
  process.on("unhandledRejection", (reason) => {
    console.warn("[Vercel Serverless Non-Fatal Rejection]", reason?.message || reason);
  });
  process.on("uncaughtException", (err) => {
    console.warn("[Vercel Serverless Non-Fatal Exception]", err?.message || err);
  });
}
var serverless_default = app;
export {
  serverless_default as default
};
