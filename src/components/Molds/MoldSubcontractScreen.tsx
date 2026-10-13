import { useMemo, useState } from 'react';
import {
  Handshake,
  Search,
  Move,
  Undo2,
  ArrowLeftRight,
  MoreHorizontal,
  Boxes,
  Users,
  Layers,
} from 'lucide-react';
import { api } from '../../api/client';
import { useApiQuery, useApiQueryFull } from '../../hooks/useApiQuery';
import PageHeader from '../PageHeader';
import KpiCard from '../Common/KpiCard';
import DataGrid, { GridColumn, StatusPill } from '../Common/DataGrid';
import SegmentedFilter, { SegmentOption } from '../Common/SegmentedFilter';
import DetailPanel from '../Common/DetailPanel';
import Button from '../Common/Button';
import ActionMenu from '../Common/ActionMenu';
import EmptyState from '../Common/EmptyState';
import PermissionGate from '../Common/PermissionGate';
import { Input, Select } from '../Common/Field';
import MoldMoveModal from './MoldMoveModal';
import {
  MOLD_LOCATION_LABELS,
  MOLD_LOCATION_TONE,
  MOLD_SUBCONTRACT_LOCATIONS,
  formatPairs,
  type MoveType,
} from './moldConstants';
import type { Contact, Mold, MoldLocationType, MoldStock } from '../../types';

type LocFilter = 'all' | 'subcontract' | 'subcontract_warehouse';

interface SizeBreak {
  size: string;
  pairs: number;
  looseLeft: number;
  looseRight: number;
}

interface FasonRow {
  key: string;
  moldId: number;
  subcontractId: number;
  locationType: MoldLocationType;
  pairs: number;
  looseLeft: number;
  looseRight: number;
  sizes: SizeBreak[];
}

export default function MoldSubcontractScreen() {
  const stockQuery = useApiQueryFull<MoldStock[]>(() => api.moldStock.list({ limit: 5000 }), [], ['moldStock']);
  const moldsQuery = useApiQueryFull(() => api.molds.list(), [], ['molds']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']) || [];

  const buckets = stockQuery.data || [];
  const molds = moldsQuery.data || [];

  const [search, setSearch] = useState('');
  const [cariFilter, setCariFilter] = useState<string>('all');
  const [locFilter, setLocFilter] = useState<LocFilter>('all');
  const [detail, setDetail] = useState<FasonRow | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveMoldId, setMoveMoldId] = useState<number | null>(null);
  const [moveType, setMoveType] = useState<MoveType>('from_subcontract_return');
  const [moveFromSub, setMoveFromSub] = useState<number | null>(null);

  const moldById = useMemo(() => {
    const map = new Map<number, Mold>();
    for (const m of molds) if (m.id != null) map.set(Number(m.id), m);
    return map;
  }, [molds]);
  const contactById = useMemo(() => {
    const map = new Map<number, Contact>();
    for (const c of contacts) if (c.id != null) map.set(Number(c.id), c);
    return map;
  }, [contacts]);
  const subName = (id: number) => contactById.get(Number(id))?.name || `#${id}`;

  // Fason konumlarındaki kovaları (kalıp, cari, konum) bazında toplulaştır.
  const rows = useMemo<FasonRow[]>(() => {
    const map = new Map<string, FasonRow>();
    for (const b of buckets) {
      if (!MOLD_SUBCONTRACT_LOCATIONS.includes(b.locationType)) continue;
      const pairs = Number(b.pairs) || 0;
      const looseLeft = Number(b.looseLeft) || 0;
      const looseRight = Number(b.looseRight) || 0;
      if (pairs <= 0 && looseLeft <= 0 && looseRight <= 0) continue;
      const moldId = Number(b.moldId);
      const subcontractId = Number(b.subcontractId);
      const key = `${moldId}|${subcontractId}|${b.locationType}`;
      const existing = map.get(key);
      if (existing) {
        existing.pairs += pairs;
        existing.looseLeft += looseLeft;
        existing.looseRight += looseRight;
        existing.sizes.push({ size: b.size, pairs, looseLeft, looseRight });
      } else {
        map.set(key, {
          key,
          moldId,
          subcontractId,
          locationType: b.locationType,
          pairs,
          looseLeft,
          looseRight,
          sizes: [{ size: b.size, pairs, looseLeft, looseRight }],
        });
      }
    }
    const out = Array.from(map.values());
    for (const r of out) r.sizes.sort((a, b) => a.size.localeCompare(b.size, 'tr', { numeric: true }));
    return out;
  }, [buckets]);

  const totals = useMemo(() => {
    const pairs = rows.reduce((s, r) => s + r.pairs, 0);
    const loose = rows.reduce((s, r) => s + r.looseLeft + r.looseRight, 0);
    const moldSet = new Set(rows.map((r) => r.moldId));
    const cariSet = new Set(rows.map((r) => r.subcontractId));
    return { pairs, loose, moldCount: moldSet.size, cariCount: cariSet.size };
  }, [rows]);

  const cariOptions = useMemo(() => {
    const ids: number[] = [];
    for (const r of rows) if (!ids.includes(r.subcontractId)) ids.push(r.subcontractId);
    ids.sort((a, b) => a - b);
    return ids.map((id) => ({ id, name: subName(id) }));
  }, [rows, contactById]);

  const segments: SegmentOption[] = useMemo(() => [
    { key: 'all', label: 'Tümü', count: rows.length },
    { key: 'subcontract', label: MOLD_LOCATION_LABELS.subcontract, count: rows.filter((r) => r.locationType === 'subcontract').length },
    { key: 'subcontract_warehouse', label: MOLD_LOCATION_LABELS.subcontract_warehouse, count: rows.filter((r) => r.locationType === 'subcontract_warehouse').length },
  ], [rows]);

  const filtered = useMemo<FasonRow[]>(() => {
    const needle = search.trim().toLocaleLowerCase('tr');
    return rows.filter((r) => {
      if (locFilter !== 'all' && r.locationType !== locFilter) return false;
      if (cariFilter !== 'all' && String(r.subcontractId) !== cariFilter) return false;
      if (needle) {
        const mold = moldById.get(r.moldId);
        const hay = `${mold?.code || ''} ${mold?.name || ''} ${subName(r.subcontractId)}`.toLocaleLowerCase('tr');
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, locFilter, cariFilter, search, moldById, contactById]);

  const openMove = (row: FasonRow | null, type: MoveType) => {
    setMoveMoldId(row ? row.moldId : null);
    setMoveType(type);
    setMoveFromSub(row ? row.subcontractId : null);
    setMoveOpen(true);
  };

  const columns = useMemo<GridColumn<FasonRow>[]>(() => [
    {
      key: 'subcontractId', title: 'Fason Cari',
      render: (r) => <span className="font-bold text-fg-strong truncate">{subName(r.subcontractId)}</span>,
      filterValue: (r) => subName(r.subcontractId),
      sortValue: (r) => subName(r.subcontractId),
    },
    {
      key: 'moldId', title: 'Kalıp',
      render: (r) => {
        const mold = moldById.get(r.moldId);
        return (
          <div className="min-w-0">
            <div className="font-black text-fg-strong truncate">{mold?.name || `#${r.moldId}`}</div>
            <div className="font-mono text-2xs font-bold text-fg-muted truncate">{mold?.code || ''}</div>
          </div>
        );
      },
      filterValue: (r) => {
        const mold = moldById.get(r.moldId);
        return `${mold?.code || ''} ${mold?.name || ''}`;
      },
    },
    {
      key: 'locationType', title: 'Konum', width: '9rem', align: 'center',
      render: (r) => <StatusPill tone={MOLD_LOCATION_TONE[r.locationType]}>{MOLD_LOCATION_LABELS[r.locationType]}</StatusPill>,
      filterValue: (r) => MOLD_LOCATION_LABELS[r.locationType],
    },
    {
      key: 'pairs', title: 'Çift', align: 'right', width: '6rem',
      render: (r) => <span className="font-mono font-black text-fg-strong">{formatPairs(r.pairs)}</span>,
      sortValue: (r) => r.pairs,
    },
    {
      key: 'looseLeft', title: 'Tek Sol', align: 'right', width: '5rem',
      render: (r) => <span className="font-mono font-bold text-fg-muted">{r.looseLeft || '·'}</span>,
      sortValue: (r) => r.looseLeft,
    },
    {
      key: 'looseRight', title: 'Tek Sağ', align: 'right', width: '5rem',
      render: (r) => <span className="font-mono font-bold text-fg-muted">{r.looseRight || '·'}</span>,
      sortValue: (r) => r.looseRight,
    },
  ], [moldById, contactById]);

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Fason Takip"
        subtitle="Fason firmalara emanet edilen kalıplar: cari bazında çift dağılımı, iade ve transfer"
        badge={`${totals.cariCount} Cari · ${formatPairs(totals.pairs)} Çift`}
        icon={Handshake}
        iconColor="amber"
        actions={
          <PermissionGate module="molds" action="edit">
            <Button variant="primary" icon={<Move className="h-3.5 w-3.5" />} onClick={() => openMove(null, 'to_subcontract')}>
              Fasona Gönder
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Fasondaki Çift" value={formatPairs(totals.pairs)} icon={Boxes} tone="warning" />
        <KpiCard label="Fasondaki Kalıp" value={totals.moldCount} icon={Layers} tone="brand" />
        <KpiCard label="Fason Cari" value={totals.cariCount} icon={Users} tone="info" />
        <KpiCard label="Tek Parça" value={totals.loose} sub="Sol + sağ" icon={Boxes} tone="violet" />
      </div>

      <div className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari veya kalıp ara…" className="pl-9" />
          </div>
          <Select value={cariFilter} onChange={(e) => setCariFilter(e.target.value)} wrapperClassName="w-auto">
            <option value="all">Tüm Cariler</option>
            {cariOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <SegmentedFilter ariaLabel="Fason konum filtresi" options={segments} value={locFilter} onChange={(k) => setLocFilter(k as LocFilter)} />
      </div>

      {filtered.length === 0 && !stockQuery.loading ? (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <EmptyState
            icon={<Handshake />}
            title="Fasonda kalıp yok"
            description="Fason firmalara gönderilen kalıplar burada cari bazında listelenir."
            action={<Button variant="secondary" onClick={() => { setSearch(''); setCariFilter('all'); setLocFilter('all'); }}>Filtreleri Temizle</Button>}
          />
        </div>
      ) : (
        <DataGrid<FasonRow>
          columns={columns}
          data={filtered}
          rowKey={(r) => r.key}
          density="compact"
          loading={stockQuery.loading}
          onRowClick={(r) => setDetail(r)}
          defaultSort={{ key: 'pairs', dir: 'desc' }}
          emptyMessage="Fasonda kalıp bulunamadı."
          rowActions={(r) => (
            <ActionMenu
              label={`${subName(r.subcontractId)} işlemleri`}
              icon={<MoreHorizontal className="h-4 w-4" />}
              items={[
                { key: 'detail', label: 'Detay', icon: <Boxes className="h-4 w-4" />, onSelect: () => setDetail(r) },
                { key: 'return', label: 'İade Et', icon: <Undo2 className="h-4 w-4" />, onSelect: () => openMove(r, 'from_subcontract_return') },
                { key: 'transfer', label: 'Başka Fasone Transfer', icon: <ArrowLeftRight className="h-4 w-4" />, onSelect: () => openMove(r, 'subcontract_transfer') },
              ]}
            />
          )}
        />
      )}

      <FasonDetail
        row={detail}
        onClose={() => setDetail(null)}
        moldById={moldById}
        subName={subName}
        onMove={openMove}
      />

      <MoldMoveModal
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        molds={molds}
        contacts={contacts}
        initialMoldId={moveMoldId}
        initialType={moveType}
        initialFromSubcontractId={moveFromSub}
        onDone={() => stockQuery.refetch()}
      />
    </div>
  );
}

function FasonDetail({
  row,
  onClose,
  moldById,
  subName,
  onMove,
}: {
  row: FasonRow | null;
  onClose: () => void;
  moldById: Map<number, Mold>;
  subName: (id: number) => string;
  onMove: (row: FasonRow | null, type: MoveType) => void;
}) {
  if (!row) return null;
  const mold = moldById.get(row.moldId);
  return (
    <DetailPanel
      isOpen={!!row}
      onClose={onClose}
      widthClass="max-w-[440px]"
      title={mold ? `${mold.code} · ${mold.name}` : `Kalıp #${row.moldId}`}
      badge={<StatusPill tone={MOLD_LOCATION_TONE[row.locationType]}>{MOLD_LOCATION_LABELS[row.locationType]}</StatusPill>}
      footer={
        <div className="flex items-center gap-2">
          <PermissionGate module="molds" action="edit">
            <Button variant="secondary" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => onMove(row, 'from_subcontract_return')}>İade Et</Button>
          </PermissionGate>
          <PermissionGate module="molds" action="edit">
            <Button variant="secondary" icon={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={() => onMove(row, 'subcontract_transfer')}>Transfer</Button>
          </PermissionGate>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-card border border-line bg-surface-raised p-3 space-y-1.5">
          <Row label="Fason Cari" value={subName(row.subcontractId)} />
          <Row label="Konum" value={MOLD_LOCATION_LABELS[row.locationType]} />
          <Row label="Toplam Çift" value={formatPairs(row.pairs)} mono />
          <Row label="Tek Sol / Sağ" value={`${row.looseLeft} / ${row.looseRight}`} mono />
        </div>

        <div className="rounded-card border border-line overflow-hidden">
          <div className="px-3 py-2 border-b border-line bg-surface-raised">
            <span className="text-xs font-black uppercase tracking-wider text-fg-muted">Numara Kırılımı</span>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-surface text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-1.5 text-left font-bold">Numara</th>
                <th className="px-2 py-1.5 text-right font-bold">Çift</th>
                <th className="px-2 py-1.5 text-right font-bold">Tek Sol</th>
                <th className="px-2 py-1.5 text-right font-bold">Tek Sağ</th>
              </tr>
            </thead>
            <tbody>
              {row.sizes.map((s) => (
                <tr key={s.size} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-1 font-mono font-black text-fg-strong">{s.size}</td>
                  <td className="px-2 py-1 text-right font-mono font-bold text-fg">{formatPairs(s.pairs)}</td>
                  <td className="px-2 py-1 text-right font-mono text-fg-muted">{s.looseLeft || '·'}</td>
                  <td className="px-2 py-1 text-right font-mono text-fg-muted">{s.looseRight || '·'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DetailPanel>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-2xs">
      <span className="font-bold uppercase tracking-wide text-fg-muted shrink-0">{label}</span>
      <span className={`font-bold text-fg-strong text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
