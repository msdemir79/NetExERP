import { useMemo, useState } from 'react';
import { Boxes, ClipboardList, Edit, Move, QrCode, ShieldCheck } from 'lucide-react';
import DetailPanel from '../Common/DetailPanel';
import Tabs from '../Common/Tabs';
import Button from '../Common/Button';
import { StatusPill } from '../Common/DataGrid';
import PermissionGate from '../Common/PermissionGate';
import { api } from '../../api/client';
import { useApiQueryFull } from '../../hooks/useApiQuery';
import type { Contact, Mold, MoldMovement, MoldStock } from '../../types';
import {
  MOLD_LOCATION_LABELS,
  MOLD_LOCATION_TONE,
  MOLD_MOVE_LABELS,
  MOLD_MOVE_TONE,
  formatPairs,
} from './moldConstants';

export interface MoldDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mold: Mold | null;
  contacts: Contact[];
  onMove: (mold: Mold) => void;
  onCountAdjust: (mold: Mold) => void;
  onEdit: (mold: Mold) => void;
}

interface LocCol {
  key: string;
  locationType: MoldStock['locationType'];
  subcontractId: number;
  label: string;
}

export default function MoldDetailDrawer({
  isOpen,
  onClose,
  mold,
  contacts,
  onMove,
  onCountAdjust,
  onEdit,
}: MoldDetailDrawerProps) {
  const [tab, setTab] = useState<'stock' | 'moves'>('stock');
  const moldId = mold?.id ?? null;

  const stockQuery = useApiQueryFull<MoldStock[]>(
    () => (moldId ? api.moldStock.list({ where: { moldId: Number(moldId) } }) : Promise.resolve([])),
    [moldId],
    ['moldStock'],
  );
  const moveQuery = useApiQueryFull<MoldMovement[]>(
    () => (moldId ? api.moldMovements.list({ where: { moldId: Number(moldId) }, orderBy: 'date', orderDir: 'desc', limit: 100 }) : Promise.resolve([])),
    [moldId],
    ['moldMovements'],
  );

  const buckets = stockQuery.data || [];
  const movements = moveQuery.data || [];

  const subName = (id: number) => contacts.find((c) => Number(c.id) === Number(id))?.name || `#${id}`;

  const { columns, sizes, cell } = useMemo(() => {
    const colMap = new Map<string, LocCol>();
    for (const b of buckets) {
      const sub = Number(b.subcontractId) || 0;
      const key = `${b.locationType}|${sub}`;
      if (!colMap.has(key)) {
        colMap.set(key, {
          key,
          locationType: b.locationType,
          subcontractId: sub,
          label: sub ? `${MOLD_LOCATION_LABELS[b.locationType]} · ${subName(sub)}` : MOLD_LOCATION_LABELS[b.locationType],
        });
      }
    }
    const cols = Array.from(colMap.values());
    const sizeSet = new Set<string>();
    for (const b of buckets) sizeSet.add(b.size);
    const sizeList = Array.from(sizeSet).sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
    const cellMap = new Map<string, number>();
    for (const b of buckets) {
      const key = `${b.size}::${b.locationType}|${Number(b.subcontractId) || 0}`;
      cellMap.set(key, (cellMap.get(key) || 0) + (Number(b.pairs) || 0));
    }
    return { columns: cols, sizes: sizeList, cell: cellMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, contacts]);

  const totalPairs = buckets.reduce((s, b) => s + (Number(b.pairs) || 0), 0);
  const looseLeft = buckets.reduce((s, b) => s + (Number(b.looseLeft) || 0), 0);
  const looseRight = buckets.reduce((s, b) => s + (Number(b.looseRight) || 0), 0);

  if (!mold) return null;

  return (
    <DetailPanel
      isOpen={isOpen}
      onClose={onClose}
      widthClass="max-w-[560px]"
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono text-brand">{mold.code}</span>
          <span>{mold.name}</span>
        </span>
      }
      badge={
        Number(mold.isActive) ? <StatusPill tone="green">Aktif</StatusPill> : <StatusPill tone="slate">Pasif</StatusPill>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <PermissionGate module="molds" action="edit">
            <Button variant="primary" icon={<Move className="h-3.5 w-3.5" />} onClick={() => onMove(mold)}>
              Hareket
            </Button>
          </PermissionGate>
          <PermissionGate module="molds" action="approve">
            <Button variant="secondary" icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => onCountAdjust(mold)}>
              Sayım
            </Button>
          </PermissionGate>
          <PermissionGate module="molds" action="edit">
            <Button variant="secondary" icon={<Edit className="h-3.5 w-3.5" />} onClick={() => onEdit(mold)}>
              Düzenle
            </Button>
          </PermissionGate>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Görsel + kimlik */}
        <div className="flex gap-3">
          <div className="h-24 w-24 shrink-0 rounded-card border border-line bg-surface-raised overflow-hidden flex items-center justify-center">
            {mold.image ? (
              <img src={mold.image} alt={mold.name} className="h-full w-full object-contain" />
            ) : (
              <Boxes className="h-8 w-8 text-fg-muted" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <InfoRow label="Tip" value={mold.moldType || '—'} />
            <InfoRow label="Marka" value={mold.brand || '—'} />
            <InfoRow label="Malzeme" value={mold.material || '—'} />
            <InfoRow label="Numara Aralığı" value={mold.sizeRange || '—'} mono />
          </div>
          <div className="shrink-0 flex flex-col items-center gap-1 rounded-card border border-line bg-surface-raised px-2.5 py-2">
            <QrCode className="h-8 w-8 text-fg-strong" />
            <span className="font-mono text-[10px] font-bold text-fg-muted break-all text-center max-w-[80px]">
              {mold.barcode || mold.code}
            </span>
          </div>
        </div>

        {/* Özet çiftler */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Toplam Çift" value={formatPairs(totalPairs)} tone="text-fg-strong" />
          <MiniStat label="Tek Sol" value={String(looseLeft)} tone="text-warning" />
          <MiniStat label="Tek Sağ" value={String(looseRight)} tone="text-warning" />
        </div>

        {(mold.supplierName || mold.purchaseCost != null) && (
          <div className="rounded-card border border-line bg-surface-raised p-3 space-y-1.5">
            {mold.supplierName && <InfoRow label="Tedarikçi" value={mold.supplierName} />}
            {mold.purchaseCost != null && (
              <InfoRow label="Alış Maliyeti" value={`${Number(mold.purchaseCost).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${mold.currency || 'TRY'}`} mono />
            )}
            {mold.firstRecordDate && <InfoRow label="İlk Kayıt" value={String(mold.firstRecordDate).slice(0, 10)} />}
          </div>
        )}

        {mold.description && (
          <p className="text-2xs font-semibold text-fg-muted whitespace-pre-wrap">{mold.description}</p>
        )}

        <Tabs
          ariaLabel="Kalıp detay sekmeleri"
          value={tab}
          onChange={(k) => setTab(k as 'stock' | 'moves')}
          items={[
            { key: 'stock', label: 'Konum Dağılımı', icon: <Boxes className="h-3.5 w-3.5" /> },
            { key: 'moves', label: 'Hareketler', icon: <ClipboardList className="h-3.5 w-3.5" />, badge: <span className="ml-1 font-mono text-2xs">{movements.length}</span> },
          ]}
        />

        {tab === 'stock' ? (
          columns.length === 0 ? (
            <EmptyHint text="Bu kalıp için henüz stok kovası yok. “Hareket” ile ilk kalıp girişini yapın." />
          ) : (
            <div className="rounded-card border border-line overflow-hidden">
              <div className="overflow-auto max-h-72">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-raised">
                    <tr className="border-b border-line">
                      <th className="px-2.5 py-1.5 text-left font-bold text-fg-muted">Numara</th>
                      {columns.map((c) => (
                        <th key={c.key} className="px-2 py-1.5 text-right font-bold whitespace-nowrap">
                          <StatusPill tone={MOLD_LOCATION_TONE[c.locationType]} className="text-[10px]">{c.label}</StatusPill>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sizes.map((size) => (
                      <tr key={size} className="border-b border-line/60 last:border-0">
                        <td className="px-2.5 py-1 font-mono font-black text-fg-strong">{size}</td>
                        {columns.map((c) => {
                          const v = cell.get(`${size}::${c.key}`) || 0;
                          return (
                            <td key={c.key} className="px-2 py-1 text-right font-mono font-bold text-fg">
                              {v ? formatPairs(v) : <span className="text-fg-muted">·</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : movements.length === 0 ? (
          <EmptyHint text="Bu kalıp için hareket kaydı yok." />
        ) : (
          <ul className="space-y-1.5">
            {movements.map((mv) => (
              <li key={mv.id} className="rounded-card border border-line bg-surface px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <StatusPill tone={MOLD_MOVE_TONE[mv.type]}>{MOLD_MOVE_LABELS[mv.type]}</StatusPill>
                  <span className="font-mono text-2xs font-bold text-fg-muted">{mv.movementNo}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-2xs">
                  <span className="font-semibold text-fg-muted">{String(mv.date).slice(0, 16).replace('T', ' ')}</span>
                  {mv.fromLocationType && (
                    <span className="font-bold text-fg">
                      {MOLD_LOCATION_LABELS[mv.fromLocationType]}
                      {Number(mv.fromSubcontractId) ? ` · ${subName(Number(mv.fromSubcontractId))}` : ''}
                      {' → '}
                    </span>
                  )}
                  {mv.toLocationType && (
                    <span className="font-bold text-fg">
                      {MOLD_LOCATION_LABELS[mv.toLocationType]}
                      {Number(mv.toSubcontractId) ? ` · ${subName(Number(mv.toSubcontractId))}` : ''}
                    </span>
                  )}
                </div>
                {mv.description && <p className="mt-1 text-2xs font-semibold text-fg-muted line-clamp-2">{mv.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DetailPanel>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-2xs">
      <span className="font-bold uppercase tracking-wide text-fg-muted">{label}</span>
      <span className={`font-bold text-fg-strong truncate ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-card border border-line bg-surface-raised px-2.5 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-fg-muted truncate">{label}</p>
      <p className={`font-mono text-lg font-black leading-tight ${tone}`}>{value}</p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-card border border-dashed border-line px-3 py-6 text-center text-2xs font-semibold text-fg-muted">
      <ShieldCheck className="mx-auto mb-1.5 h-5 w-5 text-fg-muted" />
      {text}
    </div>
  );
}
