import type { PoolConnection } from 'mysql2/promise';
import { HttpError } from './errors.js';

export async function assertReservedVariants(conn: PoolConnection, productId: number, variants: any[]) {
  const [reservations] = await conn.query<any[]>("SELECT color,size,SUM(remainingQuantity) AS quantity FROM stockReservations WHERE productId=? AND status='active' GROUP BY color,size", [productId]);
  for (const reservation of reservations) {
    if (!reservation.color && !reservation.size) continue;
    const available = variants.filter(v => (!reservation.color || v.color === reservation.color) && (!reservation.size || v.size === reservation.size)).reduce((sum, v) => sum + Number(v.stock || 0), 0);
    if (available + 0.00001 < Number(reservation.quantity)) throw new HttpError(409, 'İşlem ayrılmış renk/beden stoğunu tüketemez.', 'RESERVED_STOCK');
  }
}

export async function consumeReservation(conn: PoolConnection, productId: number, quantity: number, source: { orderId?: number; workOrderId?: number; color?: string; size?: string }) {
  if (!source.orderId && !source.workOrderId) return;
  const [reservations] = await conn.query<any[]>('SELECT * FROM `stockReservations` WHERE `productId` = ? AND `status` = \'active\' AND (? IS NULL OR `orderId` = ?) AND (? IS NULL OR `workOrderId` = ?) AND COALESCE(`color`,\'\') = ? AND COALESCE(`size`,\'\') = ? ORDER BY `id` FOR UPDATE', [productId, source.orderId || null, source.orderId || null, source.workOrderId || null, source.workOrderId || null, source.color || '', source.size || '']);
  let remaining = quantity;
  for (const reservation of reservations) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(reservation.remainingQuantity));
    await conn.query('UPDATE `stockReservations` SET `remainingQuantity` = `remainingQuantity` - ?, `status` = ? WHERE `id` = ?', [take, Number(reservation.remainingQuantity) <= take ? 'consumed' : 'active', reservation.id]);
    remaining -= take;
  }
}

/** Çağıran ürün satırını önceden kilitlemiştir: iki rezervasyon birbirinin serbest stoğunu kullanamaz. */
export async function assertUnreservedStock(conn: PoolConnection, product: { id: number; stock: number; name: string }, outgoing: number) {
  const [reserved] = await conn.query<any[]>("SELECT COALESCE(SUM(`remainingQuantity`),0) AS quantity FROM `stockReservations` WHERE `productId`=? AND `status`='active'", [product.id]);
  if (Number(product.stock) - Number(reserved[0].quantity) + 0.00001 < outgoing) throw new HttpError(409, `${product.name}: serbest stok yetersiz; başka işlemler için rezervasyon var.`, 'RESERVED_STOCK');
}
