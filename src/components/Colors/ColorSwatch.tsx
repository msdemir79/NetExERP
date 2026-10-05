import React from 'react';
import { cn } from '../../lib/utils';
import { getColorSwatch } from '../../lib/colorSwatches';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

interface ColorSwatchProps {
  /** Renk adı; kartta HEX yoksa ortak paletten yaklaşık renk bulunur. */
  name?: string | null;
  /** Merkezi renk kartının gerçek HEX değeri (her zaman palete tercih edilir). */
  hexCode?: string | null;
  /** Kutu kenar uzunluğu (px). */
  size?: number;
  /** Yanında renk adı da yazılsın mı? */
  withName?: boolean;
  className?: string;
}

/**
 * Renk kutusu: raporlardan listelere, barkod ekranından stok kartına kadar her
 * yerde aynı görsel dil. Emoji yerine karttaki gerçek HEX'i boyar; HEX
 * tanımsızsa (tarihsel kayıtlar) src/lib/colorSwatches paletine düşer.
 */
export default function ColorSwatch({ name, hexCode, size = 18, withName = false, className }: ColorSwatchProps) {
  const label = (name || '').trim();
  const hex = hexCode && HEX_RE.test(hexCode) ? hexCode.toUpperCase() : null;
  const background = hex || getColorSwatch(label).bg;

  const box = (
    <span
      className={cn('inline-block shrink-0 rounded-md', className)}
      style={{
        width: size,
        height: size,
        backgroundColor: background,
        border: '1px solid rgba(100, 116, 139, 0.5)',
      }}
      title={label ? `${label}${hex ? ` — ${hex}` : ''}` : hex || 'Renksiz'}
    />
  );

  if (!withName) return box;

  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {box}
      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{label || '—'}</span>
    </span>
  );
}
