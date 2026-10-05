import React, { useMemo, useRef, useState } from 'react';
import {
  FileSpreadsheet, Upload, Download, Barcode, Search, Trash2,
  AlertTriangle, Wand2, FileWarning, CheckCircle2, Info,
} from 'lucide-react';
import PageHeader from '../PageHeader';
import Tabs, { tabId, tabPanelId } from '../Common/Tabs';
import Button from '../Common/Button';
import { Input } from '../Common/Field';
import { StatusPill } from '../Common/DataGrid';
import EmptyState from '../Common/EmptyState';
import PermissionGate from '../Common/PermissionGate';
import { api, generateBarcodesBulk } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { useColorMaster } from '../Colors/useColorMaster';
import { showToast, confirmDialog } from '../../lib/feedback';
import { cn } from '../../lib/utils';
import {
  downloadTemplate, parseImportFile, mapAndValidate, importProducts,
  type ImportRowResult,
} from '../../services/stockImportService';
import type { AssortmentTemplate, ColorMaster, Product } from '../../types';

const CATEGORY_LABEL: Record<string, string> = {
  finished: 'Mamul', semi_finished: 'Yarı Mamul', raw_material: 'Hammadde', accessory: 'Aksesuar',
};

/** Bir ürün kartında herhangi bir barkod (tekil / koli / varyant) var mı? */
function hasBarcode(p: Product): boolean {
  if (p.barcode && String(p.barcode).trim()) return true;
  if (p.colorBoxBarcodes && p.colorBoxBarcodes.length > 0) return true;
  if (p.variantBarcodes && p.variantBarcodes.length > 0) return true;
  return false;
}

export default function BulkStockScreen() {
  const [tab, setTab] = useState<'import' | 'barcode'>('import');

  const products = useApiQuery(() => api.products.list(), [], ['products']) ?? [];
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']) ?? [];
  const colors = useColorMaster();

  return (
    <div className="space-y-4 font-sans">
      <PageHeader
        title="Toplu Stok İşlemleri"
        subtitle="Excel'den toplu stok kartı aktarın ve barkodsuz kartlara otomatik barkod üretin."
        icon={FileSpreadsheet}
        iconColor="indigo"
      />

      <Tabs
        ariaLabel="Toplu stok işlemleri sekmeleri"
        value={tab}
        onChange={(k) => setTab(k as 'import' | 'barcode')}
        items={[
          { key: 'import', label: "Excel'den Aktarım", icon: <Upload className="h-4 w-4" /> },
          { key: 'barcode', label: 'Toplu Barkod', icon: <Barcode className="h-4 w-4" /> },
        ]}
      />

      {tab === 'import' ? (
        <div role="tabpanel" id={tabPanelId('import')} aria-labelledby={tabId('import')}>
          <ImportTab products={products} colors={colors} templates={templates} />
        </div>
      ) : (
        <div role="tabpanel" id={tabPanelId('barcode')} aria-labelledby={tabId('barcode')}>
          <BarcodeTab products={products} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sekme 1: Excel'den içe aktarma                                       */
/* ------------------------------------------------------------------ */

function ImportTab({
  products, colors, templates,
}: { products: Product[]; colors: ColorMaster[]; templates: AssortmentTemplate[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRowResult[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [parseError, setParseError] = useState('');

  const existingCodes = useMemo(
    () => new Set(products.map((p) => String(p.code || '').trim().toLocaleUpperCase('tr')).filter(Boolean)),
    [products],
  );

  const stats = useMemo(() => {
    const ok = rows.filter((r) => r.status === 'ok').length;
    const err = rows.filter((r) => r.status === 'error').length;
    const warn = rows.filter((r) => r.warnings.length > 0).length;
    return { total: rows.length, ok, err, warn };
  }, [rows]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadTemplate({ colors, templates });
      showToast('Şablon indirildi.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Şablon indirilemedi.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    setRows([]);
    setFileName(file.name);
    try {
      const raw = await parseImportFile(file);
      if (!raw.length) {
        setParseError('Dosyada içe aktarılacak satır bulunamadı. Verileri "Stok" sayfasına girin.');
        return;
      }
      setRows(mapAndValidate(raw, { existingCodes, colors, templates }));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Dosya okunamadı.');
    } finally {
      setParsing(false);
    }
  };

  const handleClear = () => {
    setRows([]);
    setFileName('');
    setParseError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleImport = async () => {
    if (stats.ok <= 0) return;
    const ok = await confirmDialog(
      `${stats.ok} yeni stok kartı eklenecek.${stats.err ? ` ${stats.err} hatalı satır atlanacak.` : ''} Devam edilsin mi?`,
      { title: 'İçe Aktarma Onayı', confirmText: 'Aktar', tone: 'default' },
    );
    if (!ok) return;
    setImporting(true);
    try {
      const ids = await importProducts(rows);
      showToast(`${ids.length} stok kartı başarıyla eklendi.`, 'success');
      handleClear();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'İçe aktarma başarısız oldu.', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <PermissionGate module="inventory" action="create" fallback={<NoPermission note="stok kartı ekleme" />}>
      <div className="space-y-4">
        {/* Adım 1: şablon + dosya seç */}
        <div className="rounded-xl border border-line bg-white p-4 shadow-xs dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-fg">
                <Download className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-fg-strong">1. Şablonu indirin ve doldurun</p>
                <p className="mt-0.5 text-xs font-semibold text-fg-muted">
                  Bu dosya yalnızca <span className="font-bold text-fg-strong">yeni</span> kart ekler; aynı kod tekrar ederse satır hata alır.
                  Renkler ve asorti şablonları adla eşleşir.
                </p>
              </div>
            </div>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} loading={downloading} onClick={handleDownload}>
              Şablonu İndir
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-fg">
                <Upload className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black text-fg-strong">2. Doldurduğunuz dosyayı seçin</p>
                <p className="mt-0.5 text-xs font-semibold text-fg-muted">
                  {fileName ? (
                    <span className="font-bold text-fg-strong">{fileName}</span>
                  ) : (
                    '.xlsx biçiminde, bu ekrandan indirilen şablon.'
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {rows.length > 0 ? (
                <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={handleClear} disabled={parsing || importing}>
                  Temizle
                </Button>
              ) : null}
              <Button
                variant="primary"
                icon={<Upload className="h-4 w-4" />}
                loading={parsing}
                onClick={() => fileRef.current?.click()}
              >
                Dosya Seç
              </Button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>
        </div>

        {parseError ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        ) : null}

        {/* Adım 3: önizleme + doğrulama */}
        {rows.length > 0 ? (
          <div className="rounded-xl border border-line bg-white shadow-xs dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-fg">
                  <Info className="h-4 w-4" />
                </span>
                <p className="text-sm font-black text-fg-strong">3. Önizleme ve doğrulama</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="slate">{stats.total} satır</StatusPill>
                <StatusPill tone="green">{stats.ok} eklenecek</StatusPill>
                {stats.err > 0 ? <StatusPill tone="red">{stats.err} hatalı</StatusPill> : null}
                {stats.warn > 0 ? <StatusPill tone="amber">{stats.warn} uyarı</StatusPill> : null}
              </div>
            </div>

            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-surface-raised">
                  <tr className="text-2xs font-black uppercase tracking-widest text-fg-muted">
                    <th className="px-3 py-2">Satır</th>
                    <th className="px-3 py-2">Kod</th>
                    <th className="px-3 py-2">Ürün Adı</th>
                    <th className="px-3 py-2">Kategori</th>
                    <th className="px-3 py-2">Durum</th>
                    <th className="px-3 py-2">Notlar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.rowNumber} className="border-t border-line align-top">
                      <td className="px-3 py-2 text-xs font-bold text-fg-muted">{r.rowNumber}</td>
                      <td className="px-3 py-2 text-xs font-bold text-fg-strong">{r.code || '—'}</td>
                      <td className="px-3 py-2 text-xs font-bold text-fg-strong">{r.name || '—'}</td>
                      <td className="px-3 py-2 text-xs font-semibold text-fg-muted">{r.categoryLabel || '—'}</td>
                      <td className="px-3 py-2">
                        {r.status === 'ok' ? <StatusPill tone="green">Hazır</StatusPill> : <StatusPill tone="red">Hata</StatusPill>}
                      </td>
                      <td className="px-3 py-2">
                        <ul className="space-y-0.5">
                          {r.errors.map((e, i) => (
                            <li key={`e${i}`} className="flex items-start gap-1 text-2xs font-bold text-danger">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                              <span>{e}</span>
                            </li>
                          ))}
                          {r.warnings.map((w, i) => (
                            <li key={`w${i}`} className="flex items-start gap-1 text-2xs font-semibold text-amber-600 dark:text-amber-400">
                              <Info className="mt-0.5 h-3 w-3 shrink-0" />
                              <span>{w}</span>
                            </li>
                          ))}
                          {r.errors.length === 0 && r.warnings.length === 0 ? (
                            <li className="text-2xs font-semibold text-fg-muted">Sorun yok.</li>
                          ) : null}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
              <p className="text-xs font-semibold text-fg-muted">
                Yalnızca <span className="font-bold text-fg-strong">Hazır</span> durumdaki satırlar aktarılır; hatalı satırlar atlanır.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleClear} disabled={importing}>
                  Vazgeç
                </Button>
                <Button
                  variant="primary"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  loading={importing}
                  disabled={stats.ok <= 0}
                  onClick={handleImport}
                >
                  {stats.ok} Kartı Aktar
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PermissionGate>
  );
}

/* ------------------------------------------------------------------ */
/* Sekme 2: Toplu barkod üretimi                                        */
/* ------------------------------------------------------------------ */

function BarcodeTab({ products }: { products: Product[] }) {
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generating, setGenerating] = useState(false);

  const missingCount = useMemo(() => products.filter((p) => !hasBarcode(p)).length, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return products.filter((p) => {
      if (onlyMissing && hasBarcode(p)) return false;
      if (!q) return true;
      return (
        String(p.code || '').toLocaleLowerCase('tr').includes(q) ||
        String(p.name || '').toLocaleLowerCase('tr').includes(q)
      );
    });
  }, [products, search, onlyMissing]);

  const selectableIds = useMemo(
    () => filtered.filter((p) => !hasBarcode(p)).map((p) => Number(p.id)).filter((n) => Number.isFinite(n)),
    [filtered],
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runGenerate = async (payload: { productIds?: number[]; onlyMissing?: boolean }, message: string) => {
    const ok = await confirmDialog(message, { title: 'Toplu Barkod Üretimi', confirmText: 'Üret', tone: 'default' });
    if (!ok) return;
    setGenerating(true);
    try {
      const res = await generateBarcodesBulk(payload);
      const prefix = res.barcodePrefix ? ` · önek ${res.barcodePrefix}` : '';
      const skipped = res.skipped ? ` ${res.skipped} kart atlandı (zaten barkodlu).` : '';
      showToast(`${res.generated.length} karta ${res.totalBarcodes} barkod üretildi (${res.barcodeType}${prefix}).${skipped}`, 'success');
      setSelected(new Set());
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Barkod üretimi başarısız oldu.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <PermissionGate module="inventory" action="edit" fallback={<NoPermission note="stok kartı düzenleme" />}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4 shadow-xs dark:bg-slate-900">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-fg">
              <Barcode className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-fg-strong">Otomatik barkod üret</p>
              <p className="mt-0.5 text-xs font-semibold text-fg-muted">
                Barkodlar sunucuda, kilitli sayaçtan üretilir. Yalnızca barkodu olmayan kartlara yazılır; mevcut barkodlar ve stoklar korunur.
                Sistemde <span className="font-bold text-fg-strong">{missingCount}</span> barkodsuz kart var.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<Wand2 className="h-4 w-4" />}
              loading={generating}
              disabled={missingCount <= 0}
              onClick={() => runGenerate({ onlyMissing: true }, `Barkodu olmayan ${missingCount} karta otomatik barkod üretilecek. Devam edilsin mi?`)}
            >
              Barkodu Olmayanlara Üret
            </Button>
            <Button
              variant="primary"
              icon={<Wand2 className="h-4 w-4" />}
              loading={generating}
              disabled={selected.size <= 0}
              onClick={() => runGenerate({ productIds: [...selected] }, `Seçili ${selected.size} karta otomatik barkod üretilecek. Devam edilsin mi?`)}
            >
              Seçililere Üret ({selected.size})
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-white shadow-xs dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-3 border-b border-line p-3">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kod veya ürün adı ara…"
                className="pl-8"
                aria-label="Stok kartı ara"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-fg-strong">
              <input
                type="checkbox"
                checked={onlyMissing}
                onChange={(e) => setOnlyMissing(e.target.checked)}
                className="h-4 w-4 cursor-pointer rounded border-line accent-brand"
              />
              Yalnızca barkodu olmayanlar
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              compact
              icon={<Barcode className="h-5 w-5" />}
              title="Listelenecek kart yok"
              description={onlyMissing ? 'Tüm stok kartlarının barkodu var. Filtreyi kaldırarak tüm kartları görebilirsiniz.' : 'Aramanızla eşleşen kart bulunamadı.'}
            />
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-line bg-surface-raised px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  aria-label="Tümünü seç"
                  className="h-4 w-4 cursor-pointer rounded border-line accent-brand disabled:cursor-not-allowed"
                />
                <span className="text-2xs font-black uppercase tracking-widest text-fg-muted">
                  {filtered.length} kart · {selectableIds.length} seçilebilir
                </span>
              </div>
              <div className="max-h-[32rem] overflow-auto">
                {filtered.map((p) => {
                  const id = Number(p.id);
                  const barcoded = hasBarcode(p);
                  return (
                    <label
                      key={id}
                      className={cn(
                        'flex items-center gap-3 border-b border-line px-3 py-2 transition-colors',
                        barcoded ? 'opacity-70' : 'cursor-pointer hover:bg-surface-hover',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleOne(id)}
                        disabled={barcoded}
                        className="h-4 w-4 cursor-pointer rounded border-line accent-brand disabled:cursor-not-allowed"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-fg-strong">{p.name}</p>
                        <p className="truncate text-2xs font-semibold text-fg-muted">
                          {p.code || '—'} · {CATEGORY_LABEL[String(p.categoryType)] || 'Diğer'}
                        </p>
                      </div>
                      {barcoded ? <StatusPill tone="green">Barkodlu</StatusPill> : <StatusPill tone="amber">Barkodsuz</StatusPill>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </PermissionGate>
  );
}

function NoPermission({ note }: { note: string }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="h-5 w-5" />}
      title="Yetkiniz yok"
      description={`Bu işlem için ${note} yetkisine sahip olmalısınız.`}
    />
  );
}
