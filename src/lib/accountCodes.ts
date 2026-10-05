/**
 * TDHP hesap kodu yardımcıları — istemci ve sunucu arasında paylaştırılır.
 *
 * Mizan hesabı eskiden istemcide, tüm journalEntries + satırları indirilip
 * döngülerle yapılıyordu. Artık satır toplamları sunucuda SQL GROUP BY ile
 * hesaplanır; bu dosyadaki `buildMizanRows` yalnızca KESİN hesap kodu bazında
 * önceden toplanmış tutarları alır ve üst kodlara (ana/grup/sınıf) yuvarlayıp
 * mizan satırlarını üretir. Toplama birleşmeli olduğundan sonuç, eski satır-satır
 * toplamanın birebir eşdeğeridir.
 */

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

export type MizanLevelFilter = 'all' | 'class' | 'group' | 'main' | 'sub';

/** Mizan satırı üretimi için gereken asgari hesap bilgisi. */
export interface MizanAccount {
  code: string;
  name: string;
  type: string;
  level: number;
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

/**
 * Mizan satırlarını hesaplar.
 *
 * @param rawAccounts   Hesap planı (kod, ad, tip, seviye). Kodu aynı olanlar teke indirilir.
 * @param perCodeTotals journalEntries satırlarının KESİN accountCode'a göre önceden
 *                      toplanmış borç/alacak tutarları (sunucuda SQL GROUP BY ile).
 * @param options       onlyWithBalance / levelFilter filtreleri.
 */
export function buildMizanRows(
  rawAccounts: MizanAccount[],
  perCodeTotals: Map<string, { debit: number; credit: number }>,
  options?: { onlyWithBalance?: boolean; levelFilter?: MizanLevelFilter },
): MizanRow[] {
  // Kodu aynı olan hesapları teke indir (ilk kayıt kazanır).
  const uniqueMap = new Map<string, MizanAccount>();
  rawAccounts.forEach((acc) => {
    const codeKey = acc.code.trim();
    if (!uniqueMap.has(codeKey)) {
      uniqueMap.set(codeKey, acc);
    }
  });
  const accounts = Array.from(uniqueMap.values());

  // Kesin kod toplamını üst kodlara (ana hesap / grup / sınıf) yuvarla.
  const totalsMap = new Map<string, { totalDebit: number; totalCredit: number }>();
  const add = (code: string, debit: number, credit: number) => {
    const current = totalsMap.get(code) || { totalDebit: 0, totalCredit: 0 };
    current.totalDebit += debit;
    current.totalCredit += credit;
    totalsMap.set(code, current);
  };

  perCodeTotals.forEach((t, code) => {
    const debit = Number(t.debit) || 0;
    const credit = Number(t.credit) || 0;

    add(code, debit, credit);

    // Üst kodlara yayılım (örn. 100.01 -> 100, 10, 1)
    const parts = code.split('.');
    const mainCode = parts[0];
    if (mainCode && mainCode !== code) {
      add(mainCode, debit, credit);
    }
    if (mainCode.length >= 2) {
      const groupCode = mainCode.substring(0, 2);
      if (groupCode !== mainCode) {
        add(groupCode, debit, credit);
      }
    }
    const classCode = mainCode.substring(0, 1);
    if (classCode !== mainCode) {
      add(classCode, debit, credit);
    }
  });

  const rows: MizanRow[] = accounts.map((acc) => {
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
      creditBalance,
    };
  });

  // TDHP kod sırasına göre diz (1, 10, 100, 100.01, 100.01.001 ...)
  rows.sort((a, b) => compareAccountCodes(a.code, b.code));

  return rows.filter((r) => {
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
}
