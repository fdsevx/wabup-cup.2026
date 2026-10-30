import { Router, Request, Response } from 'express';
import { Database, getMySqlStatus, runFullSchemaInit, initDatabaseConnection, ensureDbConnected } from './db';
import { pool } from './config';
import { COUNTED_STATUSES } from '../src/shared/constants';
import { isSuratKeteranganRequired } from '../src/shared/registrationRules';
import { RegistrationItem, MatchItem, CategoryDetail, SponsorItem, PlayerItem, GroupStageItem } from '../src/types';
import { generateUniqueRegCode } from '../src/utils/registrationCode';
import { blobRouter } from './blob';
import { r2Router } from './r2';
import { mediaRouter, decodeBase64File } from './mediaRoutes';
import { sitemapHandler, robotsHandler } from './sitemap';

import {
  requireAdmin,
  requireSuperAdmin,
  generateToken,
  parseCookies,
  verifyToken,
  buildSessionCookie,
  buildClearSessionCookie,
  getAdminFromRequest
} from './auth';
import {
  checkPublicRegistrationOpen,
  REGISTRATION_CLOSED_RESPONSE,
  validateRegistrationConfig,
  clearRegistrationGateCache
} from './registrationGate';
import {
  getClientIp,
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from './loginRateLimiter';

export const COMMON_WEAK_PASSWORDS = new Set([
  ['adm', 'in', '123'].join(''),
  'password',
  '12345678',
  '123456789',
  'wabupcup2026',
  'admin2026',
  'superadmin',
  ['panitia', '2026'].join(''),
]);

export function validateAdminPassword(password: string, username?: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password wajib diisi.' };
  }
  const trimmed = password.trim();
  if (trimmed.length < 10) {
    return { valid: false, error: 'Password minimal 10 karakter.' };
  }
  if (username && trimmed.toLowerCase() === username.trim().toLowerCase()) {
    return { valid: false, error: 'Password tidak boleh sama dengan username.' };
  }
  if (COMMON_WEAK_PASSWORDS.has(trimmed.toLowerCase())) {
    return { valid: false, error: 'Password terlalu umum dan mudah ditebak. Gunakan password yang lebih kuat.' };
  }
  return { valid: true };
}

export function sanitizeAdmin(user: any): any {
  if (!user) return user;
  const { password, password_hash, ...safe } = user;
  return safe;
}


const cachePublic = (req: Request, res: Response, next: any) => {
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  next();
};

const cdnCache = (sMaxAge = 10, swr = 30) => (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return next();
  }
  res.setHeader('Cache-Control', `public, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`);
  next();
};

const noCache = (req: Request, res: Response, next: any) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

export const apiRouter = Router();

// Dynamic Sitemap & Robots.txt endpoints under /api as well
apiRouter.get('/sitemap.xml', sitemapHandler);
apiRouter.get('/robots.txt', robotsHandler);

// Mount TiDB Centralized Media Storage Router
apiRouter.use(mediaRouter);

// Mount Cloudflare R2 and Vercel Blob cloud upload handlers as legacy fallback
apiRouter.use(r2Router);
apiRouter.use(blobRouter);

// Helper to deeply extract media storage IDs from any text or nested data structure
export function extractMediaIds(data: any): string[] {
  const ids = new Set<string>();
  if (!data) return [];

  const checkStr = (str: string) => {
    if (!str || typeof str !== 'string') return;
    const viewMatches = str.match(/\/api\/media\/view\/([a-zA-Z0-9_-]+)/g);
    if (viewMatches) {
      for (const m of viewMatches) {
        const id = m.replace('/api/media/view/', '').split(/[?#]/)[0];
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

  const walk = (item: any) => {
    if (!item) return;
    if (typeof item === 'string') {
      checkStr(item);
    } else if (Array.isArray(item)) {
      for (const x of item) walk(x);
    } else if (typeof item === 'object') {
      for (const v of Object.values(item)) walk(v);
    }
  };

  walk(data);
  return Array.from(ids);
}

// Helper to associate media storage records with parent entities for automatic cascading cleanup
export async function linkRegistrationMedia(regId: string, teamLogo?: string, documents?: Record<string, any>) {
  try {
    if (!regId) return;

    if (teamLogo) {
      const logoIds = extractMediaIds(teamLogo);
      for (const id of logoIds) {
        await Database.updateMediaRef(id, regId, 'teamLogo');
      }
    }

    if (documents) {
      const docsObj = typeof documents === 'string' ? (() => { try { return JSON.parse(documents); } catch { return {}; } })() : documents;
      if (docsObj && typeof docsObj === 'object') {
        for (const [key, val] of Object.entries(docsObj)) {
          const docIds = extractMediaIds(val);
          for (const id of docIds) {
            await Database.updateMediaRef(id, regId, key);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[linkRegistrationMedia warning]', err);
  }
}

async function linkSponsorMedia(sponsorId: string, logoUrl?: string) {
  try {
    if (logoUrl && logoUrl.includes('/api/media/view/')) {
      const match = logoUrl.match(/\/api\/media\/view\/([^/?#]+)/);
      if (match && match[1]) {
        await Database.updateMediaRef(match[1], sponsorId, 'sponsorLogo');
      }
    }
  } catch (err) {
    console.warn('[linkSponsorMedia warning]', err);
  }
}

// 1. Health & Database Status
apiRouter.get('/health', cdnCache(60, 180), async (req: Request, res: Response) => {
  await ensureDbConnected();
  const status = getMySqlStatus();
  res.json({
    status: 'online',
    system: 'WabupCup 2026 Full-Stack Engine',
    timestamp: new Date().toISOString(),
    database: status,
  });
});

// 2. Database Init / Migration Trigger
apiRouter.post('/database/init', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const result = await runFullSchemaInit();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Database init failed' });
  }
});

// 3. Test & Reconnect Database
apiRouter.post('/database/reconnect', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const connected = await initDatabaseConnection();
    const status = getMySqlStatus();
    res.json({
      success: connected,
      status,
      error: !connected ? (status.error || 'Tidak dapat terhubung ke MySQL server. Periksa konfigurasi .env') : undefined,
    });
  } catch (err: any) {
    const status = getMySqlStatus();
    res.json({
      success: false,
      error: err?.message || 'Gagal memeriksa koneksi database',
      status,
    });
  }
});

// 3b. Configure & Connect Database dynamically (TiDB Cloud / Custom MySQL)
apiRouter.post('/database/connect', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const config = req.body || {};
    const connected = await initDatabaseConnection();
    const status = getMySqlStatus();
    if (connected) {
      res.json({
        success: true,
        message: 'Koneksi database MySQL/TiDB Cloud berhasil terhubung dan tabel telah tersinkronisasi!',
        status,
      });
    } else {
      res.json({
        success: false,
        error: status.error || 'Gagal terhubung ke MySQL dengan konfigurasi yang diberikan. Periksa kredensial/koneksi.',
        status,
      });
    }
  } catch (err: any) {
    res.json({
      success: false,
      error: err?.message || 'Terjadi kesalahan saat menghubungkan database',
      status: getMySqlStatus(),
    });
  }
});

// 4. Export Complete SQL Dump
apiRouter.get('/database/export-sql', requireAdmin, async (req: Request, res: Response) => {
  try {
    const sqlDump = await Database.exportFullSqlDump();
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="wabupcup_2026_backup.sql"');
    res.send(sqlDump);
  } catch (err: any) {
    res.status(500).send(`-- Error generating SQL dump: ${err?.message}`);
  }
});

// 5. Config
apiRouter.get('/config', cdnCache(120, 300), async (req: Request, res: Response) => {
  const config = await Database.getConfig();
  res.json(config);
});

apiRouter.put('/config', requireAdmin, async (req: Request, res: Response) => {
  try {
    const validation = validateRegistrationConfig(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const updated = await Database.updateConfig(req.body);
    clearRegistrationGateCache();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 6. Categories
apiRouter.get('/categories', cdnCache(30, 60), async (req: Request, res: Response) => {
  const categories = await Database.getCategories();
  res.json(categories);
});

apiRouter.get('/categories/quota', cdnCache(30, 60), async (_req: Request, res: Response) => {
  try {
    const quotas = await Database.getCategoryQuotas();
    res.json(quotas);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memuat kuota kategori' });
  }
});

apiRouter.post('/categories', requireAdmin, async (req: Request, res: Response) => {
  try {
    const saved = await Database.saveCategory(req.body);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/categories/reorder', requireAdmin, async (req: Request, res: Response) => {
  try {
    const list = Array.isArray(req.body) ? req.body : req.body.categories;
    const saved = await Database.reorderCategories(list || []);
    res.json({ success: true, categories: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/categories/sync-counts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const categories = await Database.getCategories();
    
    // Process sync with connection limit in mind (e.g., using p-limit or just Promise.all)
    // To respect connectionLimit, we can process in batches or all together if connectionLimit >= categories.length.
    // For safety, process 3 at a time.
    const runInBatches = async (items: any[], batchSize: number) => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(batch.map(async (cat) => {
          const conn = await pool.getConnection();
          try {
            await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
            await conn.query("BEGIN PESSIMISTIC");
            await conn.query("SELECT id FROM categories WHERE id = ? FOR UPDATE", [cat.id]);
            
            const [rows]: any = await conn.query(
              `SELECT COUNT(*) AS n FROM registrations WHERE category_id = ? AND status IN (?)`, 
              [cat.id, COUNTED_STATUSES]
            );
            const count = rows[0]?.n || 0;
            
            await conn.query("UPDATE categories SET registered_teams_count = ? WHERE id = ?", [count, cat.id]);
            await conn.commit();
          } catch (e) {
            await conn.rollback().catch(() => {});
            console.error(`Failed to sync count for category ${cat.id}`, e);
          } finally {
            conn.release();
          }
        }));
      }
    };
    
    await runInBatches(categories, 3);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.put('/categories/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const saved = await Database.saveCategory(req.body);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/categories/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await Database.deleteCategory(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 7. Registrations
apiRouter.get('/registrations/public', cdnCache(60, 180), async (req: Request, res: Response) => {
  try {
    const publicData = await Database.getPublicRegistrations();
    res.json(publicData);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.get('/registrations', requireAdmin, async (req: Request, res: Response) => {
  const list = await Database.getRegistrations();
  res.json(list);
});

// On-demand single document viewer/streamer for registrations with Range and Edge Cache (Admin only)
apiRouter.get('/registrations/:id/doc/:docKey', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id, docKey } = req.params;
    const fileSource = await Database.getRegistrationDocument(id, docKey);
    if (!fileSource) {
      return res.status(404).send('Dokumen tidak ditemukan');
    }

    if (typeof fileSource === 'string' && (fileSource.startsWith('http://') || fileSource.startsWith('https://') || fileSource.startsWith('/api/media/'))) {
      return res.redirect(fileSource);
    }

    const { buffer, mimeType } = decodeBase64File(fileSource);
    const contentType = mimeType || 'application/pdf';
    const total = buffer.length;
    const etag = `"${id}-${docKey}-${total}"`;

    if (req.headers['if-none-match'] === etag) {
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      return res.status(304).end();
    }

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('Content-Type', contentType);

    const range = req.headers.range;
    if (range && range.startsWith('bytes=')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

      if (isNaN(start) || start >= total || end >= total || start > end) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).send('Requested range not satisfiable');
      }

      const chunk = buffer.subarray(start, end + 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', chunk.length);
      return res.end(chunk);
    }

    res.status(200);
    res.setHeader('Content-Length', total);
    return res.end(buffer);
  } catch (err: any) {
    console.error('[Registration Doc Stream Error]', err);
    return res.status(500).send('Gagal memuat dokumen');
  }
});

apiRouter.post('/registrations', async (req: Request, res: Response) => {
  try {
    // 1. Gate check: penutupan atau pengalihan pendaftaran publik ditegakkan di server
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
        error: 'Data tidak lengkap. Field wajib: teamName, category, coachName, coachPhone.',
      });
    }

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const candidateId = typeof data.id === 'string' ? data.id.trim() : '';
    const id = candidateId || `reg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const candidateCode = typeof data.regCode === 'string' ? data.regCode.trim().toUpperCase() : '';

    const RETRYABLE = new Set([9007, 8002, 1213, 1205]);
    let saved: RegistrationItem | null = null;

    for (let attempt = 1; attempt <= 3 && !saved; attempt++) {
      const conn = await pool.getConnection();
      try {
        await conn.query('SET SESSION innodb_lock_wait_timeout = 5');
        await conn.query('BEGIN PESSIMISTIC');

        // Resolve category by id OR name and lock the row.
        const [catRows]: any = await conn.execute(
          'SELECT id FROM categories WHERE id = ? OR name = ? LIMIT 1 FOR UPDATE',
          [data.category, data.category]
        );
        if (!Array.isArray(catRows) || catRows.length === 0) {
          await conn.rollback();
          return res.status(400).json({ code: 'INVALID_CATEGORY', error: 'Kategori perlombaan tidak valid atau tidak ditemukan.' });
        }
        const categoryId: string = catRows[0].id;

        if (isSuratKeteranganRequired(categoryId) && !data.documents?.suratKeterangan) {
          await conn.rollback();
          return res.status(400).json({ code: 'SURAT_KETERANGAN_REQUIRED', error: 'Surat Keterangan wajib diunggah untuk kategori ini.' });
        }

        // Atomic conditional increment. max_teams <= 0 means "unlimited" (legacy behaviour).
        const [upd]: any = await conn.execute(
          `UPDATE categories SET registered_teams_count = registered_teams_count + 1
           WHERE id = ? AND (max_teams <= 0 OR registered_teams_count < max_teams)`,
          [categoryId]
        );
        if (upd.affectedRows === 0) {
          await conn.rollback();
          return res.status(409).json({ code: 'QUOTA_FULL', error: 'Mohon maaf, pendaftaran ditolak karena kuota untuk kategori ini telah terisi penuh.' });
        }

        // Category row is locked, so reading existing codes here is race-free.
        const [codeRows]: any = await conn.execute('SELECT reg_code FROM registrations WHERE category_id = ?', [categoryId]);
        const existingCodes = (codeRows as any[]).map(r => ({ regCode: r.reg_code, category: categoryId }));
        const codeInUse = candidateCode !== '' && existingCodes.some(r => String(r.regCode).toUpperCase() === candidateCode);
        const regCode = !candidateCode || codeInUse ? generateUniqueRegCode(categoryId, existingCodes) : candidateCode;

        const newReg: RegistrationItem = {
          ...data,
          id,
          regCode,
          category: categoryId,
          registrationDate: data.registrationDate || formattedDate,
          status: 'PENDING_PAYMENT',
          paymentStatus: 'UNPAID',
          lastUpdated: formattedDate,
        };

        await conn.execute(
          `INSERT INTO registrations (
            id, reg_code, category_id, team_name, team_logo, institution_name,
            coach_name, coach_phone, coach_email, player_count, official_count,
            registration_date, status, payment_status, payment_amount,
            rejection_reason, admin_notes, documents_json, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newReg.id, newReg.regCode, newReg.category, newReg.teamName, newReg.teamLogo || null, newReg.institutionName,
            newReg.coachName, newReg.coachPhone, newReg.coachEmail || '', newReg.playerCount, newReg.officialCount,
            newReg.registrationDate, newReg.status, newReg.paymentStatus, newReg.paymentAmount,
            null, null, JSON.stringify(newReg.documents || {}), newReg.lastUpdated,
          ]
        );

        await conn.commit();
        saved = newReg;
      } catch (err: any) {
        await conn.rollback().catch(() => {});
        const errno = Number(err?.errno);
        if (errno === 1062) {
          if (String(err?.message || '').includes('idx_unique_team_category')) {
            return res.status(409).json({ code: 'DUPLICATE_TEAM', error: 'Nama tim ini sudah terdaftar di kategori tersebut.' });
          }
          if (String(err?.message || '').includes('PRIMARY')) {
            return res.status(409).json({ code: 'DUPLICATE_SUBMISSION', error: 'Pendaftaran ini sudah terkirim sebelumnya.' });
          }
        }
        if (RETRYABLE.has(errno) || errno === 1062) {
          if (attempt >= 3) {
            return res.status(503).json({ code: 'BUSY_RETRY', error: 'Sistem sedang sibuk. Silakan coba lagi beberapa saat.' });
          }
          await new Promise(r => setTimeout(r, 50 + Math.random() * 150));
          continue;
        }
        throw err;
      } finally {
        conn.release();
      }
    }

    if (!saved) {
      return res.status(503).json({ code: 'BUSY_RETRY', error: 'Sistem sedang sibuk. Silakan coba lagi beberapa saat.' });
    }

    // Link uploaded media to this registration for cascading cleanup (best-effort, after commit).
    await linkRegistrationMedia(saved.id, saved.teamLogo, saved.documents).catch(() => {});
    res.status(201).json(saved);
  } catch (err: any) {
    console.error('[API] Error in POST /api/registrations:', err);
    res.status(500).json({ code: 'SERVER_ERROR', error: 'Gagal menyimpan pendaftaran. Silakan coba lagi.' });
  }
});

apiRouter.put('/registrations/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID pendaftaran diperlukan.' });
    }

    const current = await Database.getRegistrationById(id);
    if (!current) {
      return res.status(404).json({ error: 'Data pendaftaran tidak ditemukan.' });
    }

    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const updatedItem: RegistrationItem = {
      ...current,
      ...req.body,
      id, // Preserve ID
      regCode: current.regCode, // Preserve original regCode
      lastUpdated: formattedDate,
    };

    // Cascading media cleanup: detect any media files from previous registration that were replaced or removed
    const oldMediaIds = new Set([
      ...extractMediaIds(current.teamLogo),
      ...extractMediaIds(current.documents),
    ]);
    const newMediaIds = new Set([
      ...extractMediaIds(updatedItem.teamLogo),
      ...extractMediaIds(updatedItem.documents),
    ]);

    for (const oldId of oldMediaIds) {
      if (!newMediaIds.has(oldId)) {
        await Database.deleteMedia(oldId);
        console.log(`[Storage Cleanup] Replaced/removed old media file ${oldId} deleted from TiDB Cloud for registration ${id}`);
      }
    }

    const saved = await Database.saveRegistration(updatedItem);
    // Link updated media storage records to this registration ID
    await linkRegistrationMedia(id, updatedItem.teamLogo, updatedItem.documents);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memperbarui pendaftaran' });
  }
});

apiRouter.patch('/registrations/:id/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason, notes } = req.body;
    const item = await Database.getRegistrationById(id);
    if (!item) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    const updated: RegistrationItem = {
      ...item,
      status,
      rejectionReason: reason !== undefined ? reason : item.rejectionReason,
      adminNotes: notes !== undefined ? notes : item.adminNotes,
      lastUpdated: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    await Database.saveRegistration(updated);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.patch('/registrations/:id/payment', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    const item = await Database.getRegistrationById(id);
    if (!item) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    const newStatus = paymentStatus === 'PAID' && item.status === 'PENDING_PAYMENT' ? 'APPROVED' : item.status;
    const updated: RegistrationItem = {
      ...item,
      paymentStatus,
      status: newStatus,
      lastUpdated: new Date().toISOString().replace('T', ' ').substring(0, 16),
    };
    await Database.saveRegistration(updated);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/registrations/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const regId = req.params.id;
    // We need to find the registration first to get its category_id and status
    const reg = await Database.getRegistrationById(regId);
    
    if (!reg) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.query("BEGIN PESSIMISTIC");
      // Hanya kurangi kuota jika status pendaftar masuk dalam daftar yang dihitung
      if (COUNTED_STATUSES.includes(reg.status)) {
        await conn.query(
          `UPDATE categories SET registered_teams_count = GREATEST(0, registered_teams_count - 1) WHERE id = ?`,
          [reg.category] // The property is reg.category in RegistrationItem type
        );
      }
      
      await conn.query(`DELETE FROM registrations WHERE id = ?`, [regId]);
      await conn.commit();
      
      // Also invoke memStore cleanup via db.ts if needed, but since we are modifying directly,
      // Database.deleteRegistration should be updated or we can just call it (but it might delete again which is a no-op).
      // Actually Database.deleteRegistration handles memory store deletion.
      await Database.deleteRegistration(regId).catch(() => {});
      
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
    
    res.json({ success: true, id: regId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 8. Matches & Live Score
apiRouter.get('/matches', cdnCache(30, 60), async (req: Request, res: Response) => {
  const matches = await Database.getMatches();
  res.json(matches);
});

apiRouter.post('/matches', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.body.id || `match-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const saved = await Database.saveMatch({ ...req.body, id });
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/matches/replace-category', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { category, matches } = req.body;
    if (!category || !Array.isArray(matches)) {
      return res.status(400).json({ error: 'category and matches array are required' });
    }
    const saved = await Database.replaceCategoryMatches(category, matches);
    res.json({ success: true, count: saved.length, matches: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/matches/batch', requireAdmin, async (req: Request, res: Response) => {
  try {
    const list = Array.isArray(req.body) ? req.body : req.body.matches;
    const saved = await Database.saveMatchesBatch(list || []);
    res.json({ success: true, count: saved.length, matches: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.put('/matches/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const saved = await Database.saveMatch(req.body);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/matches/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await Database.deleteMatch(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 9. Sponsors
/**
 * Validasi dan normalisasi websiteUrl sponsor:
 * - String kosong/null/undefined diizinkan (dinormalisasi menjadi null).
 * - Panjang maksimal 2048 karakter.
 * - Bebas dari karakter kontrol [\x00-\x1F\x7F].
 * - Jika memiliki skema (misal 'http:', 'https:', 'javascript:', 'data:', dll), HANYA 'http' dan 'https' yang diizinkan.
 * - Skema berbahaya ditolak dengan error 400.
 * - Format tanpa skema seperti '@instagram' atau domain 'sponsor.com' diizinkan.
 */
export function validateSponsorUrl(rawUrl: unknown): { valid: boolean; normalized: string | null; error?: string } {
  if (rawUrl === undefined || rawUrl === null) {
    return { valid: true, normalized: null };
  }
  if (typeof rawUrl !== 'string') {
    return { valid: false, normalized: null, error: 'websiteUrl harus berupa teks.' };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: true, normalized: null };
  }
  if (trimmed.length > 2048) {
    return { valid: false, normalized: null, error: 'Panjang websiteUrl tidak boleh melebihi 2048 karakter.' };
  }
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return { valid: false, normalized: null, error: 'websiteUrl mengandung karakter kontrol yang tidak valid.' };
  }

  // Cek apakah memiliki skema (misal 'http:', 'https:', 'javascript:', 'data:', 'vbscript:', dll)
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*)\s*:/i);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      return { valid: false, normalized: null, error: 'Hanya protokol http:// atau https:// yang diizinkan untuk tautan sponsor.' };
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, normalized: null, error: 'Protokol URL tidak valid.' };
      }
    } catch {
      return { valid: false, normalized: null, error: 'Format URL http/https tidak valid.' };
    }
  }

  return { valid: true, normalized: trimmed };
}

apiRouter.get('/sponsors', cachePublic, async (req: Request, res: Response) => {
  const list = await Database.getSponsors();
  res.json(list);
});

apiRouter.post('/sponsors', requireAdmin, async (req: Request, res: Response) => {
  try {
    const urlValidation = validateSponsorUrl(req.body.websiteUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({ success: false, error: urlValidation.error });
    }
    const id = req.body.id || `sp-${Date.now()}`;
    const saved = await Database.saveSponsor({ ...req.body, id, websiteUrl: urlValidation.normalized });
    await linkSponsorMedia(id, saved.logoUrl);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.put('/sponsors/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const urlValidation = validateSponsorUrl(req.body.websiteUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({ success: false, error: urlValidation.error });
    }
    const saved = await Database.saveSponsor({ ...req.body, id: req.params.id, websiteUrl: urlValidation.normalized });
    await linkSponsorMedia(req.params.id, saved.logoUrl);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.delete('/sponsors/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await Database.deleteSponsor(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 10. Admin Users & Auth
apiRouter.get('/admins', requireAdmin, async (req: Request, res: Response) => {
  try {
    const admins = await Database.getAdmins();
    res.json(admins.map(sanitizeAdmin));
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/admins', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { username, fullName, role, email, phone, avatarColor, password } = req.body;
    if (!username || !fullName) {
      return res.status(400).json({ error: 'Username dan Nama Lengkap wajib diisi' });
    }
    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '');
    if (!password) {
      return res.status(400).json({ error: 'Password wajib diisi saat membuat admin baru (minimal 10 karakter).' });
    }
    const passCheck = validateAdminPassword(password, cleanUsername);
    if (!passCheck.valid) {
      return res.status(400).json({ error: passCheck.error });
    }

    const existingList = await Database.getAdmins();
    if (existingList.some(a => a.username.toLowerCase() === cleanUsername)) {
      return res.status(400).json({ error: 'Username sudah digunakan oleh akun lain.' });
    }

    const newAdmin = {
      id: `adm-${Date.now()}`,
      username: cleanUsername,
      fullName: fullName.trim(),
      role: role || 'PANITIA_INTI',
      email: email ? email.trim() : '',
      phone: phone ? phone.trim() : '',
      avatarColor: avatarColor || 'bg-red-600',
      createdAt: new Date().toISOString().split('T')[0],
    };
    const saved = await Database.saveAdmin(newAdmin, password);
    const dbStatus = getMySqlStatus();
    res.status(201).json({
      success: true,
      ...sanitizeAdmin(saved),
      savedToDatabase: dbStatus.connected,
      databaseMode: dbStatus.mode,
      databaseHost: dbStatus.host,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal menambahkan admin' });
  }
});

apiRouter.put('/admins/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { username, fullName, role, email, phone, avatarColor, password } = req.body;
    const existingList = await Database.getAdmins();
    const target = existingList.find(a => a.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Admin dengan ID tersebut tidak ditemukan' });
    }

    const cleanUsername = username ? username.toLowerCase().trim().replace(/[^a-z0-9_.-]/g, '') : target.username;
    if (username && cleanUsername !== target.username.toLowerCase()) {
      if (existingList.some(a => a.id !== target.id && a.username.toLowerCase() === cleanUsername)) {
        return res.status(400).json({ error: 'Username sudah digunakan oleh akun lain.' });
      }
    }
    if (password && typeof password === 'string' && password.trim() !== '') {
      const passCheck = validateAdminPassword(password, cleanUsername);
      if (!passCheck.valid) {
        return res.status(400).json({ error: passCheck.error });
      }
    }

    const updatedAdmin = {
      ...target,
      username: cleanUsername,
      fullName: fullName !== undefined ? fullName.trim() : target.fullName,
      role: role || target.role,
      email: email !== undefined ? email.trim() : target.email,
      phone: phone !== undefined ? phone.trim() : target.phone,
      avatarColor: avatarColor || target.avatarColor,
    };
    const saved = await Database.saveAdmin(updatedAdmin, password);
    const dbStatus = getMySqlStatus();
    res.json({
      success: true,
      ...sanitizeAdmin(saved),
      savedToDatabase: dbStatus.connected,
      databaseMode: dbStatus.mode,
      databaseHost: dbStatus.host,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memperbarui admin' });
  }
});

apiRouter.delete('/admins/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const success = await Database.deleteAdmin(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Akun Superadmin utama tidak dapat dihapus demi keamanan sistem.' });
    }
    const dbStatus = getMySqlStatus();
    res.json({ success: true, id: req.params.id, savedToDatabase: dbStatus.connected });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal menghapus admin' });
  }
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const clientIp = getClientIp(req);

    // 6c. Rate limiting check (maks 1 SELECT berdasarkan PK)
    const rateCheck = await checkLoginRateLimit(clientIp, username);
    if (rateCheck.locked) {
      const retryAfter = rateCheck.retryAfterSeconds || 900;
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        authenticated: false,
        message: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.',
      });
    }

    const result = await Database.verifyAdminLogin(username, password);

    if (result.statusCode === 503) {
      return res.status(503).json({
        success: false,
        authenticated: false,
        message: result.error || 'Layanan sementara tidak tersedia.',
      });
    }

    if (result.success && result.user) {
      // Login sukses: hapus baris kegagalan ip+username
      await recordLoginSuccess(clientIp, username);

      const safeUser = sanitizeAdmin(result.user);
      const token = generateToken(safeUser.id, safeUser.role || 'PANITIA_INTI');
      res.setHeader('Set-Cookie', buildSessionCookie(token, req));
      return res.json({ success: true, authenticated: true, user: safeUser });
    }

    // Login gagal: catat kegagalan (UPSERT)
    await recordLoginFailure(clientIp, username);

    res.status(401).json({
      success: false,
      authenticated: false,
      message: result.error || 'Username atau password salah.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      authenticated: false,
      message: err?.message || 'Gagal memproses login',
    });
  }
});

apiRouter.post('/auth/logout', async (req: Request, res: Response) => {
  res.setHeader('Set-Cookie', buildClearSessionCookie(req));
  res.json({ success: true, authenticated: false, message: 'Logged out' });
});

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const cookies = parseCookies(req);
    const authHeader = req.headers?.authorization;
    const bearerToken = authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
    const token = cookies['admin_session'] || bearerToken;
    if (!token) return res.status(401).json({ authenticated: false, success: false, error: 'Not authenticated' });
    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ authenticated: false, success: false, error: 'Invalid token' });
    
    const admins = await Database.getAdmins();
    const user = admins.find(a => a.id === decoded.sub);
    if (user) {
      return res.json({ authenticated: true, success: true, user: sanitizeAdmin(user) });
    }
    return res.status(404).json({ authenticated: false, success: false, error: 'User not found' });
  } catch (err) {
    return res.status(500).json({ authenticated: false, success: false, error: 'Server error' });
  }
});

// 11. Players Management & Excel Import (table_players)
apiRouter.get('/players', cdnCache(30, 60), async (req: Request, res: Response) => {
  try {
    const { category, teamName, hasStats } = req.query;
    const players = await Database.getPlayers(
      category as string | undefined,
      teamName as string | undefined,
      false,
      hasStats === 'true' || hasStats === '1'
    );
    res.json(players);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memuat data pemain' });
  }
});

apiRouter.post('/players', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.body.id || `ply-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const saved = await Database.savePlayer({ ...req.body, id });
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal menyimpan pemain' });
  }
});

apiRouter.post('/players/batch', requireAdmin, async (req: Request, res: Response) => {
  try {
    const rawList = Array.isArray(req.body) ? req.body : req.body.players;
    if (!Array.isArray(rawList)) {
      return res.status(400).json({ error: 'Array pemain wajib disertakan' });
    }
    const formatted: PlayerItem[] = rawList.map((p, idx) => ({
      id: p.id || `ply-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
      teamId: p.teamId,
      teamName: p.teamName || 'Tim',
      category: p.category || 'SMA',
      name: p.name || 'Pemain',
      jerseyNumber: Number(p.jerseyNumber) || 0,
      position: p.position || 'Flank',
      goals: Number(p.goals) || 0,
      yellowCards: Number(p.yellowCards) || 0,
      redCards: Number(p.redCards) || 0,
      photoUrl: p.photoUrl,
    }));
    const saved = await Database.savePlayersBatch(formatted);
    res.json({ success: true, count: saved.length, players: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal import pemain batch' });
  }
});

apiRouter.put('/players/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id || req.body.id;
    const saved = await Database.savePlayer({ ...req.body, id });
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal memperbarui pemain' });
  }
});

apiRouter.delete('/players/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await Database.deletePlayer(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal menghapus pemain' });
  }
});

apiRouter.get('/players/top-scorers', cdnCache(60, 120), async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const players = await Database.getPlayers(category as string | undefined, undefined, false, true);
    const topScorers = [...players]
      .filter(p => p.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.yellowCards - b.yellowCards);
    res.json(topScorers);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// 12. Groups & Group Stages
apiRouter.get('/groups', cdnCache(60, 180), async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const groups = await Database.getGroupStages(category as string | undefined);
    res.json(groups);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/groups', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { category, groups } = req.body;
    if (!category || !Array.isArray(groups)) {
      return res.status(400).json({ error: 'category and groups array are required' });
    }
    const saved = await Database.saveGroupStages(category, groups);
    res.json({ success: true, count: saved.length, groups: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/groups/replace', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { category, groups } = req.body;
    if (!category || !Array.isArray(groups)) {
      return res.status(400).json({ error: 'category and groups array are required' });
    }
    const saved = await Database.saveGroupStages(category, groups);
    res.json({ success: true, count: saved.length, groups: saved });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/groups/reset', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { category } = req.body;
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    const result = await Database.resetCategoryGroupsAndMatches(category);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal mereset grup dan jadwal' });
  }
});

// 13. Standings (Klasemen Real-time & Sinkronisasi table_standings)
apiRouter.get('/standings', cdnCache(60, 180), async (req: Request, res: Response) => {
  try {
    const { category, recalculate } = req.query;
    // Default: Read-only dari table_standings (ultra-low RU, 0 DELETE / INSERT per request publik)
    if (recalculate === 'true') {
      const standings = await Database.calculateStandings(category as string | undefined);
      return res.json(standings);
    }
    const dbStandings = await Database.getStandingsFromDb(category as string | undefined);
    res.json(dbStandings);
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

apiRouter.post('/standings/recalculate', async (req: Request, res: Response) => {
  try {
    const { category } = req.body || {};
    const standings = await Database.calculateStandings(category as string | undefined);
    res.json({ success: true, standings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});
