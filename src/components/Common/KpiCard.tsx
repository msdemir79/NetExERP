import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export type KpiTone =
  | 'brand' | 'success' | 'warning' | 'danger' | 'info'
  | 'violet' | 'orange' | 'teal';

const TONES: Record<KpiTone, string> = {
  brand: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  orange: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
  teal: 'bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400',
};

export interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  onClick?: () => void;
  className?: string;
}

export default function KpiCard({ label, value, sub, icon: Icon, tone = 'brand', onClick, className }: KpiCardProps) {
  const Tag = (onClick ? 'button' : 'div') as any;
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 bg-surface border border-line rounded-card shadow-card p-4 text-left min-w-0',
        onClick && 'cursor-pointer hover:border-line-strong hover:shadow-raised transition-all',
        className
      )}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', TONES[tone])}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-label font-semibold uppercase tracking-wide text-fg-muted truncate">{label}</p>
        <p className="text-2xl font-black text-fg-strong leading-tight truncate">{value}</p>
        {sub ? <p className="text-2xs text-fg-muted truncate">{sub}</p> : null}
      </div>
    </Tag>
  );
}
