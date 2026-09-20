import { api, commit, type Mutation } from '../api/client';
import type { 
  CollectionReceipt, 
  CashBox, 
  BankAccount, 
  CheckNote, 
  CheckStatus, 
  PaymentInstrument, 
  ReceiptType,
  JournalEntryLine
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

    const receiptNumber = await this.generateReceiptNumber(data.type);
    const receiptDate = data.date ? new Date(data.date) : new Date();
    const amount = Number(data.amount);

    let checkId: number | undefined;
    const mutations: Mutation[] = [];

    // 1. Handle Check Creation if instrument is check
    if (data.instrument === 'check') {
      if (!data.checkData) throw new Error('Çek/Senet bilgileri girilmelidir.');
      const checkType = data.type === 'collection' ? 'received_check' : 'given_check';
      const portfolioNumber = await this.generateCheckPortfolioNumber(checkType);

      // not: kimlik zinciri nedeniyle iki adımlı yazma
      checkId = await api.checks.create({
        type: checkType,
        portfolioNumber,
        serialNumber: data.checkData.serialNumber,
        bankName: data.checkData.bankName,
        branchName: data.checkData.branchName,
        drawer: data.checkData.drawer || contact.name,
        contactId: contact.id!,
        contactName: contact.name,
        issueDate: new Date(data.checkData.issueDate || receiptDate),
        dueDate: new Date(data.checkData.dueDate),
        amount,
        currency: data.currency || 'TRY',
        status: 'portfolio',
        accountCode: checkType === 'received_check' ? '101.01' : '103.01',
        notes: data.checkData.notes,
        createdAt: new Date()
      });
    }

    // 2. Update CashBox or BankAccount balance
    if (data.instrument === 'cash' && data.cashBoxId) {
      const cash = await api.cashBoxes.get(data.cashBoxId);
      if (cash) {
        const newBal = data.type === 'collection' ? cash.balance + amount : cash.balance - amount;
        mutations.push({ op: 'update', resource: 'cashBoxes', id: data.cashBoxId, data: { balance: Number(newBal.toFixed(2)) } });
      }
    } else if (data.instrument === 'bank' && data.bankAccountId) {
      const bank = await api.bankAccounts.get(data.bankAccountId);
      if (bank) {
        const newBal = data.type === 'collection' ? bank.balance + amount : bank.balance - amount;
        mutations.push({ op: 'update', resource: 'bankAccounts', id: data.bankAccountId, data: { balance: Number(newBal.toFixed(2)) } });
      }
    }

    // 3. Update Contact Balance:
    // Customer: collection decreases balance (reduces debt to us)
    // Supplier: disbursement increases balance towards 0 (reduces our payable)
    let newContactBalance = contact.balance;
    if (contact.type === 'customer') {
      newContactBalance = data.type === 'collection' ? contact.balance - amount : contact.balance + amount;
    } else if (contact.type === 'supplier') {
      newContactBalance = data.type === 'disbursement' ? contact.balance + amount : contact.balance - amount;
    } else {
      newContactBalance = data.type === 'collection' ? contact.balance - amount : contact.balance + amount;
    }

    mutations.push({
      op: 'update',
      resource: 'contacts',
      id: contact.id!,
      data: {
        balance: Number(newContactBalance.toFixed(2)),
        updatedAt: new Date()
      }
    });

    // 4. Update Invoice payment status if linked
    if (data.invoiceId) {
      const inv = await api.invoices.get(data.invoiceId);
      if (inv) {
        const prevPaid = inv.paidAmount || 0;
        const newPaid = prevPaid + amount;
        const status = newPaid >= inv.grandTotal ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
        mutations.push({
          op: 'update',
          resource: 'invoices',
          id: data.invoiceId,
          data: {
            paidAmount: Number(newPaid.toFixed(2)),
            paymentStatus: status,
            updatedAt: new Date()
          }
        });
      }
    }

    // 5. Add to Transactions table for backward compatibility
    mutations.push({
      op: 'insert',
      resource: 'transactions',
      data: {
        contactId: contact.id,
        type: data.type === 'collection' ? 'income' : 'expense',
        amount,
        description: data.description || `${data.type === 'collection' ? 'Tahsilat' : 'Tediye'} - Makbuz No: ${receiptNumber}`,
        category: data.type === 'collection' ? 'Tahsilat' : 'Ödeme',
        paymentMethod: data.instrument === 'cash' ? 'cash' : data.instrument === 'bank' ? 'bank_transfer' : data.instrument === 'check' ? 'check' : 'credit_card',
        documentNo: receiptNumber,
        date: receiptDate
      }
    });

    // 6. Save Collection Receipt record
    mutations.push({
      op: 'insert',
      resource: 'collectionReceipts',
      data: {
        receiptNumber,
        type: data.type,
        date: receiptDate,
        contactId: contact.id!,
        contactName: contact.name,
        instrument: data.instrument,
        cashBoxId: data.cashBoxId,
        bankAccountId: data.bankAccountId,
        checkId,
        amount,
        currency: data.currency || 'TRY',
        description: data.description,
        invoiceId: data.invoiceId,
        invoiceNumber: data.invoiceNumber,
        isAccounted: false,
        createdAt: new Date()
      }
    });

    const results = await commit(mutations);
    const receiptId = results[results.length - 1].id as number;

    // 7. Auto-Account in TDHP Journal Entries
    try {
      await accountingService.createReceiptJournalEntry(receiptId);
    } catch (e) {
      console.error('TDHP muhasebeleştirme hatası:', e);
    }

    return receiptId;
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
    const amount = Number(params.amount);
    const transferDate = params.date ? new Date(params.date) : new Date();

    let fromName = '';
    let fromAccountCode = '';
    let toName = '';
    let toAccountCode = '';

    const mutations: Mutation[] = [];

    // Deduct from source
    if (params.fromType === 'cash') {
      const cash = await api.cashBoxes.get(params.fromId);
      if (!cash) throw new Error('Kaynak kasa bulunamadı');
      if (cash.balance < amount) throw new Error('Kaynak kasada yeterli bakiye bulunmamaktadır.');
      mutations.push({ op: 'update', resource: 'cashBoxes', id: params.fromId, data: { balance: Number((cash.balance - amount).toFixed(2)) } });
      fromName = cash.name;
      fromAccountCode = cash.accountCode || '100.01';
    } else {
      const bank = await api.bankAccounts.get(params.fromId);
      if (!bank) throw new Error('Kaynak banka hesabı bulunamadı');
      if (bank.balance < amount) throw new Error('Kaynak banka hesabında yeterli bakiye bulunmamaktadır.');
      mutations.push({ op: 'update', resource: 'bankAccounts', id: params.fromId, data: { balance: Number((bank.balance - amount).toFixed(2)) } });
      fromName = `${bank.bankName} (${bank.iban})`;
      fromAccountCode = bank.accountCode || '102.01';
    }

    // Add to target
    if (params.toType === 'cash') {
      const cash = await api.cashBoxes.get(params.toId);
      if (!cash) throw new Error('Hedef kasa bulunamadı');
      mutations.push({ op: 'update', resource: 'cashBoxes', id: params.toId, data: { balance: Number((cash.balance + amount).toFixed(2)) } });
      toName = cash.name;
      toAccountCode = cash.accountCode || '100.01';
    } else {
      const bank = await api.bankAccounts.get(params.toId);
      if (!bank) throw new Error('Hedef banka hesabı bulunamadı');
      mutations.push({ op: 'update', resource: 'bankAccounts', id: params.toId, data: { balance: Number((bank.balance + amount).toFixed(2)) } });
      toName = `${bank.bankName} (${bank.iban})`;
      toAccountCode = bank.accountCode || '102.01';
    }

    await commit(mutations);

    // Create Journal Entry for Virman:
    // BORÇ: Hedef Hesap (Kasa veya Banka)
    // ALACAK: Kaynak Hesap (Kasa veya Banka)
    const lines: JournalEntryLine[] = [
      {
        id: `line-${Date.now()}-1`,
        accountCode: toAccountCode,
        accountName: toName,
        description: `Virman Girişi: ${params.description || `${fromName} -> ${toName}`}`,
        debit: amount,
        credit: 0
      },
      {
        id: `line-${Date.now()}-2`,
        accountCode: fromAccountCode,
        accountName: fromName,
        description: `Virman Çıkışı: ${params.description || `${fromName} -> ${toName}`}`,
        debit: 0,
        credit: amount
      }
    ];

    const entryId = await accountingService.createJournalEntry({
      entryType: 'mahsup',
      date: transferDate,
      description: `Hesaplar Arası Virman: ${fromName} -> ${toName} (₺${amount.toLocaleString('tr-TR')})`,
      documentType: 'manual',
      lines,
      status: 'approved'
    });

    return entryId;
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
    const check = await api.checks.get(checkId);
    if (!check) throw new Error('Çek/Senet kaydı bulunamadı');

    const actionDate = options?.date ? new Date(options.date) : new Date();
    const amount = check.amount;
    const targetBank = options?.targetBankAccountId ? await api.bankAccounts.get(options.targetBankAccountId) : undefined;
    const targetCash = options?.targetCashBoxId ? await api.cashBoxes.get(options.targetCashBoxId) : undefined;
    const endorsedTarget = options?.endorsedToContactId ? await api.contacts.get(options.endorsedToContactId) : undefined;
    const mutations: Mutation[] = [];

    let destAccountCode = '102.01';
    let destAccountName = 'Bankalar';

    // 1. Alınan Çek Tahsil Edildi (Portföy -> Banka veya Kasa)
    if (check.type === 'received_check' && newStatus === 'collected') {
      if (options?.targetBankAccountId) {
        if (targetBank) {
          mutations.push({ op: 'update', resource: 'bankAccounts', id: targetBank.id!, data: { balance: Number((targetBank.balance + amount).toFixed(2)) } });
          destAccountCode = targetBank.accountCode || '102.01';
          destAccountName = `${targetBank.bankName} (${targetBank.iban})`;
        }
      } else if (options?.targetCashBoxId) {
        if (targetCash) {
          mutations.push({ op: 'update', resource: 'cashBoxes', id: targetCash.id!, data: { balance: Number((targetCash.balance + amount).toFixed(2)) } });
          destAccountCode = targetCash.accountCode || '100.01';
          destAccountName = targetCash.name;
        }
      }
    }

    // 2. Alınan Çek Ciro Edildi (Tedarikçiye verildi)
    if (check.type === 'received_check' && newStatus === 'endorsed' && endorsedTarget) {
      // Reduces supplier payable (contact.balance increases towards 0)
      const newBalance = endorsedTarget.balance + amount;
      mutations.push({ op: 'update', resource: 'contacts', id: endorsedTarget.id!, data: { balance: Number(newBalance.toFixed(2)) } });
    }

    // 3. Verilen Çek Bankadan Ödendi (collected)
    if (check.type === 'given_check' && newStatus === 'collected' && targetBank) {
      mutations.push({ op: 'update', resource: 'bankAccounts', id: targetBank.id!, data: { balance: Number((targetBank.balance - amount).toFixed(2)) } });
    }

    // Update check record
    let endorsedName = check.endorsedToContactName;
    if (endorsedTarget) endorsedName = endorsedTarget.name;

    mutations.push({
      op: 'update',
      resource: 'checks',
      id: checkId,
      data: {
        status: newStatus,
        statusChangeDate: actionDate,
        statusNotes: options?.notes || check.statusNotes,
        endorsedToContactId: options?.endorsedToContactId || check.endorsedToContactId,
        endorsedToContactName: endorsedName
      }
    });

    await commit(mutations);

    // Journal Entry: BORÇ 102/100, ALACAK 101 (Alınan Çekler)
    if (check.type === 'received_check' && newStatus === 'collected') {
      await accountingService.createJournalEntry({
        entryType: 'mahsup',
        date: actionDate,
        description: `Alınan Çek Tahsilatı: ${check.portfolioNumber} (${check.drawer})`,
        documentType: 'check',
        documentId: check.id,
        documentNumber: check.portfolioNumber,
        lines: [
          {
            id: `line-${Date.now()}-1`,
            accountCode: destAccountCode,
            accountName: destAccountName,
            description: `Çek Tahsilat Bedeli - ${check.portfolioNumber}`,
            debit: amount,
            credit: 0
          },
          {
            id: `line-${Date.now()}-2`,
            accountCode: '101.01',
            accountName: 'Portföydeki Çekler',
            description: `Tahsil Edilen Çek Çıkışı - ${check.serialNumber}`,
            debit: 0,
            credit: amount
          }
        ]
      });
    }

    // Journal Entry: BORÇ 320 (Satıcılar), ALACAK 101 (Alınan Çekler)
    if (check.type === 'received_check' && newStatus === 'endorsed' && endorsedTarget) {
      await accountingService.createJournalEntry({
        entryType: 'mahsup',
        date: actionDate,
        description: `Çek Cirosu: ${check.portfolioNumber} -> ${endorsedTarget.name}`,
        documentType: 'check',
        documentId: check.id,
        documentNumber: check.portfolioNumber,
        lines: [
          {
            id: `line-${Date.now()}-1`,
            accountCode: '320.01',
            accountName: `Yurtiçi Mal ve Hizmet Tedarikçileri (${endorsedTarget.name})`,
            description: `Çek Cirosu ile Borç Ödemesi - ${check.portfolioNumber}`,
            debit: amount,
            credit: 0,
            contactId: endorsedTarget.id
          },
          {
            id: `line-${Date.now()}-2`,
            accountCode: '101.01',
            accountName: 'Portföydeki Çekler',
            description: `Ciro Edilen Çek Çıkışı - ${check.serialNumber}`,
            debit: 0,
            credit: amount
          }
        ]
      });
    }

    // Journal Entry: BORÇ 103 (Verilen Çekler), ALACAK 102 (Bankalar)
    if (check.type === 'given_check' && newStatus === 'collected' && targetBank) {
      await accountingService.createJournalEntry({
        entryType: 'mahsup',
        date: actionDate,
        description: `Verilen Çek Bankadan Ödendi: ${check.portfolioNumber} (${targetBank.bankName})`,
        documentType: 'check',
        documentId: check.id,
        documentNumber: check.portfolioNumber,
        lines: [
          {
            id: `line-${Date.now()}-1`,
            accountCode: '103.01',
            accountName: 'Verilen Firma Çekleri',
            description: `Ödenen Çek Kapanışı - ${check.serialNumber}`,
            debit: amount,
            credit: 0
          },
          {
            id: `line-${Date.now()}-2`,
            accountCode: targetBank.accountCode || '102.01',
            accountName: `${targetBank.bankName} (${targetBank.iban})`,
            description: `Çek Ödemesi - ${check.portfolioNumber}`,
            debit: 0,
            credit: amount
          }
        ]
      });
    }
  },

  // --- Kasa (CashBox) Düzenleme ve Silme İşlemleri ---
  async updateCashBox(id: number, data: Partial<CashBox>, syncAccount = true) {
    const existing = await api.cashBoxes.get(id);
    if (!existing) throw new Error('Kasa bulunamadı.');

    const result = await api.cashBoxes.update(id, {
      ...data,
      balance: data.balance !== undefined ? Number(data.balance) : existing.balance
    });

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

    const result = await api.bankAccounts.update(id, {
      ...data,
      balance: data.balance !== undefined ? Number(data.balance) : existing.balance
    });

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
