/**
 * Görsel dosya deposu (#51): base64 data URL'leri veritabanında tutmak yerine
 * diske yazar ve `/uploads/<sha256>.<ext>` URL'i döndürür.
 *
 * Dosya adı içeriğin sha256 hash'i olduğu için aynı görsel tekrar yüklenirse
 * diskte tekilleşir (dedupe) ve URL değişmez. Hem canlı upload ucu (POST
 * /api/files) hem de tek seferlik migration script'i bu modülü paylaşır.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { HttpError } from './errors.js';

const ALLOWED_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Tek bir görsel için üst sınır (bayt). İstemci zaten canvas ile sıkıştırır. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Yüklenen görsellerin yazılacağı mutlak dizin. */
export function uploadsDir(): string {
  const configured = process.env.UPLOAD_DIR || path.join('data', 'uploads');
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

export interface StoredImage {
  url: string;
  filename: string;
  bytes: number;
}

/**
 * Base64 data URL'i doğrular, diske yazar ve genel URL'ini döner.
 * Geçersiz tür/boyut/biçim 400 (HttpError) üretir; asla 500'e düşmez.
 */
export function storeImageFromDataUrl(dataUrl: unknown): StoredImage {
  if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
    throw new HttpError(400, 'Görsel verisi (dataUrl) zorunludur.', 'INVALID_IMAGE');
  }
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new HttpError(400, 'Yalnızca base64 data URL biçimindeki görseller kabul edilir.', 'INVALID_IMAGE');
  }
  const mime = match[1].toLowerCase();
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    throw new HttpError(400, `Desteklenmeyen görsel türü: ${mime}. İzinli: png, jpeg, webp, gif.`, 'INVALID_IMAGE');
  }

  const buf = Buffer.from(match[2], 'base64');
  if (!buf.length) {
    throw new HttpError(400, 'Görsel verisi çözümlenemedi veya boş.', 'INVALID_IMAGE');
  }
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new HttpError(400, `Görsel çok büyük (en fazla ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB).`, 'IMAGE_TOO_LARGE');
  }

  const filename = `${crypto.createHash('sha256').update(buf).digest('hex')}.${ext}`;
  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, filename);
  // Hash aynıysa içerik de aynıdır; yeniden yazmaya gerek yok.
  if (!fs.existsSync(full)) fs.writeFileSync(full, buf);

  return { url: `/uploads/${filename}`, filename, bytes: buf.length };
}
