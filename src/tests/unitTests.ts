/**
 * ProERP Çekirdek İş Mantığı Birim Testleri
 * 
 * 1. Bordro & Vergi Matrahı Testleri (2026 Standartları, Kuruş Duyarlılığı)
 * 2. Yevmiye & TDHP Denge Testleri
 * 3. Stok & Maliyet Testleri
 */

import { 
  calculatePayroll2026, 
  HR_CONSTANTS_2026, 
  toKurus, 
  fromKurus, 
  calculateProgressiveIncomeTaxKurus 
} from '../lib/payrollCalculator';
import { 
  validateJournalLines, 
  assertBalancedJournalEntry, 
  UnbalancedJournalEntryError 
} from '../lib/accountingValidator';
import { 
  calculateNewStock, 
  isStockCritical, 
  calculateWeightedAverageCost, 
  calculateAvailableLotQuantity 
} from '../lib/inventoryCalculator';

let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    HATA: ${err.message}`);
    failedTests++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Beklenen: ${expected}, Alınan: ${actual}`);
      }
    },
    toBeCloseTo(expected: number, delta: number = 0.05) {
      if (Math.abs(actual - expected) > delta) {
        throw new Error(`Beklenen: ~${expected} (±${delta}), Alınan: ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (!(actual > expected)) {
        throw new Error(`Beklenen: > ${expected}, Alınan: ${actual}`);
      }
    }
  };
}

console.log('\n======================================================');
console.log(' PROERP BİRİM TESTLERİ ÇALIŞTIRILIYOR (UNIT TESTS)');
console.log('======================================================\n');

// -----------------------------------------------------------------
// 1. BORDRO & VERGİ MATRAHI TESTLERİ (2026 STANDARTLARI)
// -----------------------------------------------------------------
console.log('📌 1. BORDRO VE 2026 VERGİ MATRAHI TESTLERİ');

test('Kuruş dönüştürücüleri (toKurus & fromKurus) hassas çalışmalı', () => {
  expect(toKurus(1234.56)).toBe(123456);
  expect(fromKurus(123456)).toBe(1234.56);
  expect(toKurus(0.01)).toBe(1);
  expect(fromKurus(1)).toBe(0.01);
});

test('2026 Asgari ücretli SGK primi ve net maaş kuruş bazında hesaplanmalı', () => {
  const result = calculatePayroll2026({
    grossSalaryTL: HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL,
    daysWorked: 26,
    weeklyRestDays: 4,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    overtimeHours: 0,
    sgkStatus: 'sgk_li',
    advanceDeductionTL: 0
  });

  // Brüt asgari ücret için işçi payı: %14 SGK + %1 İşsizlik = %15
  const expectedWorkerSgkAndUnemp = HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL * 0.15;
  expect(result.employeeSgkShare + result.employeeUnemploymentShare).toBeCloseTo(expectedWorkerSgkAndUnemp, 0.05);

  // Asgari ücret istisnası ile net asgari ücret tam kuruş eşleşmeli
  expect(result.netSalary).toBeCloseTo(HR_CONSTANTS_2026.MIN_WAGE_NET_TL, 1.0);
  expect(result.totalGrossPayKurus).toBe(toKurus(HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL));
});

test('Kümülatif vergi matrahı arttığında vergi dilimi %15\'ten %20\'ye geçmeli', () => {
  // İlk dilim tavanı: 158.000 TL (15.800.000 Kuruş)
  // 1. Durum: Matrah 50.000 TL (5.000.000 Kuruş), Aylık 20.000 TL (2.000.000 Kuruş) -> %15
  const tax1 = calculateProgressiveIncomeTaxKurus(5000000, 2000000);
  expect(tax1.effectiveRate).toBe(15);
  expect(tax1.taxKurus).toBe(300000); // 20.000 TL * 0.15 = 3.000 TL (300.000 Kuruş)

  // 2. Durum: Önceki kümülatif 150.000 TL, yeni matrah 20.000 TL -> 158.000 TL sınırını aşar
  // 8.000 TL'si %15'ten (1.200 TL = 120.000 Kuruş), kalan 12.000 TL'si %20'den (2.400 TL = 240.000 Kuruş)
  // Toplam: 360.000 Kuruş
  const tax2 = calculateProgressiveIncomeTaxKurus(15000000, 2000000);
  expect(tax2.taxKurus).toBe(360000);
  expect(tax2.effectiveRate).toBe(18); // 360.000 / 2.000.000 = %18 efektif oran
});

test('Avans kesintisi net ödemeden tam olarak düşmeli', () => {
  const resultWithAdvance = calculatePayroll2026({
    grossSalaryTL: 45000,
    daysWorked: 26,
    weeklyRestDays: 4,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    overtimeHours: 0,
    sgkStatus: 'sgk_li',
    advanceDeductionTL: 5000
  });

  const resultWithoutAdvance = calculatePayroll2026({
    grossSalaryTL: 45000,
    daysWorked: 26,
    weeklyRestDays: 4,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    absentDays: 0,
    overtimeHours: 0,
    sgkStatus: 'sgk_li',
    advanceDeductionTL: 0
  });

  expect(resultWithAdvance.netSalary).toBeCloseTo(resultWithoutAdvance.netSalary - 5000, 0.05);
  expect(resultWithAdvance.advanceDeduction).toBe(5000);
});

// -----------------------------------------------------------------
// 2. YEVMİYE VE TDHP DENGE TESTLERİ
// -----------------------------------------------------------------
console.log('\n📌 2. GENEL MUHASEBE YEVMİYE FİŞİ DENGE TESTLERİ');

test('Borç ve Alacak eşit olduğunda yevmiye geçerli sayılmalı', () => {
  const lines = [
    { accountCode: '100.01', debit: 15000, credit: 0 },
    { accountCode: '120.01', debit: 0, credit: 15000 }
  ];

  const validation = validateJournalLines(lines);
  expect(validation.isBalanced).toBe(true);
  expect(validation.difference).toBe(0);

  const assertion = assertBalancedJournalEntry(lines);
  expect(assertion.totalDebit).toBe(15000);
  expect(assertion.totalCredit).toBe(15000);
});

test('Borç ve Alacak dengesiz olduğunda UnbalancedJournalEntryError fırlatılmalı', () => {
  const lines = [
    { accountCode: '100.01', debit: 20000, credit: 0 },
    { accountCode: '120.01', debit: 0, credit: 18000 } // 2000 TL eksik alacak
  ];

  const validation = validateJournalLines(lines);
  expect(validation.isBalanced).toBe(false);
  expect(validation.difference).toBe(2000);

  let threwExpected = false;
  try {
    assertBalancedJournalEntry(lines);
  } catch (err: any) {
    if (err instanceof UnbalancedJournalEntryError) {
      threwExpected = true;
    }
  }

  if (!threwExpected) {
    throw new Error('Dengesiz yevmiye kaydında UnbalancedJournalEntryError fırlatılmadı!');
  }
});

test('Sıfır tutarlı veya boş fişler reddedilmeli', () => {
  let threwEmpty = false;
  try {
    assertBalancedJournalEntry([]);
  } catch {
    threwEmpty = true;
  }
  expect(threwEmpty).toBe(true);

  let threwZero = false;
  try {
    assertBalancedJournalEntry([
      { debit: 0, credit: 0 },
      { debit: 0, credit: 0 }
    ]);
  } catch {
    threwZero = true;
  }
  expect(threwZero).toBe(true);
});

// -----------------------------------------------------------------
// 3. STOK VE MALİYET HESAPLAMA TESTLERİ
// -----------------------------------------------------------------
console.log('\n📌 3. STOK HAREKETİ VE MALİYET TESTLERİ');

test('Stok girişi ve çıkışı doğru hesaplanmalı', () => {
  const stockAfterIn = calculateNewStock(100, 'in', 50);
  expect(stockAfterIn).toBe(150);

  const stockAfterOut = calculateNewStock(150, 'out', 30);
  expect(stockAfterOut).toBe(120);

  const stockAfterProdIn = calculateNewStock(120, 'production_in', 40);
  expect(stockAfterProdIn).toBe(160);
});

test('Yetersiz stokta negatif izin verilmediğinde hata fırlatmalı', () => {
  let threwInsufficient = false;
  try {
    calculateNewStock(20, 'out', 50, false);
  } catch (err: any) {
    if (err.message.includes('Yetersiz stok')) {
      threwInsufficient = true;
    }
  }
  expect(threwInsufficient).toBe(true);
});

test('Ağırlıklı Ortalama Maliyet (AOM) doğru hesaplanmalı', () => {
  // Mevcut: 100 adet @ 50 TL = 5.000 TL
  // Giren: 50 adet @ 80 TL = 4.000 TL
  // Toplam: 150 adet, 9.000 TL -> Yeni birim maliyet: 9.000 / 150 = 60 TL
  const newCost = calculateWeightedAverageCost(100, 50, 50, 80);
  expect(newCost).toBe(60);
});

test('Kritik stok seviyesi doğru tespit edilmeli', () => {
  expect(isStockCritical(10, 15)).toBe(true);  // 10 <= 15 -> Kritik
  expect(isStockCritical(15, 15)).toBe(true);  // 15 <= 15 -> Kritik
  expect(isStockCritical(20, 15)).toBe(false); // 20 > 15 -> Normal
});

test('Parti ve lot rezervasyonu hesaplaması doğru olmalı', () => {
  expect(calculateAvailableLotQuantity(500, 150)).toBe(350);
  expect(calculateAvailableLotQuantity(100, 120)).toBe(0); // Negatife düşmez, 0 döner
});

console.log('\n======================================================');
console.log(` TEST RAPORU: ${passedTests} BAŞARILI, ${failedTests} HATALI`);
console.log('======================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
