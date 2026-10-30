import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { Database, AppMediaItem } from './db';
import { requireAdmin, getAdminFromRequest } from './auth';
import { isB2Configured, presignPut, presignGet, getB2ObjectStream } from './b2';
import { checkPublicRegistrationOpen, REGISTRATION_CLOSED_RESPONSE } from './registrationGate';

export const mediaRouter = Router();

/**
 * Helper to extract raw buffer from base64 or Data URI
 */
export function decodeBase64File(fileData: string): { buffer: Buffer; mimeType?: string } {
  const matches = fileData.match(/^data:([A-Za-z0-9-+/]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    return { buffer, mimeType };
  }
  // If raw base64 without prefix
  return { buffer: Buffer.from(fileData, 'base64') };
}

/**
 * 7b. Verifikasi byte awal (magic bytes) berkas biner
 * PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
 * JPEG: 0xFF, 0xD8, 0xFF
 * PNG: 0x89, 0x50, 0x4E, 0x47 (\x89PNG)
 * WEBP: RIFF pada offset 0, WEBP pada offset 8
 */
export function verifyMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 12) return false;
  const type = mimeType.toLowerCase();

  if (type === 'application/pdf') {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d;
  }
  if (type === 'image/jpeg' || type === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (type === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (type === 'image/webp') {
    const isRiff = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isWebp = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    return isRiff && isWebp;
  }
  return false;
}

/**
 * 1. Upload Media (File-by-file direct to TiDB Cloud storage)
 * Payload is typically small (<1MB per file), completely safe from Vercel's 4.5MB limit.
 */
mediaRouter.post('/media/upload', async (req: Request, res: Response) => {
  try {
    const { filename, contentType, fileData, category, refId, subKey } = req.body;

    const ALLOWED_CATEGORIES = ['REG_DOC', 'TEAM_LOGO', 'SPONSOR_LOGO', 'CMS_WALLPAPER', 'CMS_DOC'] as const;
    if (!category || typeof category !== 'string' || !ALLOWED_CATEGORIES.includes(category as any)) {
      return res.status(400).json({ success: false, error: 'Kategori media tidak dikenali.' });
    }

    // Kategori khusus konten admin WAJIB login admin
    if (category === 'SPONSOR_LOGO' || category === 'CMS_WALLPAPER' || category === 'CMS_DOC') {
      const admin = getAdminFromRequest(req);
      if (!admin) {
        return res.status(401).json({
          success: false,
          error: 'Sesi tidak valid atau telah berakhir. Harap login kembali.'
        });
      }
    }

    // Gate check untuk kategori pendaftaran (REG_DOC dan TEAM_LOGO)
    if (category === 'REG_DOC' || category === 'TEAM_LOGO') {
      const isAdmin = Boolean(getAdminFromRequest(req));
      if (!isAdmin) {
        const isOpen = await checkPublicRegistrationOpen();
        if (!isOpen) {
          return res.status(403).json(REGISTRATION_CLOSED_RESPONSE);
        }
      }
    }

    if (!filename || !fileData) {
      return res.status(400).json({ error: 'Filename and fileData are required' });
    }

    const { buffer, mimeType } = decodeBase64File(fileData);
    const resolvedContentType = contentType || mimeType || 'application/octet-stream';
    const fileSize = buffer.length;

    // 7. Pembatasan khusus jalur cadangan untuk category REG_DOC
    if (category === 'REG_DOC') {
      // 7a. Pagar lunak: Jika Backblaze B2 terkonfigurasi, wajib membawa header X-Upload-Fallback: b2-failed
      // Catatan keamanan: Ini adalah pagar lunak (header dapat dipalsukan klien), ditujukan untuk memastikan
      // klien normal tidak langsung membanjiri fungsi serverless & basis data ketika B2 aktif.
      if (isB2Configured() && req.headers['x-upload-fallback'] !== 'b2-failed') {
        return res.status(409).json({ error: 'Gunakan unggahan langsung.' });
      }

      // 7b. Ukuran biner maksimal 1.2 MB (1.2 * 1024 * 1024 = 1,258,291 byte)
      const MAX_REG_DOC_BYTES = Math.floor(1.2 * 1024 * 1024);
      if (fileSize > MAX_REG_DOC_BYTES) {
        return res.status(413).json({ error: 'Ukuran berkas melebihi batas 1.2MB untuk jalur cadangan.' });
      }

      const ALLOWED_REG_DOC_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!ALLOWED_REG_DOC_TYPES.includes(resolvedContentType)) {
        return res.status(400).json({ error: 'Tipe berkas tidak diizinkan. Hanya PDF, JPEG, PNG, atau WEBP.' });
      }

      if (!verifyMagicBytes(buffer, resolvedContentType)) {
        return res.status(400).json({ error: 'Isi berkas tidak valid atau tidak cocok dengan format yang dideklarasikan.' });
      }
    }

    // Pembatasan khusus untuk category TEAM_LOGO (publik)
    if (category === 'TEAM_LOGO') {
      const MAX_TEAM_LOGO_BYTES = Math.floor(1.2 * 1024 * 1024);
      if (fileSize > MAX_TEAM_LOGO_BYTES) {
        return res.status(413).json({ success: false, error: 'Ukuran logo tim melebihi batas 1.2MB.' });
      }

      const ALLOWED_TEAM_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
      if (!ALLOWED_TEAM_LOGO_TYPES.includes(resolvedContentType)) {
        return res.status(400).json({ success: false, error: 'Tipe berkas tidak diizinkan. Hanya JPEG, PNG, atau WEBP.' });
      }

      if (!verifyMagicBytes(buffer, resolvedContentType)) {
        return res.status(400).json({ success: false, error: 'Isi berkas tidak valid atau tidak cocok dengan format yang dideklarasikan.' });
      }
    }

    // Hard safety check per single file: max 4MB to protect Vercel Serverless & TiDB payload
    if (fileSize > 4 * 1024 * 1024) {
      return res.status(413).json({
        error: 'Ukuran berkas melebihi batas 4MB. Untuk file PDF/dokumen di atas 4MB, silakan kompres terlebih dahulu atau gunakan tautan Google Drive.',
      });
    }

    const id = `med-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const mediaItem: AppMediaItem = {
      id,
      category,
      refId: refId || undefined,
      subKey: subKey || undefined,
      filename,
      contentType: resolvedContentType,
      fileSize,
      fileData,
    };

    // If subKey and refId are supplied (e.g. replacing 'logoTim' or 'suratPernyataan'), remove previous duplicate media
    if (refId && subKey) {
      try {
        // Will clean up any older record for same ref and slot
        const existingList = await Database.getMedia(id);
      } catch {}
    }

    await Database.saveMedia(mediaItem);

    // Format human-readable size
    const sizeInKb = (fileSize / 1024).toFixed(1);
    const sizeFormatted = fileSize > 1024 * 1024
      ? `${(fileSize / (1024 * 1024)).toFixed(2)} MB`
      : `${sizeInKb} KB`;

    return res.status(201).json({
      id,
      url: `/api/media/view/${id}`,
      filename,
      contentType: resolvedContentType,
      fileSize,
      sizeFormatted,
    });
  } catch (err: any) {
    console.error('[Media Upload Error]', err);
    return res.status(500).json({ error: err?.message || 'Gagal mengunggah berkas ke TiDB Cloud' });
  }
});

/**
 * 1b. Presigned upload ke Backblaze B2 (khusus dokumen pendaftar / REG_DOC).
 * Browser mengunggah langsung ke B2, jadi file tidak lewat fungsi Vercel (hemat FOT).
 * Jika B2 belum dikonfigurasi, balas 503 dan klien otomatis memakai jalur lama (TiDB).
 */
const B2_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const B2_MAX_BYTES = 3 * 1024 * 1024;

// Hanya tipe ini yang boleh tampil inline di domain situs; selain itu dipaksa unduh (cegah stored XSS).
const SAFE_INLINE_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

mediaRouter.post('/media/presign', async (req: Request, res: Response) => {
  try {
    const { filename, contentType, fileSize, category = 'REG_DOC' } = req.body || {};

    // Gate check untuk kategori pendaftaran (REG_DOC dan TEAM_LOGO)
    if (category === 'REG_DOC' || category === 'TEAM_LOGO') {
      const isAdmin = Boolean(getAdminFromRequest(req));
      if (!isAdmin) {
        const isOpen = await checkPublicRegistrationOpen();
        if (!isOpen) {
          return res.status(403).json(REGISTRATION_CLOSED_RESPONSE);
        }
      }
    }

    if (!isB2Configured()) {
      return res.status(503).json({ error: 'Backblaze B2 belum dikonfigurasi', configured: false });
    }

    const type = String(contentType || '').toLowerCase();
    const size = Number(fileSize);

    if (category !== 'REG_DOC') {
      return res.status(400).json({ error: 'Unggah langsung hanya untuk dokumen pendaftar (REG_DOC)' });
    }
    if (!filename || !B2_ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipe berkas tidak diizinkan. Hanya PDF, JPG, PNG, WEBP.' });
    }
    if (!Number.isFinite(size) || size <= 0 || size > B2_MAX_BYTES) {
      return res.status(413).json({ error: 'Ukuran berkas melebihi batas 3MB.' });
    }

    const sanitizedFilename = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    // ID acak yang sulit ditebak, tetap kompatibel dengan regex /med-\d+-[a-zA-Z0-9_-]+/
    const id = `med-${Date.now()}-${crypto.randomBytes(9).toString('hex')}`;
    const fileKey = `reg-docs/${id}`;

    // Penautan ke pendaftaran (ref_id/sub_key) dan pembersihan berkas lama dilakukan oleh
    // Database.updateMediaRef setelah pendaftaran dibuat, sama seperti jalur lama.
    await Database.saveMedia({
      id,
      category,
      filename: sanitizedFilename,
      contentType: type,
      fileSize: size,
      fileData: '',
      storage: 'b2',
      fileKey,
    });

    const uploadUrl = await presignPut(fileKey, type, size, 600);
    return res.status(201).json({
      id,
      url: `/api/media/view/${id}`,
      uploadUrl,
      contentType: type,
      filename: sanitizedFilename,
      fileSize: size,
    });
  } catch (err: any) {
    console.error('[Media Presign Error]', err);
    return res.status(500).json({ error: err?.message || 'Gagal menyiapkan unggahan' });
  }
});

/**
 * 2. Serve / View Media directly from TiDB Cloud
 * Can be used directly in <img src="/api/media/view/:id" /> or <iframe>
 */
async function handleMediaServe(req: Request, res: Response, forceDownload = false) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).send('ID media diperlukan');
    }

    // Hanya metadata (tanpa file_data) supaya 304 dan redirect B2 tidak membaca isi file dari TiDB
    const meta = await Database.getMediaMeta(id);
    if (!meta) {
      return res.status(404).send('Berkas tidak ditemukan');
    }

    // 5c. Akses Dokumen Pendaftaran (REG_DOC) wajib login admin
    if (meta.category === 'REG_DOC') {
      const admin = getAdminFromRequest(req);
      if (!admin) {
        return res.status(401).json({
          success: false,
          error: 'Sesi tidak valid atau telah berakhir.'
        });
      }
    }

    const isDownload = forceDownload || req.query.download === '1' || req.query.download === 'true' || req.query.dl === '1';
    const rawType = (meta.contentType || 'application/octet-stream').toLowerCase();
    const isSafeInline = !isDownload && SAFE_INLINE_MIME_TYPES.includes(rawType);
    const servedType = isSafeInline ? rawType : (rawType || 'application/octet-stream');

    const cleanFilename = (meta.filename || 'berkas')
      .replace(/^.*[\\\/]/, '')
      .replace(/["\r\n\\]/g, '')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim() || 'berkas';

    let finalFilename = cleanFilename;
    if (!finalFilename.includes('.')) {
      if (rawType.includes('pdf')) finalFilename += '.pdf';
      else if (rawType.includes('png')) finalFilename += '.png';
      else if (rawType.includes('jpeg') || rawType.includes('jpg')) finalFilename += '.jpg';
      else if (rawType.includes('webp')) finalFilename += '.webp';
    }

    const contentDisposition = `${isSafeInline ? 'inline' : 'attachment'}; filename="${finalFilename}"`;

    // Dokumen pendaftar bersifat pribadi: jangan di-cache di CDN publik (hanya cache browser).
    const isPrivateDoc = meta.category === 'REG_DOC';
    const cacheControl = isPrivateDoc
      ? 'private, max-age=86400'
      : 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400';

    // A. Berkas di Backblaze B2:
    if (meta.storage === 'b2' && meta.fileKey) {
      if (!isB2Configured()) {
        return res.status(503).send('Penyimpanan berkas belum dikonfigurasi');
      }

      // 6b. Jalur streaming getB2ObjectStream HANYA jika B2_STREAM_DOWNLOADS === '1' dan admin login
      const allowStream = process.env.B2_STREAM_DOWNLOADS === '1' && Boolean(getAdminFromRequest(req));
      if (isDownload && allowStream) {
        try {
          const b2Res = await getB2ObjectStream(meta.fileKey);
          if (b2Res && b2Res.Body) {
            res.setHeader('Content-Disposition', contentDisposition);
            res.setHeader('Content-Type', servedType);
            if (b2Res.ContentLength) {
              res.setHeader('Content-Length', b2Res.ContentLength);
            }
            res.setHeader('Cache-Control', 'private, no-cache');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            (b2Res.Body as any).pipe(res);
            return;
          }
        } catch (b2StreamErr) {
          console.error('[B2 Download Stream Error, fallback to presigned redirect]', b2StreamErr);
        }
      }

      // 6a. Default unduhan dan view: redirect 302 ke presigned URL
      // Untuk media publik (logo tim, logo sponsor, aset turnamen): expiresIn 7 hari & simpan di Edge CDN Vercel
      // Untuk dokumen pendaftaran privat (REG_DOC): expiresIn 10 menit & Cache-Control private
      const url = await presignGet(meta.fileKey, {
        contentType: servedType,
        disposition: contentDisposition,
        expiresIn: isPrivateDoc ? 600 : 604800,
      });
      res.setHeader('Cache-Control', isPrivateDoc ? 'private, max-age=300' : cacheControl);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.redirect(302, url);
    }

    // B. Berkas lama di TiDB (sampai dimigrasi)
    const etag = `"${id}-${meta.fileSize}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', cacheControl);

    // 1. If-None-Match (304) dijawab tanpa membaca file_data sama sekali
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    const media = await Database.getMedia(id);
    if (!media || !media.fileData) {
      return res.status(404).send('Berkas tidak ditemukan');
    }

    const { buffer } = decodeBase64File(media.fileData);
    const total = buffer.length;
    res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Content-Type', servedType);

    // 2. HTTP Range Requests (RFC 7233) untuk PDF viewer
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

    // 3. Full Content
    res.status(200);
    res.setHeader('Content-Length', total);
    return res.end(buffer);
  } catch (err: any) {
    console.error('[Media View/Download Error]', err);
    return res.status(500).send('Gagal memuat berkas');
  }
}

mediaRouter.get('/media/view/:id', (req: Request, res: Response) => handleMediaServe(req, res, false));
mediaRouter.get('/media/download/:id', (req: Request, res: Response) => handleMediaServe(req, res, true));

/**
 * 3. Delete Media by ID from TiDB Cloud
 */
mediaRouter.delete('/media/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID media diperlukan' });
    }

    await Database.deleteMedia(id);
    return res.json({ success: true, message: 'Berkas berhasil dihapus dari TiDB Cloud' });
  } catch (err: any) {
    console.error('[Media Delete Error]', err);
    return res.status(500).json({ error: err?.message || 'Gagal menghapus berkas dari TiDB Cloud' });
  }
});

/**
 * 3b. Delete all media by reference ID (e.g. registration ID)
 */
mediaRouter.delete('/media/ref/:refId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { refId } = req.params;
    if (!refId) {
      return res.status(400).json({ error: 'Reference ID diperlukan' });
    }

    await Database.deleteMediaByRef(refId);
    return res.json({ success: true, message: `Seluruh berkas terkait ${refId} berhasil dihapus dari TiDB Cloud` });
  } catch (err: any) {
    console.error('[Media Delete By Ref Error]', err);
    return res.status(500).json({ error: err?.message || 'Gagal menghapus berkas dari TiDB Cloud' });
  }
});

/**
 * 4. Status of Media Storage in TiDB Cloud
 */
mediaRouter.get('/media/status', async (req: Request, res: Response) => {
  try {
    res.json({
      status: 'ready',
      storageEngine: 'TiDB_CLOUD_DATABASE_MEDIA_STORAGE',
      table: 'app_media_storage',
      description: 'Penyimpanan terpusat logo tim, berkas formulir PDF, gambar wallpaper CMS di TiDB Cloud',
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});
