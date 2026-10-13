import { useMemo, useState } from 'react';
import { ArrowRight, ClipboardList, Move, Plus, Search } from 'lucide-react';
import { api } from '../../api/client';
import { useApiQuery, useApiQueryFull } from '../../hooks/useApiQuery';
import PageHeader from '../PageHeader';
import DataGrid, { GridColumn, StatusPill } from '../Common/DataGrid';
import DetailPanel from '../Common/DetailPanel';
import Button from '../Common/Button';
import EmptyState from '../Common/EmptyState';
import PermissionGate from '../Common/PermissionGate';
import { Input, Select } from '../Common/Field';
import MoldMoveModal from './MoldMoveModal';
import MoldCountAdjustModal from './MoldCountAdjustModal';
import {
  MOLD_LOCATION_LABELS,
  MOLD_MOVE_LABELS,
  MOLD_MOVE_TONE,
  formatPairs,
} from './moldConstants';
import type { Mold, MoldMovement, MoldMovementItem, MoldMoveType } from '../../types';

const ALL_TYPES = Object.keys(MOLD_MOVE_LABELS) as MoldMoveType[];

export default function MoldMovementsScreen() {
  const movesQuery = useApiQueryFull<MoldMovement[]>(
    () => api.moldMovements.list({ orderBy: 'date', orderDir: 'desc', limit: 500 }),
    [],
    ['moldMovements'],
  );
  const moldsQuery = useApiQueryFull(() => api.molds.list(), [], ['molds']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']) || [];

  const movements = movesQuery.data || [];
  const molds = moldsQuery.data || [];

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [moldFilter, setMoldFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [detail, setDetail] = useState<MoldMovement | null>(null);

  const moldById = useMemo(() => {
    const map = new Map<number, Mold>();
    for (const m of molds) if (m.id != null) map.set(Number(m.id), m);
    return map;
  }, [molds]);
  const subName = (id: number) => contacts.find((c) => Number(c.id) === Number(id))?.name || `#${id}`;

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('tr');
    return movements.filter((mv) => {
      if (typeFilter !== 'all' && mv.type !== typeFilter) return false;
      if (moldFilter !== 'all' && Number(mv.moldId) !== Number(moldFilter)) return false;
      if (needle) {
        const mold = moldById.get(Number(mv.moldId));
        const hay = `${mv.movementNo} ${mv.description || ''} ${mv.documentRef || ''} ${mold?.code || ''} ${mold?.name || ''}`.toLocaleLowerCase('tr');
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [movements, typeFilter, moldFilter, search, moldById]);

  const endpoint = (loc: MoldMovement['toLocationType'], sub: number) => {
    if (!loc) return null;
    const base = MOLD_LOCATION_LABELS[loc];
    return sub ? `${base} · ${subName(sub)}` : base;
  };

  const columns = useMemo<GridColumn<MoldMovement>[]>(() => [
    {
      key: 'movementNo', title: 'Fiş No', width: '7rem',
      render: (mv) => <span className="font-mono font-bold text-brand whitespace-nowrap">{mv.movementNo}</span>,
      filterValue: (mv) => mv.movementNo,
    },
    {
      key: 'date', title: 'Tarih', width: '8rem',
      render: (mv) => <span className="font-mono text-xs font-bold text-fg whitespace-nowrap">{String(mv.date).slice(0, 16).replace('T', ' ')}</span>,
      sortValue: (mv) => String(mv.date),
    },
    {
      key: 'moldId', title: 'Kalıp',
      render: (mv) => {
        const mold = moldById.get(Number(mv.moldId));
        return (
          <div className="min-w-0">
            <div className="font-black text-fg-strong truncate">{mold?.name || `#${mv.moldId}`}</div>
            <div className="font-mono text-2xs font-bold text-fg-muted truncate">{mold?.code || ''}</div>
          </div>
        );
      },
      filterValue: (mv) => {
        const mold = moldById.get(Number(mv.moldId));
        return `${mold?.code || ''} ${mold?.name || ''}`;
      },
    },
    {
      key: 'type', title: 'Tür', width: '11rem',
      render: (mv) => <StatusPill tone={MOLD_MOVE_TONE[mv.type]}>{MOLD_MOVE_LABELS[mv.type]}</StatusPill>,
      filterValue: (mv) => MOLD_MOVE_LABELS[mv.type],
    },
    {
      key: 'route', title: 'Kaynak → Hedef', width: '15rem',
      render: (mv) => {
        const from = endpoint(mv.fromLocationType, Number(mv.fromSubcontractId));
        const to = endpoint(mv.toLocationType, Number(mv.toSubcontractId));
        return (
          <span className="inline-flex items-center gap-1.5 text-2xs font-bold text-fg">
            <span className="text-fg-muted">{from || 'Giriş'}</span>
            <ArrowRight className="h-3 w-3 text-brand shrink-0" />
            <span>{to || '—'}</span>
          </span>
        );
      },
      filterable: false,
    },
    {
      key: 'description', title: 'Açıklama',
      render: (mv) => <span className="text-2xs font-semibold text-fg-muted line-clamp-1">{mv.description || '—'}</span>,
      filterValue: (mv) => `${mv.description || ''} ${mv.documentRef || ''}`,
    },
  ], [moldById, contacts]);

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Kalıp Hareketleri"
        subtitle="Tüm kalıp giriş/çıkış, fason, bakım ve sayım hareketlerinin defteri"
        badge={`${movements.length} Hareket`}
        icon={ClipboardList}
        iconColor="purple"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PermissionGate module="molds" action="approve">
              <Button variant="secondary" icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => setAdjustOpen(true)}>
                Sayım Düzelt
              </Button>
            </PermissionGate>
            <PermissionGate module="molds" action="edit">
              <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setMoveOpen(true)}>
                Yeni Hareket
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <div className="space-y-3 rounded-card border border-line bg-surface p-3 shadow-card">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Fiş no, açıklama, belge veya kalıp ara…" className="pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
      </div>

      {filtered.length === 0 && !movesQuery.loading ? (
        <div className="rounded-card border border-line bg-surface shadow-card">
          <EmptyState
            icon={<Move />}
            title="Hareket bulunamadı"
            description="Filtreleri değiştirebilir veya yeni bir kalıp hareketi kaydedebilirsiniz."
            action={<Button variant="secondary" onClick={() => { setSearch(''); setTypeFilter('all'); setMoldFilter('all'); }}>Filtreleri Temizle</Button>}
          />
        </div>
      ) : (
        <DataGrid
          columns={columns}
          data={filtered}
          rowKey="id"
          density="compact"
          loading={movesQuery.loading}
          onRowClick={(mv) => setDetail(mv)}
          defaultSort={{ key: 'date', dir: 'desc' }}
          emptyMessage="Hareket bulunamadı."
        />
      )}

      <MovementDetail movement={detail} onClose={() => setDetail(null)} moldById={moldById} subName={subName} />

      <MoldMoveModal
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        molds={molds}
        contacts={contacts}
        onDone={() => movesQuery.refetch()}
      />
      <MoldCountAdjustModal
        isOpen={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        molds={molds}
        contacts={contacts}
        onDone={() => movesQuery.refetch()}
      />
    </div>
  );
}

function MovementDetail({
  movement,
  onClose,
  moldById,
  subName,
}: {
  movement: MoldMovement | null;
  onClose: () => void;
  moldById: Map<number, Mold>;
  subName: (id: number) => string;
}) {
  const movementId = movement?.id ?? null;
  const itemsQuery = useApiQueryFull<MoldMovementItem[]>(
    () => (movementId ? api.moldMovementItems.list({ where: { movementId: Number(movementId) } }) : Promise.resolve([])),
    [movementId],
    ['moldMovementItems'],
  );
  const items = itemsQuery.data || [];
  if (!movement) return null;
  const mold = moldById.get(Number(movement.moldId));
  const totalPairs = items.reduce((s, it) => s + (Number(it.pairs) || 0), 0);

  const from = movement.fromLocationType
    ? `${MOLD_LOCATION_LABELS[movement.fromLocationType]}${Number(movement.fromSubcontractId) ? ` · ${subName(Number(movement.fromSubcontractId))}` : ''}`
    : 'Giriş (kaynak yok)';
  const to = movement.toLocationType
    ? `${MOLD_LOCATION_LABELS[movement.toLocationType]}${Number(movement.toSubcontractId) ? ` · ${subName(Number(movement.toSubcontractId))}` : ''}`
    : '—';

  return (
    <DetailPanel
      isOpen={!!movement}
      onClose={onClose}
      widthClass="max-w-[460px]"
      title={<span className="font-mono">{movement.movementNo}</span>}
      badge={<StatusPill tone={MOLD_MOVE_TONE[movement.type]}>{MOLD_MOVE_LABELS[movement.type]}</StatusPill>}
    >
      <div className="space-y-4">
        <div className="rounded-card border border-line bg-surface-raised p-3 space-y-1.5">
          <Row label="Kalıp" value={`${mold?.code || ''} ${mold?.name || `#${movement.moldId}`}`} />
          <Row label="Tarih" value={String(movement.date).slice(0, 16).replace('T', ' ')} mono />
          <Row label="Kaynak" value={from} />
          <Row label="Hedef" value={to} />
          {movement.documentRef && <Row label="Belge" value={movement.documentRef} mono />}
          {movement.deliveredBy && <Row label="Teslim Eden" value={movement.deliveredBy} />}
          {movement.receivedBy && <Row label="Teslim Alan" value={movement.receivedBy} />}
          {Number(movement.toWorkOrderId) > 0 && <Row label="İş Emri" value={`#${movement.toWorkOrderId}`} mono />}
        </div>

        {movement.description && (
          <p className="text-2xs font-semibold text-fg whitespace-pre-wrap">{movement.description}</p>
        )}

        <div className="rounded-card border border-line overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-surface-raised">
            <span className="text-xs font-black uppercase tracking-wider text-fg-muted">Numara Kırılımı</span>
            <span className="font-mono text-2xs font-black text-fg-strong">{formatPairs(totalPairs)} çift</span>
          </div>
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-2xs font-semibold text-fg-muted">Satır yok.</div>
          ) : (
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
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-1 font-mono font-black text-fg-strong">{it.size}</td>
                    <td className="px-2 py-1 text-right font-mono font-bold text-fg">{formatPairs(Number(it.pairs) || 0)}</td>
                    <td className="px-2 py-1 text-right font-mono text-fg-muted">{it.looseLeft || '·'}</td>
                    <td className="px-2 py-1 text-right font-mono text-fg-muted">{it.looseRight || '·'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
