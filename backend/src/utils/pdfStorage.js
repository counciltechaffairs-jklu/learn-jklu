import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { getDb } from '../config/db.js';
import { STORAGE_PAPERS_DIR, STORAGE_CACHE_DIR } from '../config/env.js';
import { getClientIp } from '../middleware/rateLimiters.js';
import { safeContentDispositionFilename } from './security.js';

const inflateAsync = promisify(zlib.inflate);

const resolvedPathCache = new Map();
const inFlightAuraDownloads = new Map();
const pendingDownloadCounts = new Map();
const recentDownloadByIpPaper = new Map();

const ALLOWED_AURA_HOSTS = new Set(['aura.jklu.edu.in']);
const MAX_REMOTE_PDF_BYTES = 25 * 1024 * 1024; // 25 MB cap
const REMOTE_FETCH_TIMEOUT_MS = 15000;

function isPathContained(rootDir, candidatePath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(candidatePath);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function statIfFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

export function isAllowedAuraUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    return parsed.protocol === 'https:' && ALLOWED_AURA_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function clearResolvedPathCache() {
  resolvedPathCache.clear();
}

export async function flushPendingDownloadCounts() {
  if (pendingDownloadCounts.size === 0) return;
  const entries = Array.from(pendingDownloadCounts.entries());
  pendingDownloadCounts.clear();
  try {
    const db = await getDb();
    for (const [paperId, delta] of entries) {
      await db.query(
        'UPDATE papers SET download_count = COALESCE(download_count, 0) + $1 WHERE id = $2',
        [delta, paperId]
      );
    }
  } catch {}
}

setInterval(() => {
  flushPendingDownloadCounts().catch(() => {});
}, 10000).unref();

export function recordDownloadCount(req, paperId) {
  if (req.headers.range) return;
  const ip = getClientIp(req);
  const key = `${ip}:${paperId}`;
  const now = Date.now();
  const last = recentDownloadByIpPaper.get(key) || 0;
  if (now - last < 60 * 1000) return;
  if (recentDownloadByIpPaper.size > 5000) {
    for (const [k, ts] of recentDownloadByIpPaper.entries()) {
      if (now - ts >= 60 * 1000) recentDownloadByIpPaper.delete(k);
    }
  }
  recentDownloadByIpPaper.set(key, now);
  pendingDownloadCounts.set(paperId, (pendingDownloadCounts.get(paperId) || 0) + 1);
}

export async function resolveOrFetchPdfDiskInfo(paper) {
  const filePathOrName = paper?.file_path || paper?.file_name || '';
  if (!filePathOrName) return null;

  const cacheKey = `${paper?.id || 'raw'}:${filePathOrName}`;
  const cached = resolvedPathCache.get(cacheKey);
  if (cached) {
    const cachedStat = await statIfFile(cached.diskPath);
    if (cachedStat) return cached;
    resolvedPathCache.delete(cacheKey);
  }

  const safeFileName = String(paper?.file_name || `paper_${paper?.id || 'doc'}.pdf`).replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );

  // 1. Check direct local PDF path ONLY within allowed pastpaper roots or STORAGE_PAPERS_DIR
  const pastpaperRoots = [
    path.resolve(process.cwd(), '../pastpaper'),
    path.resolve(process.cwd(), '../../pastpaper'),
    STORAGE_PAPERS_DIR,
  ];
  if (!/^https?:\/\//i.test(filePathOrName)) {
    const directCandidates = [];
    if (path.isAbsolute(filePathOrName)) {
      if (pastpaperRoots.some((root) => isPathContained(root, filePathOrName))) {
        directCandidates.push(path.resolve(filePathOrName));
      }
    } else {
      for (const root of pastpaperRoots) {
        const candidate = path.resolve(root, filePathOrName);
        if (isPathContained(root, candidate)) {
          directCandidates.push(candidate);
        }
      }
    }
    for (const candidate of directCandidates) {
      const stat = await statIfFile(candidate);
      if (stat) {
        const info = { diskPath: candidate, fileSize: stat.size };
        resolvedPathCache.set(cacheKey, info);
        return info;
      }
    }
  }

  // 2. Check local compressed binary (.bin) in ../pastpaper_bin with strict containment
  if (paper?.aura_uuid) {
    const safeUuid = String(paper.aura_uuid).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeDept = String(paper.department || 'B.TECH').replace(/[^a-zA-Z0-9._-]/g, '');
    if (safeUuid && safeDept) {
      const binRoot = path.resolve(process.cwd(), '../pastpaper_bin');
      const binCandidate = path.resolve(binRoot, safeDept, `${safeUuid}.bin`);
      const inflatedCachePath = path.join(
        STORAGE_CACHE_DIR,
        `bin_${paper.id || safeUuid.slice(0, 8)}_${safeFileName}`
      );
      const cachedInflated = await statIfFile(inflatedCachePath);
      if (cachedInflated && cachedInflated.size > 1000) {
        const info = { diskPath: inflatedCachePath, fileSize: cachedInflated.size };
        resolvedPathCache.set(cacheKey, info);
        return info;
      }
      if (isPathContained(binRoot, binCandidate) && (await statIfFile(binCandidate))) {
        try {
          const compressed = await fs.promises.readFile(binCandidate);
          const pdfBuf = await inflateAsync(compressed);
          await fs.promises.writeFile(inflatedCachePath, pdfBuf);
          const info = { diskPath: inflatedCachePath, fileSize: pdfBuf.length };
          resolvedPathCache.set(cacheKey, info);
          return info;
        } catch {}
      }
    }
  }

  // 3. Check PostgreSQL compressed binary (file_blob BYTEA) — cached in isolated STORAGE_CACHE_DIR
  if (paper?.id) {
    const dbCachePath = path.join(STORAGE_CACHE_DIR, `db_${paper.id}_${safeFileName}`);
    const dbCacheStat = await statIfFile(dbCachePath);
    if (dbCacheStat && dbCacheStat.size > 1000) {
      const info = { diskPath: dbCachePath, fileSize: dbCacheStat.size };
      resolvedPathCache.set(cacheKey, info);
      return info;
    }
    try {
      const db = await getDb();
      const blobRes = await db.query(
        'SELECT file_blob FROM papers WHERE id = $1 AND file_blob IS NOT NULL LIMIT 1',
        [Number(paper.id)]
      );
      if (blobRes.rowCount > 0 && blobRes.rows[0].file_blob) {
        const rawBlob = Buffer.from(blobRes.rows[0].file_blob);
        const pdfBuf =
          rawBlob[0] === 0x25 && rawBlob[1] === 0x50 ? rawBlob : await inflateAsync(rawBlob);
        await fs.promises.writeFile(dbCachePath, pdfBuf);
        const info = { diskPath: dbCachePath, fileSize: pdfBuf.length };
        resolvedPathCache.set(cacheKey, info);
        return info;
      }
    } catch {}
  }

  // 4. Handle remote AURA bitstream URLs ONLY (strict SSRF allowlist + timeout + size cap)
  if (/^https?:\/\//i.test(filePathOrName)) {
    if (!isAllowedAuraUrl(filePathOrName)) {
      console.warn('⚠️ [PDF Storage] Blocked non-AURA remote URL fetch:', filePathOrName);
      return null;
    }
    const localDiskPath = path.join(
      STORAGE_CACHE_DIR,
      `aura_${paper?.id || crypto.createHash('md5').update(filePathOrName).digest('hex').slice(0, 8)}_${safeFileName}`
    );

    const existingStat = await statIfFile(localDiskPath);
    if (existingStat && existingStat.size > 1000) {
      const info = { diskPath: localDiskPath, fileSize: existingStat.size };
      resolvedPathCache.set(cacheKey, info);
      return info;
    }

    let downloadPromise = inFlightAuraDownloads.get(localDiskPath);
    if (!downloadPromise) {
      downloadPromise = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(filePathOrName, {
            signal: controller.signal,
            redirect: 'follow',
          });
          if (!res.ok) {
            throw new Error(`AURA bitstream HTTP ${res.status}`);
          }
          const finalUrl = res.url || filePathOrName;
          if (!isAllowedAuraUrl(finalUrl)) {
            throw new Error('Blocked redirect to non-AURA host');
          }
          const contentLen = Number(res.headers.get('content-length') || 0);
          if (contentLen > MAX_REMOTE_PDF_BYTES) {
            throw new Error('Remote PDF exceeds maximum allowed size');
          }
          const chunks = [];
          let totalBytes = 0;
          for await (const chunk of res.body) {
            totalBytes += chunk.length;
            if (totalBytes > MAX_REMOTE_PDF_BYTES) {
              throw new Error('Remote PDF stream exceeded maximum allowed size');
            }
            chunks.push(chunk);
          }
          const buf = Buffer.concat(chunks, totalBytes);
          await fs.promises.writeFile(localDiskPath, buf);
          return { diskPath: localDiskPath, fileSize: buf.length };
        } finally {
          clearTimeout(timer);
        }
      })().finally(() => {
        inFlightAuraDownloads.delete(localDiskPath);
      });
      inFlightAuraDownloads.set(localDiskPath, downloadPromise);
    }

    try {
      const info = await downloadPromise;
      resolvedPathCache.set(cacheKey, info);
      return info;
    } catch {
      return null;
    }
  }

  return resolvePdfDiskInfo(filePathOrName);
}

export async function resolvePdfDiskInfo(filePathOrName) {
  if (!filePathOrName) return null;
  const cached = resolvedPathCache.get(filePathOrName);
  if (cached && (await statIfFile(cached.diskPath))) return cached;

  const base = path.basename(filePathOrName);
  if (!base || base === '.' || base === '..') return null;

  let foundPath = null;
  const candidate1 = path.join(STORAGE_PAPERS_DIR, base);
  if (isPathContained(STORAGE_PAPERS_DIR, candidate1) && (await statIfFile(candidate1))) {
    foundPath = candidate1;
  } else {
    try {
      const allFiles = await fs.promises.readdir(STORAGE_PAPERS_DIR);
      const found = allFiles.find(
        (f) => f.toLowerCase() === base.toLowerCase() || f.toLowerCase().endsWith(base.toLowerCase())
      );
      if (found) {
        const candidate2 = path.join(STORAGE_PAPERS_DIR, found);
        if (isPathContained(STORAGE_PAPERS_DIR, candidate2)) {
          foundPath = candidate2;
        }
      }
    } catch {}
  }

  if (!foundPath) return null;

  const stat = await statIfFile(foundPath);
  if (!stat) return null;
  const info = { diskPath: foundPath, fileSize: stat.size };
  resolvedPathCache.set(filePathOrName, info);
  return info;
}

export function streamPdfWithByteRange(req, res, diskInfo, downloadName, disposition, isPublic = true) {
  const { diskPath, fileSize } = diskInfo;
  const safeName = safeContentDispositionFilename(downloadName, 'paper.pdf');

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeName}"`);
  if (isPublic) {
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000'
    );
    res.setHeader('CDN-Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=2592000');
    res.setHeader(
      'Vercel-CDN-Cache-Control',
      'public, s-maxage=604800, stale-while-revalidate=2592000'
    );
  } else {
    res.setHeader('Cache-Control', 'private, no-store');
  }

  let stream;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(String(range).trim());
    if (!match || fileSize <= 0) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    const startStr = match[1];
    const endStr = match[2];
    let start;
    let end;
    if (startStr === '' && endStr !== '') {
      const suffixLen = parseInt(endStr, 10);
      if (Number.isNaN(suffixLen) || suffixLen <= 0) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
        return;
      }
      start = Math.max(0, fileSize - suffixLen);
      end = fileSize - 1;
    } else {
      start = parseInt(startStr, 10);
      end = endStr ? Math.min(fileSize - 1, parseInt(endStr, 10)) : fileSize - 1;
    }

    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      start < 0 ||
      end < 0 ||
      start >= fileSize ||
      end >= fileSize ||
      start > end
    ) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const chunksize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunksize);
    stream = fs.createReadStream(diskPath, { start, end });
  } else {
    res.status(200);
    res.setHeader('Content-Length', fileSize);
    stream = fs.createReadStream(diskPath);
  }

  stream.on('error', (err) => {
    console.error('[PDF Stream Error]', err?.message || err);
    if (!res.headersSent) {
      res.status(500).json({ detail: 'Failed to stream PDF file' });
    } else {
      res.end();
    }
  });

  res.on('close', () => {
    if (!stream.destroyed) {
      stream.destroy();
    }
  });

  stream.pipe(res);
}
