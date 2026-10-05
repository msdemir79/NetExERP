import type { PoolConnection } from 'mysql2/promise';
import { query } from './db.js';
import { HttpError } from './errors.js';
import { allocateDocumentNumber } from './numbering.js';

/**
 * Merkezi renk kartı (color master) servis katmanı.
 *
 * Renk, bu modülden önce ürün kartlarında ve hareket satırlarında serbest metin
 * olarak tutuluyordu ("Siyah" / "SİYAH" / "siyah" aynı rengin üç ayrı kaydıydı).
 * Artık tek doğruluk kaynağı `colors` tablosudur:
 *   - products ↔ colors bağı `productColors` üzerinden (çoktan-çoğa),
 *   - hareket/satır tabloları (inventoryLogs, orderItems, waybillItems,
 *     invoiceItems, workOrders, recipes) `colorId` FK'sı taşır.
 *
 * Bu dosya generic CRUD'un (server/api.ts) içine takılan kancaları içerir;
 * ikinci bir API/validation mekanizması kurulmaz. Tüm yazımlar çağıranın
 * transaction'ı içinde yapılır.
 */

/** #RRGGBB — `000000`, `#00000`, `#GGGGGG` gibi değerler reddedilir. */
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
/** Renk kodu: harf/rakamla başlar, boşluk ve .-_ içerebilir (ör. R-0001, TABA-01). */
const CODE_RE = /^[A-Z0-9][A-Z0-9 .\-_]{0,49}$/;
/** Renk adı değiştirildiğinde ürün kartında güncellenen JSON kolonları. */
const PRODUCT_COLOR_JSON_COLUMNS = ['variantBarcodes', 'colorBoxBarcodes', 'colorImages'] as const;

/** Renk adlarını tek biçime indirger: Türkçe büyük harf + fazladan boşluk temizliği. */
export function canonicalColorName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr');
}

/**
 * Karşılaştırma anahtarı: kanonik ad + Türkçe aksan katlaması (İ→I, Ş→S ...).
 * "SIYAH" ile "SİYAH" aynı rengin iki yazımıdır; MySQL'in turkish_ci
 * karşılaştırması bunları eşit saymadığı için eşleştirmeler bu anahtarla yapılır.
 */
export function foldTurkishName(value: unknown): string {
  return canonicalColorName(value)
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');
}

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/** HEX'ten "R, G, B" metni üretir (rgbCode hiçbir zaman istemciden alınmaz). */
export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function rowsOf(result: any): any[] {
  return (result?.[0] as any[]) || [];
}

/**
 * Renk gövdesini yazıma hazırlar (senkron doğrulama).
 * `applyResourceRules('colors', data)` üzerinden çağrılır; yani hem generic
 * REST hem /ops/commit yolu aynı kurallara tabidir.
 */
export function normalizeColorPayload(data: Record<string, any>): void {
  if ('name' in data) {
    const name = canonicalColorName(data.name);
    if (!name) throw new HttpError(400, 'Renk adı zorunludur.', 'COLOR_NAME_REQUIRED');
    if (name.length > 100) throw new HttpError(400, 'Renk adı en fazla 100 karakter olabilir.', 'COLOR_NAME_TOO_LONG');
    data.name = name;
  }

  if ('code' in data) {
    const raw = trimOrNull(data.code);
    if (!raw) {
      // Boş kod: INSERT'te sunucu üretir (prepareColorWrite), UPDATE'te alan değişmez.
      delete data.code;
    } else {
      const code = raw.toLocaleUpperCase('tr');
      if (!CODE_RE.test(code)) {
        throw new HttpError(400, 'Renk kodu geçersiz. Harf veya rakamla başlamalı; yalnızca harf, rakam, boşluk, "-", "." ve "_" içerebilir.', 'INVALID_COLOR_CODE');
      }
      data.code = code;
    }
  }

  if ('hexCode' in data) {
    const hex = trimOrNull(data.hexCode);
    if (!hex) {
      data.hexCode = null;
      data.rgbCode = null;
    } else {
      if (!HEX_RE.test(hex)) {
        throw new HttpError(422, 'HEX kodu #RRGGBB biçiminde olmalıdır (ör. #1A2B3C).', 'INVALID_HEX_CODE');
      }
      data.hexCode = hex.toLocaleUpperCase('en');
      data.rgbCode = hexToRgb(data.hexCode);
    }
  } else {
    // rgbCode yalnızca hexCode'tan türetilir; istemci gövdesinden yazılamaz.
    delete data.rgbCode;
  }

  for (const column of ['groupName', 'pantoneCode', 'manufacturerCode', 'description'] as const) {
    if (column in data) data[column] = trimOrNull(data[column]);
  }
}

/** Bir sonraki renk kodunu (`R-0001`) kilitli sayaçtan ayırır. */
export async function allocateColorCode(conn: PoolConnection): Promise<string> {
  return allocateDocumentNumber(conn, { table: 'colors', prefix: 'R', pad: 4, omitYear: true });
}

/**
 * Renk adından merkezi kartı çözer (eşleşme yoksa null).
 * Hareket/belge satırları tarihsel metni (`color`) korurken `colorId` bağını da
 * yazabilmek için kullanılır; kartı olmayan eski metinler bağsız kalır.
 */
export async function resolveColorIdByName(
  conn: PoolConnection,
  colorName: unknown,
): Promise<number | null> {
  const name = canonicalColorName(colorName);
  if (!name) return null;
  const hit = rowsOf(await conn.query('SELECT `id` FROM `colors` WHERE `name` = ? LIMIT 1', [name]))[0];
  if (hit) return Number(hit.id);

  // SQL eşitliği (utf8mb4_turkish_ci) "SIYAH" ile "SİYAH"ı aynı saymaz; oysa
  // merkezi kart sözlüğü Türkçe katlamasıyla kurulur (bkz. backfill betiği).
  // Eski/ASCII yazımlar kartsız kalmasın diye katlanarak bir daha aranır.
  const folded = foldTurkishName(name);
  const all = rowsOf(await conn.query('SELECT `id`, `name` FROM `colors`'));
  const match = all.find((row) => foldTurkishName(String(row.name)) === folded);
  return match ? Number(match.id) : null;
}

/**
 * INSERT/UPDATE öncesi renk kodunu kesinleştirir: kod boşsa üretilir, ardından
 * benzersizlik açıkça denetlenir. UNIQUE çakışması (ER_DUP_ENTRY) 500'e düşüp
 * kullanıcıya "Sunucu hatası" olarak görüneceği için kontrol burada yapılır.
 */
export async function prepareColorWrite(
  conn: PoolConnection,
  data: Record<string, any>,
  opts: { id?: number | string | null } = {},
): Promise<void> {
  const isNew = opts.id === undefined || opts.id === null;
  if (!data.code) {
    if (isNew) data.code = await allocateColorCode(conn);
    else return;
  }
  const result = await conn.query(
    'SELECT `id` FROM `colors` WHERE `code` = ? AND `id` <> ? LIMIT 1',
    [data.code, isNew ? 0 : opts.id],
  );
  const hit = rowsOf(result)[0];
  if (hit) {
    throw new HttpError(409, `"${data.code}" renk kodu zaten kullanılıyor. Farklı bir kod girin.`, 'COLOR_CODE_DUPLICATE');
  }
}

/**
 * Reçetenin hedef rengi metin olarak gelir; merkezî kart bağı (`targetColorId`)
 * sunucuda çözülür. Reçete eşleştirmesi tarihsel olarak renk ADI üzerinden
 * yapıldığı için `targetColor` metni korunur, yalnızca FK doldurulur.
 */
export async function applyRecipeTargetColor(
  conn: PoolConnection,
  data: Record<string, any>,
): Promise<void> {
  if (data.targetColorId !== undefined) return;
  const colorId = await resolveColorIdByName(conn, data.targetColor);
  if (colorId != null) data.targetColorId = colorId;
}

/**
 * Ürünün renk bağlarını (productColors) gövdeden senkronlar.
 * Gövde `colorIds` (tercih edilen) veya `colors` (renk adı listesi) taşıyabilir;
 * ikisi de yoksa mevcut bağlara dokunulmaz. Pasif renkler YENİ bağlanamaz,
 * ancak daha önce bağlanmış pasif renkler korunur (veri kaybı olmaz).
 */
export async function syncProductColorsFromBody(
  conn: PoolConnection,
  productId: number | string,
  body: any,
): Promise<number> {
  const requested = await resolveRequestedColorIds(conn, body);
  if (!requested) return 0;

  const current = rowsOf(await conn.query('SELECT `colorId` FROM `productColors` WHERE `productId` = ?', [productId]))
    .map((r) => Number(r.colorId));
  const currentSet = new Set(current);
  const requestedSet = new Set(requested);

  const removed = current.filter((id) => !requestedSet.has(id));
  if (removed.length) {
    await conn.query(
      `DELETE FROM \`productColors\` WHERE \`productId\` = ? AND \`colorId\` IN (${removed.map(() => '?').join(', ')})`,
      [productId, ...removed],
    );
  }

  const added = requested.filter((id) => !currentSet.has(id));
  if (added.length) {
    const found = rowsOf(
      await conn.query(
        `SELECT \`id\`, \`name\`, \`isActive\` FROM \`colors\` WHERE \`id\` IN (${added.map(() => '?').join(', ')})`,
        added,
      ),
    );
    const byId = new Map(found.map((r) => [Number(r.id), r]));
    for (const id of added) {
      const color = byId.get(id);
      if (!color) throw new HttpError(400, `Renk bulunamadı (id: ${id}).`, 'COLOR_NOT_FOUND');
      if (!color.isActive) {
        throw new HttpError(422, `"${color.name}" rengi pasif durumda; yeni kayıtlarda seçilemez.`, 'COLOR_INACTIVE');
      }
    }
  }

  for (let i = 0; i < requested.length; i++) {
    const colorId = requested[i];
    if (added.includes(colorId)) {
      await conn.query(
        'INSERT INTO `productColors` (`productId`, `colorId`, `sortOrder`, `createdAt`) VALUES (?, ?, ?, NOW())',
        [productId, colorId, i],
      );
    } else {
      await conn.query('UPDATE `productColors` SET `sortOrder` = ? WHERE `productId` = ? AND `colorId` = ?', [
        i,
        productId,
        colorId,
      ]);
    }
  }
  return added.length + removed.length;
}

/**
 * Gövdedeki renk seçimini colorId listesine çevirir.
 * Renk bilgisi yoksa `null` (bağlara dokunma), boş liste seçimi temizler.
 * Renk adı ile gelen değerler yalnızca MEVCUT merkezi kartlarla eşleştirilir:
 * serbest metin renk girişi API üzerinden de kapalıdır, kartı olmayan ad 422 ile
 * reddedilir (kullanıcı listeden seçmeli veya önce renk kartı açmalıdır).
 */
async function resolveRequestedColorIds(conn: PoolConnection, body: any): Promise<number[] | null> {
  const ids: number[] = [];

  if (Array.isArray(body?.colorIds)) {
    for (const value of body.colorIds) {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0 && !ids.includes(id)) ids.push(id);
    }
    return validateExistingColors(conn, ids);
  }

  if (!Array.isArray(body?.colors)) return null;

  const names: string[] = [];
  for (const value of body.colors) {
    const name = canonicalColorName(value);
    if (name && !names.includes(name)) names.push(name);
  }
  if (!names.length) return [];

  const result = await conn.query(
    `SELECT \`id\`, \`name\` FROM \`colors\` WHERE \`name\` IN (${names.map(() => '?').join(', ')})`,
    names,
  );
  const byName = new Map(rowsOf(result).map((r) => [canonicalColorName(r.name), Number(r.id)]));
  const unknown = names.filter((name) => !byName.has(name));
  if (unknown.length) {
    throw new HttpError(
      422,
      `Renk kartı bulunamadı: ${unknown.join(', ')}. Renkler merkezî listeden seçilmelidir.`,
      'COLOR_NOT_IN_MASTER',
    );
  }
  for (const name of names) {
    const id = byName.get(name)!;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

async function validateExistingColors(conn: PoolConnection, ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const found = rowsOf(
    await conn.query(`SELECT \`id\` FROM \`colors\` WHERE \`id\` IN (${ids.map(() => '?').join(', ')})`, ids),
  ).map((r) => Number(r.id));
  const missing = ids.filter((id) => !found.includes(id));
  if (missing.length) throw new HttpError(400, `Renk bulunamadı (id: ${missing.join(', ')}).`, 'COLOR_NOT_FOUND');
  return found;
}

/**
 * Ürün satırlarına merkezi renk kartlarını ekler (`products.colors` JSON'u
 * kaldırıldığı için liste/tekil okuma yolu burada zenginleştirilir).
 * Mevcut tüm ekranlar `product.colors` okumaya devam eder; `colorRefs` ise
 * HEX önizlemesi ve üretici kodu için kullanılır.
 */
export async function attachProductColors<T extends { id: number | string }>(rows: T[]): Promise<T[]> {
  const list = (rows || []).filter((r) => r && r.id !== undefined && r.id !== null);
  if (!list.length) return rows;
  const ids = list.map((r) => r.id);
  const result = await query(
    `SELECT pc.productId, c.id, c.code, c.name, c.groupName, c.hexCode, c.pantoneCode, c.manufacturerCode, c.isActive
       FROM productColors pc
       JOIN colors c ON c.id = pc.colorId
      WHERE pc.productId IN (${ids.map(() => '?').join(', ')})
      ORDER BY pc.sortOrder ASC, pc.id ASC`,
    ids,
  );
  const byProduct = new Map<string, any[]>();
  for (const row of result) {
    const key = String(row.productId);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(row);
  }
  for (const product of list) {
    const refs = byProduct.get(String(product.id)) || [];
    (product as any).colorRefs = refs.map((c) => ({
      id: Number(c.id),
      code: c.code,
      name: c.name,
      groupName: c.groupName ?? null,
      hexCode: c.hexCode ?? null,
      pantoneCode: c.pantoneCode ?? null,
      manufacturerCode: c.manufacturerCode ?? null,
      isActive: Boolean(c.isActive),
    }));
    (product as any).colors = (product as any).colorRefs.map((c: any) => c.name);
  }
  return rows;
}

/**
 * Renk adı değiştiğinde, bu rengi kullanan ürün kartlarının JSON alanlarındaki
 * renk metni de güncellenir (kart üstündeki barkod/varyant/görsel eşlemesi
 * kopmasın). Geçmiş belgeler (stok hareketi, sipariş, irsaliye, fatura, iş emri)
 * ASLA yeniden yazılmaz; onlar colorId ile zaten merkezi karta bağlıdır.
 */
export async function propagateColorRename(
  conn: PoolConnection,
  colorId: number | string,
  before: { name?: string | null } | null | undefined,
  after: { name?: string | null } | null | undefined,
): Promise<void> {
  const oldName = canonicalColorName(before?.name);
  const newName = canonicalColorName(after?.name);
  if (!oldName || !newName || oldName === newName) return;

  const products = rowsOf(
    await conn.query(
      `SELECT p.id, p.variantBarcodes, p.colorBoxBarcodes, p.colorImages
         FROM products p
         JOIN productColors pc ON pc.productId = p.id
        WHERE pc.colorId = ?`,
      [colorId],
    ),
  );
  for (const product of products) {
    const patch: Record<string, string> = {};
    for (const column of PRODUCT_COLOR_JSON_COLUMNS) {
      const next = renameInColorArray(product[column], oldName, newName);
      if (next !== null) patch[column] = next;
    }
    const keys = Object.keys(patch);
    if (!keys.length) continue;
    await conn.query(
      `UPDATE \`products\` SET ${keys.map((k) => `\`${k}\` = ?`).join(', ')}, \`updatedAt\` = NOW() WHERE \`id\` = ?`,
      [...keys.map((k) => patch[k]), product.id],
    );
  }
}

/** `[{ color: 'SİYAH', ... }]` dizisindeki renk adını değiştirir; değişim yoksa null. */
function renameInColorArray(raw: unknown, oldName: string, newName: string): string | null {
  if (!raw) return null;
  let items: any;
  if (typeof raw === 'string') {
    try {
      items = JSON.parse(raw);
    } catch {
      return null;
    }
  } else {
    items = raw;
  }
  if (!Array.isArray(items) || !items.length) return null;
  let changed = false;
  const next = items.map((item) => {
    if (!item || typeof item !== 'object') return item;
    if (canonicalColorName(item.color) === oldName) {
      changed = true;
      return { ...item, color: newName };
    }
    return item;
  });
  return changed ? JSON.stringify(next) : null;
}
