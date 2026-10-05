import React, { useEffect, useMemo, useState } from 'react';
import { Palette, Plus, Search, Edit3, Eye, EyeOff, ChevronLeft, ChevronRight, X } from 'lucide-react';
import DataGrid, { StatusPill } from '../Common/DataGrid';
import type { GridColumn } from '../Common/DataGrid';
import PermissionGate from '../Common/PermissionGate';
import ColorSwatch from '../Colors/ColorSwatch';
import ColorFormModal from '../Colors/ColorFormModal';
import { api } from '../../api/client';
import { showToast, confirmDialog } from '../../lib/feedback';
import type { ListOptions } from '../../api/client';
import { useApiQueryFull } from '../../hooks/useApiQuery';
import type { ColorMaster } from '../../types';

const PAGE_SIZE = 25;

const SORT_OPTIONS: { value: string; label: string; orderBy: string; orderDir: 'asc' | 'desc' }[] = [
  { value: 'name-asc', label: 'Renk Adı (A→Z)', orderBy: 'name', orderDir: 'asc' },
  { value: 'name-desc', label: 'Renk Adı (Z→A)', orderBy: 'name', orderDir: 'desc' },
  { value: 'code-asc', label: 'Renk Kodu', orderBy: 'code', orderDir: 'asc' },
  { value: 'group-asc', label: 'Renk Grubu', orderBy: 'groupName', orderDir: 'asc' },
];

type StatusFilter = 'all' | 'active' | 'passive';

/**
 * Merkezi renk tanımları (color master) yönetim ekranı.
 *
 * Renk kartları burada açılır/düzenlenir; stok kartı, reçete, sipariş, irsaliye
 * ve fatura ekranlarındaki renk seçicileri yalnızca bu listeyi okur. Kartlar
 * fiziksel olarak silinmez — "Sil" yerine pasifleştirme vardır, böylece geçmiş
 * belgelerdeki renk bilgisi korunur.
 *
 * Arama, durum filtresi ve sayfalama sunucu tarafında yapılır.
 */
export default function ColorSettings() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState(SORT_OPTIONS[0].value);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<ColorMaster | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Arama sunucuya gittiği için her tuşta istek atılmaz.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const where = useMemo(() => (status === 'all' ? undefined : { isActive: status === 'active' }), [status]);
  const sortOption = SORT_OPTIONS.find((o) => o.value === sort) || SORT_OPTIONS[0];

  const { data, loading, refetch } = useApiQueryFull(
    async () => {
      const listOpts: ListOptions = {
        where,
        search: search || undefined,
        orderBy: sortOption.orderBy,
        orderDir: sortOption.orderDir,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      const [rows, total] = await Promise.all([
        api.colors.list(listOpts),
        api.colors.countList({ where, search: listOpts.search }),
      ]);
      return { rows, total };
    },
    [search, status, sort, page],
    ['colors'],
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastIndex = Math.min(total, page * PAGE_SIZE);

  const openNew = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const openEdit = (color: ColorMaster) => {
    setEditing(color);
    setIsFormOpen(true);
  };

  const handleToggleActive = async (color: ColorMaster) => {
    if (busyId) return;
    const activating = !color.isActive;
    let message = activating
      ? `"${color.name}" rengi yeniden aktifleştirilsin mi?`
      : `"${color.name}" rengi pasifleştirilsin mi? Pasif renkler yeni seçimlerde listelenmez; mevcut ürün ve belge kayıtları korunur.`;
    if (!activating) {
      try {
        const usedBy = await api.productColors.count({ colorId: color.id! });
        if (usedBy > 0) message += `\n\nBu renk ${usedBy} ürün kartında kullanılıyor.`;
      } catch {
        // Kullanım sayısı yalnızca bilgilendirme amaçlıdır; sayılamazsa işlem devam eder.
      }
    }
    if (!(await confirmDialog(message, { tone: 'default' }))) return;

    setBusyId(color.id!);
    try {
      await api.colors.update(color.id!, { isActive: activating });
      refetch();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Renk durumu güncellenemedi.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const columns: GridColumn<ColorMaster>[] = [
    {
      key: 'swatch',
      title: 'Renk',
      width: '64px',
      align: 'center',
      sortable: false,
      filterable: false,
      render: (row) => <ColorSwatch name={row.name} hexCode={row.hexCode} size={26} className="rounded-lg" />,
    },
    { key: 'code', title: 'Renk Kodu', width: '110px', sortable: false, filterable: false, render: (row) => <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">{row.code}</span> },
    { key: 'name', title: 'Renk Adı', sortable: false, filterable: false, render: (row) => <span className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase">{row.name}</span> },
    { key: 'groupName', title: 'Renk Grubu', width: '130px', sortable: false, filterable: false, render: (row) => <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{row.groupName || '—'}</span> },
    {
      key: 'hexCode',
      title: 'HEX / RGB',
      width: '140px',
      sortable: false,
      filterable: false,
      render: (row) =>
        row.hexCode ? (
          <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
            {row.hexCode}
            <span className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300">RGB {row.rgbCode || '—'}</span>
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tanımsız</span>
        ),
    },
    { key: 'pantoneCode', title: 'Pantone', width: '120px', sortable: false, filterable: false, render: (row) => <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{row.pantoneCode || '—'}</span> },
    { key: 'manufacturerCode', title: 'Üretici Kodu', width: '120px', sortable: false, filterable: false, render: (row) => <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{row.manufacturerCode || '—'}</span> },
    {
      key: 'isActive',
      title: 'Durum',
      width: '90px',
      align: 'center',
      sortable: false,
      filterable: false,
      render: (row) => (row.isActive ? <StatusPill tone="green">Aktif</StatusPill> : <StatusPill tone="slate">Pasif</StatusPill>),
    },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="p-6 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-fuchsia-600 rounded-xl flex items-center justify-center text-white shadow-md">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold uppercase tracking-wider">Renk Tanımları</h3>
            <p className="text-slate-300 text-xs font-medium">Merkezi renk kartları: kod, HEX, Pantone ve üretici kodu</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
            Kayıtlı Renk: {total}
          </div>
          <PermissionGate module="colors" action="create">
            <button
              type="button"
              onClick={openNew}
              className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Yeni Renk
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <DataGrid<ColorMaster>
          columns={columns}
          data={rows}
          rowKey="id"
          loading={loading}
          emptyMessage="Bu kriterlere uyan renk kartı bulunamadı."
          toolbar={
            <>
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Kod, ad, grup, Pantone veya üretici kodu ara..."
                  className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg pl-9 pr-8 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput('')}
                    title="Aramayı temizle"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                {([
                  { id: 'all', label: 'Tümü' },
                  { id: 'active', label: 'Aktif' },
                  { id: 'passive', label: 'Pasif' },
                ] as { id: StatusFilter; label: string }[]).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => { setStatus(option.id); setPage(1); }}
                    className={
                      status === option.id
                        ? 'px-3 py-1.5 rounded-md bg-white dark:bg-slate-900 text-xs font-black uppercase text-slate-900 dark:text-slate-100 shadow-xs cursor-pointer'
                        : 'px-3 py-1.5 rounded-md text-xs font-black uppercase text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer'
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <select
                value={sort}
                onChange={(e) => { setSort(e.target.value); setPage(1); }}
                className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </>
          }
          rowActions={(row) => (
            <div className="flex items-center justify-end gap-1">
              <PermissionGate module="colors" action="edit">
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  title="Düzenle"
                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </PermissionGate>
              <PermissionGate module="colors" action="delete">
                <button
                  type="button"
                  onClick={() => handleToggleActive(row)}
                  disabled={busyId === row.id}
                  title={row.isActive ? 'Pasifleştir' : 'Aktifleştir'}
                  className={
                    row.isActive
                      ? 'p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50'
                      : 'p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50'
                  }
                >
                  {row.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </PermissionGate>
            </div>
          )}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {firstIndex}–{lastIndex} / {total} renk
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Önceki sayfa"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-black text-slate-700 dark:text-slate-200 px-2">
                  {page} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page >= pageCount}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Sonraki sayfa"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          }
        />
      </div>

      <ColorFormModal
        isOpen={isFormOpen}
        color={editing}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => refetch()}
      />
    </div>
  );
}
