import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  AlertTriangle,
  Palette,
  Trash2,
  Barcode,
  Grid,
  BookOpen,
  FileText,
  Edit2,
} from 'lucide-react';
import Modal from '../Modal';
import { cn } from '../../lib/utils';
import { formatQuantity } from '../../lib/inventoryCalculator';
import { getColorSwatch } from '../../lib/colorSwatches';
import { inventoryService } from '../../services/inventoryService';
import { CATEGORY_CONFIGS, getProductCategoryType } from './categoryConfig';
import type { Account, BarcodeVariant, Product } from '../../types';

interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  tdhpAccounts: Account[] | undefined;
  onDeleted: () => void;
  onOpenStatement: () => void;
  onEdit: (product: Product) => void;
}

export default function ProductDetailModal({
  isOpen,
  onClose,
  product,
  tdhpAccounts,
  onDeleted,
  onOpenStatement,
  onEdit,
}: ProductDetailModalProps) {
  const navigate = useNavigate();
  const [detailTab, setDetailTab] = useState<'general' | 'stock' | 'tdhp'>('general');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDetailTab('general');
      setDeleteConfirmId(null);
      setDeleteError(null);
    }
  }, [isOpen, product?.id]);

  const handleDelete = async (id: number) => {
    try {
      setDeleteError(null);
      await inventoryService.deleteProduct(id);
      setDeleteConfirmId(null);
      onClose();
      onDeleted();
    } catch (err: any) {
      setDeleteError(err.message || 'Ürün silinemedi.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Stok Kartı Detayı & Analizi"
      className="max-w-3xl"
    >
      {product && (() => {
        const cat = getProductCategoryType(product);
        const cfg = CATEGORY_CONFIGS[cat];
        const isLow = product.stock <= (product.minStock || 0);
        const vbs: BarcodeVariant[] = product.variantBarcodes || [];
        const hasMatrix = (product.hasSizeVariants || product.isFootwear) && vbs.length > 0;
        const activeTab = detailTab === 'stock' && !hasMatrix ? 'general' : detailTab;
        const matrixSizes = Array.from(new Set(vbs.map(v => v.size)))
          .sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b, 'tr'));
        const variantColors = Array.from(new Set(vbs.map(v => v.color)));
        const definedColors = product.colors || [];
        const matrixColors = [
          ...definedColors.filter(c => variantColors.includes(c)),
          ...variantColors.filter(c => !definedColors.includes(c)),
        ];
        const cellOf = (color: string, size: string) => vbs.find(v => v.color === color && v.size === size);
        const detailTabs: { id: 'general' | 'stock' | 'tdhp'; label: string }[] = [
          { id: 'general', label: 'Genel Bilgiler' },
          ...(hasMatrix ? [{ id: 'stock' as const, label: 'Renk & Numara Stok' }] : []),
          { id: 'tdhp', label: 'Muhasebe (TDHP)' },
        ];

        return (
          <div className="space-y-6">
            {/* Product Header Profile */}
            <div className="flex flex-col md:flex-row items-start justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-4">
                <div className="w-28 h-28 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0 shadow-sm">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                  ) : (
                    <Package className="w-14 h-14 text-slate-300" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md border",
                      `${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`
                    )}>
                      {cfg.badge}
                    </span>
                    <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-slate-200 text-slate-700 dark:text-slate-200">
                      {product.code}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{product.name}</h3>
                  <div className="text-xs font-bold text-slate-400 uppercase">
                    {product.brand} {product.subType && `• ${product.subType}`}
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0 space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Mevcut Stok</div>
                <div className={cn("text-3xl font-black font-mono", isLow ? "text-rose-600" : "text-indigo-600")}>
                  {formatQuantity(product.stock)} <span className="text-xs uppercase">{product.unit}</span>
                </div>
                {isLow && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                    <AlertTriangle className="w-3 h-3" /> Kritik Seviye
                  </span>
                )}
              </div>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-fit max-w-full overflow-x-auto">
              {detailTabs.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDetailTab(t.id)}
                  className={cn(
                    'px-3.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer',
                    activeTab === t.id
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'general' && (
            <div className="space-y-4">
            {/* Price & Shelf Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Alış Fiyatı</div>
                <div className="text-sm font-black font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                  ₺{(product.buyingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Satış Fiyatı</div>
                <div className="text-sm font-black font-mono text-indigo-600 mt-0.5">
                  ₺{(product.sellingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Depo Raf</div>
                <div className="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">
                  {product.shelf || 'Tanımlanmadı'}
                </div>
              </div>

              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Kritik Limit</div>
                <div className="text-sm font-black font-mono text-rose-600 mt-0.5">
                  {product.minStock || 0} {product.unit}
                </div>
              </div>
            </div>

            {/* Defined Color Options */}
            {product.colors && product.colors.length > 0 && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Palette className="w-4 h-4 text-indigo-600" /> Tanımlı Renk Seçenekleri
                  </h4>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    {product.colors.length} Renk
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {product.colors.map(c => {
                    const sw = getColorSwatch(c);
                    return (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase text-slate-800 dark:text-slate-200 shadow-sm"
                      >
                        <span className="w-2.5 h-2.5 rounded-full border flex-shrink-0" style={{ backgroundColor: sw.bg, borderColor: sw.border }} />
                        {c}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
            )}

            {activeTab === 'tdhp' && (
            <div className="p-4 bg-indigo-50/50 border border-indigo-200/80 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" /> Tek Düzen Hesap Planı (TDHP) Eşleşmeleri
                </h4>
                <span className="text-[10px] font-mono font-bold bg-white dark:bg-slate-900 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  KDV: %{product.vatRate ?? 20}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Stok Hesabı (Aktif)</div>
                  <div className="font-mono font-black text-xs text-indigo-700 mt-1">
                    {product.accountingCode || '157.01 (Varsayılan)'}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {tdhpAccounts?.find(a => a.code === product.accountingCode)?.name || 'Mamuller / Stok Hesabı'}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Satış Gelir Hesabı</div>
                  <div className="font-mono font-black text-xs text-slate-800 dark:text-slate-200 mt-1">
                    {product.salesAccountCode || '600.01 (Varsayılan)'}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {tdhpAccounts?.find(a => a.code === product.salesAccountCode)?.name || 'Yurtiçi Satışlar'}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Alış / Maliyet Hesabı</div>
                  <div className="font-mono font-black text-xs text-slate-800 dark:text-slate-200 mt-1">
                    {product.purchaseAccountCode || '620.01 (Varsayılan)'}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {tdhpAccounts?.find(a => a.code === product.purchaseAccountCode)?.name || 'Satılan Malzeme/Mamul'}
                  </div>
                </div>
              </div>
            </div>
            )}

            {activeTab === 'stock' && hasMatrix && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Grid className="w-4 h-4 text-indigo-600" /> Beden & Numara Bazlı Stok Dağılımı
                  </h4>
                  <span className="text-[10px] font-bold text-slate-400">
                    {vbs.length} Varyant
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full border-collapse text-center">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <th className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Renk</th>
                        {matrixSizes.map(s => (
                          <th key={s} className="px-2 py-2 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap">
                            No: {s}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700">Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixColors.map(color => {
                        const sw = getColorSwatch(color);
                        return (
                          <tr key={color} className="border-b border-slate-100 dark:border-slate-800 last:border-b-0 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3 py-2 text-left whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase text-slate-800 dark:text-slate-200">
                                <span className="w-2.5 h-2.5 rounded-full border flex-shrink-0" style={{ backgroundColor: sw.bg, borderColor: sw.border }} />
                                {color}
                              </span>
                            </td>
                            {matrixSizes.map(s => {
                              const v = cellOf(color, s);
                              return (
                                <td key={s} className="px-2 py-1.5 border-l border-slate-100 dark:border-slate-800">
                                  {v ? (
                                    <div className="space-y-0.5">
                                      <div className={cn('text-sm font-black font-mono', (v.stock || 0) > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400')}>
                                        {v.stock || 0}
                                      </div>
                                      <div className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 max-w-[7.5rem] truncate mx-auto" title={v.barcode}>
                                        {v.barcode}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">-</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2 border-l border-slate-200 dark:border-slate-700 text-xs font-black font-mono text-slate-700 dark:text-slate-200">
                              {matrixSizes.reduce((sum, s) => sum + (cellOf(color, s)?.stock || 0), 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700">
                        <td className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Toplam</td>
                        {matrixSizes.map(s => (
                          <td key={s} className="px-2 py-2 border-l border-slate-200 dark:border-slate-700 text-[11px] font-black font-mono text-slate-600 dark:text-slate-300">
                            {matrixColors.reduce((sum, c) => sum + (cellOf(c, s)?.stock || 0), 0)}
                          </td>
                        ))}
                        <td className="px-3 py-2 border-l border-slate-200 dark:border-slate-700 text-[11px] font-black font-mono text-indigo-600 dark:text-indigo-400">
                          {vbs.reduce((sum, v) => sum + (v.stock || 0), 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Delete error notification */}
            {deleteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              {deleteConfirmId === product.id ? (
                <div className="flex items-center gap-2 bg-rose-50 p-2 rounded-xl border border-rose-200">
                  <span className="text-xs font-black text-rose-700 px-2">Silmek istiyor musunuz?</span>
                  <button
                    onClick={() => handleDelete(product.id!)}
                    className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700"
                  >
                    Evet, Sil
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold"
                  >
                    İptal
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirmId(product.id!)}
                  className="flex items-center gap-1.5 px-4 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors border border-rose-200"
                >
                  <Trash2 className="w-4 h-4" /> Kartı Sil
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onClose();
                    onOpenStatement();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-purple-600" /> Stok Ekstresi / Hareketler
                </button>

                <button
                  onClick={() => {
                    onClose();
                    if (product?.id) navigate(`/inventory/barcode?product=${product.id}`);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
                >
                  <Barcode className="w-4 h-4" /> Barkod Yazdır
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onEdit(product);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20"
                >
                  <Edit2 className="w-4 h-4" /> Düzenle
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </Modal>
  );
}
