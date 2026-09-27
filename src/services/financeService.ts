import { api, callOp } from '../api/client';
import type { 
  CollectionReceipt, 
  CashBox, 
  BankAccount, 
  CheckNote, 
  CheckStatus, 
  PaymentInstrument, 
  ReceiptType
} from '../types';
import { accountingService } from './accountingService';
import { turkishIncludes } from '../lib/turkishUtils';

export const financeService = {
  // --- Receipt Number Generation ---
  async generateReceiptNumber(type: ReceiptType): Promise<string> {
    const year = new Date().getFullYear();
    const count = await api.collectionReceipts.count();
    const prefix = type === 'collection' ? 'THS' : 'TED';
    return `${prefix}-${year}-${(count + 1).toString().padStart(6, '0')}`;
  },

  async generateCheckPortfolioNumber(type: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await api.checks.count();
    const prefix = type.includes('check') ? 'CEK' : 'SNT';
    return `${prefix}-${year}-${(count + 1).toString().padStart(4, '0')}`;
  },

  // --- Collection & Disbursement Operations ---
  async addReceipt(data: {
    type: ReceiptType;
    contactId: number;
    amount: number;
    currency?: string;
    instrument: PaymentInstrument;
    cashBoxId?: number;
    bankAccountId?: number;
    checkData?: {
      serialNumber: string;
      bankName?: string;
      branchName?: string;
      drawer: string;
      issueDate: Date;
      dueDate: Date;
      notes?: string;
    };
    description: string;
    date?: Date;
    invoiceId?: number;
    invoiceNumber?: string;
  }) {
    const contact = await api.contacts.get(data.contactId);
    if (!contact) throw new Error('Cari hesap bulunamadı');

    // Muhasebe fişinin cari hesabı için TDHP kaydını önceden garanti et
    // (ana veri hazırlığı; asıl finansal işlem sunucuda tek transaction'dır).
    const contactAccountCode = contact.accountCode?.trim();
    if (contactAccountCode) {
      try {
        await accountingService.ensureAccountExists(
          contactAccountCode,
          `${data.type === 'collection' ? 'Alıcılar' : 'Satıcılar'} - ${contact.name}`,
          data.type === 'collection' ? 'asset' : 'liability'
        );
      } catch (e) {
        console.warn('Cari hesabı TDHP kaydı hazırlanamadı:', e);
      }
    }

    // Çek portföy kaydı + kasa/banka/cari bakiyeleri + makbuz + transaction
    // + muhasebe fişi + denetim kaydı sunucuda TEK transaction içinde yazılır.
    const result = await callOp<{ receiptId: number; receiptNumber: string; checkId: number | null; journalEntryId: number }>('receipt', {
      type: data.type,
      contactId: data.contactId,
      amount: data.amount,
      currency: data.currency,
      instrument: data.instrument,
      cashBoxId: data.cashBoxId,
      bankAccountId: data.bankAccountId,
      checkData: data.checkData,
      description: data.description,
      date: data.date,
      invoiceId: data.invoiceId,
      invoiceNumber: data.invoiceNumber
    });

    return result.receiptId;
  },

  // --- Fund Transfers (Virman) ---
  async transferFunds(params: {
    fromType: 'cash' | 'bank';
    fromId: number;
    toType: 'cash' | 'bank';
    toId: number;
    amount: number;
    description: string;
    date?: Date;
  }) {
    // Bakiye kontrolü, kasa/banka güncellemeleri ve virman fişi sunucuda
    // tek transaction + satır kilidi altında uygulanır.
    const result = await callOp<{ entryId: number; fromName: string; toName: string; amount: number }>('transfer', {
      fromType: params.fromType,
      fromId: params.fromId,
      toType: params.toType,
      toId: params.toId,
      amount: params.amount,
      description: params.description,
      date: params.date
    });
    return result.entryId;
  },

  // --- Check & Note Status Lifecycle ---
  async updateCheckStatus(
    checkId: number, 
    newStatus: CheckStatus, 
    options?: {
      targetBankAccountId?: number;
      targetCashBoxId?: number;
      endorsedToContactId?: number;
      notes?: string;
      date?: Date;
    }
  ) {
    // Çek kaydı, hedef kasa/banka/cari güncellemeleri ve muhasebe fişleri
    // sunucuda tek transaction + satır kilidi altında uygulanır.
    await callOp<{ checkId: number; status: string }>('check-status', {
      checkId,
      newStatus,
      targetBankAccountId: options?.targetBankAccountId,
      targetCashBoxId: options?.targetCashBoxId,
      endorsedToContactId: options?.endorsedToContactId,
      notes: options?.notes,
      date: options?.date
    });
  },

  // --- Kasa (CashBox) Düzenleme ve Silme İşlemleri ---
  async updateCashBox(id: number, data: Partial<CashBox>, syncAccount = true) {
    const existing = await api.cashBoxes.get(id);
    if (!existing) throw new Error('Kasa bulunamadı.');

    // balance türetilmiş bir alandır; generic update'te soyulur. Tanım alanları
    // generic update ile, bakiye değişikliği ise kontrollü açılış-bakiyesi ucuyla yazılır.
    const { balance: _ignoredBalance, ...definitionData } = data;
    const result = await api.cashBoxes.update(id, { ...definitionData });

    if (data.balance !== undefined && Number(data.balance) !== Number(existing.balance)) {
      await callOp('opening-balance', { resource: 'cashBoxes', id, amount: Number(data.balance) });
      (result as any).balance = Number(data.balance);
    }

    // TDHP Kasa Hesabı Senkronizasyonu
    if (syncAccount && (data.name || data.code || data.accountCode)) {
      try {
        const targetAccCode = data.accountCode || existing.accountCode;
        const oldAccCode = existing.accountCode;
        const newDisplayName = `${data.code || existing.code} - ${data.name || existing.name}`;

        const account = await api.accounts.findOne({ code: oldAccCode });
        if (account && account.id) {
          await api.accounts.update(account.id, {
            name: newDisplayName,
            code: targetAccCode,
            currency: data.currency || existing.currency
          });
        }
      } catch (err) {
        console.error('Kasa hesabı TDHP senkronizasyon hatası:', err);
      }
    }

    return result;
  },

  async deleteCashBox(id: number, force = false) {
    const existing = await api.cashBoxes.get(id);
    if (!existing) throw new Error('Kasa bulunamadı.');

    // Bu kasaya bağlı tahsilat/tediye makbuzu var mı kontrol et
    let receiptCount = 0;
    try {
      receiptCount = await api.collectionReceipts.count({ cashBoxId: id });
    } catch {
      const allReceipts = await api.collectionReceipts.list();
      receiptCount = allReceipts.filter(r => r.cashBoxId === id).length;
    }

    if (receiptCount > 0 && !force) {
      throw new Error(`Bu kasaya bağlı ${receiptCount} adet makbuz kaydı bulunmaktadır. Silmek için onay vermeniz gerekmektedir.`);
    }

    // Eğer force ise veya makbuz yoksa sil
    return await api.cashBoxes.remove(id);
  },

  // --- Banka Hesabı (BankAccount) Düzenleme ve Silme İşlemleri ---
  async updateBankAccount(id: number, data: Partial<BankAccount>, syncAccount = true) {
    const existing = await api.bankAccounts.get(id);
    if (!existing) throw new Error('Banka hesabı bulunamadı.');

    // balance türetilmiş bir alandır; generic update'te soyulur. Tanım alanları
    // generic update ile, bakiye değişikliği kontrollü açılış-bakiyesi ucuyla yazılır.
    const { balance: _ignoredBalance, ...definitionData } = data;
    const result = await api.bankAccounts.update(id, { ...definitionData });

    if (data.balance !== undefined && Number(data.balance) !== Number(existing.balance)) {
      await callOp('opening-balance', { resource: 'bankAccounts', id, amount: Number(data.balance) });
      (result as any).balance = Number(data.balance);
    }

    // TDHP Banka Hesabı Senkronizasyonu
    if (syncAccount && (data.bankName || data.branchName || data.iban || data.accountCode)) {
      try {
        const targetAccCode = data.accountCode || existing.accountCode;
        const oldAccCode = existing.accountCode;
        const newDisplayName = `${data.bankName || existing.bankName} (${data.branchName || existing.branchName || 'Merkez'})`;

        const account = await api.accounts.findOne({ code: oldAccCode });
        if (account && account.id) {
          await api.accounts.update(account.id, {
            name: newDisplayName,
            code: targetAccCode,
            currency: data.currency || existing.currency,
            description: `Banka Hesabı - IBAN: ${data.iban || existing.iban}`
          });
        }
      } catch (err) {
        console.error('Banka hesabı TDHP senkronizasyon hatası:', err);
      }
    }

    return result;
  },

  async deleteBankAccount(id: number, force = false) {
    const existing = await api.bankAccounts.get(id);
    if (!existing) throw new Error('Banka hesabı bulunamadı.');

    // Bu banka hesabına bağlı tahsilat/tediye makbuzu var mı kontrol et
    let receiptCount = 0;
    try {
      receiptCount = await api.collectionReceipts.count({ bankAccountId: id });
    } catch {
      const allReceipts = await api.collectionReceipts.list();
      receiptCount = allReceipts.filter(r => r.bankAccountId === id).length;
    }

    if (receiptCount > 0 && !force) {
      throw new Error(`Bu banka hesabına bağlı ${receiptCount} adet makbuz kaydı bulunmaktadır. Silmek için onay vermeniz gerekmektedir.`);
    }

    return await api.bankAccounts.remove(id);
  },

  // --- Statement & Movement Reports (Ekstre ve Hareket Raporları) ---
  async getCashBoxStatement(
    cashBoxId: number,
    options?: {
      startDate?: Date;
      endDate?: Date;
      search?: string;
      typeFilter?: string;
    }
  ) {
    const cashBox = await api.cashBoxes.get(cashBoxId);
    if (!cashBox) throw new Error('Kasa bulunamadı.');

    const allReceipts = await api.collectionReceipts.list();
    const boxReceipts = allReceipts.filter(r => r.cashBoxId === cashBoxId);

    const allJournalEntries = await api.journalEntries.list();
    const allContacts = await api.contacts.list();
    const contactMap = new Map(allContacts.map(c => [c.id!, c.name]));

    const processedReceiptIds = new Set<number>();
    const rawMovements: {
      id: string;
      date: Date;
      documentNo: string;
      type: 'collection' | 'disbursement' | 'virman_in' | 'virman_out' | 'check_in' | 'check_out' | 'payroll' | 'manual';
      typeLabel: string;
      description: string;
      contactName?: string;
      contactId?: number;
      debit: number;
      credit: number;
      instrument?: string;
      referenceId?: number;
    }[] = [];

    // 1. Process Collection Receipts
    boxReceipts.forEach(r => {
      if (r.id) processedReceiptIds.add(r.id);
      const isCollection = r.type === 'collection';
      const debit = isCollection ? r.amount : 0;
      const credit = isCollection ? 0 : r.amount;

      rawMovements.push({
        id: `rcpt-${r.id}`,
        date: new Date(r.date),
        documentNo: r.receiptNumber,
        type: isCollection ? 'collection' : 'disbursement',
        typeLabel: isCollection ? 'Tahsilat Makbuzu' : 'Tediye Makbuzu',
        description: r.description || (isCollection ? 'Nakit Tahsilat' : 'Nakit Tediye'),
        contactName: r.contactName || contactMap.get(r.contactId) || '-',
        contactId: r.contactId,
        debit,
        credit,
        instrument: r.instrument,
        referenceId: r.id
      });
    });

    // 2. Process Journal Entries for this CashBox account code (Virman, Cheque Collections, Manual, Payroll)
    const targetAccountCode = cashBox.accountCode || '100.01';
    allJournalEntries.forEach(entry => {
      // If this entry was created by a receipt we already processed, skip
      if ((entry.documentType === 'collection' || entry.documentType === 'disbursement' || (entry.documentType as string) === 'receipt') && entry.documentId && processedReceiptIds.has(entry.documentId)) {
        return;
      }
      if (boxReceipts.some(r => r.receiptNumber && entry.description?.includes(r.receiptNumber))) {
        return;
      }

      entry.lines.forEach((line, lineIdx) => {
        if (line.accountCode === targetAccountCode || line.accountCode.startsWith(`${targetAccountCode}.`)) {
          const debit = Number(line.debit) || 0;
          const credit = Number(line.credit) || 0;
          if (debit === 0 && credit === 0) return;

          let type: 'collection' | 'disbursement' | 'virman_in' | 'virman_out' | 'check_in' | 'check_out' | 'payroll' | 'manual' = 'manual';
          let typeLabel = 'Mahsup Fişi';

          const descLower = (line.description || entry.description || '').toLowerCase();
          if (descLower.includes('virman')) {
            type = debit > 0 ? 'virman_in' : 'virman_out';
            typeLabel = debit > 0 ? 'Virman Girişi' : 'Virman Çıkışı';
          } else if (descLower.includes('çek') || descLower.includes('senet')) {
            type = debit > 0 ? 'check_in' : 'check_out';
            typeLabel = debit > 0 ? 'Çek Tahsilatı' : 'Çek Ödemesi';
          } else if (descLower.includes('maaş') || descLower.includes('bordro') || descLower.includes('avans') || descLower.includes('ücret')) {
            type = 'payroll';
            typeLabel = 'Maaş / Avans Ödemesi';
          } else if (debit > 0) {
            type = 'collection';
            typeLabel = 'Nakit Girişi';
          } else {
            type = 'disbursement';
            typeLabel = 'Nakit Çıkışı';
          }

          rawMovements.push({
            id: `je-${entry.id}-${lineIdx}`,
            date: new Date(entry.date),
            documentNo: entry.entryNumber || `YEV-${entry.id}`,
            type,
            typeLabel,
            description: line.description || entry.description || 'Muhasebe Kaydı',
            contactName: entry.documentNumber || '-',
            debit,
            credit,
            referenceId: entry.id
          });
        }
      });
    });

    // 3. Sort chronologically
    rawMovements.sort((a, b) => a.date.getTime() - b.date.getTime());

    // 4. Calculate initial balance before startDate
    let initialBalance = 0;
    const periodMovements: typeof rawMovements = [];

    rawMovements.forEach(m => {
      const isBeforeStart = options?.startDate && m.date < new Date(options.startDate);
      const isAfterEnd = options?.endDate && m.date > new Date(options.endDate);

      if (isBeforeStart) {
        initialBalance += (m.debit - m.credit);
      } else if (!isAfterEnd) {
        periodMovements.push(m);
      }
    });

    // 5. Calculate running balance and filter
    let runningBalance = initialBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const itemsWithBalance = periodMovements.map(m => {
      runningBalance += (m.debit - m.credit);
      totalDebit += m.debit;
      totalCredit += m.credit;

      return {
        ...m,
        balance: Number(runningBalance.toFixed(2))
      };
    });

    // 6. Apply search or type filter on displayed items
    const filteredItems = itemsWithBalance.filter(item => {
      if (options?.typeFilter && options.typeFilter !== 'all' && item.type !== options.typeFilter) {
        return false;
      }
      if (options?.search) {
        const q = options.search;
        const match = 
          turkishIncludes(item.documentNo, q) ||
          turkishIncludes(item.description, q) ||
          turkishIncludes(item.contactName, q) ||
          turkishIncludes(item.typeLabel, q);
        if (!match) return false;
      }
      return true;
    });

    return {
      accountInfo: {
        id: cashBox.id!,
        title: cashBox.name,
        code: cashBox.code,
        accountCode: cashBox.accountCode,
        currency: cashBox.currency || 'TRY',
        currentBalance: cashBox.balance,
        extra: cashBox.responsiblePerson ? `Sorumlu: ${cashBox.responsiblePerson}` : undefined
      },
      initialBalance: Number(initialBalance.toFixed(2)),
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      periodBalance: Number((initialBalance + totalDebit - totalCredit).toFixed(2)),
      items: filteredItems
    };
  },

  async getBankAccountStatement(
    bankAccountId: number,
    options?: {
      startDate?: Date;
      endDate?: Date;
      search?: string;
      typeFilter?: string;
    }
  ) {
    const bankAccount = await api.bankAccounts.get(bankAccountId);
    if (!bankAccount) throw new Error('Banka hesabı bulunamadı.');

    const allReceipts = await api.collectionReceipts.list();
    const bankReceipts = allReceipts.filter(r => r.bankAccountId === bankAccountId);

    const allJournalEntries = await api.journalEntries.list();
    const allContacts = await api.contacts.list();
    const contactMap = new Map(allContacts.map(c => [c.id!, c.name]));

    const processedReceiptIds = new Set<number>();
    const rawMovements: {
      id: string;
      date: Date;
      documentNo: string;
      type: 'collection' | 'disbursement' | 'virman_in' | 'virman_out' | 'check_in' | 'check_out' | 'payroll' | 'manual';
      typeLabel: string;
      description: string;
      contactName?: string;
      contactId?: number;
      debit: number;
      credit: number;
      instrument?: string;
      referenceId?: number;
    }[] = [];

    // 1. Process Bank Receipts (Havale / EFT)
    bankReceipts.forEach(r => {
      if (r.id) processedReceiptIds.add(r.id);
      const isCollection = r.type === 'collection';
      const debit = isCollection ? r.amount : 0;
      const credit = isCollection ? 0 : r.amount;

      rawMovements.push({
        id: `rcpt-${r.id}`,
        date: new Date(r.date),
        documentNo: r.receiptNumber,
        type: isCollection ? 'collection' : 'disbursement',
        typeLabel: isCollection ? 'Havale/EFT Tahsilat' : 'Havale/EFT Tediye',
        description: r.description || (isCollection ? 'Banka Havale Girişi' : 'Banka Havale Çıkışı'),
        contactName: contactMap.get(r.contactId) || r.contactName || '-',
        contactId: r.contactId,
        debit,
        credit,
        instrument: r.instrument,
        referenceId: r.id
      });
    });

    // 2. Process Journal Entries for this Bank account code
    const targetAccountCode = bankAccount.accountCode || '102.01';
    allJournalEntries.forEach(entry => {
      if ((entry.documentType === 'collection' || entry.documentType === 'disbursement' || (entry.documentType as string) === 'receipt') && entry.documentId && processedReceiptIds.has(entry.documentId)) {
        return;
      }
      if (bankReceipts.some(r => r.receiptNumber && entry.description?.includes(r.receiptNumber))) {
        return;
      }

      entry.lines.forEach((line, lineIdx) => {
        if (line.accountCode === targetAccountCode || line.accountCode.startsWith(`${targetAccountCode}.`)) {
          const debit = Number(line.debit) || 0;
          const credit = Number(line.credit) || 0;
          if (debit === 0 && credit === 0) return;

          let type: 'collection' | 'disbursement' | 'virman_in' | 'virman_out' | 'check_in' | 'check_out' | 'payroll' | 'manual' = 'manual';
          let typeLabel = 'Banka Fişi';

          const descLower = (line.description || entry.description || '').toLowerCase();
          if (descLower.includes('virman')) {
            type = debit > 0 ? 'virman_in' : 'virman_out';
            typeLabel = debit > 0 ? 'Virman (Gelen)' : 'Virman (Giden)';
          } else if (descLower.includes('çek') || descLower.includes('senet')) {
            type = debit > 0 ? 'check_in' : 'check_out';
            typeLabel = debit > 0 ? 'Çek Tahsilatı (Takas)' : 'Çek Ödemesi';
          } else if (descLower.includes('maaş') || descLower.includes('bordro') || descLower.includes('avans')) {
            type = 'payroll';
            typeLabel = 'Personel Maaş Transferi';
          } else if (debit > 0) {
            type = 'collection';
            typeLabel = 'Yatan Para / Transfer';
          } else {
            type = 'disbursement';
            typeLabel = 'Çekilen Para / Transfer';
          }

          rawMovements.push({
            id: `je-${entry.id}-${lineIdx}`,
            date: new Date(entry.date),
            documentNo: entry.entryNumber || `YEV-${entry.id}`,
            type,
            typeLabel,
            description: line.description || entry.description || 'Banka Muhasebe Kaydı',
            contactName: entry.documentNumber || '-',
            debit,
            credit,
            referenceId: entry.id
          });
        }
      });
    });

    // 3. Sort chronologically
    rawMovements.sort((a, b) => a.date.getTime() - b.date.getTime());

    // 4. Calculate initial balance before startDate
    let initialBalance = 0;
    const periodMovements: typeof rawMovements = [];

    rawMovements.forEach(m => {
      const isBeforeStart = options?.startDate && m.date < new Date(options.startDate);
      const isAfterEnd = options?.endDate && m.date > new Date(options.endDate);

      if (isBeforeStart) {
        initialBalance += (m.debit - m.credit);
      } else if (!isAfterEnd) {
        periodMovements.push(m);
      }
    });

    // 5. Calculate running balance and filter
    let runningBalance = initialBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const itemsWithBalance = periodMovements.map(m => {
      runningBalance += (m.debit - m.credit);
      totalDebit += m.debit;
      totalCredit += m.credit;

      return {
        ...m,
        balance: Number(runningBalance.toFixed(2))
      };
    });

    // 6. Apply search or type filter on displayed items
    const filteredItems = itemsWithBalance.filter(item => {
      if (options?.typeFilter && options.typeFilter !== 'all' && item.type !== options.typeFilter) {
        return false;
      }
      if (options?.search) {
        const q = options.search;
        const match = 
          turkishIncludes(item.documentNo, q) ||
          turkishIncludes(item.description, q) ||
          turkishIncludes(item.contactName, q) ||
          turkishIncludes(item.typeLabel, q);
        if (!match) return false;
      }
      return true;
    });

    return {
      accountInfo: {
        id: bankAccount.id!,
        title: bankAccount.bankName,
        code: bankAccount.accountNumber || '',
        accountCode: bankAccount.accountCode,
        currency: bankAccount.currency || 'TRY',
        currentBalance: bankAccount.balance,
        extra: `IBAN: ${bankAccount.iban} ${bankAccount.branchName ? `(${bankAccount.branchName})` : ''}`
      },
      initialBalance: Number(initialBalance.toFixed(2)),
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      periodBalance: Number((initialBalance + totalDebit - totalCredit).toFixed(2)),
      items: filteredItems
    };
  },

  async getCheckMovementReport(options?: {
    type?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    search?: string;
  }) {
    const allChecks = await api.checks.list();
    const allContacts = await api.contacts.list();
    const contactMap = new Map(allContacts.map(c => [c.id!, c.name]));
    const bankAccounts = await api.bankAccounts.list();
    const bankMap = new Map(bankAccounts.map(b => [b.id!, `${b.bankName} (${b.iban})`]));
    const cashBoxes = await api.cashBoxes.list();
    const cashMap = new Map(cashBoxes.map(c => [c.id!, c.name]));

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const mapped = allChecks.map(chk => {
      const dueDate = new Date(chk.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const diffTime = dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let agingCategory = '0-30';
      if (diffDays < 0) agingCategory = 'overdue';
      else if (diffDays <= 30) agingCategory = '0-30';
      else if (diffDays <= 60) agingCategory = '31-60';
      else if (diffDays <= 90) agingCategory = '61-90';
      else agingCategory = '90+';

      const contactName = contactMap.get(chk.contactId) || chk.contactName || '-';
      const targetBankName = (chk as any).targetBankAccountId ? bankMap.get((chk as any).targetBankAccountId) : undefined;
      const targetCashName = (chk as any).targetCashBoxId ? cashMap.get((chk as any).targetCashBoxId) : undefined;
      const endorsedToName = (chk as any).endorsedToContactId ? contactMap.get((chk as any).endorsedToContactId) : undefined;

      return {
        ...chk,
        contactName,
        diffDays,
        agingCategory,
        targetBankName,
        targetCashName,
        endorsedToName
      };
    });

    // Filter
    const filtered = mapped.filter(chk => {
      if (options?.type && options.type !== 'all' && chk.type !== options.type) return false;
      if (options?.status && options.status !== 'all' && chk.status !== options.status) return false;
      if (options?.startDate && new Date(chk.dueDate) < new Date(options.startDate)) return false;
      if (options?.endDate && new Date(chk.dueDate) > new Date(options.endDate)) return false;
      if (options?.search) {
        const q = options.search;
        const match = 
          turkishIncludes(chk.portfolioNumber, q) ||
          turkishIncludes(chk.serialNumber, q) ||
          turkishIncludes(chk.drawer, q) ||
          turkishIncludes(chk.contactName, q) ||
          (chk.bankName && turkishIncludes(chk.bankName, q));
        if (!match) return false;
      }
      return true;
    });

    // Sort by due date
    filtered.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // Totals
    const totalAmount = filtered.reduce((sum, c) => sum + (c.amount || 0), 0);
    const activeCustomerTotal = filtered
      .filter(c => c.type.startsWith('received') && (c.status === 'portfolio' || c.status === 'bank_collection'))
      .reduce((sum, c) => sum + (c.amount || 0), 0);
    const activeSupplierTotal = filtered
      .filter(c => c.type.startsWith('given') && c.status === 'portfolio')
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    return {
      items: filtered,
      totalCount: filtered.length,
      totalAmount,
      activeCustomerTotal,
      activeSupplierTotal
    };
  }
};
