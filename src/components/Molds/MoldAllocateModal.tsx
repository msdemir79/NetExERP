import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import Modal from '../Modal';
import Button from '../Common/Button';
import { Field, Input, Select, Textarea } from '../Common/Field';
import { api, moldAllocate, moldDeallocate } from '../../api/client';
import { useApiQueryFull } from '../../hooks/useApiQuery';
import { showToast } from '../../lib/feedback';
import type { Mold, MoldStock, WorkOrder } from '../../types';
import { MOLD_FACTORY_LOCATIONS, formatPairs, moldSizes } from './moldConstants';

export interface MoldAllocateModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder | null;
  molds: Mold[];
  onDone: () => void;
}

interface ItemRow {
  size: string;
  pairs: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fabrika konumlarında (workOrderId=0) serbest çiftler. */
function freePairsAt(buckets: MoldStock[], size: string): number {
  return buckets
    .filter(
      (b) =>
        b.size === size &&
        Number(b.workOrderId) === 0 &&
        MOLD_FACTORY_LOCATIONS.includes(b.locationType as (typeof MOLD_FACTORY_LOCATIONS)[number]),
    )
    .reduce((s, b) => s + (Number(b.pairs) || 0), 0);
}

/** Bu iş emrine tahsisli (allocated + workOrderId) çiftler. */
function allocatedPairsAt(buckets: MoldStock[], size: string, workOrderId: number): number {
  return buckets
    .filter((b) => b.size === size && b.locationType === 'allocated' && Number(b.workOrderId) === Number(workOrderId))
    .reduce((s, b) => s + (Number(b.pairs) || 0), 0);
}

export default function MoldAllocateModal({ isOpen, onClose, workOrder, molds, onDone }: MoldAllocateModalProps) {
  const matchedMolds = useMemo(
    () => molds.filter((m) => Number(m.productId) === Number(workOrder?.productId)),
    [molds, workOrder],
  );
  const initialMoldId = matchedMolds[0]?.id ?? molds[0]?.id ?? null;

  const [mode, setMode] = useState<'allocate' | 'deallocate'>('allocate');
  const [moldId, setMoldId] = useState<number | null>(initialMoldId);
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mold = molds.find((m) => Number(m.id) === Number(moldId)) || null;

  const stockQuery = useApiQueryFull<MoldStock[]>(
    () => (moldId ? api.moldStock.list({ where: { moldId: Number(moldId) } }) : Promise.resolve([])),
    [moldId],
    ['moldStock'],
  );
  const buckets = stockQuery.data || [];

  useEffect(() => {
    setRows(moldSizes(mold).map((size) => ({ size, pairs: '' })));
  }, [mold]);

  useEffect(() => {
    if (isOpen) {
      setMode('allocate');
      setMoldId(initialMoldId);
      setDate(today());
      setDescription('');
      setErrors({});
    }
  }, [isOpen, initialMoldId]);

  const setRow = (size: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.size === size ? { ...r, pairs: value } : r)));

  const totalPairs = rows.reduce((s, r) => s + (Number(r.pairs) || 0), 0);

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!workOrder?.id) e.workOrder = 'İş emri bulunamadı.';
    if (!moldId) e.mold = 'Kalıp seçilmelidir.';
    if (rows.every((r) => (Number(r.pairs) || 0) === 0)) e.items = 'En az bir numara için çift girilmelidir.';
    setErrors(e);
    if (Object.keys(e).length) return;

    const items = rows
      .map((r) => ({ size: r.size, pairs: Number(r.pairs) || 0, looseLeft: 0, looseRight: 0 }))
      .filter((it) => it.pairs > 0);

    setSaving(true);
    try {
      const payload = {
        moldId: Number(moldId),
        workOrderId: Number(workOrder!.id),
        items,
        date,
        description: description.trim() || undefined,
      };
      const result = mode === 'allocate' ? await moldAllocate(payload) : await moldDeallocate(payload);
      showToast(
        `${result.movementNo} — ${formatPairs(result.totalPairs)} çift ${mode === 'allocate' ? 'tahsis edildi' : 'tahsisten çıkarıldı'}.`,
        'success',
      );
      onDone();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Kalıp tahsisi kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requiredPairs = Number(workOrder?.quantity) || 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kalıp Tahsisi"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs font-semibold text-fg-muted">
            Toplam: <span className="font-mono font-black text-fg-strong">{formatPairs(totalPairs)}</span> çift
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
            <Button variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={handleSubmit}>
              {mode === 'allocate' ? 'Tahsis Et' : 'Tahsisi İptal Et'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-card border border-line bg-surface-raised px-3 py-2 text-2xs font-bold text-fg-strong">
          <div>İş Emri: <span className="font-mono">{workOrder?.barcode || `#${workOrder?.id ?? ''}`}</span></div>
          <div className="text-fg-muted">
            Gerekli miktar: <span className="font-mono text-fg-strong">{formatPairs(requiredPairs)}</span> çift
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="İşlem" htmlFor="al-mode">
            <Select id="al-mode" value={mode} onChange={(ev) => setMode(ev.target.value as 'allocate' | 'deallocate')}>
              <option value="allocate">İş Emrine Tahsis</option>
              <option value="deallocate">Tahsis İptali (Depoya Geri Al)</option>
            </Select>
          </Field>
          <Field label="Kalıp" htmlFor="al-mold" required error={errors.mold}>
            <Select id="al-mold" value={moldId ?? ''} onChange={(ev) => setMoldId(ev.target.value === '' ? null : Number(ev.target.value))}>
              <option value="">— Kalıp seçin —</option>
              {molds.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.name}{m.sizeRange ? ` (${m.sizeRange})` : ''}
                  {matchedMolds.some((mm) => Number(mm.id) === Number(m.id)) ? ' ✓' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {matchedMolds.length === 0 && (
          <p className="text-2xs font-semibold text-amber-600">
            Bu iş emrinin ürününe bağlı kalıp kartı yok; listeden uygun kalıbı elle seçin.
          </p>
        )}

        <div className="rounded-card border border-line overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-surface-raised">
            <span className="text-xs font-black uppercase tracking-wider text-fg-muted">Numara Kırılımı (çift)</span>
            <span className="text-2xs font-semibold text-fg-muted">
              {mode === 'allocate' ? 'Serbest çiftler gösterilir' : 'Bu iş emrine tahsisli çiftler gösterilir'}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-2xs font-semibold text-fg-muted">
              Bu kalıbın numara kümesi yok. Önce kalıp kartında bir asorti şablonu bağlayın.
            </div>
          ) : (
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface text-fg-muted">
                  <tr className="border-b border-line">
                    <th className="px-3 py-1.5 text-left font-bold">Numara</th>
                    <th className="px-2 py-1.5 text-right font-bold">{mode === 'allocate' ? 'Serbest' : 'Tahsisli'}</th>
                    <th className="px-2 py-1.5 text-right font-bold">Çift</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const avail =
                      mode === 'allocate'
                        ? freePairsAt(buckets, r.size)
                        : allocatedPairsAt(buckets, r.size, Number(workOrder?.id));
                    return (
                      <tr key={r.size} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-1 font-mono font-black text-fg-strong">{r.size}</td>
                        <td className="px-2 py-1 text-right font-mono font-bold text-fg-muted">{formatPairs(avail)}</td>
                        <td className="px-2 py-1">
                          <input
                            type="number" min="0" step="1" value={r.pairs}
                            onChange={(ev) => setRow(r.size, ev.target.value)}
                            className="w-20 h-7 rounded-md border border-line bg-surface-raised px-1.5 text-right font-mono font-bold text-fg-strong outline-none focus:border-brand"
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {errors.items && <div className="px-3 py-2 text-2xs font-bold text-danger">{errors.items}</div>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Tarih" htmlFor="al-date">
            <Input id="al-date" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} />
          </Field>
          <Field label="Açıklama" htmlFor="al-desc">
            <Textarea id="al-desc" value={description} onChange={(ev) => setDescription(ev.target.value)} placeholder="Opsiyonel açıklama…" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
