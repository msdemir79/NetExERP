import { api, equalsIgnoreCase } from '../api/client';
import type { 
  Account, 
  JournalEntry, 
  JournalEntryLine, 
  JournalEntryType,
  Invoice,
  CollectionReceipt
} from '../types';
import { assertBalancedJournalEntry } from '../lib/accountingValidator';
import { assertServicePermission } from './authGuard';

export interface MizanRow {
  code: string;
  name: string;
  type: string;
  level: number;
  totalDebit: number;    // Toplam Borç
  totalCredit: number;   // Toplam Alacak
  debitBalance: number;  // Borç Bakiyesi
  creditBalance: number; // Alacak Bakiyesi
}

/**
 * TDHP Hesap Planı Hiyerarşik Sıralama Karşılaştırıcısı:
 * 1 (Sınıf) -> 10 (Grup) -> 100 (Ana Hesap) -> 100.01 (Alt Hesap) -> 100.01.001 (Muavin Hesap)
 * 120 -> 120.01 -> 120.01.001 (Aslanlar Ayakkabı) -> 120.02 -> 120.02.001 -> 121
 */
export function compareAccountCodes(codeA: string, codeB: string): number {
  if (!codeA) return -1;
  if (!codeB) return 1;
  const segsA = codeA.trim().split('.');
  const segsB = codeB.trim().split('.');
  const minLen = Math.min(segsA.length, segsB.length);

  for (let i = 0; i < minLen; i++) {
    const sA = segsA[i];
    const sB = segsB[i];
    if (sA !== sB) {
      if (i === 0) {
        // Ana kök hesap kodu (1, 10, 100, 120, 121, 320...)
        // Alfabetik / leksikografik karşılaştırma: '1' < '10' < '100' < '101' < '11' < '12' < '120' < '121' < '2' < '3'
        return sA.localeCompare(sB);
      }
      // Noktadan sonraki alt ve muavin segmentler (örn: '01' vs '02' vs '001')
      const numA = parseInt(sA, 10);
      const numB = parseInt(sB, 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) {
          return numA - numB;
        }
        return sA.localeCompare(sB);
      }
      return sA.localeCompare(sB, undefined, { numeric: true });
    }
  }
  return segsA.length - segsB.length;
}

export const accountingService = {
  // --- Account Management ---
  async addAccount(account: Omit<Account, 'id'>) {
    const trimmedCode = account.code.trim();
    const existing = await api.accounts.findOne({ code: equalsIgnoreCase(trimmedCode) });
    if (existing) {
      return existing.id!;
    }
    return await api.accounts.create({
      ...account,
      code: trimmedCode,
      name: account.name.trim(),
      isActive: account.isActive ?? true
    });
  },

  async updateAccount(id: number, account: Partial<Account>, syncJournalEntries = true) {
    const existing = await api.accounts.get(id);
    const result = await api.accounts.update(id, account);
    
    // If account name changed and sync requested, also update journal entries using this account code
    if (syncJournalEntries && existing && account.name && account.name.trim() !== existing.name.trim()) {
      try {
        const entries = await api.journalEntries.list();
        for (const entry of entries) {
          let hasChange = false;
          const updatedLines = entry.lines.map(l => {
            if (l.accountCode === existing.code) {
              hasChange = true;
              return { ...l, accountName: account.name!.trim() };
            }
            return l;
          });
          if (hasChange && entry.id) {
            await api.journalEntries.update(entry.id, { lines: updatedLines });
          }
        }
      } catch (err) {
        console.error('Yevmiye fişleri hesap adı senkronizasyon hatası:', err);
      }
    }
    return result;
  },

  async deleteAccount(id: number) {
    const acc = await api.accounts.get(id);
    if (!acc) return;
    
    // Standart sistem hesapları (Sınıf, grup veya 3 haneli ana hesaplar) koruma altında
    if (acc.isSystem && acc.level <= 3) {
      throw new Error(`Standart Tek Düzen Hesap Planı sistem hesabı (${acc.code} - ${acc.name}) silinemez.`);
    }

    // Alt hesap kontrolü
    const allAccounts = await api.accounts.list();
    const childAccounts = allAccounts.filter(
      a => a.id !== acc.id && (a.parentCode === acc.code || (a.code.startsWith(acc.code + '.') && a.code !== acc.code))
    );
    if (childAccounts.length > 0) {
      const childCodes = childAccounts.slice(0, 3).map(c => c.code).join(', ');
      const suffix = childAccounts.length > 3 ? ` ve ${childAccounts.length - 3} diğer alt hesap` : '';
      throw new Error(`Bu hesabın altında tanımlı alt hesaplar bulunmaktadır (${childCodes}${suffix}). Önce alt hesapları silmelisiniz.`);
    }

    // Yevmiye fişlerinde kullanım kontrolü
    const entries = await api.journalEntries.list();
    const usedInEntries = entries.filter(e => e.lines.some(l => l.accountCode === acc.code));
    if (usedInEntries.length > 0) {
      throw new Error(`Bu hesap (${acc.code} - ${acc.name}) ${usedInEntries.length} adet yevmiye fişinde muhasebe hareketi görmüştür, silinemez.`);
    }

    // Bağlantılı modüllerdeki referansları temizle (Cari kart, Kasa, Banka, Ürün/Stok)
    try {
      const contacts = await api.contacts.list({ where: { accountCode: acc.code } });
      for (const c of contacts) {
        if (c.id) {
          await api.contacts.update(c.id, { accountCode: undefined });
        }
      }

      const cashBoxes = await api.cashBoxes.list({ where: { accountCode: acc.code } });
      for (const cb of cashBoxes) {
        if (cb.id) {
          await api.cashBoxes.update(cb.id, { accountCode: undefined });
        }
      }

      const bankAccounts = await api.bankAccounts.list({ where: { accountCode: acc.code } });
      for (const ba of bankAccounts) {
        if (ba.id) {
          await api.bankAccounts.update(ba.id, { accountCode: undefined });
        }
      }

      const products = await api.products.list();
      for (const p of products) {
        if (p.id && (p.accountingCode === acc.code || p.salesAccountCode === acc.code || p.purchaseAccountCode === acc.code)) {
          const updates: any = {};
          if (p.accountingCode === acc.code) updates.accountingCode = undefined;
          if (p.salesAccountCode === acc.code) updates.salesAccountCode = undefined;
          if (p.purchaseAccountCode === acc.code) updates.purchaseAccountCode = undefined;
          await api.products.update(p.id, updates);
        }
      }
    } catch (cleanErr) {
      console.warn('Hesap silinirken ilişkili modüller güncellenirken uyarı:', cleanErr);
    }

    return await api.accounts.remove(id);
  },

  async checkAccountDeletable(id: number): Promise<{
    canDelete: boolean;
    reason?: string;
    isSystem: boolean;
    childAccounts: Account[];
    journalEntriesCount: number;
    totalDebit: number;
    totalCredit: number;
    linkedContactsCount: number;
    linkedCashOrBankCount: number;
    linkedProductsCount: number;
  }> {
    const acc = await api.accounts.get(id);
    if (!acc) {
      return {
        canDelete: false,
        reason: 'Hesap bulunamadı.',
        isSystem: false,
        childAccounts: [],
        journalEntriesCount: 0,
        totalDebit: 0,
        totalCredit: 0,
        linkedContactsCount: 0,
        linkedCashOrBankCount: 0,
        linkedProductsCount: 0,
      };
    }

    const isSystem = !!(acc.isSystem && acc.level <= 3);

    const allAccounts = await api.accounts.list();
    const childAccounts = allAccounts.filter(
      a => a.id !== acc.id && (a.parentCode === acc.code || (a.code.startsWith(acc.code + '.') && a.code !== acc.code))
    );

    const entries = await api.journalEntries.list();
    const usedEntries = entries.filter(e => e.lines.some(l => l.accountCode === acc.code));
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of usedEntries) {
      for (const l of e.lines) {
        if (l.accountCode === acc.code) {
          totalDebit += Number(l.debit) || 0;
          totalCredit += Number(l.credit) || 0;
        }
      }
    }

    const contacts = await api.contacts.list({ where: { accountCode: acc.code } });
    const cashBoxes = await api.cashBoxes.list({ where: { accountCode: acc.code } });
    const bankAccounts = await api.bankAccounts.list({ where: { accountCode: acc.code } });
    const products = await api.products.list();
    const linkedProducts = products.filter(p => p.accountingCode === acc.code || p.salesAccountCode === acc.code || p.purchaseAccountCode === acc.code);

    let canDelete = true;
    let reason: string | undefined = undefined;

    if (isSystem) {
      canDelete = false;
      reason = `Bu hesap standart Tek Düzen Hesap Planı sistem hesabıdır (${acc.code}) ve silinemez.`;
    } else if (childAccounts.length > 0) {
      canDelete = false;
      reason = `Bu hesabın altında ${childAccounts.length} adet alt hesap tanımlıdır. Önce bu alt hesapları silmelisiniz.`;
    } else if (usedEntries.length > 0) {
      canDelete = false;
      reason = `Bu hesap ile ilgili sistemde ${usedEntries.length} adet yevmiye fişi kaydı (toplam hareket) bulunmaktadır. Fiş kaydı bulunan hesaplar silinemez.`;
    }

    return {
      canDelete,
      reason,
      isSystem,
      childAccounts,
      journalEntriesCount: usedEntries.length,
      totalDebit,
      totalCredit,
      linkedContactsCount: contacts.length,
      linkedCashOrBankCount: cashBoxes.length + bankAccounts.length,
      linkedProductsCount: linkedProducts.length
    };
  },

  // --- Journal Entries ---
  async generateEntryNumber(type: JournalEntryType = 'mahsup'): Promise<string> {
    const year = new Date().getFullYear();
    const count = await api.journalEntries.count();
    const prefix = type === 'tahsil' ? 'THS' : type === 'tediye' ? 'TDY' : type === 'acilis' ? 'ACL' : type === 'kapanis' ? 'KPN' : 'YEV';
    return `${prefix}-${year}-${(count + 1).toString().padStart(6, '0')}`;
  },

  async createJournalEntry(entry: {
    entryNumber?: string;
    entryType: JournalEntryType;
    date: Date;
    description: string;
    documentType?: 'invoice' | 'collection' | 'disbursement' | 'check' | 'manual' | 'opening';
    documentId?: number;
    documentNumber?: string;
    lines: JournalEntryLine[];
    status?: 'approved' | 'draft';
  }) {
    // 1. Servis Katmanı Yetki Kontrolü
    await assertServicePermission('accounting', 'create', true);

    // 2. Dengesiz yevmiye kaydını kesin olarak engelle (TDHP Denge Kuralı)
    const { totalDebit, totalCredit } = assertBalancedJournalEntry(entry.lines, 0.05);

    const entryNumber = entry.entryNumber || await this.generateEntryNumber(entry.entryType);

    const id = await api.journalEntries.create({
      ...entry,
      entryNumber,
      totalDebit,
      totalCredit,
      isBalanced: true,
      status: entry.status || 'approved',
      date: new Date(entry.date),
      createdAt: new Date()
    });

    return id;
  },

  async updateJournalEntry(id: number, entry: Partial<JournalEntry>) {
    // 1. Servis Katmanı Yetki Kontrolü
    await assertServicePermission('accounting', 'edit', true);

    let totalDebit: number | undefined = undefined;
    let totalCredit: number | undefined = undefined;
    let isBalanced: boolean | undefined = undefined;

    if (entry.lines && entry.lines.length > 0) {
      // Satırlar güncelleniyorsa denge şarttır
      const verified = assertBalancedJournalEntry(entry.lines, 0.05);
      totalDebit = verified.totalDebit;
      totalCredit = verified.totalCredit;
      isBalanced = true;
    }

    return await api.journalEntries.update(id, {
      ...entry,
      ...(totalDebit !== undefined ? { totalDebit } : {}),
      ...(totalCredit !== undefined ? { totalCredit } : {}),
      ...(isBalanced !== undefined ? { isBalanced } : {}),
      updatedAt: new Date()
    });
  },

  async deleteJournalEntry(id: number) {
    // Servis Katmanı Yetki Kontrolü
    await assertServicePermission('accounting', 'delete', true);
    return await api.journalEntries.remove(id);
  },

  // Helper to infer Account Type from TDHP Code
  inferAccountType(code: string): Account['type'] {
    const trimmed = code.trim();
    if (trimmed.startsWith('1') || trimmed.startsWith('2')) return 'asset';
    if (trimmed.startsWith('3') || trimmed.startsWith('4')) return 'liability';
    if (trimmed.startsWith('5')) return 'equity';
    if (trimmed.startsWith('6')) {
      if (trimmed.startsWith('60') || trimmed.startsWith('64') || trimmed.startsWith('67')) return 'revenue';
      if (trimmed.startsWith('61')) return 'revenue';
      if (trimmed.startsWith('62')) return 'cost';
      return 'expense';
    }
    if (trimmed.startsWith('7')) {
      if (trimmed.startsWith('71') || trimmed.startsWith('72') || trimmed.startsWith('73')) return 'cost';
      return 'expense';
    }
    return 'asset';
  },

  // Helper to get standard Turkish account name for intermediate parent codes
  getStandardAccountName(code: string): string {
    const standardNames: Record<string, string> = {
      '1': 'DÖNEN VARLIKLAR',
      '10': 'HAZIR DEĞERLER',
      '100': 'KASA',
      '100.01': 'Merkez TL Kasası',
      '101': 'ALINAN ÇEKLER',
      '101.01': 'Portföydeki Çekler',
      '102': 'BANKALAR',
      '102.01': 'Vadesiz TL Mevduat Hesabı',
      '103': 'VERİLEN ÇEKLER VE ÖDEME EMİRLERİ (-)',
      '108': 'DİĞER HAZIR DEĞERLER',
      '12': 'TİCARİ ALACAKLAR',
      '120': 'ALICILAR (MÜŞTERİLER)',
      '120.01': 'Yurtiçi Müşteriler Cari Hesabı',
      '120.02': 'Yurtdışı Müşteriler Cari Hesabı',
      '121': 'ALACAK SENETLERİ',
      '15': 'STOKLAR',
      '150': 'İLK MADDE VE MALZEME',
      '150.01': 'Deri ve Suni Deri Stokları',
      '150.02': 'Taban, Fuspet ve Ökçe Stokları',
      '150.03': 'Astar ve Tekstil Malzemeleri',
      '150.04': 'Yardımcı Malzeme ve Aksesuarlar',
      '151': 'YARI MAMULLER - ÜRETİM',
      '151.01': 'Kesim ve Saya Yarı Mamulleri',
      '152': 'MAMULLER',
      '152.01': 'Biten Ayakkabı Mamul Deposu',
      '153': 'TİCARİ MALLAR',
      '153.01': 'Satın Alınan Ticari Mallar',
      '191': 'İNDİRİLECEK KDV',
      '191.01': '%1 İndirilecek KDV',
      '191.10': '%10 İndirilecek KDV',
      '191.20': '%20 İndirilecek KDV',
      '3': 'KISA VADELİ YABANCI KAYNAKLAR',
      '30': 'MALİ BORÇLAR',
      '32': 'TİCARİ BORÇLAR',
      '320': 'SATICILAR (TEDARİKÇİLER)',
      '320.01': 'Yurtiçi Mal ve Hizmet Tedarikçileri',
      '320.02': 'Fason Saya ve Taban Atölyeleri',
      '321': 'BORÇ SENETLERİ',
      '391': 'HESAPLANAN KDV',
      '391.01': '%1 Hesaplanan KDV',
      '391.10': '%10 Hesaplanan KDV',
      '391.20': '%20 Hesaplanan KDV',
      '6': 'GELİR TABLOSU HESAPLARI',
      '60': 'BRÜT SATIŞLAR',
      '600': 'YURTİÇİ SATIŞLAR',
      '600.01': '%1 KDV Yurtiçi Satışlar',
      '600.10': '%10 KDV Yurtiçi Satışlar',
      '600.20': '%20 KDV Yurtiçi Satışlar',
      '601': 'YURTDIŞI SATIŞLAR (İHRACAT)',
      '620': 'SATILAN MAMULLER MALİYETİ (-)',
      '621': 'SATILAN TİCARİ MALLAR MALİYETİ (-)',
      '7': 'MALİYET HESAPLARI',
      '710': 'DİREKT İLK MADDE VE MALZEME GİDERLERİ',
      '720': 'DİREKT İŞÇİLİK GİDERLERİ',
      '730': 'GENEL ÜRETİM GİDERLERİ',
      '760': 'PAZARLAMA, SATIŞ VE DAĞITIM GİDERLERİ',
      '770': 'GENEL YÖNETİM GİDERLERİ',
      '780': 'FİNANSMAN GİDERLERİ'
    };
    return standardNames[code] || `${code} Hesabı`;
  },

  /**
   * Automatically registers an account in Tek Düzen Hesap Planı (accounts)
   * whenever a card (Contact, Product, Cash, Bank) is saved with an accounting code (e.g. 120.01.001).
   * Also ensures all intermediate parent accounts (e.g. 120, 120.01) exist in the hierarchy.
   */
  async registerAccountFromCode(params: {
    code: string;
    name: string;
    type?: Account['type'];
    currency?: string;
    description?: string;
    sourceModule?: 'contact' | 'product' | 'finance' | 'manual';
  }): Promise<Account | null> {
    const rawCode = params.code?.trim();
    if (!rawCode) return null;

    const code = rawCode;
    let cleanName = params.name?.trim() || `${code} Hesabı`;
    // Clean any 'undefined -' or undefined keywords
    cleanName = cleanName.replace(/^undefined\s*[-–:]\s*/i, '').replace(/undefined/gi, '').trim() || `${code} Hesabı`;
    const inferredType = params.type || this.inferAccountType(code);

    // 1. Ensure intermediate parent accounts exist in hierarchy
    const parts = code.split('.');
    if (parts.length > 1) {
      // e.g. parts = ['120', '01', '001']
      // 1.1 Ensure level 3 parent (e.g. '120')
      const mainCode = parts[0];
      const mainExisting = await api.accounts.findOne({ code: equalsIgnoreCase(mainCode) });
      if (!mainExisting) {
        const groupCode = mainCode.substring(0, 2);
        try {
          await api.accounts.create({
            code: mainCode,
            name: this.getStandardAccountName(mainCode),
            type: inferredType,
            level: 3,
            parentCode: groupCode,
            currency: 'TRY',
            isSystem: true,
            isActive: true
          });
        } catch {
          // ignore duplicate
        }
      }

      // 1.2 If there are 3 parts (e.g. 120.01.001), ensure sub-parent (e.g. 120.01)
      if (parts.length >= 3) {
        const subCode = `${parts[0]}.${parts[1]}`;
        const subExisting = await api.accounts.findOne({ code: equalsIgnoreCase(subCode) });
        if (!subExisting) {
          try {
            await api.accounts.create({
              code: subCode,
              name: this.getStandardAccountName(subCode),
              type: inferredType,
              level: 4,
              parentCode: mainCode,
              currency: 'TRY',
              isSystem: false,
              isActive: true
            });
          } catch {
            // ignore duplicate
          }
        }
      }
    }

    // 2. Check if the target account itself already exists
    const existing = await api.accounts.findOne({ code: equalsIgnoreCase(code) });
    if (existing) {
      // Update name and description if they were updated in the card or had undefined
      const isDirty = existing.name.includes('undefined') || (cleanName && existing.name !== cleanName);
      if (isDirty && !existing.isSystem) {
        const cleanExistingDesc = existing.description?.replace(/^undefined\s*[-–:]\s*/i, '').replace(/undefined/gi, '').trim();
        const cleanParamDesc = params.description?.replace(/^undefined\s*[-–:]\s*/i, '').replace(/undefined/gi, '').trim();
        const newDesc = cleanParamDesc || cleanExistingDesc || `${cleanName} Hesabı`;
        await api.accounts.update(existing.id!, {
          name: cleanName,
          description: newDesc,
          isActive: true
        });
        existing.name = cleanName;
        existing.description = newDesc;
      }
      return existing;
    }

    // 3. Determine level & parentCode for the new account
    let parentCode: string | undefined = undefined;
    let level = 4;
    if (parts.length > 1) {
      parentCode = parts.slice(0, parts.length - 1).join('.');
      level = Math.min(6, 3 + parts.length - 1);
    } else if (code.length === 3) {
      parentCode = code.substring(0, 2);
      level = 3;
    }

    const defaultDesc = params.sourceModule === 'contact' 
      ? `${cleanName} Cari Kart Hesabı`
      : params.sourceModule === 'product'
      ? `Stok/Mamul Kartı Hesabı (${code})`
      : params.sourceModule === 'finance'
      ? `Finans/Kasa/Banka Kartı Hesabı (${code})`
      : 'Otomatik Kart Hesabı';

    const cleanInputDesc = params.description?.replace(/^undefined\s*[-–:]\s*/i, '').replace(/undefined/gi, '').trim();

    try {
      const id = await api.accounts.create({
        code,
        name: cleanName,
        type: inferredType,
        level,
        parentCode,
        currency: params.currency || 'TRY',
        description: cleanInputDesc || defaultDesc,
        isSystem: false,
        isActive: true
      });
      return {
        id,
        code,
        name: cleanName,
        type: inferredType,
        level,
        parentCode,
        currency: params.currency || 'TRY',
        description: cleanInputDesc || defaultDesc,
        isSystem: false,
        isActive: true
      };
    } catch {
      return await api.accounts.findOne({ code }) || null;
    }
  },

  // Helper to ensure an account code exists in accounts (delegates to registerAccountFromCode)
  async ensureAccountExists(code: string, defaultName: string, type: Account['type']): Promise<string> {
    const acc = await this.registerAccountFromCode({
      code,
      name: defaultName,
      type
    });
    return acc ? acc.name : defaultName;
  },

  // --- Automatic TDHP Accounting for Invoices ---
  async createInvoiceJournalEntry(invoiceId: number): Promise<number | null> {
    const invoice = await api.invoices.get(invoiceId);
    if (!invoice || invoice.status === 'cancelled') return null;

    // Check if already accounted
    const existingEntry = (await api.journalEntries.list({ where: { documentType: 'invoice' } })).filter(e => e.documentId === invoiceId)[0];

    if (existingEntry) {
      return existingEntry.id!;
    }

    const contact = invoice.contactId ? await api.contacts.get(invoice.contactId) : null;
    const contactName = contact ? contact.name : 'Genel Cari';

    // 1. Determine Contact Account Code dynamically
    const defaultContactCode = invoice.type === 'sales' ? '120.01' : '320.01';
    const contactAccountCode = contact?.accountCode?.trim() || defaultContactCode;
    const contactAccountName = await this.ensureAccountExists(
      contactAccountCode,
      invoice.type === 'sales' ? `Alıcılar - ${contactName}` : `Satıcılar - ${contactName}`,
      invoice.type === 'sales' ? 'asset' : 'liability'
    );

    // 2. Fetch invoice items and look up defined product accounts
    const invoiceItems = await api.invoiceItems.list({ where: { invoiceId } });
    const lines: JournalEntryLine[] = [];
    const grandTotal = Number((invoice.grandTotal || 0).toFixed(2));

    if (invoice.type === 'sales') {
      // SATIŞ FATURASI:
      // BORÇ: 120 (veya Carinin Tanımlı Hesabı) - Genel Toplam
      lines.push({
        id: `line-${Date.now()}-contact`,
        accountCode: contactAccountCode,
        accountName: contactAccountName,
        description: `Satış Faturası: ${invoice.invoiceNumber} - ${contactName}`,
        debit: grandTotal,
        credit: 0,
        contactId: invoice.contactId
      });

      // ALACAK: 600 Hesapları (Ürünlerin Tanımlı Satış Gelir Hesapları) ve 391 Hesaplanan KDV
      const salesAccountMap = new Map<string, { amount: number; name: string }>();
      const vatAccountMap = new Map<string, { amount: number; name: string }>();

      if (invoiceItems.length > 0) {
        for (const item of invoiceItems) {
          let salesAccCode = '600.01';
          let salesAccName = 'Mamul ve Ürün Satışları';
          let vatAccCode = '391.20';
          let vatAccName = '%20 Hesaplanan KDV';

          if (item.productId) {
            const product = await api.products.get(item.productId);
            if (product?.salesAccountCode?.trim()) {
              salesAccCode = product.salesAccountCode.trim();
            }
          }

          // VAT Code based on item.taxRate
          const taxRate = item.taxRate !== undefined ? item.taxRate : 20;
          if (taxRate === 1) {
            vatAccCode = '391.01';
            vatAccName = '%1 Hesaplanan KDV';
          } else if (taxRate === 10) {
            vatAccCode = '391.10';
            vatAccName = '%10 Hesaplanan KDV';
          } else if (taxRate === 0) {
            vatAccCode = '391.00';
            vatAccName = '%0 Hesaplanan KDV';
          }

          // Net line amount = (quantity * unitPrice) - discountAmount
          const lineNet = Number(((item.quantity * item.unitPrice) - (item.discountAmount || 0)).toFixed(2));
          const lineTax = Number((item.taxAmount || 0).toFixed(2));

          if (lineNet > 0) {
            const existing = salesAccountMap.get(salesAccCode);
            if (existing) {
              existing.amount += lineNet;
            } else {
              salesAccountMap.set(salesAccCode, { amount: lineNet, name: salesAccName });
            }
          }

          if (lineTax > 0) {
            const existingVat = vatAccountMap.get(vatAccCode);
            if (existingVat) {
              existingVat.amount += lineTax;
            } else {
              vatAccountMap.set(vatAccCode, { amount: lineTax, name: vatAccName });
            }
          }
        }
      } else {
        // Fallback if no invoice items
        const netAmount = Number((invoice.subtotal - (invoice.discountTotal || 0)).toFixed(2));
        const vatAmount = Number((invoice.taxTotal || 0).toFixed(2));
        if (netAmount > 0) {
          salesAccountMap.set('600.01', { amount: netAmount, name: 'Mamul ve Ürün Satışları' });
        }
        if (vatAmount > 0) {
          salesAccountMap.set('391.20', { amount: vatAmount, name: '%20 Hesaplanan KDV' });
        }
      }

      // Add Sales Revenue Lines
      let lineIndex = 1;
      for (const [code, data] of salesAccountMap.entries()) {
        const roundedAmount = Number(data.amount.toFixed(2));
        if (roundedAmount > 0) {
          const accName = await this.ensureAccountExists(code, data.name, 'revenue');
          lines.push({
            id: `line-${Date.now()}-rev-${lineIndex++}`,
            accountCode: code,
            accountName: accName,
            description: `Satış Geliri (Fatura: ${invoice.invoiceNumber})`,
            debit: 0,
            credit: roundedAmount
          });
        }
      }

      // Add VAT Lines
      for (const [code, data] of vatAccountMap.entries()) {
        const roundedAmount = Number(data.amount.toFixed(2));
        if (roundedAmount > 0) {
          const accName = await this.ensureAccountExists(code, data.name, 'liability');
          lines.push({
            id: `line-${Date.now()}-vat-${lineIndex++}`,
            accountCode: code,
            accountName: accName,
            description: `Hesaplanan KDV (Fatura: ${invoice.invoiceNumber})`,
            debit: 0,
            credit: roundedAmount
          });
        }
      }

      // Ensure exact balancing in case of rounding decimals
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      const diff = Number((totalDebit - totalCredit).toFixed(2));
      if (Math.abs(diff) > 0 && Math.abs(diff) < 0.10) {
        const revLine = lines.find(l => l.credit > 0);
        if (revLine) {
          revLine.credit = Number((revLine.credit + diff).toFixed(2));
        }
      }
    } else {
      // ALIŞ FATURASI:
      // BORÇ: 150 / 153 / 152 (Ürünlerin Tanımlı Alış / Stok Hesapları) ve 191 İndirilecek KDV
      // ALACAK: 320 (veya Tedarikçinin Tanımlı Hesabı) - Genel Toplam
      const purchaseAccountMap = new Map<string, { amount: number; name: string }>();
      const vatAccountMap = new Map<string, { amount: number; name: string }>();

      if (invoiceItems.length > 0) {
        for (const item of invoiceItems) {
          let purchaseAccCode = '150.01';
          let purchaseAccName = 'İlk Madde ve Malzeme Stokları';
          let vatAccCode = '191.20';
          let vatAccName = '%20 İndirilecek KDV';

          if (item.productId) {
            const product = await api.products.get(item.productId);
            if (product?.purchaseAccountCode?.trim()) {
              purchaseAccCode = product.purchaseAccountCode.trim();
            } else if (product?.accountingCode?.trim()) {
              purchaseAccCode = product.accountingCode.trim();
            }
          }

          // VAT Code based on item.taxRate
          const taxRate = item.taxRate !== undefined ? item.taxRate : 20;
          if (taxRate === 1) {
            vatAccCode = '191.01';
            vatAccName = '%1 İndirilecek KDV';
          } else if (taxRate === 10) {
            vatAccCode = '191.10';
            vatAccName = '%10 İndirilecek KDV';
          } else if (taxRate === 0) {
            vatAccCode = '191.00';
            vatAccName = '%0 İndirilecek KDV';
          }

          const lineNet = Number(((item.quantity * item.unitPrice) - (item.discountAmount || 0)).toFixed(2));
          const lineTax = Number((item.taxAmount || 0).toFixed(2));

          if (lineNet > 0) {
            const existing = purchaseAccountMap.get(purchaseAccCode);
            if (existing) {
              existing.amount += lineNet;
            } else {
              purchaseAccountMap.set(purchaseAccCode, { amount: lineNet, name: purchaseAccName });
            }
          }

          if (lineTax > 0) {
            const existingVat = vatAccountMap.get(vatAccCode);
            if (existingVat) {
              existingVat.amount += lineTax;
            } else {
              vatAccountMap.set(vatAccCode, { amount: lineTax, name: vatAccName });
            }
          }
        }
      } else {
        // Fallback
        const netAmount = Number((invoice.subtotal - (invoice.discountTotal || 0)).toFixed(2));
        const vatAmount = Number((invoice.taxTotal || 0).toFixed(2));
        if (netAmount > 0) {
          purchaseAccountMap.set('150.01', { amount: netAmount, name: 'İlk Madde ve Malzeme Stokları' });
        }
        if (vatAmount > 0) {
          vatAccountMap.set('191.20', { amount: vatAmount, name: '%20 İndirilecek KDV' });
        }
      }

      let lineIndex = 1;
      // Add Purchase Asset Lines
      for (const [code, data] of purchaseAccountMap.entries()) {
        const roundedAmount = Number(data.amount.toFixed(2));
        if (roundedAmount > 0) {
          const accName = await this.ensureAccountExists(code, data.name, 'asset');
          lines.push({
            id: `line-${Date.now()}-stock-${lineIndex++}`,
            accountCode: code,
            accountName: accName,
            description: `Alış Girişi (Fatura: ${invoice.invoiceNumber})`,
            debit: roundedAmount,
            credit: 0
          });
        }
      }

      // Add VAT Lines
      for (const [code, data] of vatAccountMap.entries()) {
        const roundedAmount = Number(data.amount.toFixed(2));
        if (roundedAmount > 0) {
          const accName = await this.ensureAccountExists(code, data.name, 'asset');
          lines.push({
            id: `line-${Date.now()}-vat-${lineIndex++}`,
            accountCode: code,
            accountName: accName,
            description: `İndirilecek KDV (Fatura: ${invoice.invoiceNumber})`,
            debit: roundedAmount,
            credit: 0
          });
        }
      }

      // Add Supplier Liability Line
      lines.push({
        id: `line-${Date.now()}-contact`,
        accountCode: contactAccountCode,
        accountName: contactAccountName,
        description: `Tedarikçi Borç Tahakkuku: ${invoice.invoiceNumber} - ${contactName}`,
        debit: 0,
        credit: grandTotal,
        contactId: invoice.contactId
      });

      // Ensure exact balancing
      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      const diff = Number((totalDebit - totalCredit).toFixed(2));
      if (Math.abs(diff) > 0 && Math.abs(diff) < 0.10) {
        const stockLine = lines.find(l => l.debit > 0);
        if (stockLine) {
          stockLine.debit = Number((stockLine.debit - diff).toFixed(2));
        }
      }
    }

    const entryId = await this.createJournalEntry({
      entryType: 'mahsup',
      date: new Date(invoice.date),
      description: `${invoice.type === 'sales' ? 'Satış' : 'Alış'} Faturası Muhasebe Kaydı (${invoice.invoiceNumber} - ${contactName})`,
      documentType: 'invoice',
      documentId: invoice.id,
      documentNumber: invoice.invoiceNumber,
      lines,
      status: 'approved'
    });

    return entryId;
  },

  // Batch Auto-Accounting for All Unaccounted Invoices
  async autoAccountAllInvoices(): Promise<{ processedCount: number; errors: string[] }> {
    const invoices = await api.invoices.list();
    const existingEntries = await api.journalEntries.list({ where: { documentType: 'invoice' } });
    const accountedInvoiceIds = new Set(existingEntries.map(e => e.documentId).filter(Boolean));

    let processedCount = 0;
    const errors: string[] = [];

    for (const inv of invoices) {
      if (inv.status !== 'cancelled' && inv.id && !accountedInvoiceIds.has(inv.id)) {
        try {
          await this.createInvoiceJournalEntry(inv.id);
          processedCount++;
        } catch (err: any) {
          errors.push(`Fatura ${inv.invoiceNumber} muhasebeleştirilemedi: ${err.message}`);
        }
      }
    }

    return { processedCount, errors };
  },

  // Automatic TDHP Accounting for Collection / Disbursement Receipt
  async createReceiptJournalEntry(receiptId: number): Promise<number | null> {
    const receipt = await api.collectionReceipts.get(receiptId);
    if (!receipt) return null;

    if (receipt.journalEntryId) {
      const existing = await api.journalEntries.get(receipt.journalEntryId);
      if (existing) return existing.id!;
    }

    const lines: JournalEntryLine[] = [];
    const amount = Number(receipt.amount.toFixed(2));

    // Determine Asset Account (100 Kasa, 102 Banka, 101 Alınan Çek, 108 Kredi Kartı)
    let assetAccountCode = '100.01';
    let assetAccountName = 'Merkez TL Kasası';

    if (receipt.instrument === 'bank') {
      assetAccountCode = '102.01';
      assetAccountName = 'Garanti BBVA Vadesiz TL Hesabı';
      if (receipt.bankAccountId) {
        const bank = await api.bankAccounts.get(receipt.bankAccountId);
        if (bank) {
          assetAccountCode = bank.accountCode || '102.01';
          assetAccountName = `${bank.bankName} (${bank.iban})`;
        }
      }
    } else if (receipt.instrument === 'check') {
      assetAccountCode = receipt.type === 'collection' ? '101.01' : '103.01';
      assetAccountName = receipt.type === 'collection' ? 'Portföydeki Alınan Çekler' : 'Verilen Firma Çekleri';
    } else if (receipt.instrument === 'credit_card') {
      assetAccountCode = '108.01';
      assetAccountName = 'Kredi Kartı Slip Alacakları';
    } else {
      if (receipt.cashBoxId) {
        const cash = await api.cashBoxes.get(receipt.cashBoxId);
        if (cash) {
          assetAccountCode = cash.accountCode || '100.01';
          assetAccountName = cash.name;
        }
      }
    }

    // Resolve Contact Account Code dynamically
    let contactAccountCode = receipt.type === 'collection' ? '120.01' : '320.01';
    let contactAccountName = receipt.type === 'collection' 
      ? `Yurtiçi Müşteriler Cari Hesabı (${receipt.contactName})` 
      : `Yurtiçi Mal ve Hizmet Tedarikçileri (${receipt.contactName})`;

    if (receipt.contactId) {
      const contact = await api.contacts.get(receipt.contactId);
      if (contact) {
        if (contact.accountCode?.trim()) {
          contactAccountCode = contact.accountCode.trim();
        }
        contactAccountName = await this.ensureAccountExists(
          contactAccountCode,
          `${receipt.type === 'collection' ? 'Alıcılar' : 'Satıcılar'} - ${contact.name}`,
          receipt.type === 'collection' ? 'asset' : 'liability'
        );
      }
    }

    if (receipt.type === 'collection') {
      // TAHSİLAT (Kasaya/Bankaya Para Girişi):
      // BORÇ: Kasa/Banka (100 / 102 / 101)
      // ALACAK: Alıcılar (120 veya tanımlı cari hesabı)
      lines.push({
        id: `line-${Date.now()}-1`,
        accountCode: assetAccountCode,
        accountName: assetAccountName,
        description: `Tahsilat (${receipt.receiptNumber}): ${receipt.description || receipt.contactName}`,
        debit: amount,
        credit: 0
      });

      lines.push({
        id: `line-${Date.now()}-2`,
        accountCode: contactAccountCode,
        accountName: contactAccountName,
        description: `Müşteri Tahsilatı - Makbuz No: ${receipt.receiptNumber}`,
        debit: 0,
        credit: amount,
        contactId: receipt.contactId
      });
    } else {
      // TEDİYE (Kasadan/Bankadan Para Çıkışı - Tedarikçiye Ödeme):
      // BORÇ: Satıcılar (320 veya tanımlı cari hesabı)
      // ALACAK: Kasa/Banka (100 / 102 / 103)
      lines.push({
        id: `line-${Date.now()}-1`,
        accountCode: contactAccountCode,
        accountName: contactAccountName,
        description: `Tedarikçi Ödemesi - Makbuz No: ${receipt.receiptNumber}`,
        debit: amount,
        credit: 0,
        contactId: receipt.contactId
      });

      lines.push({
        id: `line-${Date.now()}-2`,
        accountCode: assetAccountCode,
        accountName: assetAccountName,
        description: `Tediye (${receipt.receiptNumber}): ${receipt.description || receipt.contactName}`,
        debit: 0,
        credit: amount
      });
    }

    const entryType: JournalEntryType = receipt.instrument === 'cash' 
      ? (receipt.type === 'collection' ? 'tahsil' : 'tediye')
      : 'mahsup';

    const entryId = await this.createJournalEntry({
      entryType,
      date: new Date(receipt.date),
      description: `${receipt.type === 'collection' ? 'Tahsilat' : 'Tediye'} Fişi: ${receipt.contactName} (${receipt.receiptNumber})`,
      documentType: receipt.type === 'collection' ? 'collection' : 'disbursement',
      documentId: receipt.id,
      documentNumber: receipt.receiptNumber,
      lines,
      status: 'approved'
    });

    await api.collectionReceipts.update(receiptId, {
      journalEntryId: entryId,
      isAccounted: true
    });

    return entryId;
  },

  // --- Trial Balance (Mizan Raporu) ---
  async getMizanReport(options?: {
    startDate?: Date;
    endDate?: Date;
    onlyWithBalance?: boolean;
    levelFilter?: 'all' | 'class' | 'group' | 'main' | 'sub';
  }): Promise<MizanRow[]> {
    const rawAccounts = await api.accounts.list();
    const uniqueMap = new Map<string, Account>();
    rawAccounts.forEach(acc => {
      const codeKey = acc.code.trim();
      if (!uniqueMap.has(codeKey)) {
        uniqueMap.set(codeKey, acc);
      }
    });
    const accounts = Array.from(uniqueMap.values());
    const journalEntries = await api.journalEntries.list();

    // Filter entries by date if specified
    const filteredEntries = journalEntries.filter(entry => {
      if (options?.startDate && new Date(entry.date) < new Date(options.startDate)) return false;
      if (options?.endDate && new Date(entry.date) > new Date(options.endDate)) return false;
      return true;
    });

    // Map account code -> { totalDebit, totalCredit }
    const totalsMap = new Map<string, { totalDebit: number; totalCredit: number }>();

    filteredEntries.forEach(entry => {
      entry.lines.forEach(line => {
        const code = line.accountCode;
        const current = totalsMap.get(code) || { totalDebit: 0, totalCredit: 0 };
        current.totalDebit += Number(line.debit) || 0;
        current.totalCredit += Number(line.credit) || 0;
        totalsMap.set(code, current);

        // Also propagate to parent account codes (e.g. 100.01 -> 100, 10, 1)
        const parts = code.split('.');
        const mainCode = parts[0];
        if (mainCode && mainCode !== code) {
          const mainCurr = totalsMap.get(mainCode) || { totalDebit: 0, totalCredit: 0 };
          mainCurr.totalDebit += Number(line.debit) || 0;
          mainCurr.totalCredit += Number(line.credit) || 0;
          totalsMap.set(mainCode, mainCurr);
        }

        if (mainCode.length >= 2) {
          const groupCode = mainCode.substring(0, 2);
          if (groupCode !== mainCode) {
            const grpCurr = totalsMap.get(groupCode) || { totalDebit: 0, totalCredit: 0 };
            grpCurr.totalDebit += Number(line.debit) || 0;
            grpCurr.totalCredit += Number(line.credit) || 0;
            totalsMap.set(groupCode, grpCurr);
          }
        }

        const classCode = mainCode.substring(0, 1);
        if (classCode !== mainCode) {
          const clsCurr = totalsMap.get(classCode) || { totalDebit: 0, totalCredit: 0 };
          clsCurr.totalDebit += Number(line.debit) || 0;
          clsCurr.totalCredit += Number(line.credit) || 0;
          totalsMap.set(classCode, clsCurr);
        }
      });
    });

    // Build Mizan rows
    const rows: MizanRow[] = accounts.map(acc => {
      const t = totalsMap.get(acc.code) || { totalDebit: 0, totalCredit: 0 };
      const totalDebit = Number(t.totalDebit.toFixed(2));
      const totalCredit = Number(t.totalCredit.toFixed(2));
      
      const diff = totalDebit - totalCredit;
      const debitBalance = diff > 0 ? Number(diff.toFixed(2)) : 0;
      const creditBalance = diff < 0 ? Number(Math.abs(diff).toFixed(2)) : 0;

      return {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        level: acc.level,
        totalDebit,
        totalCredit,
        debitBalance,
        creditBalance
      };
    });

    // Sort by TDHP code order (1, 10, 100, 100.01, 100.01.001 ...)
    rows.sort((a, b) => compareAccountCodes(a.code, b.code));

    // Apply filters
    return rows.filter(r => {
      if (options?.onlyWithBalance && r.totalDebit === 0 && r.totalCredit === 0) {
        return false;
      }
      if (options?.levelFilter && options.levelFilter !== 'all') {
        if (options.levelFilter === 'class' && r.level !== 1) return false;
        if (options.levelFilter === 'group' && r.level !== 2) return false;
        if (options.levelFilter === 'main' && r.level !== 3) return false;
        if (options.levelFilter === 'sub' && r.level < 4) return false;
      }
      return true;
    });
  },

  // --- General Ledger (Defter-i Kebir) ---
  async getGeneralLedger(accountCode: string, startDate?: Date, endDate?: Date) {
    const journalEntries = await api.journalEntries.list();

    const matchingLines: {
      entryId: number;
      entryNumber: string;
      date: Date;
      description: string;
      debit: number;
      credit: number;
      balance: number;
    }[] = [];

    // Filter & sort
    const sortedEntries = journalEntries
      .filter(e => {
        if (startDate && new Date(e.date) < new Date(startDate)) return false;
        if (endDate && new Date(e.date) > new Date(endDate)) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || (a.id || 0) - (b.id || 0));

    let runningBalance = 0;

    sortedEntries.forEach(entry => {
      entry.lines.forEach(line => {
        // match exact code or startsWith if parent
        if (line.accountCode === accountCode || line.accountCode.startsWith(`${accountCode}.`)) {
          const debit = Number(line.debit) || 0;
          const credit = Number(line.credit) || 0;
          runningBalance += (debit - credit);

          matchingLines.push({
            entryId: entry.id!,
            entryNumber: entry.entryNumber,
            date: new Date(entry.date),
            description: line.description || entry.description,
            debit,
            credit,
            balance: Number(runningBalance.toFixed(2))
          });
        }
      });
    });

    return matchingLines;
  }
};
