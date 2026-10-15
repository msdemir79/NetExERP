/**
 * Genel Muhasebe Yevmiye Fişi Doğrulayıcı & Denge Kontrol Modülü
 *
 * TDHP standartlarına göre çift taraflı kayıtta Borç ve Alacak eşitliği şarttır.
 * Dengesiz yevmiye kaydını kesin olarak engeller.
 */

export interface JournalLineBalanceCheck {
  accountCode?: string;
  debit?: number;
  credit?: number;
}

/**
 * Yevmiye denge toleransı.
 *
 * Tutarlar 2 haneye yuvarlandığı için borç–alacak farkı ancak 0,01'in katı
 * olabilir. Tolerans 0,05 iken **5 kuruşa kadar dengesiz** bir fiş kabul
 * ediliyordu; o fiş `isBalanced = 1` olarak damgalandığı için Mizan'da kalıcı
 * kuruş farkı oluşuyor ve `unbalancedJournals` sayacı 0 gösteriyordu.
 * Muhasebede denge toleransı para biriminin en küçük basamağını aşmamalıdır;
 * 0,005 değeri yuvarlanmış 2 haneli toplamlarda fiilen "tam eşitlik" demektir.
 */
export const JOURNAL_BALANCE_TOLERANCE = 0.005;

export class UnbalancedJournalEntryError extends Error {
  constructor(public totalDebit: number, public totalCredit: number, public difference: number) {
    super(
      `Dengesiz yevmiye kaydı engellendi: Borç toplamı (₺${totalDebit.toFixed(2)}) ile ` +
      `Alacak toplamı (₺${totalCredit.toFixed(2)}) eşit olmalıdır. Fark: ₺${Math.abs(difference).toFixed(2)}`
    );
    this.name = 'UnbalancedJournalEntryError';
  }
}

/**
 * Yevmiye fişindeki satırların borç ve alacak toplamlarını hesaplar ve eşitliğini doğrular
 */
export function validateJournalLines(
  lines: JournalLineBalanceCheck[],
  tolerance: number = JOURNAL_BALANCE_TOLERANCE
): {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
} {
  if (!lines || lines.length === 0) {
    throw new Error('Yevmiye fişi en az bir borç ve bir alacak satırı içermelidir.');
  }
  for (const line of lines) {
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);
    if (!line.accountCode?.trim() || !Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0)) {
      throw new Error('Fiş satırında geçerli hesap kodu ve tek yönde pozitif tutar bulunmalıdır.');
    }
  }

  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const roundedDebit = Number(totalDebit.toFixed(2));
  const roundedCredit = Number(totalCredit.toFixed(2));
  const difference = Number((roundedDebit - roundedCredit).toFixed(2));
  const isBalanced = Math.abs(difference) <= tolerance;

  return {
    totalDebit: roundedDebit,
    totalCredit: roundedCredit,
    difference,
    isBalanced
  };
}

/**
 * Yevmiye fişinin dengeli olduğunu garanti eder, dengesiz ise hata fırlatır
 */
export function assertBalancedJournalEntry(
  lines: JournalLineBalanceCheck[],
  tolerance: number = JOURNAL_BALANCE_TOLERANCE
): { totalDebit: number; totalCredit: number } {
  const result = validateJournalLines(lines, tolerance);

  if (!result.isBalanced) {
    throw new UnbalancedJournalEntryError(result.totalDebit, result.totalCredit, result.difference);
  }

  if (result.totalDebit <= 0 && result.totalCredit <= 0) {
    throw new Error('Yevmiye fişinin toplam tutarı sıfırdan büyük olmalıdır.');
  }

  return {
    totalDebit: result.totalDebit,
    totalCredit: result.totalCredit
  };
}
