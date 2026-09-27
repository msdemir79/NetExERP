import type { AttendanceStatus } from '../../types';

export const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

export const DAY_NAMES_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function formatWeekendDays(days: number[]): string {
  const ordered = WEEK_ORDER.filter(d => days.includes(d));
  if (ordered.length === 0) return 'Tanımlı değil';
  return ordered.map(d => DAY_NAMES_TR[d]).join(', ');
}

export const STATUS_CONFIG: Record<AttendanceStatus, { label: string; code: string; bg: string; text: string; border: string }> = {
  present: { label: 'Geldi (Normal)', code: 'N', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300' },
  weekly_rest: { label: 'Hafta Tatili', code: 'H', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600', border: 'border-slate-300' },
  absent: { label: 'Devamsız', code: 'D', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-300' },
  paid_leave: { label: 'Ücretli İzin', code: 'İ', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-300' },
  unpaid_leave: { label: 'Ücretsiz İzin', code: 'Ü', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  sick_leave: { label: 'Sağlık Raporu', code: 'S', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-300' },
  public_holiday: { label: 'Resmi Tatil', code: 'R', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-300' },
  half_day: { label: 'Yarım Gün', code: 'Y', bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-300' }
};
