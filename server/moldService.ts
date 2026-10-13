import type { PoolConnection } from 'mysql2/promise';
import { HttpError } from './errors.js';
import { allocateDocumentNumber } from './numbering.js';

/**
 * Kalıp (last) ana kartı servis katmanı.
 *
 * colorService.ts ile aynı desendir: generic CRUD'un (server/api.ts) içine takılan
 * kancalar burada yaşar, ikinci bir API/validation mekanizması kurulmaz. Tüm
 * yazımlar çağıranın transaction'ı içinde yapılır.
 *
 * Kalıp kodu (`KLP-0001`) boş bırakılırsa kilitli sayaçtan üretilir. Numara
 * kümesi (sizeRange) asorti şablonundan türer: molds.assortment `[{size,quantity}]`
 * biçimindedir ve sizeRange bu satırlardan otomatik türetilir (tek doğruluk kaynağı
 * asorti), böylece kalıp modülü mevcut asorti şablonlarıyla uyumlu kalır.
 */

/** Kalıp kodu: harf/rakamla başlar; harf, rakam, boşluk, "-", "." ve "_" içerebilir (ör. KLP-0001). */
const CODE_RE = /^[A-Z0-9][A-Z0-9 .\-_]{0,49}$/;

const TEXT_COLUMNS = ['name', 'moldType', 'brand', 'material', 'supplierName', 'description', 'barcode', 'currency'] as const;

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function rowsOf(result: any): any[] {
  return (result?.[0] as any[]) || [];
}

/** Asorti satırlarını `{ size, quantity }` biçiminde doğrular/normalleştirir. */
function normalizeAssortment(raw: unknown): { size: string; quantity: number }[] | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let items: any = raw;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      throw new HttpError(400, 'Kalıp asorti bilgisi geçersiz JSON biçiminde.', 'INVALID_MOLD_ASSORTMENT');
    }
  }
  if (!Array.isArray(items)) throw new HttpError(400, 'Kalıp asorti bilgisi bir liste olmalıdır.', 'INVALID_MOLD_ASSORTMENT');
  const out: { size: string; quantity: number }[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const size = trimOrNull((it as any).size);
    if (!size) continue;
    const quantity = Number((it as any).quantity);
    out.push({ size, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0 });
  }
  return out.length ? out : null;
}

/**
 * Asorti satırlarından numara aralığı metni üretir ("36-42"). Numaralar sayısal
 * sıralanabiliyorsa min-max, aksi halde benzersiz numaraların virgüllü listesi.
 */
export function deriveSizeRange(items: { size: string; quantity: number }[] | null): string | null {
  if (!items || !items.length) return null;
  const sizes = Array.from(new Set(items.map((i) => i.size)));
  const numeric = sizes.map((s) => Number(s));
  if (numeric.every((n) => Number.isFinite(n))) {
    const sorted = numeric.slice().sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return min === max ? String(min) : `${min}-${max}`;
  }
  return sizes.join(', ');
}

/**
 * Kalıp gövdesini yazıma hazırlar (senkron doğrulama).
 * `applyResourceRules('molds', data)` üzerinden çağrılır; hem generic REST hem
 * /ops/commit yolu aynı kurallara tabidir.
 */
export function normalizeMoldPayload(data: Record<string, any>): void {
  if ('name' in data) {
    const name = trimOrNull(data.name);
    if (!name) throw new HttpError(400, 'Kalıp adı zorunludur.', 'MOLD_NAME_REQUIRED');
    if (name.length > 255) throw new HttpError(400, 'Kalıp adı en fazla 255 karakter olabilir.', 'MOLD_NAME_TOO_LONG');
    data.name = name;
  }

  if ('code' in data) {
    const raw = trimOrNull(data.code);
    if (!raw) {
      // Boş kod: INSERT'te sunucu üretir (prepareMoldWrite), UPDATE'te alan değişmez.
      delete data.code;
    } else {
      const code = raw.toLocaleUpperCase('tr');
      if (!CODE_RE.test(code)) {
        throw new HttpError(400, 'Kalıp kodu geçersiz. Harf veya rakamla başlamalı; yalnızca harf, rakam, boşluk, "-", "." ve "_" içerebilir.', 'INVALID_MOLD_CODE');
      }
      data.code = code;
    }
  }

  for (const column of TEXT_COLUMNS) {
    if (column in data && column !== 'name') data[column] = trimOrNull(data[column]);
  }

  if ('purchaseCost' in data) {
    const cost = data.purchaseCost === null || data.purchaseCost === '' ? null : Number(data.purchaseCost);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      throw new HttpError(400, 'Alış maliyeti sıfırdan küçük olamaz.', 'INVALID_MOLD_COST');
    }
    data.purchaseCost = cost;
  }

  if ('isActive' in data) data.isActive = data.isActive ? 1 : 0;

  // Asorti verildiğinde normalize et ve numara aralığını ondan türet (tek kaynak).
  if ('assortment' in data) {
    const items = normalizeAssortment(data.assortment);
    // JSON kolonuna mysql2 parametresi olarak yazılacağı için dizi değil, JSON
    // metni saklanır; aksi halde dizi `(a,b)` biçiminde escape edilip INSERT patlar.
    data.assortment = items ? JSON.stringify(items) : null;
    const range = deriveSizeRange(items);
    if (range) data.sizeRange = range;
  }
  if ('sizeRange' in data && data.sizeRange !== undefined) {
    data.sizeRange = trimOrNull(data.sizeRange);
  }
}

/** Bir sonraki kalıp kodunu (`KLP-0001`) kilitli sayaçtan ayırır. */
export async function allocateMoldCode(conn: PoolConnection): Promise<string> {
  return allocateDocumentNumber(conn, { table: 'molds', prefix: 'KLP', pad: 4, omitYear: true });
}

/**
 * INSERT/UPDATE öncesi kalıp kodunu kesinleştirir: kod boşsa üretilir, ardından
 * benzersizlik açıkça denetlenir (UNIQUE çakışması 500'e düşmesin).
 */
export async function prepareMoldWrite(
  conn: PoolConnection,
  data: Record<string, any>,
  opts: { id?: number | string | null } = {},
): Promise<void> {
  const isNew = opts.id === undefined || opts.id === null;
  if (!data.code) {
    if (isNew) data.code = await allocateMoldCode(conn);
    else return;
  }
  const hit = rowsOf(
    await conn.query('SELECT `id` FROM `molds` WHERE `code` = ? AND `id` <> ? LIMIT 1', [data.code, isNew ? 0 : opts.id]),
  )[0];
  if (hit) {
    throw new HttpError(409, `"${data.code}" kalıp kodu zaten kullanılıyor. Farklı bir kod girin.`, 'MOLD_CODE_DUPLICATE');
  }
}
