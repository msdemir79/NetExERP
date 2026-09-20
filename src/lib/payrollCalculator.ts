/**
 * 2026 Türkiye Bordro ve Vergi Parametreleri & Hassas Kuruş Hesaplayıcısı
 *
 * Tutarlar hesaplama süresince tam sayı (integer) kuruş olarak tutulur.
 * Kümülatif vergi matrahı geçmiş dönemler üzerinden hesaplanır ve
 * 2026 Gelir Vergisi Dilimlerine göre artan oranlı uygulanır.
 */

// 2026 Yılı Yasal Parametreleri (TL ve Kuruş Karşılıkları)
export const HR_CONSTANTS_2026 = {
  // Oranlar
  SGK_WORKER_RATE: 0.14,            // %14 SGK İşçi Payı
  UNEMPLOYMENT_WORKER_RATE: 0.01,   // %1 İşsizlik İşçi Payı
  SGK_EMPLOYER_RATE: 0.155,         // %15.5 SGK İşveren Payı (5 puanlık Hazine teşviki ile)
  UNEMPLOYMENT_EMPLOYER_RATE: 0.02, // %2 İşveren İşsizlik Payı
  STAMP_TAX_RATE: 0.00759,          // Binde 7.59 Damga Vergisi

  // Asgari Ücret (2026 Standartları)
  MIN_WAGE_GROSS_TL: 26005.00,
  MIN_WAGE_NET_TL: 22104.00,
  MIN_WAGE_GROSS_KURUS: 2600500,
  MIN_WAGE_NET_KURUS: 2210400,

  // Asgari Ücret Vergi ve Damga İstisnası (Aylık Maksimum)
  MIN_WAGE_INCOME_TAX_EXEMPTION_TL: 3315.64,
  MIN_WAGE_INCOME_TAX_EXEMPTION_KURUS: 331564,
  MIN_WAGE_STAMP_TAX_EXEMPTION_TL: 197.38,
  MIN_WAGE_STAMP_TAX_EXEMPTION_KURUS: 19738,

  // SGK Tavanı (Brüt Asgari Ücretin 7.5 Katı)
  SGK_CEILING_TL: 195037.50,
  SGK_CEILING_KURUS: 19503750,

  // Standart Aylık Çalışma Saati
  MONTHLY_LEGAL_WORK_HOURS: 225,

  // 2026 Ücret Gelir Vergisi Dilimleri (Kuruş cinsinden)
  TAX_BRACKETS_2026: [
    { limitKurus: 15800000, rate: 0.15 },    // 158.000 TL'ye kadar %15
    { limitKurus: 33000000, rate: 0.20 },    // 330.000 TL'ye kadar %20
    { limitKurus: 120000000, rate: 0.27 },   // 1.200.000 TL'ye kadar %27
    { limitKurus: 430000000, rate: 0.35 },   // 4.300.000 TL'ye kadar %35
    { limitKurus: Infinity, rate: 0.40 },    // 4.300.000 TL üzeri %40
  ]
};

/**
 * TL tutarını tam sayı kuruşa dönüştürür (Integer cent conversion)
 */
export function toKurus(tl: number): number {
  if (!tl || isNaN(tl)) return 0;
  return Math.round(tl * 100);
}

/**
 * Kuruş tutarını 2 basamaklı TL float değerine dönüştürür
 */
export function fromKurus(kurus: number): number {
  if (!kurus || isNaN(kurus)) return 0;
  return Number((Math.round(kurus) / 100).toFixed(2));
}

/**
 * 2026 Kümülatif Vergi Matrahına göre Gelir Vergisi hesaplar (Kuruş cinsinden)
 */
export function calculateProgressiveIncomeTaxKurus(
  previousCumulativeBaseKurus: number,
  monthlyBaseKurus: number
): { taxKurus: number; effectiveRate: number; newCumulativeBaseKurus: number } {
  if (monthlyBaseKurus <= 0) {
    return {
      taxKurus: 0,
      effectiveRate: 15,
      newCumulativeBaseKurus: previousCumulativeBaseKurus
    };
  }

  const startBase = Math.max(0, previousCumulativeBaseKurus);
  const endBase = startBase + monthlyBaseKurus;
  let taxKurus = 0;
  let lowerBound = 0;

  for (const bracket of HR_CONSTANTS_2026.TAX_BRACKETS_2026) {
    const upperBound = bracket.limitKurus;

    // Bu dilime düşen aralık kesişimini hesapla
    const bracketStart = Math.max(startBase, lowerBound);
    const bracketEnd = Math.min(endBase, upperBound);

    if (bracketEnd > bracketStart) {
      const taxableInBracket = bracketEnd - bracketStart;
      taxKurus += Math.round(taxableInBracket * bracket.rate);
    }

    if (endBase <= upperBound) break;
    lowerBound = upperBound;
  }

  const effectiveRate = monthlyBaseKurus > 0 
    ? Number(((taxKurus / monthlyBaseKurus) * 100).toFixed(1))
    : 15;

  return {
    taxKurus,
    effectiveRate,
    newCumulativeBaseKurus: endBase
  };
}

export interface PayrollCalculationInput {
  grossSalaryTL: number;
  salaryType?: 'monthly' | 'daily' | 'hourly';
  sgkStatus?: 'sgk_li' | 'sgk_siz';
  daysWorked: number;
  weeklyRestDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  overtimeHours: number;
  bonusPayTL?: number;
  advanceDeductionTL?: number;
  otherDeductionsTL?: number;
  previousCumulativeTaxBaseTL?: number;
}

export interface PayrollCalculationResult {
  // TL Değerleri (2 basamak float)
  baseSalary: number;
  basePay: number;
  overtimePay: number;
  bonusPay: number;
  totalGrossPay: number;
  employeeSgkShare: number;
  employeeUnemploymentShare: number;
  incomeTaxBase: number;
  previousCumulativeTaxBase: number;
  cumulativeTaxBase: number;
  appliedTaxRate: number;
  incomeTax: number;
  stampTax: number;
  totalLegalDeductions: number;
  advanceDeduction: number;
  otherDeductions: number;
  netSalary: number;
  employerSgkShare: number;
  employerUnemploymentShare: number;
  totalEmployerCost: number;

  // Tam Sayı Kuruş Değerleri (Hassas Integer)
  totalGrossPayKurus: number;
  employeeSgkShareKurus: number;
  employeeUnemploymentShareKurus: number;
  incomeTaxKurus: number;
  stampTaxKurus: number;
  netSalaryKurus: number;
  totalEmployerCostKurus: number;
}

/**
 * 2026 Standartlarına uygun SGK'lı veya SGK'sız Personel Bordro Hesabı
 */
export function calculatePayroll2026(input: PayrollCalculationInput): PayrollCalculationResult {
  const isSgkLi = input.sgkStatus !== 'sgk_siz';
  const effectiveDays = Math.max(0, input.daysWorked + input.weeklyRestDays + input.paidLeaveDays);
  const bonusPayKurus = toKurus(input.bonusPayTL || 0);
  const advanceDeductionKurus = toKurus(input.advanceDeductionTL || 0);
  const otherDeductionsKurus = toKurus(input.otherDeductionsTL || 0);
  const prevCumulativeTaxBaseKurus = toKurus(input.previousCumulativeTaxBaseTL || 0);

  if (isSgkLi) {
    // SGK'lı Hesaplama
    const grossSalaryKurus = toKurus(input.grossSalaryTL || HR_CONSTANTS_2026.MIN_WAGE_GROSS_TL);
    
    // Günlük ve Saatlik Brüt
    const hourlyGrossKurus = Math.round(grossSalaryKurus / HR_CONSTANTS_2026.MONTHLY_LEGAL_WORK_HOURS);

    // Tam ay (30 gün) çalışan personel için tam brüt maaş, eksik gün çalışanlar için oransal brüt
    const basePayKurus = effectiveDays >= 30 
      ? grossSalaryKurus 
      : Math.round((grossSalaryKurus * effectiveDays) / 30);
    const overtimePayKurus = Math.round(hourlyGrossKurus * 1.5 * (input.overtimeHours || 0));
    const totalGrossPayKurus = basePayKurus + overtimePayKurus + bonusPayKurus;

    // SGK Tavanı kontrolü
    const sgkBaseKurus = Math.min(totalGrossPayKurus, HR_CONSTANTS_2026.SGK_CEILING_KURUS);

    // SGK İşçi (%14) ve İşsizlik İşçi (%1)
    const employeeSgkShareKurus = Math.round(sgkBaseKurus * HR_CONSTANTS_2026.SGK_WORKER_RATE);
    const employeeUnemploymentShareKurus = Math.round(sgkBaseKurus * HR_CONSTANTS_2026.UNEMPLOYMENT_WORKER_RATE);

    // Gelir Vergisi Matrahı
    const incomeTaxBaseKurus = Math.max(0, totalGrossPayKurus - employeeSgkShareKurus - employeeUnemploymentShareKurus);

    // Kümülatif Vergi Matrahı Hesabı (Artan Oranlı Dilimler)
    const { taxKurus: rawIncomeTaxKurus, effectiveRate, newCumulativeBaseKurus } = 
      calculateProgressiveIncomeTaxKurus(prevCumulativeTaxBaseKurus, incomeTaxBaseKurus);

    // Asgari Ücret Vergi İstisnası Düşümü
    const incomeTaxKurus = Math.max(0, rawIncomeTaxKurus - HR_CONSTANTS_2026.MIN_WAGE_INCOME_TAX_EXEMPTION_KURUS);

    // Damga Vergisi & İstisna Düşümü
    const rawStampTaxKurus = Math.round(totalGrossPayKurus * HR_CONSTANTS_2026.STAMP_TAX_RATE);
    const stampTaxKurus = Math.max(0, rawStampTaxKurus - HR_CONSTANTS_2026.MIN_WAGE_STAMP_TAX_EXEMPTION_KURUS);

    // Toplam Yasal Kesintiler
    const totalLegalDeductionsKurus = employeeSgkShareKurus + employeeUnemploymentShareKurus + incomeTaxKurus + stampTaxKurus;

    // Net Maaş
    const netSalaryKurus = Math.max(0, totalGrossPayKurus - totalLegalDeductionsKurus - advanceDeductionKurus - otherDeductionsKurus);

    // İşveren Maliyeti (SGK İşveren %15.5 + İşsizlik %2)
    const employerSgkShareKurus = Math.round(sgkBaseKurus * HR_CONSTANTS_2026.SGK_EMPLOYER_RATE);
    const employerUnemploymentShareKurus = Math.round(sgkBaseKurus * HR_CONSTANTS_2026.UNEMPLOYMENT_EMPLOYER_RATE);
    const totalEmployerCostKurus = totalGrossPayKurus + employerSgkShareKurus + employerUnemploymentShareKurus;

    return {
      baseSalary: fromKurus(grossSalaryKurus),
      basePay: fromKurus(basePayKurus),
      overtimePay: fromKurus(overtimePayKurus),
      bonusPay: fromKurus(bonusPayKurus),
      totalGrossPay: fromKurus(totalGrossPayKurus),
      employeeSgkShare: fromKurus(employeeSgkShareKurus),
      employeeUnemploymentShare: fromKurus(employeeUnemploymentShareKurus),
      incomeTaxBase: fromKurus(incomeTaxBaseKurus),
      previousCumulativeTaxBase: fromKurus(prevCumulativeTaxBaseKurus),
      cumulativeTaxBase: fromKurus(newCumulativeBaseKurus),
      appliedTaxRate: effectiveRate,
      incomeTax: fromKurus(incomeTaxKurus),
      stampTax: fromKurus(stampTaxKurus),
      totalLegalDeductions: fromKurus(totalLegalDeductionsKurus),
      advanceDeduction: fromKurus(advanceDeductionKurus),
      otherDeductions: fromKurus(otherDeductionsKurus),
      netSalary: fromKurus(netSalaryKurus),
      employerSgkShare: fromKurus(employerSgkShareKurus),
      employerUnemploymentShare: fromKurus(employerUnemploymentShareKurus),
      totalEmployerCost: fromKurus(totalEmployerCostKurus),

      totalGrossPayKurus,
      employeeSgkShareKurus,
      employeeUnemploymentShareKurus,
      incomeTaxKurus,
      stampTaxKurus,
      netSalaryKurus,
      totalEmployerCostKurus
    };
  } else {
    // SGK'sız / Günlük Yevmiyeli Personel (Fiili Net Hakediş)
    let basePayKurus = 0;
    let hourlyRateKurus = 0;

    if (input.salaryType === 'daily') {
      const dailyRateKurus = toKurus(input.grossSalaryTL || 1500);
      const payableDays = Math.max(0, input.daysWorked + input.paidLeaveDays);
      basePayKurus = dailyRateKurus * payableDays;
      hourlyRateKurus = Math.round(dailyRateKurus / 8);
    } else if (input.salaryType === 'hourly') {
      hourlyRateKurus = toKurus(input.grossSalaryTL || 200);
      basePayKurus = (input.daysWorked * 8) * hourlyRateKurus;
    } else {
      const monthlyNetKurus = toKurus(input.grossSalaryTL || 30000);
      const dailyRateKurus = Math.round(monthlyNetKurus / 30);
      basePayKurus = dailyRateKurus * effectiveDays;
      hourlyRateKurus = Math.round(monthlyNetKurus / HR_CONSTANTS_2026.MONTHLY_LEGAL_WORK_HOURS);
    }

    const overtimePayKurus = Math.round(hourlyRateKurus * 1.5 * (input.overtimeHours || 0));
    const totalGrossPayKurus = basePayKurus + overtimePayKurus + bonusPayKurus;
    const netSalaryKurus = Math.max(0, totalGrossPayKurus - advanceDeductionKurus - otherDeductionsKurus);

    return {
      baseSalary: input.grossSalaryTL || 0,
      basePay: fromKurus(basePayKurus),
      overtimePay: fromKurus(overtimePayKurus),
      bonusPay: fromKurus(bonusPayKurus),
      totalGrossPay: fromKurus(totalGrossPayKurus),
      employeeSgkShare: 0,
      employeeUnemploymentShare: 0,
      incomeTaxBase: 0,
      previousCumulativeTaxBase: 0,
      cumulativeTaxBase: 0,
      appliedTaxRate: 0,
      incomeTax: 0,
      stampTax: 0,
      totalLegalDeductions: 0,
      advanceDeduction: fromKurus(advanceDeductionKurus),
      otherDeductions: fromKurus(otherDeductionsKurus),
      netSalary: fromKurus(netSalaryKurus),
      employerSgkShare: 0,
      employerUnemploymentShare: 0,
      totalEmployerCost: fromKurus(totalGrossPayKurus),

      totalGrossPayKurus,
      employeeSgkShareKurus: 0,
      employeeUnemploymentShareKurus: 0,
      incomeTaxKurus: 0,
      stampTaxKurus: 0,
      netSalaryKurus,
      totalEmployerCostKurus: totalGrossPayKurus
    };
  }
}
