import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import ContactFormModal from './ContactFormModal';
import PermissionGate from '../Common/PermissionGate';
import { contactService } from '../../services/contactService';
import { api } from '../../api/client';
import { cn } from '../../lib/utils';
import type { Contact, EntityType } from '../../types';

export const CONTACT_TYPE_LABEL: Record<EntityType, string> = {
  customer: 'Müşteri',
  supplier: 'Tedarikçi',
  both: 'Müşteri & Tedarikçi',
};

const TYPE_BADGE_CLASS: Record<EntityType, string> = {
  customer: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300',
  supplier: 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
  both: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
};

function matches(contact: Contact, term: string): boolean {
  if (!term) return true;
  const needle = term.toLocaleLowerCase('tr');
  return [
    contact.code, contact.name, contact.companyTitle, contact.contactPerson,
    contact.city, contact.district, contact.category,
    contact.phone, contact.mobile, contact.email, contact.taxNumber,
  ].some((field) => (field || '').toLocaleLowerCase('tr').includes(needle));
}

function formatBalance(balance?: number): string {
  return `₺${(Number(balance) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Yeni Cari" formunun başlangıç türü: filtre yalnızca tedarikçi içeriyorsa tedarikçi. */
function createTypeFor(allowTypes?: EntityType[], explicit?: EntityType): EntityType {
  if (explicit) return explicit;
  if (allowTypes && allowTypes.length > 0 && !allowTypes.includes('customer')) return 'supplier';
  return 'customer';
}

/* ------------------------------------------------------------------ */
/* Açılır panel                                                        */
/* ------------------------------------------------------------------ */

const PANEL_WIDTH = 360;
const PANEL_MAX_HEIGHT = 340;

interface ContactPickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  options: Contact[];
  selectedId: number | null;
  onPick: (contact: Contact) => void;
  onClear: () => void;
  emptyOptionLabel?: string;
  showBalance: boolean;
  canCreate: boolean;
  onCreate: () => void;
  searchPlaceholder: string;
}

/**
 * Cari listesi portal üzerinden çizilir: satır editörleri ve grid hücreleri
 * `overflow` kapsayıcıları içinde olduğu için normal akışta panel kırpılırdı.
 * Konum tetikleyiciye göre hesaplanır, yer dar ise üste doğru açılır.
 */
function ContactPickerPanel({
  isOpen,
  onClose,
  triggerRef,
  options,
  selectedId,
  onPick,
  onClear,
  emptyOptionLabel,
  showBalance,
  canCreate,
  onCreate,
  searchPlaceholder,
}: ContactPickerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) { setStyle(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, PANEL_WIDTH);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < PANEL_MAX_HEIGHT && rect.top > spaceBelow;
    setStyle({
      position: 'fixed',
      left,
      width,
      maxHeight: PANEL_MAX_HEIGHT,
      ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    setTerm('');
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    // Panel sabit konumlu olduğu için sayfa kaydırılınca/boyut değişince kapanır.
    // Panelin kendi listesinin kayması konumu değiştirmediğinden kapatmaz.
    const onMove = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || !style) return null;

  const filtered = options.filter((c) => matches(c, term.trim()));

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className="z-[90] bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden flex flex-col"
    >
      <div className="p-2 border-b border-slate-100 dark:border-slate-800">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="overflow-y-auto p-1.5 space-y-1">
        {emptyOptionLabel && (
          <button
            type="button"
            onClick={() => { onClear(); onClose(); }}
            className={cn(
              'w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer',
              selectedId == null
                ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-800 dark:text-indigo-300 ring-1 ring-indigo-300 dark:ring-indigo-500/40'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
            )}
          >
            {emptyOptionLabel}
          </button>
        )}

        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
            Aramaya uyan cari kartı bulunamadı.
          </div>
        ) : (
          filtered.map((contact) => {
            const isSelected = selectedId != null && Number(contact.id) === selectedId;
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => onPick(contact)}
                className={cn(
                  'w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 transition-colors cursor-pointer',
                  isSelected ? 'bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-300 dark:ring-indigo-500/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                    {contact.name}
                  </span>
                  <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">
                    {contact.code ? <span className="font-mono">{contact.code} · </span> : null}
                    {CONTACT_TYPE_LABEL[contact.type]}
                    {contact.city ? ` · ${contact.city}` : ''}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {showBalance && (
                    <span className="text-[10px] font-black font-mono text-slate-700 dark:text-slate-200">
                      {formatBalance(contact.balance)}
                    </span>
                  )}
                  <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-black tracking-tight', TYPE_BADGE_CLASS[contact.type])}>
                    {contact.type === 'both' ? 'M&T' : contact.type === 'supplier' ? 'TED' : 'MÜŞ'}
                  </span>
                  {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                </span>
              </button>
            );
          })
        )}
      </div>

      {canCreate && (
        <PermissionGate module="contacts" action="create">
          <div className="border-t border-slate-100 dark:border-slate-800 p-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 px-1">
              {options.length} cari kartı
            </span>
            <button
              type="button"
              onClick={onCreate}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Yeni Cari
            </button>
          </div>
        </PermissionGate>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Seçici                                                              */
/* ------------------------------------------------------------------ */

export interface ContactSelectProps {
  /** Cari listesi. Çağıran ekran zaten yüklüyor; bileşen ayrıca sorgu yapmaz. */
  contacts: Contact[];
  value?: number | null;
  /** Seçilen kart da döner; çağıran taraf adı/bakiyeyi yeniden sorgulamak zorunda kalmaz. */
  onChange: (contactId: number | null, contact: Contact | null) => void;
  /** Yalnızca bu türdeki cariler listelenir (ör. ['supplier','both']). Verilmezse tümü. */
  allowTypes?: EntityType[];
  /** "Yeni Cari" formunun başlangıç türü. Verilmezse allowTypes'tan türetilir. */
  createType?: EntityType;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** Panelde boş seçim satırı gösterilir (ör. "Cari Yok", "Genel Kasa Hareketi"). */
  emptyOptionLabel?: string;
  /** Panel satırlarında cari bakiyesi gösterilir (tahsilat/tediye/çek). */
  showBalance?: boolean;
  /** Tablo/ExcelGrid hücreleri için tek satırlı yoğun görünüm. */
  compact?: boolean;
  className?: string;
}

/**
 * Cari seçici. Yalnızca `contacts` kartlarından seçim yapılabilir; kullanıcı cari
 * adı yazamaz. Panelde "Yeni Cari" düğmesi vardır ve form iç içe bir modalda
 * açılır — bulunulan ekranın durumu korunur, kayıt sonrası yeni cari otomatik
 * seçilir. Aynı desen renk seçicide (ColorSelect) kullanılır.
 */
export function ContactSelect({
  contacts,
  value = null,
  onChange,
  allowTypes,
  createType,
  placeholder = 'Cari seçin...',
  disabled = false,
  allowClear = true,
  emptyOptionLabel,
  showBalance = false,
  compact = false,
  className,
}: ContactSelectProps) {
  /** Yeni oluşturulan kart, liste SSE ile tazelenene kadar yerel olarak eklenir. */
  const [recent, setRecent] = useState<Contact[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const pool = useMemo(() => {
    const byId = new Map<number, Contact>();
    for (const c of [...contacts, ...recent]) if (c.id != null) byId.set(Number(c.id), c);
    return byId;
  }, [contacts, recent]);

  const options = useMemo(() => {
    const all = [...pool.values()];
    return allowTypes && allowTypes.length > 0 ? all.filter((c) => allowTypes.includes(c.type)) : all;
  }, [pool, allowTypes]);

  const selectedId = value == null || value === 0 ? null : Number(value);
  const selected = selectedId != null ? pool.get(selectedId) ?? null : null;

  const pick = (contact: Contact) => {
    onChange(Number(contact.id), contact);
    setIsOpen(false);
  };

  const clear = (event?: React.MouseEvent | React.KeyboardEvent) => {
    event?.stopPropagation();
    onChange(null, null);
  };

  const handleCreate = async (data: Partial<Contact>) => {
    const id = await contactService.addContact({
      ...data,
      name: String(data.name || '').trim(),
      type: data.type || createTypeFor(allowTypes, createType),
      balance: Number(data.balance) || 0,
    } as Omit<Contact, 'id'>);
    const saved = await api.contacts.get(id);
    const created = saved ?? ({ ...data, id } as Contact);
    setRecent((prev) => [...prev.filter((c) => Number(c.id) !== Number(created.id)), created]);
    onChange(Number(created.id), created);
  };

  const subtitle = selected
    ? [selected.code, CONTACT_TYPE_LABEL[selected.type], selected.city].filter(Boolean).join(' · ')
    : '';

  return (
    <div className={cn('relative w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-lg border text-left transition-all shadow-2xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-60',
          compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
          selected
            ? 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700',
          isOpen && 'ring-1 ring-indigo-500 border-indigo-500',
        )}
      >
        {selected ? (
          compact ? (
            <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 truncate">{selected.name}</span>
          ) : (
            <span className="min-w-0">
              <span className="block text-xs font-black text-slate-900 dark:text-slate-100 truncate">{selected.name}</span>
              <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate">{subtitle}</span>
            </span>
          )
        ) : (
          <span className={cn('font-bold text-slate-600 dark:text-slate-300 truncate', compact ? 'text-[11px]' : 'text-xs')}>
            {placeholder}
          </span>
        )}
        <span className="flex items-center gap-1 shrink-0">
          {allowClear && selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              title="Cariyi temizle"
              onClick={clear}
              onKeyDown={(e) => { if (e.key === 'Enter') clear(e); }}
              className="p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={cn('text-slate-400 transition-transform duration-200', compact ? 'w-3.5 h-3.5' : 'w-4 h-4', isOpen && 'rotate-180')} />
        </span>
      </button>

      <ContactPickerPanel
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
        options={options}
        selectedId={selectedId}
        onPick={pick}
        onClear={() => clear()}
        emptyOptionLabel={emptyOptionLabel}
        showBalance={showBalance}
        canCreate
        onCreate={() => { setIsOpen(false); setIsFormOpen(true); }}
        searchPlaceholder="Cari adı, kod, yetkili, şehir veya vergi no..."
      />

      {/* Form yalnızca istendiğinde kurulur: satır satır render edilen seçicilerde
          gereksiz cari/hesap sorgusu tetiklenmesin. */}
      {isFormOpen && (
        <ContactFormModal
          isOpen
          nested
          defaultType={createTypeFor(allowTypes, createType)}
          onClose={() => setIsFormOpen(false)}
          onSave={handleCreate}
        />
      )}
    </div>
  );
}

export default ContactSelect;
