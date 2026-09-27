import React from 'react';
import { Truck, Building2, Layers, RefreshCw, ShoppingCart, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatQuantity } from '../../lib/inventoryCalculator';
import DataGrid, { StatusPill, type GridColumn } from '../Common/DataGrid';
import { getMrpKey } from './mrpUtils';
import type { MrpCalculationResult, MrpRequirementItem, WorkOrder, Product } from '../../types';

interface MrpTabProps {
  mrpResult: MrpCalculationResult | null;
  isMrpCalculating: boolean;
  selectedMrpKeys: string[];
  setSelectedMrpKeys: React.Dispatch<React.SetStateAction<string[]>>;
  expandedMatrixKeys: string[];
  setExpandedMatrixKeys: React.Dispatch<React.SetStateAction<string[]>>;
  mrpWoFilter: string;
  setMrpWoFilter: (value: string) => void;
  workOrders?: WorkOrder[] | null;
  productMap: Map<number, Product>;
  onCalculate: (targetIds?: number[]) => void;
  onOpenPurchaseOrderModal: () => void;
}

export default function MrpTab({
  mrpResult,
  isMrpCalculating,
  selectedMrpKeys,
  setSelectedMrpKeys,
  expandedMatrixKeys,
  setExpandedMatrixKeys,
  mrpWoFilter,
  setMrpWoFilter,
  workOrders,
  productMap,
  onCalculate,
  onOpenPurchaseOrderModal
}: MrpTabProps) {
  // MRP DataGrid columns (custom checkbox column + in-cell matrix expansion)
  const mrpColumns = React.useMemo<GridColumn<MrpRequirementItem>[]>(() => [
    {
      key: '_select', title: '', width: 'w-10', sortable: false, filterable: false,
      render: (item) => {
        const itemKey = getMrpKey(item);
        const isSelected = selectedMrpKeys.includes(itemKey);
        const isShortage = item.status === 'shortage' && item.shortageQuantity > 0;
        const isPoCreated = item.status === 'po_created';
        return (
          <input
            type="checkbox"
            checked={isSelected}
            disabled={!isShortage}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedMrpKeys([...selectedMrpKeys, itemKey]);
              } else {
                setSelectedMrpKeys(selectedMrpKeys.filter(k => k !== itemKey));
              }
            }}
            title={
              isPoCreated
                ? "Bu malzeme için Satın Alma Siparişi zaten oluşturuldu. Mükerrer sipariş engellendi."
                : !isShortage
                  ? "Mevcut stok yeterli."
                  : "Satın alma siparişi oluşturmak için seçin"
            }
            className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
          />
        );
      },
    },
    {
      key: 'rawMaterialName', title: 'Hammadde Kodu & Adı',
      render: (item) => {
        const itemKey = getMrpKey(item);
        const isMatrixExpanded = expandedMatrixKeys.includes(itemKey);
        return (
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-slate-900 dark:text-slate-100">{item.rawMaterialName}</span>
              {item.color && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Renk: {item.color}
                </span>
              )}
              {item.subType && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {item.subType}
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{item.rawMaterialCode}</div>

            {item.affectedWorkOrders && item.affectedWorkOrders.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[9px] font-bold text-slate-400">İş Emirleri ({item.affectedWorkOrders.length}):</span>
                {item.affectedWorkOrders.map((wo, woIdx) => (
                  <span
                    key={`wo-badge-${itemKey}-${wo.workOrderId}-${woIdx}`}
                    className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                    title={`${wo.modelName} — ${wo.quantity} Çift`}
                  >
                    <span>{wo.barcode} ({wo.quantity} Çift)</span>
                  </span>
                ))}
              </div>
            )}

            {item.activePurchaseOrders && item.activePurchaseOrders.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {item.activePurchaseOrders.map((po, poIdx) => (
                  <span
                    key={`mrp-po-tag-${itemKey}-${po.orderId}-${poIdx}`}
                    className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
                    title={`${po.supplierName || 'Tedarikçi'} firmasından ${po.quantity} ${item.unit} sipariş edildi`}
                  >
                    <Truck className="w-2.5 h-2.5 text-sky-500" />
                    <span>SAS: <b>{po.orderNumber}</b> ({po.quantity} {item.unit})</span>
                  </span>
                ))}
              </div>
            )}

            {item.hasSizeMatrix && item.sizeBreakdown && item.sizeBreakdown.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isMatrixExpanded) {
                      setExpandedMatrixKeys(expandedMatrixKeys.filter(k => k !== itemKey));
                    } else {
                      setExpandedMatrixKeys([...expandedMatrixKeys, itemKey]);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                >
                  <Layers className="w-3 h-3" />
                  <span>Beden Asorti Matrisi ({item.sizeBreakdown.length} Beden)</span>
                  <span className="text-[9px] font-mono font-black">{isMatrixExpanded ? '▲ Gizle' : '▼ Detay'}</span>
                </button>
              </div>
            )}

            {item.hasSizeMatrix && item.sizeBreakdown && item.sizeBreakdown.length > 0 && isMatrixExpanded && (
              <div className="mt-2 p-3 bg-white dark:bg-slate-900 rounded-xl border border-indigo-100 dark:border-indigo-900/60 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] font-black text-indigo-900 dark:text-indigo-200">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    {item.rawMaterialName} ({item.color ? `Renk: ${item.color}` : 'Tüm Renkler'}) — Beden / Asorti Detayı:
                  </span>
                  <span className="text-slate-500 font-normal">
                    {item.unit || 'Çift'} bazında dağılım
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {item.sizeBreakdown.map((sb, sbIdx) => {
                    const isSbShortage = sb.shortage > 0;
                    const isSbOnOrder = (sb.onOrderQuantity || 0) > 0 && sb.shortage === 0;

                    return (
                      <div
                        key={`sb-chip-${itemKey}-${sb.size}-${sbIdx}`}
                        className={cn(
                          "p-2 rounded-lg border text-center space-y-0.5 transition-all",
                          isSbShortage
                            ? "bg-rose-50/60 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50"
                            : isSbOnOrder
                              ? "bg-sky-50/50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50"
                              : "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40"
                        )}
                      >
                        <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                          Beden {sb.size}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          İhtiyaç: <b className="text-slate-900 dark:text-slate-100">{sb.required}</b>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          Stok: <b className="text-slate-700 dark:text-slate-300">{sb.currentStock}</b>
                        </div>
                        {sb.onOrderQuantity && sb.onOrderQuantity > 0 ? (
                          <div className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold">
                            Yolda: <b>+{sb.onOrderQuantity}</b>
                          </div>
                        ) : null}
                        <div className="text-[10px] font-black pt-0.5 border-t border-slate-200 dark:border-slate-700">
                          {isSbShortage ? (
                            <span className="text-rose-600 dark:text-rose-400">Eksik: {sb.shortage}</span>
                          ) : isSbOnOrder ? (
                            <span className="text-sky-600 dark:text-sky-400">Siparişte (+{sb.onOrderQuantity})</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">Yeterli</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      },
      filterValue: (item) => `${item.rawMaterialName} ${item.rawMaterialCode} ${item.color || ''} ${item.subType || ''}`,
    },
    {
      key: 'preferredSupplierName', title: 'Öncelikli Tedarikçi', width: 'w-44',
      render: (item) => item.preferredSupplierName ? (
        <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40">
          <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
          <span className="truncate max-w-[130px]">{item.preferredSupplierName}</span>
        </div>
      ) : (
        <span className="text-[11px] text-slate-400 italic">Genel / Tanımsız</span>
      ),
      filterValue: (item) => item.preferredSupplierName || 'Genel Tanımsız',
    },
    {
      key: 'requiredQuantity', title: 'Toplam İhtiyaç', align: 'right', width: 'w-32',
      render: (item) => (
        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
          {formatQuantity(item.requiredQuantity)} {item.unit}
        </span>
      ),
      filterValue: (item) => `${item.requiredQuantity ?? 0}`,
    },
    {
      key: 'currentStock', title: 'Mevcut Stok / Yolda', align: 'right', width: 'w-40',
      render: (item) => (
        <div className="text-right">
          <div className="text-xs font-black text-slate-800 dark:text-slate-200">
            {formatQuantity(item.currentStock)} {item.unit}
          </div>
          {item.warehouseStock !== undefined && item.warehouseStock !== item.currentStock && (
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              Depo Kartı: {formatQuantity(item.warehouseStock)} {item.unit}
            </div>
          )}
          {item.onOrderQuantity && item.onOrderQuantity > 0 ? (
            <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 flex items-center justify-end gap-1 mt-0.5">
              <Truck className="w-3 h-3" />
              <span>Yolda (SAS): +{formatQuantity(item.onOrderQuantity)} {item.unit}</span>
            </div>
          ) : null}
        </div>
      ),
      filterValue: (item) => `${item.currentStock ?? 0}`,
    },
    {
      key: 'shortageQuantity', title: 'Net Eksik / Fazla', align: 'right', width: 'w-36',
      render: (item) => {
        const isShortage = item.status === 'shortage' && item.shortageQuantity > 0;
        const isPoCreated = item.status === 'po_created';
        if (isShortage) {
          return (
            <span className="text-xs font-black text-rose-600 bg-rose-100 dark:bg-rose-950/50 px-2 py-0.5 rounded">
              -{formatQuantity(item.shortageQuantity)} {item.unit}
            </span>
          );
        }
        if (isPoCreated) {
          return (
            <span className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800 inline-block">
              Siparişte (+{formatQuantity(item.onOrderQuantity || 0)} {item.unit})
            </span>
          );
        }
        return (
          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
            +{formatQuantity(item.currentStock - item.requiredQuantity)} {item.unit} (Yeterli)
          </span>
        );
      },
      filterValue: (item) => `${item.shortageQuantity ?? 0}`,
    },
    {
      key: 'status', title: 'Durum', align: 'center', width: 'w-32',
      render: (item) => {
        const isShortage = item.status === 'shortage' && item.shortageQuantity > 0;
        const isPoCreated = item.status === 'po_created';
        if (isShortage) return <StatusPill tone="red" className="text-[9px] uppercase">Kritik Eksik</StatusPill>;
        if (isPoCreated) return <StatusPill tone="blue" className="text-[9px] uppercase"><Truck className="w-3 h-3" /> Sipariş Açıldı</StatusPill>;
        return <StatusPill tone="green" className="text-[9px] uppercase">Stok Yeterli</StatusPill>;
      },
      filterValue: (item) => {
        const isShortage = item.status === 'shortage' && item.shortageQuantity > 0;
        const isPoCreated = item.status === 'po_created';
        if (isShortage) return 'Kritik Eksik';
        if (isPoCreated) return 'Sipariş Açıldı';
        return 'Stok Yeterli';
      },
    },
    {
      key: 'estimatedCost', title: 'Tahmini Maliyet', align: 'right', width: 'w-32',
      render: (item) => (
        <div className="text-right">
          <div className="text-xs font-black text-slate-800 dark:text-slate-200">
            {item.estimatedCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
          </div>
          <div className="text-[9px] text-slate-400">
            Birim: {item.buyingPrice.toLocaleString('tr-TR')} ₺
          </div>
        </div>
      ),
      filterValue: (item) => `${item.estimatedCost ?? 0}`,
    },
  ], [selectedMrpKeys, expandedMatrixKeys]);

  return (
        <div className="space-y-6">
          {/* MRP Header Card */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">
                  Otomatik Malzeme İhtiyaç Planlaması (MRP)
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Aktif üretim iş emirlerinin reçete hammadde ihtiyaçları anlık depo mevcudu ve satın alma siparişleriyle uzlaştırılır.
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-3">
              {/* Work Order Filter Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">Kapsam:</label>
                <select
                  value={mrpWoFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMrpWoFilter(val);
                    if (val === 'all') {
                      onCalculate();
                    } else {
                      onCalculate([Number(val)]);
                    }
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="all">Tüm Aktif İş Emirleri (Genel MRP)</option>
                  {(workOrders || []).filter(w => w.status === 'pending' || w.status === 'in_progress').map(wo => {
                    const p = productMap.get(wo.productId);
                    return (
                      <option key={`mrp-wo-opt-${wo.id}`} value={wo.id}>
                        {wo.barcode || `#WO-${wo.id}`} — {p?.name || 'Ürün'} ({wo.quantity} Çift)
                      </option>
                    );
                  })}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (mrpWoFilter === 'all') {
                    onCalculate();
                  } else {
                    onCalculate([Number(mrpWoFilter)]);
                  }
                }}
                disabled={isMrpCalculating}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2"
              >
                <RefreshCw className={cn("w-4 h-4", isMrpCalculating && "animate-spin")} />
                Yeniden Hesapla
              </button>

              {(mrpResult?.shortageItemsCount || 0) > 0 ? (
                <button
                  type="button"
                  onClick={onOpenPurchaseOrderModal}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-md shadow-rose-100 animate-pulse"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Eksikler İçin Satın Alma Oluştur ({mrpResult?.shortageItemsCount})
                </button>
              ) : mrpResult && mrpResult.items.some(i => i.status === 'po_created') ? (
                <div className="px-3.5 py-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300 rounded-xl text-xs font-black flex items-center gap-2">
                  <Truck className="w-4 h-4 text-sky-600" />
                  <span>Eksik Malzemeler Siparişte (Mükerrer Koruma Aktif)</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* MRP Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                Gerekli Hammadde ve Malzeme Listesi ({mrpResult?.items.length || 0} Kalem)
              </div>
              {mrpResult?.totalShortageCost ? (
                <div className="text-xs font-black text-rose-600">
                  Tahmini Eksik Tedarik Maliyeti: {mrpResult.totalShortageCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                </div>
              ) : mrpResult && mrpResult.items.some(i => i.status === 'po_created') ? (
                <div className="text-xs font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-sky-600" />
                  Tüm eksikler için Satın Alma Siparişi açılmıştır
                </div>
              ) : null}
            </div>

            <DataGrid<MrpRequirementItem>
              columns={mrpColumns}
              data={mrpResult?.items || []}
              rowKey={(item) => getMrpKey(item)}
              emptyMessage="Aktif üretim emirlerinde hammadde ihtiyacı bulunamadı veya reçete tanımlanmamış."
              toolbar={(() => {
                const shortages = mrpResult?.items.filter(i => i.status === 'shortage' && i.shortageQuantity > 0) || [];
                const allShortagesSelected = shortages.length > 0 && shortages.every(i => selectedMrpKeys.includes(getMrpKey(i)));
                return (
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allShortagesSelected}
                      disabled={shortages.length === 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMrpKeys(shortages.map(i => getMrpKey(i)));
                        } else {
                          setSelectedMrpKeys([]);
                        }
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-30 cursor-pointer"
                      title={shortages.length === 0 ? "Sipariş verilecek yeni eksik hammadde bulunmuyor" : "Tüm eksikleri seç"}
                    />
                    Tüm Eksikleri Seç ({shortages.length})
                  </label>
                );
              })()}
            />
          </div>
        </div>
  );
}
