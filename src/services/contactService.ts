import {
  api,
  callOp,
  commit,
  recalculateContactBalance,
} from '../api/client';
import { accountingService } from './accountingService';
import type {
  Contact,
  EntityType,
  Transaction,
} from '../types';

/**
 * Calculates the next sequential contact code based on existing contacts and type.
 * Müşteri (customer): CAR-001, CAR-002, CAR-003, ... (remembers highest number, e.g. CAR-004 -> CAR-005)
 * Tedarikçi (supplier): TED-001, TED-002, TED-003, ...
 */
export function getNextContactCode(
  contacts: { code?: string }[],
  type: EntityType = 'customer'
): { nextCode: string; maxNumber: number; lastCode?: string; prefix: string } {
  const prefix = type === 'supplier' ? 'TED-' : 'CAR-';
  const regex = new RegExp(`^${prefix}0*(\\d+)$`, 'i');
  const altRegex = type === 'supplier' 
    ? /^TED[-_]?0*(\d+)$/i 
    : /^(?:CAR|MUS)[-_]?0*(\d+)$/i;

  let maxNum = 0;
  let lastCode: string | undefined = undefined;

  for (const c of contacts) {
    if (!c.code) continue;
    const trimmed = c.code.trim();
    const match = trimmed.match(regex) || trimmed.match(altRegex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
        lastCode = trimmed;
      }
    }
  }

  const nextSeq = (maxNum + 1).toString().padStart(3, '0');
  return {
    nextCode: `${prefix}${nextSeq}`,
    maxNumber: maxNum,
    lastCode,
    prefix
  };
}

/**
 * Cari (müşteri/tedarikçi) ve işlem servisi. erpService'ten bölündü (#46).
 */

export const contactService = {
  // --- Accounting & Contacts ---
  async addContact(contact: Omit<Contact, 'id'>) {
    let code = contact.code?.trim();
    if (!code) {
      const allContacts = await api.contacts.list();
      code = getNextContactCode(allContacts, contact.type).nextCode;
    }

    const initialBalance = Number(contact.balance) || 0;
    // not: kimlik zinciri nedeniyle iki adımlı yazma
    const contactId = await api.contacts.create({
      ...contact,
      code,
      balance: initialBalance,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    if (initialBalance !== 0) {
      await commit([
        {
          op: 'insert',
          resource: 'transactions',
          data: {
            contactId,
            type: initialBalance > 0 ? 'income' : 'expense',
            amount: Math.abs(initialBalance),
            description: 'Açılış / Devir Bakiyesi',
            category: 'Açılış Bakiyesi',
            date: new Date(),
            documentNo: 'DVR-' + contactId
          }
        }
      ]);
    }

    // Otomatik TDHP Muhasebe Hesabı Açılışı:
    if (contact.accountCode?.trim()) {
      try {
        const typeName = contact.type === 'customer' ? 'Müşteri' : contact.type === 'supplier' ? 'Tedarikçi' : 'Cari';
        await accountingService.registerAccountFromCode({
          code: contact.accountCode.trim(),
          name: contact.name.trim(),
          type: contact.type === 'supplier' ? 'liability' : 'asset',
          currency: contact.currency || 'TRY',
          sourceModule: 'contact',
          description: `${contact.name.trim()} (${typeName} Cari Hesabı)`
        });
      } catch (err) {
        console.error('Cari muhasebe hesabı otomatik oluşturulamadı:', err);
      }
    }

    return contactId;
  },

  async updateContact(id: number, contact: Partial<Contact>) {
    const res = await api.contacts.update(id, {
      ...contact,
      updatedAt: new Date()
    });

    const fullContact = await api.contacts.get(id);
    if (fullContact && fullContact.accountCode?.trim()) {
      try {
        const typeName = fullContact.type === 'customer' ? 'Müşteri' : fullContact.type === 'supplier' ? 'Tedarikçi' : 'Cari';
        await accountingService.registerAccountFromCode({
          code: fullContact.accountCode.trim(),
          name: fullContact.name.trim(),
          type: fullContact.type === 'supplier' ? 'liability' : 'asset',
          currency: fullContact.currency || 'TRY',
          sourceModule: 'contact',
          description: `${fullContact.name.trim()} (${typeName} Cari Hesabı)`
        });
      } catch (err) {
        console.error('Cari güncelleme muhasebe senkronizasyon hatası:', err);
      }
    }
    return res;
  },

  async deleteContact(id: number) {
    const orderCount = await api.orders.count({ contactId: id });
    if (orderCount > 0) {
      throw new Error(`Bu cariye ait ${orderCount} adet sipariş/fatura kaydı bulunmaktadır. Önce siparişleri silmeli veya arşivlemelisiniz.`);
    }
    await commit([
      { op: 'deleteWhere', resource: 'transactions', where: { contactId: id } },
      { op: 'delete', resource: 'contacts', id }
    ]);
  },

  async recordContactTransaction(data: {
    contactId: number;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    category?: string;
    paymentMethod?: 'cash' | 'bank_transfer' | 'credit_card' | 'check' | 'other';
    documentNo?: string;
    date?: Date;
  }) {
    // Cari hareket + bakiye güncellemesi sunucuda, cari satırı kilitlenerek tek
    // transaction içinde yapılır (contacts.balance türetilmiş alandır).
    const result = await callOp<{ id: number; contactId: number }>('contact-transaction', {
      mode: 'create',
      contactId: data.contactId,
      type: data.type,
      amount: data.amount,
      description: data.description,
      category: data.category || (data.type === 'income' ? 'Tahsilat' : 'Ödeme'),
      paymentMethod: data.paymentMethod || 'cash',
      documentNo: data.documentNo,
      date: data.date || new Date(),
    });
    return result.id;
  },

  async addTransaction(transaction: Transaction) {
    const result = await callOp<{ id: number; contactId: number }>('contact-transaction', {
      mode: 'create',
      contactId: transaction.contactId,
      type: transaction.type,
      amount: Number(transaction.amount) || 0,
      description: transaction.description,
      category: transaction.category,
      paymentMethod: transaction.paymentMethod,
      documentNo: transaction.documentNo,
      date: transaction.date ? new Date(transaction.date) : new Date(),
    });
    return result.id;
  },

  async updateTransaction(id: number, data: Partial<Transaction>) {
    await callOp<{ id: number; contactId: number }>('contact-transaction', {
      mode: 'update',
      id,
      ...(data.contactId !== undefined ? { contactId: data.contactId } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.amount !== undefined ? { amount: Number(data.amount) } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...(data.paymentMethod !== undefined ? { paymentMethod: data.paymentMethod } : {}),
      ...(data.documentNo !== undefined ? { documentNo: data.documentNo } : {}),
      ...(data.date !== undefined ? { date: new Date(data.date) } : {}),
    });
    return id;
  },

  async deleteTransaction(id: number) {
    await callOp<{ id: number; deleted: boolean }>('contact-transaction', { mode: 'delete', id });
    return true;
  },

  /**
   * Cari bakiye, sunucuda cari satırı kilitlenerek yeniden hesaplanır
   * (faturalar + kasa/banka hareketleri). Böylece istemci listelerinin
   * bayat (stale) olmasından kaynaklanan yanlış bakiye oluşmaz.
   */
  async recalculateContactBalance(contactId: number) {
    if (!Number.isFinite(contactId)) return 0;
    const result = await recalculateContactBalance(contactId);
    return result.balance;
  },
};
