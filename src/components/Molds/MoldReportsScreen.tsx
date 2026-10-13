import { useMemo, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet, Search } from 'lucide-react';
import { api, getMoldSummary } from '../../api/client';
import { useApiQuery, useApiQueryFull } from '../../hooks/useApiQuery';
import PageHeader from '../PageHeader';
import KpiCard from '../Common/KpiCard';
import DataGrid, { GridColumn, StatusPill } from '../Common/DataGrid';
import SegmentedFilter, { SegmentOption } from '../Common/SegmentedFilter';
import Button from '../Common/Button';
import EmptyState from '../Common/EmptyState';
import { Input, Select } from '../Common/Field';
import { showToast } from '../../lib/feedback';
import type { Mold, MoldMovement, MoldMovementItem, MoldStock, MoldSummary } from '../../types';
import {
  MOLD_LOCATION_LABELS,
  MOLD_MOVE_LABELS,
  MOLD_MOVE_TONE,
  MOLD_SUBCONTRACT_LOCATIONS,
  formatPairs,
} from './moldConstants';
import {
  buildMovementReportRows,
  buildSubcontractReportRows,
  exportMoldLocationSummary,
  exportMoldMovements,
  exportMoldSubcontract,
  type ExportFormat,
} from './moldExport';

type ReportTab = 'location' | 'subcontract' | 'movements';

const ALL_TYPES = Object.keys(MOLD_MOVE_LABELS) as (keyof typeof MOLD_MOVE_LABELS)[];

export default function MoldReportsScreen() {
  const [tab, setTab] = useState<ReportTab>('location');

  const summary = useApiQuery<MoldSummary>(() => getMoldSummary(), [], ['molds', 'moldStock', 'moldMovements']);
  const molds = useApiQuery<Mold[]>(() => api.molds.list(), [], ['molds']) || [];
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']) || [];
  const stockQuery = useApiQueryFull<MoldStock[]>(() => api.moldStock.list({ limit: 5000 }), [], ['moldStock']);
  const movesQuery = useApiQueryFull<MoldMovement[]>(
    () => api.moldMovements.list({ orderBy: 'date', orderDir: 'desc', limit: 1000 }),
    [],
    ['moldMovements'],
  );
  const itemsQuery = useApiQueryFull<MoldMovementItem[]>(
    () => api.moldMovementItems.list({ limit: 5000 }),
    [],
    ['moldMovementItems'],
  );

  const stock = stockQuery.data || [];
  const movements = movesQuery.data || [];
  const items = itemsQuery.data || [];

  // Hareket filtreleri
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [moldFilter, setMoldFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const perMold = summary?.perMold || [];
  const totals = summary?.totals;

  const subRows = useMemo(
    () => buildSubcontractReportRows(stock, molds, contacts, MOLD_SUBCONTRACT_LOCATIONS as string[]),
    [stock, molds, contacts],
  );

  const itemsByMovement = useMemo(() => {
    const map = new Map<number, number>();
    for (const it of items) {
      const id = Number(it.movementId);
      map.set(id, (map.get(id) || 0) + (Number(it.pairs) || 0));
    }
    return map;
  }, [items]);

  const moveRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr');
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    const filtered = movements.filter((mv) => {
      if (typeFilter !== 'all' && mv.type !== typeFilter) return false;
      if (moldFilter !== 'all' && Number(mv.moldId) !== Number(moldFilter)) return false;
      const d = new Date(mv.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (needle) {
        const hay = `${mv.movementNo} ${mv.description || ''} ${mv.documentRef || ''}`.toLocaleLowerCase('tr');
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return buildMovementReportRows(filtered, itemsByMovement, molds, contacts);
  }, [movements, itemsByMovement, molds, contacts, search, typeFilter, moldFilter, dateFrom, dateTo]);

  const segments = useMemo<SegmentOption[]>(() => [
    { key: 'location', label: 'Konum Özeti', count: perMold.length },
    { key: 'subcontract', label: 'Fason Emanet', count: subRows.length },
    { key: 'movements', label: 'Hareket Dökümü', count: moveRows.length },
  ], [perMold.length, subRows.length, moveRows.length]);

  const handleExport = (format: ExportFormat) => {
    try {
      if (tab === 'location') exportMoldLocationSummary(perMold, format);
      else if (tab === 'subcontract') exportMoldSubcontract(subRows, format);
      else exportMoldMovements(moveRows, format, `${moveRows.length} hareket${dateFrom || dateTo ? ` (${dateFrom || '…'} → ${dateTo || '…'})` : ''}`);
      showToast('Rapor dışa aktarıldı.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Dışa aktarma başarısız.', 'error');
    }
  };

  const locationColumns = useMemo<GridColumn<typeof perMold[number]>[]>(() => [
    {
      key: 'code', title: 'Kalıp',
      render: (m) => (
        <div className="min-w-0">
          <div className="font-black text-fg-strong truncate">{m.name}</div>
          <div className="font-mono text-2xs font-bold text-fg-muted truncate">{m.code}{m.sizeRange ? ` · ${m.sizeRange}` : ''}</div>
        </div>
      ),
      filterValue: (m) => `${m.code} ${m.name}`,
    },
    { key: 'factoryPairs', title: 'Fabrika', align: 'right', render: (m) => <Num v={m.factoryPairs} />, sortValue: (m) => m.factoryPairs },
    { key: 'subcontractPairs', title: 'Fason', align: 'right', render: (m) => <Num v={m.subcontractPairs} tone="text-amber-600" />, sortValue: (m) => m.subcontractPairs },
    { key: 'allocatedPairs', title: 'Tahsis', align: 'right', render: (m) => <Num v={m.allocatedPairs} tone="text-emerald-600" />, sortValue: (m) => m.allocatedPairs },
    { key: 'maintenancePairs', title: 'Bakım', align: 'right', render: (m) => <Num v={m.maintenancePairs} tone="text-violet-600" />, sortValue: (m) => m.maintenancePairs },
    { key: 'scrapPairs', title: 'Hurda', align: 'right', render: (m) => <Num v={m.scrapPairs} tone="text-red-600" />, sortValue: (m) => m.scrapPairs },
    { key: 'totalPairs', title: 'Toplam', align: 'right', render: (m) => <span className="font-mono font-black text-fg-strong">{formatPairs(m.totalPairs)}</span>, sortValue: (m) => m.totalPairs },
    { key: 'availablePairs', title: 'Kullanılabilir', align: 'right', render: (m) => <Num v={m.availablePairs} tone="text-brand" />, sortValue: (m) => m.availablePairs },
  ], []);

  const subColumns = useMemo<GridColumn<typeof subRows[number]>[]>(() => [
    {
      key: 'cariName', title: 'Cari',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-black text-fg-strong truncate">{r.cariName}</div>
          <div className="font-mono text-2xs font-bold text-fg-muted truncate">{r.cariCode}</div>
        </div>
      ),
      filterValue: (r) => `${r.cariCode} ${r.cariName}`,
    },
    {
      key: 'moldName', title: 'Kalıp',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-bold text-fg truncate">{r.moldName}</div>
          <div className="font-mono text-2xs font-bold text-fg-muted truncate">{r.moldCode}</div>
        </div>
      ),
      filterValue: (r) => `${r.moldCode} ${r.moldName}`,
    },
    { key: 'locationLabel', title: 'Konum', render: (r) => <StatusPill tone="amber">{r.locationLabel}</StatusPill>, filterValue: (r) => r.locationLabel },
    { key: 'pairs', title: 'Çift', align: 'right', render: (r) => <span className="font-mono font-black text-fg-strong">{formatPairs(r.pairs)}</span>, sortValue: (r) => r.pairs },
    { key: 'looseLeft', title: 'Tek Sol', align: 'right', render: (r) => <Num v={r.looseLeft} />, sortValue: (r) => r.looseLeft },
    { key: 'looseRight', title: 'Tek Sağ', align: 'right', render: (r) => <Num v={r.looseRight} />, sortValue: (r) => r.looseRight },
  ], []);

  const moveColumns = useMemo<GridColumn<typeof moveRows[number]>[]>(() => [
    { key: 'movementNo', title: 'Fiş No', width: '7rem', render: (r) => <span className="font-mono font-bold text-brand whitespace-nowrap">{r.movementNo}</span>, filterValue: (r) => r.movementNo },
    { key: 'date', title: 'Tarih', width: '8rem', render: (r) => <span className="font-mono text-2xs font-bold text-fg whitespace-nowrap">{r.date}</span>, sortValue: (r) => r.date },
    {
      key: 'moldName', title: 'Kalıp',
      render: (r) => (
        <div className="min-w-0">
          <div className="font-black text-fg-strong truncate">{r.moldName}</div>
          <div className="font-mono text-2xs font-bold text-fg-muted truncate">{r.moldCode}</div>
        </div>
      ),
      filterValue: (r) => `${r.moldCode} ${r.moldName}`,
    },
    { key: 'typeLabel', title: 'Tür', width: '10rem', render: (r) => <span className="text-2xs font-bold text-fg">{r.typeLabel}</span>, filterValue: (r) => r.typeLabel },
    { key: 'route', title: 'Kaynak → Hedef', render: (r) => <span className="text-2xs font-semibold text-fg-muted">{r.fromLabel} → {r.toLabel}</span>, filterable: false },
    { key: 'totalPairs', title: 'Çift', align: 'right', width: '5rem', render: (r) => <span className="font-mono font-bold text-fg">{formatPairs(r.totalPairs)}</span>, sortValue: (r) => r.totalPairs },
  ], []);

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Kalıp Raporları"
        subtitle="Konum özeti, fason emanet ve hareket dökümü — Excel/CSV dışa aktarma"
        icon={BarChart3}
        iconColor="indigo"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" icon={<FileSpreadsheet className="h-3.5 w-3.5" />} onClick={() => handleExport('xls')}>
              Excel (.xls)
            </Button>
            <Button variant="secondary" icon={<Download className="h-3.5 w-3.5" />} onClick={() => handleExport('csv')}>
              CSV
            </Button>
          </div>
        }
      />

      {tab === 'location' && totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Toplam Çift" value={formatPairs(totals.totalPairs)} sub={`${totals.moldCount} kalıp`} icon={BarChart3} tone="info" />
          <KpiCard label="Fabrika" value={formatPairs(totals.factoryPairs)} icon={BarChart3} tone="teal" />
          <KpiCard label="Fason" value={formatPairs(totals.subcontractPairs)} icon={BarChart3} tone="warning" />
          <KpiCard label="Tahsis" value={formatPairs(totals.allocatedPairs)} icon={BarChart3} tone="success" />
          <KpiCard label="Bakım/Hurda" value={formatPairs(totals.maintenancePairs + totals.scrapPairs)} icon={BarChart3} tone="violet" />
          <KpiCard label="Kullanılabilir" value={formatPairs(totals.availablePairs)} icon={BarChart3} tone="brand" />
        </div>
      )}

      <div className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card">
        <SegmentedFilter ariaLabel="Kalıp raporu seçimi" options={segments} value={tab} onChange={(k) => setTab(k as ReportTab)} />

        {tab === 'movements' && (
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 pt-1">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Fiş no, açıklama veya belge ara…" className="pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" aria-label="Başlangıç tarihi" />
              <span className="text-2xs font-bold text-fg-muted">→</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" aria-label="Bitiş tarihi" />
              <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} wrapperClassName="w-auto">
                <option value="all">Tüm Türler</option>
                {ALL_TYPES.map((t) => <option key={t} value={t}>{MOLD_MOVE_LABELS[t]}</option>)}
              </Select>
              <Select value={moldFilter} onChange={(e) => setMoldFilter(e.target.value)} wrapperClassName="w-auto">
                <option value="all">Tüm Kalıplar</option>
                {molds.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}
              </Select>
            </div>
          </div>
        )}
      </div>

      {tab === 'location' && (
        perMold.length === 0 ? (
          <EmptyBox title="Kalıp yok" description="Rapor için önce kalıp kartı ekleyin veya kalıp hareketi kaydedin." />
        ) : (
          <DataGrid columns={locationColumns} data={perMold} rowKey="id" density="compact" loading={!summary} defaultSort={{ key: 'totalPairs', dir: 'desc' }} emptyMessage="Kalıp bulunamadı." />
        )
      )}

      {tab === 'subcontract' && (
        subRows.length === 0 ? (
          <EmptyBox title="Fason emanet yok" description="Fason firmalarında bulunan kalıp çiftleri burada listelenir." />
        ) : (
          <DataGrid columns={subColumns} data={subRows} rowKey={(r: { cariCode: string; moldCode: string; locationLabel: string }) => `${r.cariCode}|${r.moldCode}|${r.locationLabel}`} density="compact" loading={stockQuery.loading} defaultSort={{ key: 'pairs', dir: 'desc' }} emptyMessage="Fason emanet bulunamadı." />
        )
      )}

      {tab === 'movements' && (
        moveRows.length === 0 ? (
          <EmptyBox title="Hareket yok" description="Filtreleri temizleyebilir veya tarih aralığını genişletebilirsiniz." />
        ) : (
          <DataGrid columns={moveColumns} data={moveRows} rowKey="movementNo" density="compact" loading={movesQuery.loading} defaultSort={{ key: 'date', dir: 'desc' }} emptyMessage="Hareket bulunamadı." />
        )
      )}
    </div>
  );
}

function Num({ v, tone }: { v: number; tone?: string }) {
  const n = Number(v) || 0;
  if (!n) return <span className="font-mono text-2xs text-fg-muted">·</span>;
  return <span className={`font-mono font-bold ${tone || 'text-fg'}`}>{formatPairs(n)}</span>;
}

function EmptyBox({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <EmptyState icon={<BarChart3 />} title={title} description={description} />
    </div>
  );
}
