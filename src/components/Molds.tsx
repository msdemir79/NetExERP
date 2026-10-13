import { useMemo, useState } from 'react';
import {
  Boxes,
  Factory,
  Handshake,
  Wrench,
  Plus,
  Move,
  ClipboardList,
  Edit,
  Trash2,
  MoreHorizontal,
  Search,
  Layers,
} from 'lucide-react';
import { api, getMoldSummary } from '../api/client';
import { useApiQuery, useApiQueryFull } from '../hooks/useApiQuery';
import PageHeader from './PageHeader';
import KpiCard from './Common/KpiCard';
import DataGrid, { GridColumn, StatusPill } from './Common/DataGrid';
import SegmentedFilter, { SegmentOption } from './Common/SegmentedFilter';
import Button from './Common/Button';
import ActionMenu from './Common/ActionMenu';
import EmptyState from './Common/EmptyState';
import DeleteConfirmModal from './Common/DeleteConfirmModal';
import PermissionGate from './Common/PermissionGate';
import { Input } from './Common/Field';
import MoldFormModal from './Molds/MoldFormModal';
import MoldMoveModal from './Molds/MoldMoveModal';
import MoldCountAdjustModal from './Molds/MoldCountAdjustModal';
import MoldDetailDrawer from './Molds/MoldDetailDrawer';
import { formatPairs } from './Molds/moldConstants';
import { showToast } from '../lib/feedback';
import type { Mold, MoldSummary } from '../types';

type FilterKey = 'all' | 'factory' | 'subcontract' | 'maintenance' | 'scrap' | 'inactive';

export default function Molds() {
  const summaryQuery = useApiQueryFull<MoldSummary>(() => getMoldSummary(), [], ['molds', 'moldStock']);
  const moldsQuery = useApiQueryFull(() => api.molds.list(), [], ['molds']);
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']) || [];
  const products = useApiQuery(() => api.products.list(), [], ['products']) || [];
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']) || [];

  const perMold = summaryQuery.data?.perMold || [];
  const totals = summaryQuery.data?.totals;
  const molds = moldsQuery.data || [];

  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Mold | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveMoldId, setMoveMoldId] = useState<number | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMoldId, setAdjustMoldId] = useState<number | null>(null);
  const [drawerMold, setDrawerMold] = useState<Mold | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Mold | null>(null);

  const moldById = useMemo(() => {
    const map = new Map<number, Mold>();
    for (const m of molds) if (m.id != null) map.set(Number(m.id), m);
    return map;
  }, [molds]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr');
    return perMold.filter((r) => {
      if (filter === 'factory' && r.factoryPairs <= 0) return false;
      if (filter === 'subcontract' && r.subcontractPairs <= 0) return false;
      if (filter === 'maintenance' && r.maintenancePairs <= 0) return false;
      if (filter === 'scrap' && r.scrapPairs <= 0) return false;
      if (filter === 'inactive' && r.isActive) return false;
      if (needle) {
        const hay = `${r.code} ${r.name} ${r.sizeRange || ''} ${r.moldType || ''} ${r.brand || ''}`.toLocaleLowerCase('tr');
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [perMold, filter, search]);

  const segments: SegmentOption[] = useMemo(() => [
    { key: 'all', label: 'Tümü', count: perMold.length },
    { key: 'factory', label: 'Fabrikada', count: perMold.filter((r) => r.factoryPairs > 0).length },
    { key: 'subcontract', label: 'Fasonda', count: perMold.filter((r) => r.subcontractPairs > 0).length },
    { key: 'maintenance', label: 'Bakımda', count: perMold.filter((r) => r.maintenancePairs > 0).length },
    { key: 'scrap', label: 'Hurda/Kayıp', count: perMold.filter((r) => r.scrapPairs > 0).length },
    { key: 'inactive', label: 'Pasif', count: perMold.filter((r) => !r.isActive).length },
  ], [perMold]);

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (mold: Mold) => { setEditing(mold); setFormOpen(true); setDrawerMold(null); };
  const openMove = (id: number | null) => { setMoveMoldId(id); setMoveOpen(true); setDrawerMold(null); };
  const openAdjust = (id: number | null) => { setAdjustMoldId(id); setAdjustOpen(true); setDrawerMold(null); };
  const openDrawer = (id: number) => setDrawerMold(moldById.get(Number(id)) || null);

  const handleSave = async (data: Partial<Mold>) => {
    if (data.id) {
      await api.molds.update(data.id, data);
      showToast('Kalıp güncellendi.', 'success');
    } else {
      await api.molds.create(data);
      showToast('Kalıp kaydedildi.', 'success');
    }
  };

  const columns = useMemo<GridColumn<typeof perMold[number]>[]>(() => [
    {
      key: 'code', title: 'Kod', width: '7rem',
      render: (r) => <span className="font-mono font-bold text-brand whitespace-nowrap">{r.code}</span>,
      filterValue: (r) => r.code,
    },
    {
      key: 'name', title: 'Kalıp',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-black text-fg-strong truncate">{r.name}</div>
          <div className="text-2xs font-semibold text-fg-muted truncate">
            {[r.moldType, r.brand].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      ),
      filterValue: (r) => `${r.name} ${r.moldType || ''} ${r.brand || ''}`,
    },
    {
      key: 'sizeRange', title: 'Numara', width: '7rem', align: 'center',
      render: (r) => <span className="font-mono text-xs font-bold text-fg">{r.sizeRange || '—'}</span>,
      filterValue: (r) => r.sizeRange || '',
    },
    {
      key: 'totalPairs', title: 'Toplam', align: 'right', width: '5.5rem',
      render: (r) => <span className="font-mono font-black text-fg-strong">{formatPairs(r.totalPairs)}</span>,
      sortValue: (r) => r.totalPairs,
    },
    {
      key: 'factoryPairs', title: 'Fabrika', align: 'right', width: '5.5rem',
      render: (r) => <span className="font-mono font-bold text-info">{formatPairs(r.factoryPairs)}</span>,
      sortValue: (r) => r.factoryPairs,
    },
    {
      key: 'subcontractPairs', title: 'Fason', align: 'right', width: '5.5rem',
      render: (r) => <span className="font-mono font-bold text-warning">{formatPairs(r.subcontractPairs)}</span>,
      sortValue: (r) => r.subcontractPairs,
    },
    {
      key: 'maintenancePairs', title: 'Bakım', align: 'right', width: '5rem',
      render: (r) => <span className="font-mono font-bold text-violet-600 dark:text-violet-400">{formatPairs(r.maintenancePairs)}</span>,
      sortValue: (r) => r.maintenancePairs,
    },
    {
      key: 'scrapPairs', title: 'Hurda', align: 'right', width: '5rem',
      render: (r) => <span className="font-mono font-bold text-danger">{formatPairs(r.scrapPairs)}</span>,
      sortValue: (r) => r.scrapPairs,
    },
    {
      key: 'availablePairs', title: 'Kullanılabilir', align: 'right', width: '7rem',
      render: (r) => <span className="font-mono font-black text-success">{formatPairs(r.availablePairs)}</span>,
      sortValue: (r) => r.availablePairs,
    },
    {
      key: 'isActive', title: 'Durum', width: '5.5rem', align: 'center',
      render: (r) => (r.isActive ? <StatusPill tone="green">Aktif</StatusPill> : <StatusPill tone="slate">Pasif</StatusPill>),
      filterValue: (r) => (r.isActive ? 'Aktif' : 'Pasif'),
    },
  ], []);

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Kalıp Takip ve Yönetimi"
        subtitle="Ayakkabı kalıpları: çift bazlı stok, konum kovaları, fason emanet ve hareket takibi"
        badge={`${totals?.moldCount ?? 0} Kalıp`}
        icon={Boxes}
        iconColor="indigo"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PermissionGate module="molds" action="approve">
              <Button variant="secondary" icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => openAdjust(null)}>
                Sayım Düzelt
              </Button>
            </PermissionGate>
            <PermissionGate module="molds" action="edit">
              <Button variant="secondary" icon={<Move className="h-3.5 w-3.5" />} onClick={() => openMove(null)}>
                Yeni Hareket
              </Button>
            </PermissionGate>
            <PermissionGate module="molds" action="create">
              <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={openNew}>
                Yeni Kalıp
              </Button>
            </PermissionGate>
          </div>
        }
      />

      {/* KPI kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Toplam Kalıp" value={totals?.moldCount ?? 0} sub={`${totals?.activeMoldCount ?? 0} aktif`} icon={Layers} tone="brand" />
        <KpiCard label="Toplam Çift" value={formatPairs(totals?.totalPairs ?? 0)} icon={Boxes} tone="info" />
        <KpiCard label="Kullanılabilir" value={formatPairs(totals?.availablePairs ?? 0)} sub="Bakım+hurda hariç" icon={Boxes} tone="success" />
        <KpiCard label="Fabrika" value={formatPairs(totals?.factoryPairs ?? 0)} icon={Factory} tone="teal" />
        <KpiCard label="Fason Emanet" value={formatPairs(totals?.subcontractPairs ?? 0)} icon={Handshake} tone="warning" />
        <KpiCard label="Bakım / Hurda" value={formatPairs((totals?.maintenancePairs ?? 0) + (totals?.scrapPairs ?? 0))} sub={`${formatPairs(totals?.maintenancePairs ?? 0)} bakım · ${formatPairs(totals?.scrapPairs ?? 0)} hurda`} icon={Wrench} tone="violet" />
      </div>

      {/* Filtre + arama */}
      <div className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Kalıp kodu, adı, tip, marka veya numara ara…" className="pl-9" />
          </div>
        </div>
        <SegmentedFilter ariaLabel="Kalıp konum filtresi" options={segments} value={filter} onChange={(k) => setFilter(k as FilterKey)} />
      </div>

      {/* Liste */}
      {filtered.length === 0 && !summaryQuery.loading ? (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <EmptyState
            icon={<Boxes />}
            title="Kalıp bulunamadı"
            description="Filtreleri temizleyebilir veya sağ üstteki butonla yeni bir kalıp kartı ekleyebilirsiniz."
            action={<Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Filtreleri Temizle</Button>}
          />
        </div>
      ) : (
        <DataGrid
          columns={columns}
          data={filtered}
          rowKey="id"
          density="compact"
          loading={summaryQuery.loading}
          onRowClick={(r) => openDrawer(Number(r.id))}
          defaultSort={{ key: 'name', dir: 'asc' }}
          emptyMessage="Kalıp bulunamadı."
          rowActions={(r) => {
            const mold = moldById.get(Number(r.id));
            return (
              <ActionMenu
                label={`${mold?.name ?? ''} işlemleri`}
                icon={<MoreHorizontal className="h-4 w-4" />}
                items={[
                  { key: 'open', label: 'Detay', icon: <Boxes className="h-4 w-4" />, onSelect: () => openDrawer(Number(r.id)) },
                  { key: 'move', label: 'Hareket', icon: <Move className="h-4 w-4" />, onSelect: () => mold && openMove(Number(mold.id)) },
                  { key: 'adjust', label: 'Sayım Düzelt', icon: <ClipboardList className="h-4 w-4" />, onSelect: () => mold && openAdjust(Number(mold.id)) },
                  { key: 'edit', label: 'Düzenle', icon: <Edit className="h-4 w-4" />, onSelect: () => mold && openEdit(mold) },
                  { key: 'delete', label: 'Sil', icon: <Trash2 className="h-4 w-4" />, tone: 'danger', onSelect: () => mold && setDeleteTarget(mold) },
                ]}
              />
            );
          }}
        />
      )}

      <MoldFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
        initialData={editing}
        templates={templates}
        products={products}
        contacts={contacts}
      />

      <MoldMoveModal
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        molds={molds}
        contacts={contacts}
        initialMoldId={moveMoldId}
        onDone={() => { summaryQuery.refetch(); moldsQuery.refetch(); }}
      />

      <MoldCountAdjustModal
        isOpen={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        molds={molds}
        contacts={contacts}
        initialMoldId={adjustMoldId}
        onDone={() => { summaryQuery.refetch(); moldsQuery.refetch(); }}
      />

      <MoldDetailDrawer
        isOpen={!!drawerMold}
        onClose={() => setDrawerMold(null)}
        mold={drawerMold}
        contacts={contacts}
        onMove={(m) => openMove(Number(m.id))}
        onCountAdjust={(m) => openAdjust(Number(m.id))}
        onEdit={(m) => openEdit(m)}
      />

      <DeleteConfirmModal
        resource="molds"
        id={deleteTarget?.id ?? null}
        title="Kalıp Kartını Sil"
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          summaryQuery.refetch();
          moldsQuery.refetch();
          showToast('Kalıp silindi.', 'success');
        }}
      />
    </div>
  );
}
