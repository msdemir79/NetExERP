import { useState, type FormEvent } from 'react';
import { callOp } from '../../api/client';
import { useApiQueryFull } from '../../hooks/useApiQuery';
import { useAuth } from '../../context/AuthContext';
import { showToast } from '../../lib/feedback';
import Button from '../Common/Button';
import { Field, Input, Select } from '../Common/Field';
import { StatusPill } from '../Common/DataGrid';

interface PeriodStatus {
  lock: { isLocked: boolean; version: number; lockedAt?: string; lockedBy?: string; notes?: string } | null;
  checks: { key: string; label: string; count: number; blocking: boolean }[];
}
export default function PeriodClosing() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { hasPermission } = useAuth();
  const query = useApiQueryFull(() => callOp<PeriodStatus>('accounting-period', { month, year }), [month, year], ['periodLocks', 'journalEntries', 'invoices', 'collectionReceipts']);
  const locked = !!query.data?.lock?.isLocked;
  const blocked = query.data?.checks.some(check => check.blocking && check.count > 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.data || query.loading || query.error) return;
    setBusy(true);
    try {
      await callOp('set-accounting-period', { month, year, isLocked: !locked, expectedVersion: Number(query.data.lock?.version || 0), reason });
      showToast(locked ? 'Dönem yeniden açıldı.' : 'Dönem kapatıldı.', 'success'); setReason(''); query.refetch();
    } catch (error) { showToast((error as Error).message, 'error'); query.refetch(); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-line bg-surface p-5 space-y-5">
    <div><h2 className="font-bold text-fg-strong">Muhasebe dönem kontrolü ve kapama</h2><p className="mt-1 text-sm text-fg-muted">Kapalı döneme finans, muhasebe ve stok hareketi yazılamaz. Yeniden açma için muhasebe onay yetkisi ve gerekçe gerekir.</p></div>
    <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
      <Field label="Ay" htmlFor="closing-month"><Select id="closing-month" disabled={busy} value={month} onChange={event => { setMonth(Number(event.target.value)); setReason(''); }}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{new Date(2026, index, 1).toLocaleString('tr-TR', { month: 'long' })}</option>)}</Select></Field>
      <Field label="Yıl" htmlFor="closing-year"><Select id="closing-year" disabled={busy} value={year} onChange={event => { setYear(Number(event.target.value)); setReason(''); }}>{Array.from({ length: 101 }, (_, index) => <option key={index} value={2000 + index}>{2000 + index}</option>)}</Select></Field>
    </div>
    {query.loading && <p role="status" className="text-fg-muted">Dönem kontrol ediliyor…</p>}
    {query.error && <div role="alert" className="text-danger">{query.error.message} <Button onClick={query.refetch}>Tekrar dene</Button></div>}
    {!query.loading && !query.error && query.data && <>
      <StatusPill tone={locked ? 'slate' : 'green'}>{locked ? 'Dönem kapalı' : 'Dönem açık'}</StatusPill>
      <ul className="divide-y divide-line">{query.data.checks.map(check => <li key={check.key} className="flex justify-between gap-4 py-3 text-sm"><span>{check.label}</span><StatusPill tone={check.count > 0 ? (check.blocking ? 'red' : 'blue') : 'green'}>{check.count}</StatusPill></li>)}</ul>
      {query.data.lock?.lockedBy && <p className="text-sm text-fg-muted">Son işlem: {query.data.lock.lockedBy} · {query.data.lock.notes}</p>}
      {hasPermission('accounting', 'approve') && <form onSubmit={submit} className="space-y-3 max-w-2xl">
        <Field label={locked ? 'Yeniden açma gerekçesi' : 'Kapama gerekçesi'} htmlFor="closing-reason"><Input id="closing-reason" required disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></Field>
        {blocked && !locked && <p className="text-sm text-danger">Kapatmadan önce kırmızı işaretli kontrolleri tamamlayın. Taslak faturalar bilgi amaçlıdır.</p>}
        <Button type="submit" variant="primary" loading={busy} disabled={!reason.trim() || (!locked && blocked)}>{locked ? 'Dönemi yeniden aç' : 'Dönemi kapat'}</Button>
      </form>}
    </>}
  </section>;
}
