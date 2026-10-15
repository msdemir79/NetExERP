import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Layers } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { productionService, PRODUCTION_STAGES_CONFIG } from '../services/productionService';
import {
  LINE_PROCESS_STAGES,
  buildLineSummary,
  distinctLines,
  filterWorkOrders,
  producedAtStage,
  stageOrderOf,
  workOrdersAtStage,
} from '../services/productionLine';
import { STAGE_ACCENT } from '../components/Production/productionLineStages';
import { showToast } from '../lib/feedback';
import type { ProductionStage, Product, WorkOrder } from '../types';
import { formatDate, formatNum } from './format';
import MobileSheet from './MobileSheet';
import { cn } from '../lib/utils';

type SheetTab = 'proses' | 'detay' | 'renk';

const SHEET_TABS: { id: SheetTab; label: string }[] = [
  { id: 'proses', label: 'Proses' },
  { id: 'detay', label: 'Detay' },
  { id: 'renk', label: 'Renk-Beden' },
];

/**
 * Mobil saha görünümü (mockup #6): hat istasyon listesi → istasyon bottom-sheet
 * → iş emri proses/detay/renk-beden. Tüm sayılar ERP iş emirlerinden türetilir;
 * veri yoksa 0 gösterilir, uydurulmaz.
 */
export default function MobileProductionLine({
  workOrders,
  products,
  onChanged,
}: {
  workOrders: WorkOrder[];
  products: Product[];
  onChanged: () => void;
}) {
  const [line, setLine] = useState<string | null>(null);
  const [stage, setStage] = useState<ProductionStage | null>(null);
  const [woId, setWoId] = useState<number | null>(null);
  const [tab, setTab] = useState<SheetTab>('proses');
  const [busy, setBusy] = useState(false);
  const { currentUser, hasPermission } = useAuth();

  const canEdit = hasPermission('production', 'edit');
  const nameOf = useMemo(() => {
    const m = new Map<number, string>();
    for (const p of products ?? []) if (p.id != null) m.set(p.id, p.name);
    return m;
  }, [products]);

  const filtered = useMemo(() => filterWorkOrders(workOrders, { line }), [workOrders, line]);
  const summary = useMemo(() => buildLineSummary(filtered), [filtered]);
  const lines = useMemo(() => distinctLines(workOrders), [workOrders]);
  const stageSummary = stage ? summary.stages.find((s) => s.stage === stage) : undefined;
  const stageWorkOrders = stage ? workOrdersAtStage(filtered, stage) : [];
  const selected = woId != null ? stageWorkOrders.find((w) => w.id === woId) : undefined;

  function closeSheet() {
    if (woId != null) {
      setWoId(null);
      return;
    }
    setStage(null);
  }

  async function complete(wo: WorkOrder) {
    if (wo.id == null) return;
    setBusy(true);
    try {
      const result = await productionService.advanceWorkOrderStage(wo.id, undefined, {
        operator: currentUser?.fullName || currentUser?.username,
      });
      const label = PRODUCTION_STAGES_CONFIG.find((s) => s.id === result.nextStage)?.shortLabel ?? result.nextStage;
      showToast(`${wo.barcode} → ${label}`, 'success');
      setWoId(null);
      onChanged();
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">DMR NEXUS</div>
          <div className="text-sm font-bold">Üretim Hattı</div>
        </div>
        {lines.length > 0 && (
          <select
            value={line ?? ''}
            onChange={(e) => setLine(e.target.value || null)}
            aria-label="Üretim hattı seç"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-medium outline-none"
          >
            <option value="">Tüm Hatlar</option>
            {lines.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-[11px]">
        <span className="text-slate-600 dark:text-slate-300">Genel ilerleme</span>
        <span className="font-bold tabular-nums">%{summary.overallPct}</span>
      </div>

      {summary.totalWorkOrders === 0 && (
        <div className="flex flex-col items-center gap-1.5 py-10 text-center">
          <Layers className="w-6 h-6 text-slate-400" />
          <p className="text-xs text-slate-500 dark:text-slate-400">Seçili filtrelerde gerçek üretim verisi yok.</p>
        </div>
      )}

      {summary.totalWorkOrders > 0 &&
        summary.stages.map((s) => {
          const a = STAGE_ACCENT[s.stage];
          return (
            <button
              key={s.stage}
              type="button"
              onClick={() => {
                setStage(s.stage);
                setWoId(null);
                setTab('proses');
              }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 text-left active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-2.5">
                <img src={s.image} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{s.shortLabel}</span>
                    <span className="shrink-0 text-sm font-bold tabular-nums">%{s.completionPct}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={cn('h-full rounded-full transition-all', a.bar)} style={{ width: `${s.completionPct}%` }} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>Üretilen {formatNum(s.producedPairs)}</span>
                    <span>·</span>
                    <span>Plan {formatNum(s.targetPairs)}</span>
                    {!!s.inProgressCount && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-600 dark:text-emerald-400">{s.inProgressCount} çalışıyor</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />
              </div>
            </button>
          );
        })}

      {stage && stageSummary && (
        <MobileSheet
          title={stageSummary.label}
          subtitle={line ? `${line} · ${stageWorkOrders.length} iş emri` : `${stageWorkOrders.length} iş emri`}
          onClose={closeSheet}
        >
          {!selected && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Plan" value={formatNum(stageSummary.targetPairs)} />
                <Metric label="Üretilen" value={formatNum(stageSummary.producedPairs)} tone="ok" />
                <Metric label="Kalan" value={formatNum(stageSummary.remainingPairs)} />
              </div>
              {!!stageSummary.scrapPairs && (
                <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5" /> Fire: {formatNum(stageSummary.scrapPairs)} çift
                </div>
              )}

              {stageWorkOrders.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Bu proseste sıraya girmiş iş emri yok.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {stageWorkOrders.map((wo) => {
                    const pct = wo.quantity > 0 ? Math.min(100, Math.round((producedAtStage(wo, stage) / wo.quantity) * 100)) : 0;
                    return (
                      <button
                        key={wo.id ?? wo.barcode}
                        type="button"
                        onClick={() => {
                          setWoId(wo.id ?? null);
                          setTab('proses');
                        }}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-left active:scale-[0.99]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{nameOf.get(wo.productId) || wo.barcode}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {wo.barcode}
                              {[wo.color, wo.size].filter(Boolean).length > 0 && ` · ${[wo.color, wo.size].filter(Boolean).join('/')}`}
                            </div>
                          </div>
                          <span className="shrink-0 text-sm font-bold tabular-nums">%{pct}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className={cn('h-full rounded-full', STAGE_ACCENT[stage].bar)} style={{ width: `${pct}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {selected && (
            <>
              <img src={stageSummary.image} alt="" loading="lazy" className="h-32 w-full rounded-xl object-cover" />
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">İş Emri {selected.barcode}</div>
              <div className="text-sm font-semibold">
                {nameOf.get(selected.productId) || '-'}{selected.color ? ` - ${selected.color}` : ''}
              </div>

              <div className="mt-3 flex gap-1.5">
                {SHEET_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold border',
                      tab === t.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'proses' && (
                <div className="mt-3 space-y-1.5">
                  {LINE_PROCESS_STAGES.map((s) => {
                    const done = producedAtStage(selected, s);
                    const pct = selected.quantity > 0 ? Math.min(100, Math.round((done / selected.quantity) * 100)) : 0;
                    const passed = selected.status === 'completed' || stageOrderOf(s) < stageOrderOf(selected.currentStage);
                    const running = s === selected.currentStage && selected.status !== 'completed';
                    return (
                      <div key={s} className="flex items-center gap-2.5 rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2">
                        {passed ? (
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                        ) : running ? (
                          <Clock className="w-4 h-4 shrink-0 text-amber-500" />
                        ) : (
                          <span className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 dark:border-slate-600" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {PRODUCTION_STAGES_CONFIG.find((c) => c.id === s)?.shortLabel}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[10px] font-semibold',
                            passed ? 'text-emerald-600 dark:text-emerald-400' : running ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400',
                          )}
                        >
                          {passed ? 'Tamamlandı' : running ? 'Devam Ediyor' : 'Bekliyor'}
                        </span>
                        <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums">%{pct}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'detay' && (
                <div className="mt-3 space-y-1.5 text-xs">
                  <Field label="Barkod" value={selected.barcode} />
                  <Field label="Model" value={nameOf.get(selected.productId) || '-'} />
                  <Field label="Cari" value={selected.customerName || '-'} />
                  <Field label="Sipariş No" value={selected.orderNumber || '-'} />
                  <Field label="Renk / Beden" value={[selected.color, selected.size].filter(Boolean).join(' / ') || '-'} />
                  <Field label="Planlanan" value={`${formatNum(selected.quantity)} çift`} />
                  <Field label="Üretilen" value={`${formatNum(producedAtStage(selected, stage))} çift`} />
                  <Field label="Termin" value={formatDate(selected.targetDate)} />
                  <Field label="Hat" value={selected.line || '-'} />
                  <Field label="Operatör" value={selected.operator || '-'} />
                  {!!selected.notes && <Field label="Notlar" value={selected.notes} />}
                </div>
              )}

              {tab === 'renk' && (
                <div className="mt-3 space-y-1.5">
                  {(selected.assortmentBreakdown ?? []).length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      Bu iş emri için asorti (beden) dağılımı kayıtlı değil.
                    </p>
                  ) : (
                    selected.assortmentBreakdown!.map((row, i) => (
                      <div key={`${row.size}-${i}`} className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2 text-xs">
                        <span className="font-medium">{selected.color || '—'} / {row.size}</span>
                        <span className="font-bold tabular-nums">{formatNum(row.quantity)} çift</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {canEdit && selected.status !== 'completed' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void complete(selected)}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" /> {busy ? 'İşleniyor…' : 'İşlemi Tamamla'}
                </button>
              )}
            </>
          )}
        </MobileSheet>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'ok' }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-2 py-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={cn('text-base font-bold tabular-nums', tone === 'ok' && 'text-emerald-600 dark:text-emerald-400')}>{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-1.5">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  );
}
