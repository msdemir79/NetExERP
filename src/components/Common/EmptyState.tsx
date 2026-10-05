import React from 'react';
import { cn } from '../../lib/utils';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Altında gösterilecek buton/bağlantı. */
  action?: React.ReactNode;
  /** Dar alanlar (tablo içi, panel) için küçültülmüş yükseklik. */
  compact?: boolean;
  className?: string;
}

/** Liste/panel boş durumu: ikon + başlık + açıklama + isteğe bağlı aksiyon. */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 text-center', compact ? 'py-6' : 'py-12', className)}>
      {icon ? (
        <div
          className={cn(
            'mb-3 flex items-center justify-center rounded-pill bg-surface-raised text-fg-muted',
            compact ? 'h-9 w-9 [&>svg]:h-4 [&>svg]:w-4' : 'h-12 w-12 [&>svg]:h-5 [&>svg]:w-5',
          )}
        >
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-black text-fg-strong">{title}</p>
      {description ? (
        <p className={cn('mt-1 max-w-sm font-semibold text-fg-muted', compact ? 'text-2xs' : 'text-xs')}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3 flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
