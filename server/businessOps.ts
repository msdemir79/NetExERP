/**
 * Sunucu tarafı işlem (business operation) uçları.
 *
 * Stok ve cari bakiye gibi türetilmiş/agregat veriler burada, tek bir MySQL
 * transaction'ı ve satır kilidi (`SELECT ... FOR UPDATE`) içinde güncellenir.
 * Böylece istemcideki "oku → hesapla → yaz" zincirinden kaynaklanan kayıp
 * güncelleme (lost update) ve yarım kalmış çok adımlı işlem riski ortadan kalkar.
 */
import express, { type Request, type Response, type Router } from 'express';
import { withTransaction } from './db.js';
import type { PoolConnection } from 'mysql2/promise';
import { clientIp, can, type AuthContext } from './auth.js';
import { versionSupported } from './schema.js';
import { calculateWeightedAverageCost, roundUpQuantity } from '../src/lib/inventoryCalculator.js';
import type { AppModule, PermissionAction } from '../src/types.js';

class OpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const STOCK_MOVEMENT_TYPES = ['in', 'out', 'production_in', 'production_out'] as const;
type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** Stok hareketi ve reçete sarfiyatı, ilgili operasyonel modüllerin yetkisiyle yapılabilir. */
function assertAnyPermission(
  auth: AuthContext | undefined,
  pairs: [AppModule, PermissionAction][],
  message: string,
): void {
  const allowed = pairs.some(([module, action]) => can(auth?.role || null, module, action));
  if (!allowed) throw new OpError(403, message, 'FORBIDDEN');
}

function actorName(auth: AuthContext | undefined): string {
  return auth?.user.fullName || 'Sistem';
}

async function lockProduct(conn: PoolConnection, productId: number) {
  const rows = await conn.query<any[]>(
    'SELECT `id`, `code`, `name`, `unit`, `stock`, `buyingPrice`, `variantBarcodes`, `colors`, `categoryType`, `isFootwear`, `isRawMaterial` FROM `products` WHERE `id` = ? FOR UPDATE',
    [productId],
  );
  const row = (rows[0] as any[])[0];
  if (!row) throw new OpError(404, 'Ürün bulunamadı.', 'PRODUCT_NOT_FOUND');
  return row;
}

function parseVariants(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => ({ ...v }));
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((v) => ({ ...v })) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function writeProductStock(
  conn: PoolConnection,
  productId: number,
  stock: number,
  variants: any[] | null,
  buyingPrice: number | null,
  withVersion: boolean,
): Promise<void> {
  const sets = ['`stock` = ?', '`updatedAt` = NOW()'];
  if (withVersion) sets.push('`version` = `version` + 1');
  const params: any[] = [stock];
  if (variants) {
    sets.push('`variantBarcodes` = ?');
    params.push(JSON.stringify(variants));
  }
  if (buyingPrice !== null) {
    sets.push('`buyingPrice` = ?');
    params.push(buyingPrice);
  }
  params.push(productId);
  await conn.query(`UPDATE \`products\` SET ${sets.join(', ')} WHERE \`id\` = ?`, params);
}

async function insertInventoryLog(
  conn: PoolConnection,
  input: {
    productId: number;
    type: StockMovementType;
    quantity: number;
    description: string;
    color?: string | null;
    size?: string | null;
  },
): Promise<number> {
  const [result] = await conn.query(
    'INSERT INTO `inventoryLogs` (`productId`, `type`, `quantity`, `date`, `description`, `color`, `size`) VALUES (?, ?, ?, NOW(), ?, ?, ?)',
    [input.productId, input.type, input.quantity, input.description, input.color ?? null, input.size ?? null],
  );
  return Number((result as any)?.insertId || 0);
}

export function createBusinessOpsRouter(): Router {
  const router = express.Router();

  /* ---------------------------------------------------------------- */
  /* Atomik stok hareketi                                             */
  /* ---------------------------------------------------------------- */
  router.post('/stock-movement', async (req, res, next) => {
    try {
      const body = req.body || {};
      const productId = Number(body.productId);
      const quantity = Math.abs(Number(body.quantity));
      const type = String(body.type) as StockMovementType;

      if (!Number.isFinite(productId)) throw new OpError(400, 'Geçerli bir ürün seçilmelidir.');
      if (!Number.isFinite(quantity) || quantity <= 0) throw new OpError(400, 'Hareket miktarı sıfırdan büyük olmalıdır.');
      if (!STOCK_MOVEMENT_TYPES.includes(type)) {
        throw new OpError(400, `Geçersiz hareket tipi: ${type}. Geçerli değerler: ${STOCK_MOVEMENT_TYPES.join(', ')}`);
      }
      if (!String(body.description || '').trim()) throw new OpError(400, 'Hareket açıklaması zorunludur.');

      // Üretim giriş/çıkışları hem stok hem üretim modülünden tetiklenebilir.
      if (type === 'production_in' || type === 'production_out') {
        assertAnyPermission(
          req.auth,
          [
            ['inventory', 'edit'],
            ['production', 'edit'],
          ],
          'Stok hareketi için "Stok" veya "Üretim" modülünde düzenleme yetkisi gerekir.',
        );
      } else {
        assertAnyPermission(
          req.auth,
          [['inventory', 'edit']],
          'Stok hareketi için "Stok" modülünde düzenleme yetkisi gerekir.',
        );
      }

      const incoming = type === 'in' || type === 'production_in';
      const delta = incoming ? quantity : -quantity;
      const allowNegative = body.allowNegative === true;
      const unitCost = Number(body.unitCost);
      const variant = body.variant && typeof body.variant === 'object' ? body.variant : null;

      const withVersion = await versionSupported('products');

      const result = await withTransaction(async (conn) => {
        const product = await lockProduct(conn, productId);

        const currentStock = Number(product.stock) || 0;
        let newStock = currentStock + delta;
        let shortfall = 0;
        if (!allowNegative && newStock < 0) {
          shortfall = Number((0 - newStock).toFixed(4));
          newStock = 0;
        }
        newStock = Number(newStock.toFixed(4));

        // Varyant (renk × beden) stoğu
        let variants = parseVariants(product.variantBarcodes);
        let variantStock: number | null = null;
        let detail = '';

        if (variant && variants.length) {
          const color = variant.color ? String(variant.color) : null;
          const size = variant.size ? String(variant.size) : null;
          let index = -1;
          if (color && size) index = variants.findIndex((v) => v.color === color && v.size === size);
          if (index === -1 && size) index = variants.findIndex((v) => v.size === size);
          if (index === -1 && color) index = variants.findIndex((v) => v.color === color);

          if (index >= 0) {
            const v = variants[index];
            const vCurrent = Number(v.stock) || 0;
            const vNext = allowNegative ? vCurrent + delta : Math.max(0, vCurrent + delta);
            variants[index] = { ...v, stock: Number(vNext.toFixed(4)) };
            variantStock = variants[index].stock;
            detail = ` [${[color, size].filter(Boolean).join(' / ')}: ${delta > 0 ? '+' : ''}${delta}]`;
          }
        }

        // Ağırlıklı ortalama maliyet: yalnızca maliyet bilgisi verilen girişlerde.
        let newBuyingPrice: number | null = null;
        if (incoming && Number.isFinite(unitCost) && unitCost > 0) {
          newBuyingPrice = calculateWeightedAverageCost(
            currentStock,
            Number(product.buyingPrice) || 0,
            quantity,
            unitCost,
          );
        }

        await writeProductStock(
          conn,
          productId,
          newStock,
          variant && variants.length ? variants : null,
          newBuyingPrice,
          withVersion,
        );

        const logId = await insertInventoryLog(conn, {
          productId,
          type,
          quantity,
          description: `${String(body.description).trim()}${detail}${shortfall > 0 ? ` | UYARI: ${shortfall} birim stok yetersizliği (0'a sabitlendi)` : ''}`,
          color: variant?.color ?? null,
          size: variant?.size ?? null,
        });

        return {
          productId,
          productName: product.name,
          type,
          quantity,
          stock: newStock,
          previousStock: currentStock,
          variantStock,
          unitCost: newBuyingPrice ?? (Number(product.buyingPrice) || null),
          shortfall,
          clamped: shortfall > 0,
          logId,
        };
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Reçete (BOM) sarfiyatı + mamul girişi — tek transaction          */
  /* ---------------------------------------------------------------- */
  router.post('/consume-recipe', async (req, res, next) => {
    try {
      const body = req.body || {};
      const productId = Number(body.productId);
      const quantity = Number(body.quantity);

      if (!Number.isFinite(productId)) throw new OpError(400, 'Geçerli bir mamul ürün seçilmelidir.');
      if (!Number.isFinite(quantity) || quantity <= 0) throw new OpError(400, 'Üretim miktarı sıfırdan büyük olmalıdır.');

      assertAnyPermission(
        req.auth,
        [
          ['inventory', 'edit'],
          ['production', 'edit'],
        ],
        'Reçete sarfiyatı için "Stok" veya "Üretim" modülünde düzenleme yetkisi gerekir.',
      );

      const color = body.color ? String(body.color) : undefined;
      const size = body.size ? String(body.size) : undefined;
      const operator = body.operator ? String(body.operator) : undefined;
      const notes = body.notes ? String(body.notes) : undefined;
      const orderBarcode = body.orderBarcode ? String(body.orderBarcode) : undefined;
      const withVersion = await versionSupported('products');

      const result = await withTransaction(async (conn) => {
        // 1) Reçeteyi seç: renk eşleşmesi → genel reçete → ilk reçete
        const recipeRows = await conn.query<any[]>(
          'SELECT `id`, `targetColor`, `ingredients` FROM `recipes` WHERE `productId` = ? ORDER BY `id` ASC',
          [productId],
        );
        const recipes = (recipeRows[0] as any[]) || [];
        const parseIngredients = (r: any): any[] => {
          const raw = r?.ingredients;
          if (Array.isArray(raw)) return raw;
          if (typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          }
          return [];
        };

        const recipe =
          (color && recipes.find((r) => r.targetColor === color && parseIngredients(r).length)) ||
          recipes.find((r) => !r.targetColor || r.targetColor === 'all' || r.targetColor === 'Genel') ||
          recipes[0];

        const ingredients = parseIngredients(recipe);
        if (!recipe || !ingredients.length) {
          throw new OpError(404, 'Bu model için tanımlı bir BOM (ürün reçetesi) bulunamadı.', 'RECIPE_NOT_FOUND');
        }

        const finished = await lockProduct(conn, productId);
        const now = new Date();
        const consumedList: any[] = [];

        // 2) Hammadde / yarı mamul sarfiyatı (satır kilidi altında)
        for (const ing of ingredients) {
          const ingProductId = Number(ing.productId);
          if (!Number.isFinite(ingProductId)) continue;

          const raw = await lockProduct(conn, ingProductId);
          const totalNeeded = Number((Number(ing.quantity) * quantity).toFixed(3));
          if (!Number.isFinite(totalNeeded) || totalNeeded <= 0) continue;

          const variants = parseVariants(raw.variantBarcodes);
          const isMatrixItem =
            Boolean(ing.isMatrixMatched) ||
            raw.categoryType === 'semi_finished' ||
            Boolean(raw.isFootwear) ||
            variants.some((v) => v.size && v.size !== 'Standart');

          let newStock: number;
          let nextVariants: any[] | null = null;
          let logDetail = '';
          const unit = raw.unit || 'Birim';

          if (isMatrixItem && variants.length > 0) {
            const rawColors = parseVariants(raw.colors);
            const targetColor =
              ing.color || color || (rawColors.length ? rawColors[0] : undefined) || variants[0]?.color || 'Genel';
            const normalizedSize = size && !['Asorti', 'Tüm Bedenler', 'Standart'].includes(size) ? size : null;

            if (normalizedSize) {
              let index = variants.findIndex((v) => v.size === normalizedSize && v.color === targetColor);
              if (index === -1) index = variants.findIndex((v) => v.size === normalizedSize);
              if (index >= 0) {
                const v = variants[index];
                variants[index] = { ...v, stock: Number(Math.max(0, (Number(v.stock) || 0) - totalNeeded).toFixed(4)) };
              }
              logDetail = ` [${targetColor ? targetColor + ' ' : ''}Beden ${normalizedSize}: -${totalNeeded} ${unit}]`;
            } else {
              // Asorti/genel düşüm: bedenlere eşit dağıt, kalanı son bedene ekle.
              const count = variants.length;
              let allocated = 0;
              variants.forEach((v, idx) => {
                const isLast = idx === count - 1;
                const sizeQty = isLast ? Math.max(0, Number((totalNeeded - allocated).toFixed(4))) : Math.round(totalNeeded / count);
                allocated += sizeQty;
                variants[idx] = { ...v, stock: Number(Math.max(0, (Number(v.stock) || 0) - sizeQty).toFixed(4)) };
              });
              logDetail = ` [${targetColor ? targetColor + ' ' : ''}-${totalNeeded} ${unit}]`;
            }

            nextVariants = variants;
            newStock = Number(variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0).toFixed(4));
          } else {
            newStock = Math.max(0, roundUpQuantity((Number(raw.stock) || 0) - totalNeeded, 2));
            logDetail = ` [${ing.partName || raw.categoryType || ''}: -${totalNeeded} ${unit}]`;
          }

          await writeProductStock(conn, ingProductId, newStock, nextVariants, null, withVersion);
          await insertInventoryLog(conn, {
            productId: ingProductId,
            type: 'production_out',
            quantity: totalNeeded,
            description: `Otomatik BOM Sarfiyatı: ${finished.name} (${quantity} ${finished.unit || 'Çift'})${orderBarcode ? ' #' + orderBarcode : ''}${logDetail}${operator ? ' | Operatör: ' + operator : ''}`,
          });

          consumedList.push({
            productId: ingProductId,
            name: raw.name,
            code: raw.code,
            unit,
            quantityPerPair: Number(ing.quantity) || 0,
            totalConsumed: totalNeeded,
            remainingStock: newStock,
            details: logDetail,
          });
        }

        // 3) Mamul girişi (production_in) — mamul satırı zaten kilitli
        const finishedVariants = parseVariants(finished.variantBarcodes);
        let finishedNewStock = Number((Number(finished.stock) || 0).toFixed(4)) + quantity;
        let nextFinishedVariants: any[] | null = null;

        if (finishedVariants.length > 0) {
          const normalizedSize = size && !['Asorti', 'Tüm Bedenler', 'Standart'].includes(size) ? size : null;
          if (normalizedSize) {
            const index = finishedVariants.findIndex((v) => v.size === normalizedSize);
            if (index >= 0) {
              finishedVariants[index] = {
                ...finishedVariants[index],
                stock: Number(((Number(finishedVariants[index].stock) || 0) + quantity).toFixed(4)),
              };
            }
          } else {
            const count = finishedVariants.length;
            let allocated = 0;
            finishedVariants.forEach((v, idx) => {
              const isLast = idx === count - 1;
              const q = isLast ? Math.max(0, Number((quantity - allocated).toFixed(4))) : Math.round(quantity / count);
              allocated += q;
              finishedVariants[idx] = { ...v, stock: Number(((Number(v.stock) || 0) + q).toFixed(4)) };
            });
          }
          nextFinishedVariants = finishedVariants;
        }

        finishedNewStock = Number(finishedNewStock.toFixed(4));
        await writeProductStock(conn, productId, finishedNewStock, nextFinishedVariants, null, withVersion);
        await insertInventoryLog(conn, {
          productId,
          type: 'production_in',
          quantity,
          description: `Üretim Tamamlandı & Mamul Stoğa Giriş: ${finished.name} (+${quantity} ${finished.unit || 'Çift'})${orderBarcode ? ' | Takip No: ' + orderBarcode : ''}${operator ? ' | Usta: ' + operator : ''}`,
        });

        return {
          success: true,
          finishedProduct: {
            productId,
            name: finished.name,
            code: finished.code,
            quantityAdded: quantity,
            newStock: finishedNewStock,
          },
          consumedIngredients: consumedList,
          reference: { orderBarcode: orderBarcode ?? null, operator: operator ?? null, notes: notes ?? null, actor: actorName(req.auth) },
          timestamp: now.toISOString(),
        };
      });

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  });

  /* ---------------------------------------------------------------- */
  /* Cari bakiye yeniden hesaplama (türetilmiş veri)                  */
  /* ---------------------------------------------------------------- */
  async function recalculateContactBalance(conn: PoolConnection, contactId: number, withVersion: boolean) {
    // Kilit, aynı cari için eşzamanlı hesaplamaların iç içe geçmesini engeller.
    const contactRows = await conn.query<any[]>(
      'SELECT `id` FROM `contacts` WHERE `id` = ? FOR UPDATE',
      [contactId],
    );
    if (!((contactRows[0] as any[]) || []).length) {
      throw new OpError(404, 'Cari bulunamadı.', 'CONTACT_NOT_FOUND');
    }

    const invoiceRows = await conn.query<any[]>(
      "SELECT `type`, `grandTotal`, `status` FROM `invoices` WHERE `contactId` = ?",
      [contactId],
    );
    const transactionRows = await conn.query<any[]>(
      'SELECT `type`, `amount`, `category`, `description` FROM `transactions` WHERE `contactId` = ?',
      [contactId],
    );

    let debit = 0;
    let credit = 0;

    for (const inv of (invoiceRows[0] as any[]) || []) {
      if (inv.status === 'cancelled' || inv.status === 'draft') continue;
      const total = Number(inv.grandTotal) || 0;
      if (inv.type === 'sales') debit += total;
      else credit += total;
    }

    for (const tx of (transactionRows[0] as any[]) || []) {
      const amount = Number(tx.amount) || 0;
      const isIncome = tx.type === 'income';
      const isOpening = tx.category === 'Açılış Bakiyesi' || String(tx.description || '').includes('Açılış');
      if (isOpening) {
        if (amount > 0 && isIncome) debit += amount;
        else credit += amount;
      } else if (isIncome) {
        credit += amount;
      } else {
        debit += amount;
      }
    }

    const balance = Number((debit - credit).toFixed(2));
    await conn.query(
      `UPDATE \`contacts\` SET \`balance\` = ?${withVersion ? ', `version` = `version` + 1' : ''}, \`updatedAt\` = NOW() WHERE \`id\` = ?`,
      [balance, contactId],
    );

    return { contactId, balance, debit: Number(debit.toFixed(2)), credit: Number(credit.toFixed(2)) };
  }

  router.post('/recalculate-contact-balance', async (req, res, next) => {
    try {
      const contactId = Number(req.body?.contactId);
      if (!Number.isFinite(contactId)) throw new OpError(400, 'Geçerli bir cari seçilmelidir.');

      assertAnyPermission(
        req.auth,
        [
          ['contacts', 'edit'],
          ['finance', 'edit'],
        ],
        'Cari bakiye hesaplaması için "Cari Hesaplar" veya "Finans" modülünde düzenleme yetkisi gerekir.',
      );

      const withVersion = await versionSupported('contacts');
      const result = await withTransaction((conn) => recalculateContactBalance(conn, contactId, withVersion));
      res.json({ data: { ...result, actor: actorName(req.auth), ip: clientIp(req) } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
