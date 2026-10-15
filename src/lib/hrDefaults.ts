import type { HRModuleSettings } from '../types';
export const HR_DEFAULT_PARAMS: HRModuleSettings = {
  weeklyWorkHours: 45,
  dailyWorkHours: 8,
  weekendDays: [0],
  overtimeWeekdayMultiplier: 1.5,
  overtimeWeekendMultiplier: 2.0,
  annualLeaveBaseDays: 14,
  sgkEmployeeRate: 14,
  unemploymentEmployeeRate: 1,
  sgkEmployerRate: 16.75,
  unemploymentEmployerRate: 2,
  incomeTaxRate: 15,
  stampTaxPerMille: 7.59,
  minWageGross: 33030,
  minWageNet: 28075.50,
  minWageIncomeTaxExemption: 4211.33,
  minWageStampTaxExemption: 250.70,
  sgkMonthlyHours: 225,
  nonSgkMonthlyHours: 240
};

