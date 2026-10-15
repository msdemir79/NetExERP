import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * DMR Kinetiq sağdan kayan detay paneli içerik primitifleri.
 *
 * Contacts pilotundaki okunur panel düzeninin (özet kart + bölüm bölüm `dl`
 * satırları + küçük bilgi kutucukları) ortak, yeniden kullanılabilir hâli.
 * Tüm modül panelleri aynı görsel dili paylassın diye markup birebir
 * Contacts'taki `section()`/özet-kart sınıflarından türetildi.
 */

export interface DetailRow {
  label: ReactNode;
  value: ReactNode;
}

/** Bölüm başlığı + ayraçlı `dl` satırları (Contacts `section()` deseni). */
export function DetailSection({
  title,
  rows,
  children,
  className,
}: {
  title?: ReactNode;
  rows?: DetailRow[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {title ? (
        <h4 className="mb-2 text-label font-black uppercase tracking-widest text-fg-muted">{title}</h4>
      ) : null}
      {rows && rows.length ? (
        <dl className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {rows.map((r, i) => (
            <div key={i} className="flex items-start justify-between gap-3 px-3 py-2">
              <dt className="shrink-0 text-xs font-semibold text-fg-muted">{r.label}</dt>
              <dd className="min-w-0 break-words text-right text-xs font-bold text-fg-strong">{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </div>
  );
}

export type DetailSummaryTone = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

const SUMMARY_VALUE_TONE: Record<DetailSummaryTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-fg-strong',
};

/**
 * Vurgulu özet kartı (ör. cari bakiye, mevcut stok, belge toplamı).
 * Üst satırda etiket + isteğe bağlı rozet, altında büyük metrik, altta ek alan.
 */
export function DetailSummary({
  label,
  value,
  unit,
  tone = 'neutral',
  badge,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  tone?: DetailSummaryTone;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface-hover/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label font-bold uppercase tracking-wide text-fg-muted">{label}</span>
        {badge}
      </div>
      <div className={cn('mt-1 font-mono text-2xl font-black tabular-nums', SUMMARY_VALUE_TONE[tone])}>
        {value}
        {unit ? <span className="ml-1 text-xs uppercase">{unit}</span> : null}
      </div>
      {children}
    </div>
  );
}

/** Küçük etiket/değer kutucukları (ör. alış/satış/raf/limit). Panel dar olduğu için varsayılan 2 sütun. */
export function DetailTiles({
  items,
  cols = 2,
}: {
  items: { label: ReactNode; value: ReactNode; valueClass?: string }[];
  cols?: 2 | 3;
}) {
  return (
    <div className={cn('grid gap-2', cols === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0 rounded-xl border border-line bg-surface p-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-fg-muted">{it.label}</div>
          <div className={cn('mt-0.5 truncate text-sm font-black text-fg-strong', it.valueClass)}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}
