import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import Modal from '../Modal';
import Button from '../Common/Button';
import { Field, Input, Select, Textarea } from '../Common/Field';
import ContactSelect from '../Contacts/ContactSelect';
import { api, moldCountAdjust } from '../../api/client';
import { useApiQueryFull } from '../../hooks/useApiQuery';
import { showToast } from '../../lib/feedback';
import type { Contact, Mold, MoldLocationType, MoldStock } from '../../types';
import {
  MOLD_LOCATION_LABELS,
  MOLD_SUBCONTRACT_LOCATIONS,
  formatPairs,
  moldSizes,
} from './moldConstants';

const ALL_LOCATIONS = Object.keys(MOLD_LOCATION_LABELS) as MoldLocationType[];

export interface MoldCountAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  molds: Mold[];
  contacts: Contact[];
  initialMoldId?: number | null;
  onDone: () => void;
}

interface ItemRow {
  size: string;
  counted: string;
  looseLeft: string;
  looseRight: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MoldCountAdjustModal({
  isOpen,
  onClose,
  molds,
  contacts,
  initialMoldId,
  onDone,
}: MoldCountAdjustModalProps) {
  const [moldId, setMoldId] = useState<number | null>(initialMoldId ?? null);
  const [locationType, setLocationType] = useState<MoldLocationType>('factory_warehouse');
  const [subcontractId, setSubcontractId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mold = molds.find((m) => Number(m.id) === Number(moldId)) || null;
  const isSub = MOLD_SUBCONTRACT_LOCATIONS.includes(locationType);

  const stockQuery = useApiQueryFull<MoldStock[]>(
    () => (moldId ? api.moldStock.list({ where: { moldId: Number(moldId) } }) : Promise.resolve([])),
    [moldId],
    ['moldStock'],
  );
  const buckets = stockQuery.data || [];

  useEffect(() => {
    if (!mold) {
      setRows([]);
      return;
    }
    const sizes = moldSizes(mold);
    const sizeSet = new Set(sizes);
    // Kovada olup asortide olmayan numaralar da sayılabilsin.
    for (const b of buckets) {
      if (Number(b.workOrderId) === 0 && b.locationType === locationType && Number(b.subcontractId) === (isSub ? Number(subcontractId) || 0 : 0)) {
        sizeSet.add(b.size);
      }
    }
    const currentAt = (size: string) =>
      buckets
        .filter((b) => b.size === size && b.locationType === locationType && Number(b.subcontractId) === (isSub ? Number(subcontractId) || 0 : 0) && Number(b.workOrderId) === 0)
        .reduce((s, b) => s + (Number(b.pairs) || 0), 0);
    setRows(
      Array.from(sizeSet).map((size) => ({
        size,
        counted: String(currentAt(size)),
        looseLeft: '',
        looseRight: '',
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mold, locationType, subcontractId, buckets]);

  useEffect(() => {
    if (isOpen) {
      setMoldId(initialMoldId ?? null);
      setLocationType('factory_warehouse');
      setSubcontractId(null);
      setReason('');
      setDate(today());
      setErrors({});
    }
  }, [isOpen, initialMoldId]);

  const setRow = (size: string, key: keyof ItemRow, value: string) =>
    setRows((prev) => prev.map((r) => (r.size === size ? { ...r, [key]: value } : r)));

  const diffs = useMemo(() => {
    return rows
      .map((r) => {
        const counted = Math.max(0, Number(r.counted) || 0);
        const before = buckets
          .filter((b) => b.size === r.size && b.locationType === locationType && Number(b.subcontractId) === (isSub ? Number(subcontractId) || 0 : 0) && Number(b.workOrderId) === 0)
          .reduce((s, b) => s + (Number(b.pairs) || 0), 0);
        return { size: r.size, before, after: counted, delta: Number((counted - before).toFixed(4)) };
      })
      .filter((d) => d.delta !== 0);
  }, [rows, buckets, locationType, subcontractId, isSub]);

  const handleSubmit = async () => {
    const e: Record<string, string> = {};
    if (!moldId) e.mold = 'Kalıp seçilmelidir.';
    if (isSub && !subcontractId) e.sub = 'Fason konumu için cari seçilmelidir.';
    if (reason.trim().length < 3) e.reason = 'Gerekçe zorunludur (en az 3 karakter).';
    if (!diffs.length) e.items = 'Sayım sonucu mevcut kayıtlarla aynı; düzeltilecek fark yok.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      const result = await moldCountAdjust({
        moldId: Number(moldId),
        locationType,
        subcontractId: isSub ? Number(subcontractId) : undefined,
        reason: reason.trim(),
        date,
        items: rows.map((r) => ({
          size: r.size,
          pairs: Math.max(0, Number(r.counted) || 0),
          looseLeft: Math.max(0, Math.floor(Number(r.looseLeft) || 0)),
          looseRight: Math.max(0, Math.floor(Number(r.looseRight) || 0)),
        })),
      });
      showToast(`${result.movementNo} — ${result.diffs.length} numara düzeltildi.`, 'success');
      onDone();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sayım düzeltmesi kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kalıp Sayım Düzeltmesi"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs font-semibold text-fg-muted">
            {diffs.length ? <span className="font-bold text-warning">{diffs.length} numarada fark var</span> : 'Fark yok'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
            <Button variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={handleSubmit}>
              Sayımı Kaydet
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-card border border-warning/30 bg-warning-soft px-3 py-2 text-2xs font-bold text-fg-strong">
          Sayım düzeltmesi seçilen konumdaki kovayı <span className="font-mono">SAYILAN</span> mutlak değere ayarlar ve onay yetkisi ister. Fark, hareket satırına delta olarak yazılır.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Kalıp" htmlFor="ca-mold" required error={errors.mold}>
            <Select id="ca-mold" value={moldId ?? ''} onChange={(e) => setMoldId(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">— Kalıp seçin —</option>
              {molds.map((m) => (
                <option key={m.id} value={m.id}>{m.code} · {m.name}{m.sizeRange ? ` (${m.sizeRange})` : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Sayım Konumu" htmlFor="ca-loc">
            <Select id="ca-loc" value={locationType} onChange={(e) => setLocationType(e.target.value as MoldLocationType)}>
              {ALL_LOCATIONS.map((l) => <option key={l} value={l}>{MOLD_LOCATION_LABELS[l]}</option>)}
            </Select>
          </Field>
          {isSub && (
            <Field label="Fason Firma" htmlFor="ca-sub" required error={errors.sub}>
              <ContactSelect contacts={contacts} value={subcontractId} allowTypes={['supplier', 'both']} placeholder="Fason cari…" onChange={(id) => setSubcontractId(id)} />
            </Field>
          )}
          <Field label="Tarih" htmlFor="ca-date">
            <Input id="ca-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-card border border-line overflow-hidden">
          <div className="px-3 py-2 border-b border-line bg-surface-raised text-xs font-black uppercase tracking-wider text-fg-muted">
            Sayılan Çiftler
          </div>
          {rows.length === 0 ? (
            <div className="px-3 py-6 text-center text-2xs font-semibold text-fg-muted">
              Önce bir kalıp seçin.
            </div>
          ) : (
            <div className="max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface text-fg-muted">
                  <tr className="border-b border-line">
                    <th className="px-3 py-1.5 text-left font-bold">Numara</th>
                    <th className="px-2 py-1.5 text-right font-bold">Kayıtlı</th>
                    <th className="px-2 py-1.5 text-right font-bold">Sayılan</th>
                    <th className="px-2 py-1.5 text-right font-bold">Fark</th>
                    <th className="px-2 py-1.5 text-right font-bold">Tek Sol</th>
                    <th className="px-2 py-1.5 text-right font-bold">Tek Sağ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const before = buckets
                      .filter((b) => b.size === r.size && b.locationType === locationType && Number(b.subcontractId) === (isSub ? Number(subcontractId) || 0 : 0) && Number(b.workOrderId) === 0)
                      .reduce((s, b) => s + (Number(b.pairs) || 0), 0);
                    const delta = (Number(r.counted) || 0) - before;
                    return (
                      <tr key={r.size} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-1 font-mono font-black text-fg-strong">{r.size}</td>
                        <td className="px-2 py-1 text-right font-mono font-bold text-fg-muted">{formatPairs(before)}</td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="1" value={r.counted} onChange={(e) => setRow(r.size, 'counted', e.target.value)}
                            className="w-16 h-7 rounded-md border border-line bg-surface-raised px-1.5 text-right font-mono font-bold text-fg-strong outline-none focus:border-brand" />
                        </td>
                        <td className={`px-2 py-1 text-right font-mono font-black ${delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-fg-muted'}`}>
                          {delta > 0 ? '+' : ''}{formatPairs(delta)}
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="1" value={r.looseLeft} onChange={(e) => setRow(r.size, 'looseLeft', e.target.value)}
                            className="w-14 h-7 rounded-md border border-line bg-surface-raised px-1.5 text-right font-mono text-fg-strong outline-none focus:border-brand" placeholder="0" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="1" value={r.looseRight} onChange={(e) => setRow(r.size, 'looseRight', e.target.value)}
                            className="w-14 h-7 rounded-md border border-line bg-surface-raised px-1.5 text-right font-mono text-fg-strong outline-none focus:border-brand" placeholder="0" />
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

        <Field label="Gerekçe" htmlFor="ca-reason" required error={errors.reason}>
          <Textarea id="ca-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sayım düzeltmesinin gerekçesi…" invalid={!!errors.reason} />
        </Field>
      </div>
    </Modal>
  );
}
