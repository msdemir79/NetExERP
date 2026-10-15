import type { Employee, AttendanceRecord, AttendanceStatus, AdvanceRequest, HRModuleSettings, PayrollRecord } from '../types';
import { HR_DEFAULT_PARAMS } from './hrDefaults';
import { calculateProgressiveIncomeTaxKurus, toKurus, fromKurus, HR_CONSTANTS_2026, minimumWageTaxExemptionKurus, grossForNet2026 } from './payrollCalculator';
export function calculateEmployeePayroll(
    employee: Employee,
    attendanceList: AttendanceRecord[],
    advances: AdvanceRequest[],
    month: number,
    year: number,
    params: HRModuleSettings = HR_DEFAULT_PARAMS,
    previousCumulativeTaxBase = 0
  ): Omit<PayrollRecord, 'id' | 'createdAt'> {
    if (year !== 2026) throw new Error(`${year} yılı için doğrulanmış bordro parametreleri tanımlı değil.`);
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Puantaj kayıtlarını tarih bazlı haritaya al
    const attMap = new Map<string, AttendanceRecord>();
    attendanceList.forEach(att => {
      if (att.date) attMap.set(att.date, att);
    });

    const weekendDays = params.weekendDays ?? [0];
    const sgkWorkerRate = params.sgkEmployeeRate / 100;
    const unemploymentWorkerRate = params.unemploymentEmployeeRate / 100;
    const sgkEmployerRate = params.sgkEmployerRate / 100;
    const unemploymentEmployerRate = params.unemploymentEmployerRate / 100;
    const incomeTaxRate = params.incomeTaxRate / 100;
    const stampTaxRate = params.stampTaxPerMille / 1000;

    let daysWorked = 0;
    let halfDays = 0;
    let weeklyRestDays = 0;
    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    let absentDays = 0;
    let overtimeWeekdayHours = 0;
    let overtimeWeekendHours = 0;

    // Ayın 1'inden son gününe kadar her takvim gününü değerlendir
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const rec = attMap.get(dateStr);
      const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0: Pazar
      const isWeekend = weekendDays.includes(dayOfWeek);

      // Kayıt yoksa: hafta tatili günleri hafta tatili, diğer günler fiili çalışma varsayılır
      const status: AttendanceStatus = rec?.status || (isWeekend ? 'weekly_rest' : 'present');

      if (status === 'present') {
        daysWorked += 1;
      } else if (status === 'half_day') {
        halfDays += 1;
        daysWorked += 0.5;
      } else if (status === 'weekly_rest') {
        weeklyRestDays += 1;
      } else if (status === 'paid_leave' || status === 'public_holiday' || status === 'sick_leave') {
        paidLeaveDays += 1;
      } else if (status === 'unpaid_leave') {
        unpaidLeaveDays += 1;
      } else if (status === 'absent') {
        absentDays += 1;
      }

      if (rec?.overtimeHours) {
        if (isWeekend || status === 'public_holiday') {
          overtimeWeekendHours += rec.overtimeHours;
        } else {
          overtimeWeekdayHours += rec.overtimeHours;
        }
      }
    }

    const overtimeHours = overtimeWeekdayHours + overtimeWeekendHours;

    // Ücret kesintisine tabi toplam gün sayısı (devamsızlık + ücretsiz izin + yarım gün açığı)
    const totalDeductedDays = absentDays + unpaidLeaveDays + (halfDays * 0.5);

    // Toplam Avans Kesintisi
    const employeeAdvances = advances.filter(a => a.employeeId === employee.id && a.status === 'paid');
    const advanceDeduction = employeeAdvances.reduce((sum, a) => sum + a.amount, 0);

    const isSgkLi = employee.sgkStatus === 'sgk_li';

    // -------------------------------------------------------------
    // SENARYO 1: SGK'LI PERSONEL (Bordrolu / Yasal Kesintili Hesaplama)
    // -------------------------------------------------------------
    if (isSgkLi) {
      // Netten Brüte veya Brüt bazlı hesaplama
      let grossSalary = 0;
      if (employee.salaryType === 'monthly_net') {
        const targetNet = employee.baseSalary || 30000;
        grossSalary = grossForNet2026(targetNet, previousCumulativeTaxBase, month);
      } else {
        grossSalary = employee.baseSalary;
      }

      // Çalışılan güne oranla temel hak ediş (30 gün standardı)
      const standardDays = 30;
      const effectiveDays = Math.max(0, standardDays - totalDeductedDays);
      const basePay = (grossSalary / standardDays) * effectiveDays;

      // Fazla mesai brüt ücreti (saatlik brüt * gün tipine göre çarpan)
      const hourlyGross = grossSalary / params.sgkMonthlyHours;
      const overtimePay =
        hourlyGross * params.overtimeWeekdayMultiplier * overtimeWeekdayHours +
        hourlyGross * params.overtimeWeekendMultiplier * overtimeWeekendHours;
      const bonusPay = 0; // Yol, yemek, prim eklenebilir

      const totalGrossPay = basePay + overtimePay + bonusPay;

      // Yasal Kesintiler
      const sgkBase = Math.min(totalGrossPay, HR_CONSTANTS_2026.SGK_CEILING_TL);
      const employeeSgkShare = fromKurus(Math.round(toKurus(sgkBase) * sgkWorkerRate));
      const employeeUnemploymentShare = fromKurus(Math.round(toKurus(sgkBase) * unemploymentWorkerRate));

      // Gelir Vergisi Matrahı
      const incomeTaxBase = totalGrossPay - employeeSgkShare - employeeUnemploymentShare;
      // Gelir vergisi ARTAN ORANLI tarifeye göre, yıl içi KÜMÜLATİF matrah üzerinden
      // hesaplanır (GVK md. 103). Kuruş hassasiyetiyle, `payrollCalculator` ile aynı
      // motordan geçer; böylece birim testlerin doğruladığı hesap üretimde de geçerlidir.
      const { taxKurus: rawIncomeTax, effectiveRate, newCumulativeBaseKurus } = calculateProgressiveIncomeTaxKurus(
        toKurus(previousCumulativeTaxBase),
        toKurus(incomeTaxBase), year,
      );
      // Asgari Ücret Vergi İstisnası Düşümü
      const incomeTax = Math.max(0, fromKurus(rawIncomeTax) - fromKurus(minimumWageTaxExemptionKurus(month, year)));

      // Damga Vergisi Matrahı & İstisnası
      const rawStampTax = totalGrossPay * stampTaxRate;
      const stampTax = Math.max(0, rawStampTax - params.minWageStampTaxExemption);

      const totalLegalDeductions = employeeSgkShare + employeeUnemploymentShare + incomeTax + stampTax;

      // Net Ödenecek
      const netSalary = Math.max(0, totalGrossPay - totalLegalDeductions - advanceDeduction);

      // İşveren Maliyeti
      const employerSgkShare = fromKurus(Math.round(toKurus(sgkBase) * sgkEmployerRate));
      const employerUnemploymentShare = fromKurus(Math.round(toKurus(sgkBase) * unemploymentEmployerRate));
      const totalEmployerCost = totalGrossPay + employerSgkShare + employerUnemploymentShare;

      return {
        employeeId: employee.id!,
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department,
        month,
        year,
        sgkStatus: 'sgk_li',
        salaryType: employee.salaryType,
        daysWorked,
        weeklyRestDays,
        paidLeaveDays,
        unpaidLeaveDays,
        absentDays,
        totalDays: effectiveDays,
        overtimeHours,
        baseSalary: fromKurus(toKurus(grossSalary)),
        basePay: fromKurus(toKurus(basePay)),
        overtimePay: fromKurus(toKurus(overtimePay)),
        bonusPay,
        totalGrossPay: fromKurus(toKurus(totalGrossPay)),
        employeeSgkShare: fromKurus(toKurus(employeeSgkShare)),
        employeeUnemploymentShare: fromKurus(toKurus(employeeUnemploymentShare)),
        // Vergi matrahı ve dilim bilgisi denetlenebilirlik için kayda geçirilir:
        // kümülatif matrah bir sonraki ayın hesabına girdi olur.
        incomeTaxBase: fromKurus(toKurus(incomeTaxBase)),
        previousCumulativeTaxBase: fromKurus(toKurus(previousCumulativeTaxBase)),
        cumulativeTaxBase: fromKurus(newCumulativeBaseKurus),
        appliedTaxRate: effectiveRate,
        incomeTax: fromKurus(toKurus(incomeTax)),
        stampTax: fromKurus(toKurus(stampTax)),
        totalLegalDeductions: fromKurus(toKurus(totalLegalDeductions)),
        advanceDeduction: fromKurus(toKurus(advanceDeduction)),
        otherDeductions: 0,
        netSalary: fromKurus(toKurus(netSalary)),
        employerSgkShare: fromKurus(toKurus(employerSgkShare)),
        employerUnemploymentShare: fromKurus(toKurus(employerUnemploymentShare)),
        totalEmployerCost: fromKurus(toKurus(totalEmployerCost)),
        paymentStatus: 'unpaid',
        isAccounted: false,
        notes: `SGK'lı Bordro Hesabı (${effectiveDays} gün hak ediş${absentDays > 0 ? `, ${absentDays} gün devamsız` : ''}${unpaidLeaveDays > 0 ? `, ${unpaidLeaveDays} gün ücr. izin` : ''}${overtimeHours > 0 ? `, ${overtimeHours} sa mesai` : ''})`
      };
    } 
    
    // -------------------------------------------------------------
    // SENARYO 2: SGK'SIZ / GÜNLÜK YEVMİYELİ / HARİCİ PERSONEL
    // (Vergi ve SGK kesintisi yok, fiili net hakediş ve yevmiye bazlı)
    // -------------------------------------------------------------
    else {
      let basePay = 0;
      let hourlyRate = 0;

      if (employee.salaryType === 'daily') {
        // Günlük Yevmiye:
        // Fiili çalışılan gün sayısı + Ücretli izin günleri üzerinden ödenir.
        // Devamsızlık veya ücretsiz izin günleri kesinlikle ödenmez.
        const dailyRate = employee.baseSalary || 1500;
        const payableDays = Math.max(0, daysWorked + paidLeaveDays);
        basePay = dailyRate * payableDays;
        hourlyRate = dailyRate / params.dailyWorkHours;
      } else if (employee.salaryType === 'hourly') {
        hourlyRate = employee.baseSalary || 200;
        basePay = (daysWorked * params.dailyWorkHours) * hourlyRate;
      } else {
        // Aylık sabit net anlaşılan tutar: 30 gün standardı üzerinden devamsızlık düşülür
        const monthlyNet = employee.baseSalary || 30000;
        const standardDays = 30;
        const effectiveDays = Math.max(0, standardDays - totalDeductedDays);
        basePay = (monthlyNet / standardDays) * effectiveDays;
        hourlyRate = monthlyNet / params.nonSgkMonthlyHours;
      }

      // Fazla Mesai (saatlik ücret * gün tipine göre çarpan)
      const overtimePay =
        hourlyRate * params.overtimeWeekdayMultiplier * overtimeWeekdayHours +
        hourlyRate * params.overtimeWeekendMultiplier * overtimeWeekendHours;
      const bonusPay = 0;
      const totalNetEarned = basePay + overtimePay + bonusPay;

      // Net Ödenecek (Avanslar Düşülür)
      const netSalary = Math.max(0, totalNetEarned - advanceDeduction);

      // SGK'sız personelde işveren maliyeti net ödenen toplam tutardır (Ek yasal prim maliyeti yoktur)
      const totalEmployerCost = totalNetEarned;

      return {
        employeeId: employee.id!,
        employeeName: employee.name,
        employeeCode: employee.employeeCode,
        department: employee.department,
        month,
        year,
        sgkStatus: 'sgk_siz',
        salaryType: employee.salaryType,
        daysWorked,
        weeklyRestDays,
        paidLeaveDays,
        unpaidLeaveDays,
        absentDays,
        totalDays: employee.salaryType === 'daily' ? Math.max(0, daysWorked + paidLeaveDays) : Math.max(0, 30 - totalDeductedDays),
        overtimeHours,
        baseSalary: employee.baseSalary,
        basePay: fromKurus(toKurus(basePay)),
        overtimePay: fromKurus(toKurus(overtimePay)),
        bonusPay,
        totalGrossPay: fromKurus(toKurus(totalNetEarned)),
        employeeSgkShare: 0,
        employeeUnemploymentShare: 0,
        // SGK'sız personelde gelir vergisi/damga kesintisi uygulanmaz; artan oranlı
        // tarifenin kümülatif matrahı da oluşmaz (matrah 0 olarak raporlanır).
        incomeTaxBase: 0,
        previousCumulativeTaxBase: 0,
        cumulativeTaxBase: 0,
        appliedTaxRate: 0,
        incomeTax: 0,
        stampTax: 0,
        totalLegalDeductions: 0,
        advanceDeduction: fromKurus(toKurus(advanceDeduction)),
        otherDeductions: 0,
        netSalary: fromKurus(toKurus(netSalary)),
        employerSgkShare: 0,
        employerUnemploymentShare: 0,
        totalEmployerCost: fromKurus(toKurus(totalEmployerCost)),
        paymentStatus: 'unpaid',
        isAccounted: false,
        notes: `SGK'sız / Yevmiyeli Net Hak Ediş (${daysWorked} fiili gün${absentDays > 0 ? `, ${absentDays} gün devamsız` : ''}${unpaidLeaveDays > 0 ? `, ${unpaidLeaveDays} gün ücr. izin` : ''}${overtimeHours > 0 ? `, ${overtimeHours} sa mesai` : ''})`
      };
    }
}
