import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral';

const TONES: Record<BadgeTone, string> = {
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand-soft text-brand-fg',
  neutral: 'bg-surface-hover text-fg-muted',
};

export interface StatusBadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export default function StatusBadge({ tone = 'neutral', children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-label font-semibold whitespace-nowrap',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
