/**
 * Genel Muhasebe Yevmiye Fişi Doğrulayıcı & Denge Kontrol Modülü
 *
 * TDHP standartlarına göre çift taraflı kayıtta Borç ve Alacak eşitliği şarttır.
 * Dengesiz yevmiye kaydını kesin olarak engeller.
 */

export interface JournalLineBalanceCheck {
  debit?: number;
  credit?: number;
}

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
  tolerance: number = 0.05
): {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
} {
  if (!lines || lines.length === 0) {
    throw new Error('Yevmiye fişi en az bir borç ve bir alacak satırı içermelidir.');
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
  tolerance: number = 0.05
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
