export function assertReceiptInput(input: { type: string; instrument: string; amount: number; cashBoxId?: number | null; bankAccountId?: number | null; currency?: string }): void {
  if (!['collection', 'disbursement'].includes(input.type)) throw new Error('Geçersiz makbuz tipi.');
  if (!['cash', 'bank', 'check', 'credit_card'].includes(input.instrument)) throw new Error('Geçersiz ödeme aracı.');
  if (!Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.00001) throw new Error('Tutar pozitif ve en fazla iki ondalık basamaklı olmalıdır.');
  if (input.instrument === 'cash' && !(Number.isSafeInteger(input.cashBoxId) && input.cashBoxId! > 0)) throw new Error('Nakit işlem için kasa seçilmelidir.');
  if (input.instrument === 'bank' && !(Number.isSafeInteger(input.bankAccountId) && input.bankAccountId! > 0)) throw new Error('Banka işlemi için hesap seçilmelidir.');
  if (input.instrument !== 'cash' && input.cashBoxId) throw new Error('Bu ödeme aracında kasa kullanılamaz.');
  if (input.instrument !== 'bank' && input.bankAccountId) throw new Error('Bu ödeme aracında banka hesabı kullanılamaz.');
  if ((input.currency || 'TRY') !== 'TRY') throw new Error('Döviz muhasebesi etkin değil. Finans işlemleri TRY olarak yapılmalıdır.');
}

export function assertInvoicePayment(invoice: { contactId: number; type: string; status: string; currency?: string; grandTotal: number; paidAmount: number }, payment: { contactId: number; type: string; amount: number; currency?: string }): void {
  if (Number(invoice.contactId) !== payment.contactId) throw new Error('Fatura seçilen cari hesaba ait değil.');
  if (invoice.type !== (payment.type === 'collection' ? 'sales' : 'purchase')) throw new Error('Makbuz yönü fatura tipiyle uyuşmuyor.');
  if (invoice.status !== 'issued') throw new Error('Yalnızca kesinleşmiş aktif faturaya ödeme bağlanabilir.');
  if ((invoice.currency || 'TRY') !== (payment.currency || 'TRY')) throw new Error('Fatura ve ödeme para birimleri uyuşmuyor.');
  const remaining = Math.round((Number(invoice.grandTotal) - Number(invoice.paidAmount || 0)) * 100);
  if (Math.round(payment.amount * 100) > remaining) throw new Error('Ödeme fatura kalanını aşamaz. Fazla tutarı ayrı cari avans olarak kaydedin.');
}
