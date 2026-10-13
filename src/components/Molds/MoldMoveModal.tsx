import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Save } from 'lucide-react';
import Modal from '../Modal';
import Button from '../Common/Button';
import { Field, Input, Select, Textarea } from '../Common/Field';
import ContactSelect from '../Contacts/ContactSelect';
import { api, moldMove } from '../../api/client';
import { useApiQueryFull } from '../../hooks/useApiQuery';
import { showToast } from '../../lib/feedback';
import type { Contact, Mold, MoldLocationType, MoldStock } from '../../types';
import {
  MOLD_FACTORY_LOCATIONS,
  MOLD_LOCATION_LABELS,
  MOLD_MOVE_FIELDS,
  MOLD_MOVE_GROUPS,
  MOLD_MOVE_LABELS,
  availableAt,
  endpointLabel,
  formatPairs,
  moldSizes,
  sourceLocationOf,
  targetLocationOf,
  type MoveType,
} from './moldConstants';

export interface MoldMoveModalProps {
  isOpen: boolean;
  onClose: () => void;
  molds: Mold[];
  contacts: Contact[];
  initialMoldId?: number | null;
  initialType?: MoveType;
  /** Fason Takip'ten açıldığında kaynak/hedef cari önceden seçili gelir. */
  initialFromSubcontractId?: number | null;
  initialToSubcontractId?: number | null;
  onDone: () => void;
}

interface ItemRow {
  size: string;
  pairs: string;
  looseLeft: string;
  looseRight: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MoldMoveModal({
  isOpen,
  onClose,
  molds,
  contacts,
  initialMoldId,
  initialType,
  initialFromSubcontractId,
  initialToSubcontractId,
  onDone,
}: MoldMoveModalProps) {
  const [moldId, setMoldId] = useState<number | null>(initialMoldId ?? null);
  const [type, setType] = useState<MoveType>(initialType ?? 'initial_entry');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const [fromFactory, setFromFactory] = useState<MoldLocationType>('factory_warehouse');
  const [toFactory, setToFactory] = useState<MoldLocationType>('factory_warehouse');
  const [fromSub, setFromSub] = useState<number | null>(initialFromSubcontractId ?? null);
  const [toSub, setToSub] = useState<number | null>(initialToSubcontractId ?? null);
  const [workOrderId, setWorkOrderId] = useState('');
  const [deliveredBy, setDeliveredBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [documentRef, setDocumentRef] = useState('');
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mold = molds.find((m) => Number(m.id) === Number(moldId)) || null;
  const flags = MOLD_MOVE_FIELDS[type];

  const stockQuery = useApiQueryFull<MoldStock[]>(
    () => (moldId ? api.moldStock.list({ where: { moldId: Number(moldId) } }) : Promise.resolve([])),
    [moldId],
    ['moldStock'],
  );
  const buckets = stockQuery.data || [];

  // Numara satırlarını kalıp değişince yeniden kur.
  useEffect(() => {
    setRows(moldSizes(mold).map((size) => ({ size, pairs: '', looseLeft: '', looseRight: '' })));
  }, [mold]);

  useEffect(() => {
    if (isOpen) {
      setMoldId(initialMoldId ?? null);
      setType(initialType ?? 'initial_entry');
      setDate(today());
      setDescription('');
      setFromFactory('factory_warehouse');
      setToFactory('factory_warehouse');
      setFromSub(initialFromSubcontractId ?? null);
      setToSub(initialToSubcontractId ?? null);
      setWorkOrderId('');
      setDeliveredBy('');
      setReceivedBy('');
      setDocumentRef('');
      setErrors({});
    }
  }, [isOpen, initialMoldId, initialType, initialFromSubcontractId, initialToSubcontractId]);

  const sourceLoc = useMemo(
    () => sourceLocationOf(type, fromFactory, Number(fromSub) || 0),
    [type, fromFactory, fromSub],
  );
  const targetLoc = useMemo(
    () => targetLocationOf(type, toFactory, Number(toSub) || 0),
    [type, toFactory, toSub],
  );

  const setRow = (size: string, key: keyof ItemRow, value: string) =>
    setRows((prev) => prev.map((r) => (r.size === size ? { ...r, [key]: value } : r)));

  const totalPairs = rows.reduce((s, r) => s + (Number(r.pairs) || 0), 0);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!moldId) e.mold = 'Kalıp seçilmelidir.';
    if (!description.trim()) e.description = 'Açıklama zorunludur.';
    if (flags.fromSub && !fromSub) e.fromSub = 'Kaynak fason firma seçilmelidir.';
    if (flags.toSub && !toSub) e.toSub = 'Hedef fason firma seçilmelidir.';
    if (flags.fromSub && flags.toSub && fromSub && fromSub === toSub) e.toSub = 'Kaynak ve hedef fason aynı olamaz.';
    if (flags.fromFactory === 'required' && flags.toFactory === 'required' && fromFactory === toFactory) {
      e.toFactory = 'Kaynak ve hedef konum aynı olamaz.';
    }
    if (rows.every((r) => (Number(r.pairs) || 0) === 0 && (Number(r.looseLeft) || 0) === 0 && (Number(r.looseRight) || 0) === 0)) {
      e.items = 'En az bir numara için miktar girilmelidir.';
    }
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const items = rows
      .map((r) => ({
        size: r.size,
        pairs: Number(r.pairs) || 0,
        looseLeft: Math.max(0, Math.floor(Number(r.looseLeft) || 0)),
        looseRight: Math.max(0, Math.floor(Number(r.looseRight) || 0)),
      }))
      .filter((it) => it.pairs > 0 || it.looseLeft > 0 || it.looseRight > 0);

    setSaving(true);
    try {
      const result = await moldMove({
        moldId: Number(moldId),
        type,
        items,
        date,
        description: description.trim(),
        workOrderId: workOrderId ? Number(workOrderId) : undefined,
        fromSubcontractId: fromSub ?? undefined,
        toSubcontractId: toSub ?? undefined,
        fromLocationType: flags.fromFactory ? fromFactory : undefined,
        toLocationType: flags.toFactory ? toFactory : undefined,
        deliveredBy: deliveredBy.trim() || undefined,
        receivedBy: receivedBy.trim() || undefined,
        documentRef: documentRef.trim() || undefined,
      });
      showToast(`${result.movementNo} — ${formatPairs(result.totalPairs)} çift kaydedildi.`, 'success');
      onDone();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Kalıp hareketi kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Yeni Kalıp Hareketi"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs font-semibold text-fg-muted">
            Toplam: <span className="font-mono font-black text-fg-strong">{formatPairs(totalPairs)}</span> çift
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Vazgeç</Button>
            <Button variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={handleSubmit}>
              Hareketi Kaydet
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Kalıp" htmlFor="mv-mold" required error={errors.mold}>
            <Select id="mv-mold" value={moldId ?? ''} onChange={(e) => setMoldId(e.target.value === '' ? null : Number(e.target.value))}>
              <option value="">— Kalıp seçin —</option>
              {molds.map((m) => (
                <option key={m.id} value={m.id}>{m.code} · {m.name}{m.sizeRange ? ` (${m.sizeRange})` : ''}</option>
              ))}
            </Select>
          </Field>
          <Field label="Hareket Türü" htmlFor="mv-type" required>
            <Select id="mv-type" value={type} onChange={(e) => setType(e.target.value as MoveType)}>
              {MOLD_MOVE_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.types.map((t) => (
                    <option key={t} value={t}>{MOLD_MOVE_LABELS[t]}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        </div>

        {/* Tür bazlı ek alanlar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {flags.fromFactory && (
            <Field label={flags.fromFactory === 'required' ? 'Kaynak Konum' : 'Kaynak Depo Konumu'} htmlFor="mv-from-factory" error={errors.fromFactory}>
              <Select id="mv-from-factory" value={fromFactory} onChange={(e) => setFromFactory(e.target.value as MoldLocationType)}>
                {MOLD_FACTORY_LOCATIONS.map((l) => <option key={l} value={l}>{MOLD_LOCATION_LABELS[l]}</option>)}
              </Select>
            </Field>
          )}
          {flags.toFactory && (
            <Field label={flags.toFactory === 'required' ? 'Hedef Konum' : 'Hedef Depo Konumu'} htmlFor="mv-to-factory" error={errors.toFactory}>
              <Select id="mv-to-factory" value={toFactory} onChange={(e) => setToFactory(e.target.value as MoldLocationType)}>
                {MOLD_FACTORY_LOCATIONS.map((l) => <option key={l} value={l}>{MOLD_LOCATION_LABELS[l]}</option>)}
              </Select>
            </Field>
          )}
          {flags.fromSub && (
            <Field label="Kaynak Fason Firma" htmlFor="mv-from-sub" required error={errors.fromSub}>
              <ContactSelect contacts={contacts} value={fromSub} allowTypes={['supplier', 'both']} placeholder="Fason cari…" onChange={(id) => setFromSub(id)} />
            </Field>
          )}
          {flags.toSub && (
            <Field label="Hedef Fason Firma" htmlFor="mv-to-sub" required error={errors.toSub}>
              <ContactSelect contacts={contacts} value={toSub} allowTypes={['supplier', 'both']} placeholder="Fason cari…" onChange={(id) => setToSub(id)} />
            </Field>
          )}
          <Field label="Tarih" htmlFor="mv-date">
            <Input id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="İş Emri ID (opsiyonel)" htmlFor="mv-wo">
            <Input id="mv-wo" type="number" min="0" value={workOrderId} onChange={(e) => setWorkOrderId(e.target.value)} placeholder="—" />
          </Field>
        </div>

        {/* Kaynak → hedef özeti */}
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface-raised px-3 py-2 text-2xs font-bold text-fg-strong">
          <span className="text-fg-muted">{endpointLabel(sourceLoc)}</span>
          <ArrowRight className="h-3.5 w-3.5 text-brand" />
          <span>{endpointLabel(targetLoc)}</span>
        </div>

        {/* Numara kırılımı */}
        <div className="rounded-card border border-line overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-line bg-surface-raised">
            <span className="text-xs font-black uppercase tracking-wider text-fg-muted">Numara Kırılımı (çift)</span>
            {sourceLoc && <span className="text-2xs font-semibold text-fg-muted">Kaynakta mevcut çiftler gösterilir</span>}
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
                    {sourceLoc && <th className="px-2 py-1.5 text-right font-bold">Mevcut</th>}
                    <th className="px-2 py-1.5 text-right font-bold">Çift</th>
                    <th className="px-2 py-1.5 text-right font-bold">Tek Sol</th>
                    <th className="px-2 py-1.5 text-right font-bold">Tek Sağ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const avail = sourceLoc ? availableAt(buckets, r.size, sourceLoc) : 0;
                    return (
                      <tr key={r.size} className="border-b border-line/60 last:border-0">
                        <td className="px-3 py-1 font-mono font-black text-fg-strong">{r.size}</td>
                        {sourceLoc && (
                          <td className="px-2 py-1 text-right font-mono font-bold text-fg-muted">{formatPairs(avail)}</td>
                        )}
                        <td className="px-2 py-1">
                          <input type="number" min="0" step="1" value={r.pairs} onChange={(e) => setRow(r.size, 'pairs', e.target.value)}
                            className="w-16 h-7 rounded-md border border-line bg-surface-raised px-1.5 text-right font-mono font-bold text-fg-strong outline-none focus:border-brand" placeholder="0" />
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Teslim Eden" htmlFor="mv-delivered">
            <Input id="mv-delivered" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)} placeholder="—" />
          </Field>
          <Field label="Teslim Alan" htmlFor="mv-received">
            <Input id="mv-received" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="—" />
          </Field>
          <Field label="Belge Referansı" htmlFor="mv-doc">
            <Input id="mv-doc" value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} placeholder="İrsaliye/fiş no" />
          </Field>
        </div>

        <Field label="Açıklama" htmlFor="mv-desc" required error={errors.description}>
          <Textarea id="mv-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Hareket açıklaması…" invalid={!!errors.description} />
        </Field>
      </div>
    </Modal>
  );
}
