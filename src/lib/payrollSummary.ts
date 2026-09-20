import type { Employee, PayrollRecord } from '../types';

export interface PaymentChannelGroup {
  count: number;
  netTotal: number;
}

export interface PayrollPaymentSummary {
  bank: PaymentChannelGroup;
  cash: PaymentChannelGroup;
  totalNet: number;
  advanceTotal: number;
  sgkLiCount: number;
  sgkSizCount: number;
  sgkEmployeeShare: number;
  unemploymentEmployeeShare: number;
  sgkEmployerShare: number;
  unemploymentEmployerShare: number;
  totalSgkPremium: number;
  incomeTax: number;
  stampTax: number;
  totalTaxes: number;
  totalGrossPay: number;
  totalEmployerCost: number;
}

export function buildPayrollPaymentSummary(
  payrolls: PayrollRecord[],
  employees: Employee[]
): PayrollPaymentSummary {
  const summary: PayrollPaymentSummary = {
    bank: { count: 0, netTotal: 0 },
    cash: { count: 0, netTotal: 0 },
    totalNet: 0,
    advanceTotal: 0,
    sgkLiCount: 0,
    sgkSizCount: 0,
    sgkEmployeeShare: 0,
    unemploymentEmployeeShare: 0,
    sgkEmployerShare: 0,
    unemploymentEmployerShare: 0,
    totalSgkPremium: 0,
    incomeTax: 0,
    stampTax: 0,
    totalTaxes: 0,
    totalGrossPay: 0,
    totalEmployerCost: 0
  };

  for (const rec of payrolls) {
    const employee = employees.find(e => e.id === rec.employeeId);
    const group = employee?.paymentMethod === 'bank' ? summary.bank : summary.cash;
    group.count += 1;
    group.netTotal += rec.netSalary || 0;

    summary.totalNet += rec.netSalary || 0;
    summary.advanceTotal += rec.advanceDeduction || 0;
    summary.totalGrossPay += rec.totalGrossPay || 0;
    summary.totalEmployerCost += rec.totalEmployerCost || 0;

    if (rec.sgkStatus === 'sgk_li') {
      summary.sgkLiCount += 1;
      summary.sgkEmployeeShare += rec.employeeSgkShare || 0;
      summary.unemploymentEmployeeShare += rec.employeeUnemploymentShare || 0;
      summary.sgkEmployerShare += rec.employerSgkShare || 0;
      summary.unemploymentEmployerShare += rec.employerUnemploymentShare || 0;
      summary.incomeTax += rec.incomeTax || 0;
      summary.stampTax += rec.stampTax || 0;
    } else {
      summary.sgkSizCount += 1;
    }
  }

  summary.totalSgkPremium =
    summary.sgkEmployeeShare +
    summary.unemploymentEmployeeShare +
    summary.sgkEmployerShare +
    summary.unemploymentEmployerShare;
  summary.totalTaxes = summary.incomeTax + summary.stampTax;

  return summary;
}
