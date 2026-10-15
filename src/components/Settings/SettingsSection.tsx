import React, { createContext, useContext, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Ayarlar Merkezi arama bağlamı. Kabuk (SettingsHub) sorguyu buradan yayar;
 * her SettingsSection kendi başlık/anahtar kelime kümesiyle eşleşip
 * eşleşmediğine göre görünür olur. Sorgu boşken tüm bölümler normal çalışır.
 */
export const SettingsSearchContext = createContext<{ query: string }>({ query: '' });
export const SettingsTabContext = createContext<{ titles: string[]; activeTitle: string } | null>(null);

export function SettingsSearchProvider({ query, children }: { query: string; children: React.ReactNode }) {
  return <SettingsSearchContext.Provider value={{ query }}>{children}</SettingsSearchContext.Provider>;
}

/** Türkçe küçük harfe indirgeme + sadeleştirme (arama için). */
function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .trim();
}

export interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** Başlık yanındaki kompakt sayaç rozeti (kayıt sayısı vb.). */
  count?: number | string;
  /** Aramanın da eşleşebileceği ek anahtar kelimeler (etiketler vb.). */
  keywords?: string;
  defaultOpen?: boolean;
  /** Başlık satırının sağındaki aksiyonlar (örn. "Yeni Renk"). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Hub içinde seçilen sekmenin paneli, diğer kullanımlarda açılır bölüm.
 * Gövde daima DOM'da tutulur
 * (yalnızca CSS ile gizlenir), böylece aç/kapa ve arama sırasında form
 * durumları kaybolmaz. Arama sorgusu eşleşmiyorsa bölüm tamamen gizlenir;
 * eşleşiyorsa otomatik açılır.
 */
export default function SettingsSection({
  title,
  description,
  icon,
  count,
  keywords,
  defaultOpen = true,
  actions,
  children,
}: SettingsSectionProps) {
  const { query } = useContext(SettingsSearchContext);
  const tab = useContext(SettingsTabContext);
  const [open, setOpen] = useState(defaultOpen);

  const q = fold(query);
  const matches = q === '' || fold(`${title} ${description ?? ''} ${keywords ?? ''}`).includes(q);
  // Arama eşleşmesi bölümü geçici olarak açar; kullanıcı elle kapatamaz (query bitince eski durum döner).
  const forceOpen = q !== '' && matches;
  const visible = !!tab || open || forceOpen;
  const inactive = tab ? tab.activeTitle !== title : false;
  const panelKey = tab ? `settings-section-${tab.titles.indexOf(title)}` : undefined;

  // Eşleşmeyen bölüm de DOM'da kalır (yalnızca gizlenir) — arama sırasında
  // çocuk bileşenlerin (örn. ColorSettings) dahili durumu kaybolmaz.
  return (
    <section hidden={inactive || !matches} role={tab ? 'tabpanel' : undefined} id={panelKey ? `tabpanel-${panelKey}` : undefined} aria-labelledby={panelKey ? `tab-${panelKey}` : undefined} className={cn('overflow-hidden rounded-card border border-line bg-surface shadow-card', (inactive || !matches) && 'hidden')}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={!!tab}
          aria-expanded={visible}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus-visible:outline-none"
        >
          {icon ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand [&>svg]:h-4 [&>svg]:w-4">
              {icon}
            </span>
          ) : null}
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className="truncate text-xs font-black uppercase tracking-wider text-fg-strong">{title}</span>
              {count != null && count !== '' ? (
                <span className="shrink-0 rounded-pill bg-surface-hover px-2 py-0.5 text-2xs font-black text-fg-muted">{count}</span>
              ) : null}
            </span>
            {description ? (
              <span className="mt-0.5 block truncate text-2xs font-semibold text-fg-muted">{description}</span>
            ) : null}
          </span>
          {!tab && <ChevronDown className={cn('ml-auto h-4 w-4 shrink-0 text-fg-muted transition-transform', visible && 'rotate-180')} />}
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn(visible ? 'block' : 'hidden')}>{children}</div>
    </section>
  );
}
