import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { STORAGE_PAPERS_DIR, STORAGE_USERS_DIR } from '../config/env.js';

export async function validateUploadedFileMagic(filePath, allowedKinds = ['pdf', 'png', 'jpeg', 'webp']) {
  let fh;
  try {
    fh = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(12);
    const { bytesRead } = await fh.read(buf, 0, 12, 0);
    if (bytesRead < 4) return false;

    if (allowedKinds.includes('pdf') && bytesRead >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
      return true;
    }
    if (
      allowedKinds.includes('png') &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return true;
    }
    if (
      allowedKinds.includes('jpeg') &&
      buf[0] === 0xff &&
      buf[1] === 0xd8 &&
      buf[2] === 0xff
    ) {
      return true;
    }
    if (
      allowedKinds.includes('webp') &&
      bytesRead >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

export const paperUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_PAPERS_DIR),
    filename: (_req, file, cb) => {
      const clean = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, `${Date.now()}_${crypto.randomBytes(3).toString('hex')}_${clean}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream';
    if (ext === '.pdf' && okMime) return cb(null, true);
    cb(new Error('Only PDF files are allowed'));
  },
});

export const userUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_USERS_DIR),
    filename: (_req, file, cb) => {
      const clean = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${clean}`);
    },
  }),
  limits: { fileSize: 500 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedExt.includes(ext) && allowedMime.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP, or PDF files are allowed'));
  },
});

export function createMemoryUpload({
  maxFileSizeMb = 25,
  allowedExtensions = [],
  invalidTypeMessage = 'Unsupported file type.',
} = {}) {
  const allowedSet = new Set(
    Array.from(allowedExtensions).map((ext) =>
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    )
  );
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (allowedSet.size === 0) return cb(null, true);
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (allowedSet.has(ext)) return cb(null, true);
      cb(new Error(invalidTypeMessage));
    },
  });
}

export const rosterUpload = createMemoryUpload({
  maxFileSizeMb: 5,
  allowedExtensions: ['.xlsx', '.csv', '.tsv'],
  invalidTypeMessage: 'Only Excel (.xlsx) or CSV/TSV roster files are allowed',
});
