import React from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { erpService } from '../../services/erpService';
import { 
  Package, 
  Search, 
  Palette, 
  Printer, 
  ChevronDown, 
  ChevronRight, 
  AlertTriangle, 
  CheckCircle2, 
  Box, 
  Layers, 
  Filter, 
  Copy, 
  Check, 
  Building2, 
  MapPin,
  Maximize2,
  Minimize2,
  RefreshCw,
  SlidersHorizontal,
  Scissors,
  Tag,
  Boxes,
  Eye,
  Info,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { printHtml } from '../../lib/printService';
import { exportToCsv } from '../../lib/exportService';
import { getColorSwatch, formatColorQty } from '../../lib/colorSwatches';
import type { Product, AssortmentTemplate, StockCategoryType } from '../../types';

export type StockClassification = 'all' | 'mamul' | 'mamul_disi';
export type SubClassification = 'all' | 'semi_finished' | 'raw_material' | 'accessory';

// Classification badge styling and definitions
const CATEGORY_TYPE_META: Record<StockCategoryType, { 
  label: string; 
  badgeLabel: string; 
  badgeClass: string; 
  badgeExpandedClass: string;
  icon: any; 
}> = {
  finished: {
    label: 'Mamül (Bitmiş Ürün)',
    badgeLabel: 'MAMÜL',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/90',
    badgeExpandedClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    icon: Box
  },
  semi_finished: {
    label: 'Yarı Mamül',
    badgeLabel: 'YARI MAMÜL',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200/90',
    badgeExpandedClass: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: Scissors
  },
  raw_material: {
    label: 'Hammadde',
    badgeLabel: 'HAMMADDE',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200/90',
    badgeExpandedClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    icon: Layers
  },
  accessory: {
    label: 'Aksesuar / Malzeme',
    badgeLabel: 'AKSESUAR',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200/90',
    badgeExpandedClass: 'bg-purple-100 text-purple-900 border-purple-300',
    icon: Tag
  }
};

const getProductCategoryType = (p: Product): StockCategoryType => {
  if (p.categoryType) return p.categoryType;
  if (p.isRawMaterial) return 'raw_material';
  return 'finished';
};

export default function StockDetailReport() {
  const systemSettings = useApiQuery(() => api.settings.get('global_settings'), [], ['settings']);
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string>('all');
  const [selectedBrand, setSelectedBrand] = React.useState<string>('all');
  
  // PRIMARY CRITERIA: Mamül vs Mamül Dışı
  const [stockClassification, setStockClassification] = React.useState<StockClassification>('all');
  const [subClassification, setSubClassification] = React.useState<SubClassification>('all');
  
  // Status filter: broken, critical, out_of_stock
  const [filterType, setFilterType] = React.useState<'all' | 'broken' | 'critical' | 'out_of_stock'>('all');
  const [sortBy, setSortBy] = React.useState<'name' | 'code' | 'stock_desc' | 'stock_asc'>('name');
  
  // Expand/collapse tracking (default: collapsed for maximum screen density and fast overview)
  const [expandedProductIds, setExpandedProductIds] = React.useState<Record<number, boolean>>({});
  const [copiedBarcode, setCopiedBarcode] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [syncSuccess, setSyncSuccess] = React.useState(false);
  const [rowDensity, setRowDensity] = React.useState<'compact' | 'normal'>('compact');

  // Auto-sync variant stocks on load
  React.useEffect(() => {
    erpService.syncProductVariantStocks().catch(err => console.error('Sync error:', err));
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await erpService.syncProductVariantStocks();
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 2500);
    } catch (e) {
      console.error(e);
      alert('Stok senkronizasyonu sırasında hata oluştu.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Stock category classification counts
  const classificationCounts = React.useMemo(() => {
    if (!products) return { total: 0, mamul: 0, mamulDisi: 0, semiFinished: 0, rawMaterial: 0, accessory: 0 };
    let mamul = 0;
    let semiFinished = 0;
    let rawMaterial = 0;
    let accessory = 0;

    products.forEach(p => {
      const cType = getProductCategoryType(p);
      if (cType === 'finished') mamul++;
      else if (cType === 'semi_finished') semiFinished++;
      else if (cType === 'raw_material') rawMaterial++;
      else if (cType === 'accessory') accessory++;
    });

    return {
      total: products.length,
      mamul,
      mamulDisi: semiFinished + rawMaterial + accessory,
      semiFinished,
      rawMaterial,
      accessory
    };
  }, [products]);

  // Derive categories and brands
  const categories = React.useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  const brands = React.useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    products.forEach(p => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set);
  }, [products]);

  // Process and filter products
  const processedProducts = React.useMemo(() => {
    if (!products) return [];

    // Map template map for quick lookup
    const templateMap = new Map<number, AssortmentTemplate>();
    templates?.forEach(t => {
      if (t.id) templateMap.set(t.id, t);
    });

    const list = products.map(p => {
      const catType = getProductCategoryType(p);
      const isMamul = catType === 'finished';
      const isFootwear = isMamul || p.isFootwear || (p.variantBarcodes && p.variantBarcodes.length > 0);
      const template = p.assortmentTemplateId ? templateMap.get(p.assortmentTemplateId) : undefined;
      const templateItems = p.assortment || template?.items || [];
      // multiplier 1 = tanımsız (Inventory varsayılanı); bu durumda asorti toplamı koli adedi sayılır
      const templateMultiplier = (p.multiplier && p.multiplier > 1 ? p.multiplier : 0) || templateItems.reduce((acc, curr) => acc + (curr.quantity || 0), 0) || 1;

      // Determine unique colors
      const colorSet = new Set<string>();
      if (p.colors && p.colors.length > 0) {
        p.colors.forEach(c => colorSet.add(c));
      }
      if (p.variantBarcodes && p.variantBarcodes.length > 0) {
        p.variantBarcodes.forEach(v => {
          if (v.color) colorSet.add(v.color);
        });
      }
      if (p.colorBoxBarcodes && p.colorBoxBarcodes.length > 0) {
        p.colorBoxBarcodes.forEach(b => {
          if (b.color) colorSet.add(b.color);
        });
      }
      if (colorSet.size === 0) {
        colorSet.add('Standart');
      }

      const colorsList = Array.from(colorSet);

      // Process color rows
      let totalCalculatedStock = 0;
      let hasBrokenSize = false;

      const colorRows = colorsList.map(color => {
        const colorImage = p.colorImages?.find(ci => ci.color === color)?.image || p.image;
        const boxBarcode = p.colorBoxBarcodes?.find(b => b.color === color)?.barcode;
        const colorVariants = p.variantBarcodes?.filter(v => v.color === color) || [];
        
        const sizeMap = new Map<string, { size: string; barcode?: string; stock: number; templateRatio?: number }>();

        // 1. Add from template / product assortment
        templateItems.forEach(item => {
          sizeMap.set(item.size, {
            size: item.size,
            stock: 0,
            templateRatio: item.quantity
          });
        });

        // 2. Add / merge from variantBarcodes
        colorVariants.forEach(v => {
          const existing = sizeMap.get(v.size);
          if (existing) {
            existing.barcode = v.barcode;
            existing.stock = v.stock || 0;
          } else {
            sizeMap.set(v.size, {
              size: v.size,
              barcode: v.barcode,
              stock: v.stock || 0,
              templateRatio: 0
            });
          }
        });

        // If no variants and no template, create a single standard size entry
        if (sizeMap.size === 0) {
          sizeMap.set('Standart', {
            size: 'Standart',
            barcode: boxBarcode || p.code,
            stock: p.stock || 0,
            templateRatio: 1
          });
        }

        const sizeList = Array.from(sizeMap.values()).sort((a, b) => {
          const numA = parseFloat(a.size);
          const numB = parseFloat(b.size);
          if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
          }
          return a.size.localeCompare(b.size);
        });

        const colorTotalStock = sizeList.reduce((acc, curr) => acc + (curr.stock || 0), 0);
        totalCalculatedStock += colorTotalStock;

        // Broken size calculation
        const sizesWithStock = sizeList.filter(s => (s.stock || 0) > 0);
        const sizesWithoutStock = sizeList.filter(s => (s.stock || 0) === 0);
        const isColorBroken = sizeList.length > 1 && sizesWithStock.length > 0 && sizesWithoutStock.length > 0;
        if (isColorBroken) {
          hasBrokenSize = true;
        }

        const estimatedBoxes = templateMultiplier > 0 ? (colorTotalStock / templateMultiplier) : 0;

        return {
          color,
          colorImage,
          boxBarcode,
          sizeList,
          colorTotalStock,
          estimatedBoxes,
          isColorBroken,
          sizesWithStockCount: sizesWithStock.length,
          sizesWithoutStockCount: sizesWithoutStock.length,
          totalSizesCount: sizeList.length
        };
      });

      // Overall stock calculation
      const finalStock = (p.variantBarcodes && p.variantBarcodes.length > 0) ? totalCalculatedStock : p.stock;
      const isCritical = finalStock <= (p.minStock || 0);
      const isOutOfStock = finalStock <= 0;

      return {
        ...p,
        catType,
        isMamul,
        isFootwear,
        templateName: template?.name || (templateItems.length > 0 ? 'Özel Asorti' : 'Standart'),
        templateMultiplier,
        templateItems,
        colorRows,
        finalStock,
        hasBrokenSize,
        isCritical,
        isOutOfStock,
        totalColorsCount: colorRows.length
      };
    });

    // Apply filtering
    return list.filter(p => {
      // 1. PRIMARY CRITERIA: Mamül vs Mamül Dışı
      if (stockClassification === 'mamul' && !p.isMamul) {
        return false;
      }
      if (stockClassification === 'mamul_disi' && p.isMamul) {
        return false;
      }
      if (stockClassification === 'mamul_disi' && subClassification !== 'all') {
        if (p.catType !== subClassification) {
          return false;
        }
      }

      // 2. Search filter
      const search = searchTerm.toLowerCase().trim();
      if (search) {
        const matchCode = p.code.toLowerCase().includes(search);
        const matchName = p.name.toLowerCase().includes(search);
        const matchBrand = p.brand?.toLowerCase().includes(search);
        const matchCategory = p.category?.toLowerCase().includes(search);
        const matchSubType = p.subType?.toLowerCase().includes(search);
        const matchShelf = p.shelf?.toLowerCase().includes(search);
        const matchColor = p.colorRows.some(c => c.color.toLowerCase().includes(search));
        const matchBarcode = p.colorRows.some(c => 
          (c.boxBarcode && c.boxBarcode.toLowerCase().includes(search)) ||
          c.sizeList.some(s => s.barcode && s.barcode.toLowerCase().includes(search))
        );
        if (!matchCode && !matchName && !matchBrand && !matchCategory && !matchSubType && !matchShelf && !matchColor && !matchBarcode) {
          return false;
        }
      }

      // 3. Category & Brand filters
      if (selectedCategory !== 'all' && p.category !== selectedCategory) {
        return false;
      }
      if (selectedBrand !== 'all' && p.brand !== selectedBrand) {
        return false;
      }

      // 4. Secondary filter type
      if (filterType === 'broken' && !p.hasBrokenSize) return false;
      if (filterType === 'critical' && !p.isCritical) return false;
      if (filterType === 'out_of_stock' && !p.isOutOfStock) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'tr');
      if (sortBy === 'code') return a.code.localeCompare(b.code, 'tr');
      if (sortBy === 'stock_desc') return b.finalStock - a.finalStock;
      if (sortBy === 'stock_asc') return a.finalStock - b.finalStock;
      return 0;
    });
  }, [products, templates, stockClassification, subClassification, searchTerm, selectedCategory, selectedBrand, filterType, sortBy]);

  // Expand / collapse all helpers
  const areAllExpanded = React.useMemo(() => {
    if (processedProducts.length === 0) return false;
    return processedProducts.every(p => p.id && !!expandedProductIds[p.id]);
  }, [processedProducts, expandedProductIds]);

  const toggleExpandAll = () => {
    if (areAllExpanded) {
      setExpandedProductIds({});
    } else {
      const newMap: Record<number, boolean> = {};
      processedProducts.forEach(p => {
        if (p.id) newMap[p.id] = true;
      });
      setExpandedProductIds(newMap);
    }
  };

  const toggleProductExpand = (id?: number) => {
    if (!id) return;
    setExpandedProductIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const isProductExpanded = (id?: number) => {
    if (!id) return false;
    return !!expandedProductIds[id];
  };

  // Copy barcode helper
  const handleCopyBarcode = (barcode: string) => {
    navigator.clipboard.writeText(barcode);
    setCopiedBarcode(barcode);
    setTimeout(() => setCopiedBarcode(null), 2000);
  };

  // Summary Metrics
  const summaryStats = React.useMemo(() => {
    if (!processedProducts) return { totalProducts: 0, totalColors: 0, totalStock: 0, brokenColorsCount: 0, criticalCount: 0, outOfStockCount: 0 };
    let totalStock = 0;
    let totalColors = 0;
    let brokenColorsCount = 0;
    let criticalCount = 0;
    let outOfStockCount = 0;

    processedProducts.forEach(p => {
      totalStock += p.finalStock;
      totalColors += p.colorRows.length;
      if (p.isCritical) criticalCount++;
      if (p.isOutOfStock) outOfStockCount++;
      p.colorRows.forEach(c => {
        if (c.isColorBroken) brokenColorsCount++;
      });
    });

    return {
      totalProducts: processedProducts.length,
      totalColors,
      totalStock,
      brokenColorsCount,
      criticalCount,
      outOfStockCount
    };
  }, [processedProducts]);

  // Printable Tabular Report (HTML)
  const handlePrint = () => {
    if (!processedProducts || processedProducts.length === 0) {
      alert('Yazdırılacak ürün bulunamadı.');
      return;
    }

    const classificationLabel = stockClassification === 'mamul' 
      ? 'Yalnızca Mamül (Bitmiş Ürün) Stokları' 
      : stockClassification === 'mamul_disi' 
        ? 'Mamül Dışı (Hammadde, Yarı Mamül & Aksesuar) Stokları' 
        : 'Tüm Stok Envanteri (Mamül + Mamül Dışı)';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; width: 100%; padding: 4px;">
        
        <!-- Header -->
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${systemSettings?.company?.logo ? `<img src="${systemSettings.company.logo}" style="height: 40px; max-width: 100px; object-fit: contain;" />` : ''}
            <div>
              <div style="font-size: 10px; font-weight: 800; color: #4f46e5; letter-spacing: 0.1em; text-transform: uppercase;">${systemSettings?.company?.companyTitle || systemSettings?.company?.companyName || 'STOK ENVANTERİ & ASORTİ ANALİZİ'}</div>
              <h1 style="font-size: 19px; font-weight: 900; color: #0f172a; text-transform: uppercase; margin: 2px 0 0 0;">Stok Detay & Envanter Raporu</h1>
              <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;"><b>Kriter:</b> ${classificationLabel}</p>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; font-weight: 700; color: #64748b;">Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-top: 2px;">Toplam: ${summaryStats.totalProducts} Kalem • ${summaryStats.totalStock} Adet/Çift</div>
          </div>
        </div>

        <!-- KPI summary row -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;">
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Toplam Kalem</div>
            <div style="font-size: 14px; font-weight: 900; color: #0f172a;">${summaryStats.totalProducts}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Renk / Varyant</div>
            <div style="font-size: 14px; font-weight: 900; color: #4f46e5;">${summaryStats.totalColors}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Toplam Stok Miktarı</div>
            <div style="font-size: 14px; font-weight: 900; color: #059669;">${summaryStats.totalStock}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 10px; border-radius: 6px;">
            <div style="font-size: 8px; font-weight: 700; color: #64748b; text-transform: uppercase;">Kırık Beden / Kritik</div>
            <div style="font-size: 14px; font-weight: 900; color: #e11d48;">${summaryStats.brokenColorsCount} Kırık / ${summaryStats.criticalCount} Kritik</div>
          </div>
        </div>

        <!-- Products List -->
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${processedProducts.map(p => {
            const meta = CATEGORY_TYPE_META[p.catType];
            return `
              <div style="border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; page-break-inside: avoid;">
                
                <!-- ÜST SATIR: Ana Ürün & Stok Bilgisi -->
                <div style="background: #f1f5f9; color: #0f172a; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="background: #0f172a; color: white; font-weight: 900; font-size: 9px; padding: 1px 5px; border-radius: 3px; font-family: monospace;">${p.code}</span>
                    <span style="background: #e0e7ff; color: #3730a3; font-weight: 800; font-size: 8px; padding: 1px 5px; border-radius: 3px;">${meta.badgeLabel}</span>
                    <span style="font-weight: 800; font-size: 12px; text-transform: uppercase;">${p.name}</span>
                    ${p.brand ? `<span style="color: #64748b; font-size: 10px;">[${p.brand}]</span>` : ''}
                    ${p.subType ? `<span style="background: #e2e8f0; font-size: 9px; padding: 1px 4px; border-radius: 2px;">${p.subType}</span>` : ''}
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${p.shelf ? `<span style="font-size: 9px; color: #64748b;">Raf: <b>${p.shelf}</b></span>` : ''}
                    <span style="background: #0f172a; color: #ffffff; font-weight: 900; font-size: 11px; padding: 2px 7px; border-radius: 4px; font-family: monospace;">
                      STOK: ${p.finalStock} ${p.unit || 'Çift'}
                    </span>
                  </div>
                </div>

                <!-- ALT DETAY: Asorti veya Malzeme Dökümü -->
                <div style="background: #ffffff; padding: 6px 8px;">
                  ${p.colorRows.map((c, cIdx) => `
                    <div style="margin-bottom: ${cIdx === p.colorRows.length - 1 ? '0' : '6px'}; border: 1px solid #e2e8f0; border-radius: 4px; overflow: hidden; background: #fafafa;">
                      <div style="background: #f8fafc; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0;">
                        <span style="font-weight: 800; font-size: 10px; color: #1e293b; text-transform: uppercase;">Varyant: ${c.color}</span>
                        <span style="font-size: 10px; font-weight: 800; color: #0f172a;">
                          Miktar: <span style="color: #4f46e5; font-family: monospace;">${c.colorTotalStock} ${p.unit || 'Çift'}</span>
                        </span>
                      </div>

                      ${p.isFootwear && c.sizeList.length > 1 ? `
                        <div style="padding: 4px;">
                          <table style="width: 100%; border-collapse: collapse; font-size: 9px; text-align: center;">
                            <thead>
                              <tr style="background: #e2e8f0; color: #475569; font-weight: 800;">
                                <th style="padding: 2px 4px; text-align: left; border: 1px solid #cbd5e1; width: 70px;">Beden</th>
                                ${c.sizeList.map(s => `
                                  <th style="padding: 2px 4px; border: 1px solid #cbd5e1; font-weight: 900;">${s.size}</th>
                                `).join('')}
                                <th style="padding: 2px 4px; border: 1px solid #cbd5e1; background: #cbd5e1; font-weight: 900;">TOPLAM</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td style="padding: 3px 4px; text-align: left; font-weight: 700; border: 1px solid #cbd5e1;">Stok</td>
                                ${c.sizeList.map(s => `
                                  <td style="padding: 3px 4px; border: 1px solid #cbd5e1; font-family: monospace; font-weight: 800; color: ${s.stock === 0 ? '#e11d48' : '#15803d'};">
                                    ${s.stock}
                                  </td>
                                `).join('')}
                                <td style="padding: 3px 4px; border: 1px solid #cbd5e1; font-weight: 900; background: #e0e7ff; color: #3730a3;">
                                  ${c.colorTotalStock}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      ` : `
                        <div style="padding: 4px 8px; font-size: 9px; color: #64748b; display: flex; gap: 14px;">
                          <span>Birim: <b>${p.unit}</b></span>
                          <span>Birim Fiyat: <b>₺${p.buyingPrice || 0}</b></span>
                          <span>Min Stok: <b>${p.minStock || 0} ${p.unit}</b></span>
                          ${c.boxBarcode ? `<span>Barkod: <b style="font-family: monospace;">${c.boxBarcode}</b></span>` : ''}
                        </div>
                      `}
                    </div>
                  `).join('')}
                </div>

              </div>
            `;
          }).join('')}
        </div>

        <!-- Footer -->
        <div style="margin-top: 14px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 8px; color: #94a3b8; display: flex; justify-content: space-between;">
          <span>ProERP Ayakkabı & Envanter Yönetimi</span>
          <span>Yazdırıldı: ${new Date().toLocaleString('tr-TR')}</span>
        </div>

      </div>
    `;

    printHtml(html, { title: 'ProERP Stok Detay Raporu' });
  };

  const handleExportExcel = () => {
    if (!processedProducts || processedProducts.length === 0) return;

    const headers = [
      'Tür / Kategori',
      'Ürün Kodu',
      'Model Adı',
      'Marka',
      'Alt Tür',
      'Renk / Varyant',
      'Numara / Beden',
      'Varyant Stok',
      'Toplam Stok',
      'Birim',
      'Alış Fiyatı (₺)',
      'Satış Fiyatı (₺)',
      'Barkod / Koli Barkodu',
      'Raf Konumu',
      'Durum'
    ];

    const rows: (string | number)[][] = [];

    processedProducts.forEach(p => {
      const typeLabel = CATEGORY_TYPE_META[p.categoryType]?.label || 'Mamül';
      const statusLabel = (p as any).isBroken ? 'KIRIK BEDEN' : p.isCritical ? 'KRİTİK STOK' : p.isOutOfStock ? 'TÜKENDİ' : 'NORMAL';

      if (p.colorRows && p.colorRows.length > 0) {
        p.colorRows.forEach(c => {
          if (p.isFootwear && c.sizeList && c.sizeList.length > 0) {
            c.sizeList.forEach(s => {
              rows.push([
                typeLabel,
                p.code,
                p.name,
                p.brand || '-',
                p.subType || '-',
                c.color,
                s.size,
                s.stock,
                p.finalStock,
                p.unit || 'Çift',
                p.buyingPrice || 0,
                p.sellingPrice || 0,
                s.barcode || c.boxBarcode || (p as any).barcode || '-',
                p.shelf || '-',
                statusLabel
              ]);
            });
          } else {
            rows.push([
              typeLabel,
              p.code,
              p.name,
              p.brand || '-',
              p.subType || '-',
              c.color,
              '-',
              c.colorTotalStock,
              p.finalStock,
              p.unit || 'Birim',
              p.buyingPrice || 0,
              p.sellingPrice || 0,
              c.boxBarcode || (p as any).barcode || '-',
              p.shelf || '-',
              statusLabel
            ]);
          }
        });
      } else {
        rows.push([
          typeLabel,
          p.code,
          p.name,
          p.brand || '-',
          p.subType || '-',
          '-',
          '-',
          p.finalStock,
          p.finalStock,
          p.unit || 'Birim',
          p.buyingPrice || 0,
          p.sellingPrice || 0,
          (p as any).barcode || '-',
          p.shelf || '-',
          statusLabel
        ]);
      }
    });

    exportToCsv('Stok_Detay_Asorti_Raporu.csv', headers, rows);
  };

  return (
    <div className="space-y-4" id="stock-detail-report-container">
      {/* ════════════════════════════════════════════════════════════════
          1. SAYFA BAŞLIĞI VE HIZLI EYLEMLER
         ════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-1 border-b border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
              Envanter & Varyant Dağılımı
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {processedProducts.length} Stok Listeleniyor
            </span>
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight uppercase">
            Stok Detay & Asorti Raporu
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Yoğunluk Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setRowDensity('compact')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5",
                rowDensity === 'compact'
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
              )}
              title="Kompakt Tasarım (Ekrana maksimum satır sığdırır)"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Kompakt</span>
            </button>
            <button
              type="button"
              onClick={() => setRowDensity('normal')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5",
                rowDensity === 'normal'
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
              )}
              title="Standart Tasarım"
            >
              <Eye className="w-3 h-3" />
              <span>Standart</span>
            </button>
          </div>

          {/* Sync Button */}
          <button 
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-2xs",
              syncSuccess 
                ? "bg-emerald-50 border-emerald-300 text-emerald-700" 
                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-800/50"
            )}
            title="Model ve varyant stoklarını asorti oranlarına göre eşitle / onar"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin text-indigo-600", syncSuccess && "text-emerald-600")} />
            <span className="hidden sm:inline">{isSyncing ? "Eşitleniyor..." : syncSuccess ? "Eşitlendi ✓" : "Stokları Onar"}</span>
          </button>

          {/* Expand/Collapse All */}
          <button 
            type="button"
            onClick={toggleExpandAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 dark:bg-slate-800/50 transition-all shadow-2xs"
            title={areAllExpanded ? "Tüm modellerin alt detayını daralt" : "Tüm modellerin alt detayını genişlet"}
          >
            {areAllExpanded ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Tümünü Daralt</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Tümünü Genişlet</span>
              </>
            )}
          </button>

          {/* Excel Export */}
          <button 
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
            title="Stok ve varyant detaylarını Excel / CSV formatında indirin"
          >
            <FileDown className="w-3.5 h-3.5" /> 
            <span>Excel'e Aktar</span>
          </button>

          {/* Print Report */}
          <button 
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> 
            <span>Yazdır / PDF</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          2. NET VE BELİRGİN KRİTER SEÇİCİ: MAMÜL vs MAMÜL DIŞI
         ════════════════════════════════════════════════════════════════ */}
      <div className="bg-slate-900 text-white p-3 sm:p-3.5 rounded-2xl shadow-sm space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
              Stok Kriteri
            </span>
            <span className="text-xs font-bold text-slate-300">
              Görüntülenecek Stok Sınıfını Seçin:
            </span>
          </div>

          <span className="text-[11px] font-mono text-slate-400 hidden sm:inline-block">
            {stockClassification === 'all' 
              ? 'Tüm kayıtlar görüntüleniyor' 
              : stockClassification === 'mamul' 
                ? 'Sadece ayakkabı & bitmiş mamüller filtrelendi' 
                : 'Yalnızca hammadde, yarı mamül & aksesuarlar filtrelendi'}
          </span>
        </div>

        {/* 3'lü Ana Kriter Düğmeleri */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* TÜM STOKLAR */}
          <button
            type="button"
            onClick={() => {
              setStockClassification('all');
              setSubClassification('all');
            }}
            className={cn(
              "py-2.5 px-3.5 rounded-xl text-left transition-all border flex items-center justify-between cursor-pointer",
              stockClassification === 'all'
                ? "bg-indigo-600 border-indigo-400 text-white shadow-md ring-2 ring-indigo-400/40"
                : "bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                stockClassification === 'all' ? "bg-white dark:bg-slate-900/20 text-white" : "bg-slate-700 text-slate-400"
              )}>
                <Layers className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="text-xs font-black uppercase tracking-wider">Tüm Stoklar</div>
                <div className="text-[10px] text-slate-300/80">Mamül + Mamül Dışı</div>
              </div>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded-md font-mono text-xs font-black shrink-0",
              stockClassification === 'all' ? "bg-white dark:bg-slate-900 text-indigo-900" : "bg-slate-700 text-slate-300"
            )}>
              {classificationCounts.total}
            </span>
          </button>

          {/* SADECE MAMÜLLER */}
          <button
            type="button"
            onClick={() => {
              setStockClassification('mamul');
              setSubClassification('all');
            }}
            className={cn(
              "py-2.5 px-3.5 rounded-xl text-left transition-all border flex items-center justify-between cursor-pointer",
              stockClassification === 'mamul'
                ? "bg-indigo-600 border-indigo-400 text-white shadow-md ring-2 ring-indigo-400/40"
                : "bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                stockClassification === 'mamul' ? "bg-white dark:bg-slate-900/20 text-white" : "bg-slate-700 text-indigo-400"
              )}>
                <Box className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="text-xs font-black uppercase tracking-wider">Mamüller (Bitmiş)</div>
                <div className="text-[10px] text-slate-300/80">Satılabilir Ürün & Ayakkabı</div>
              </div>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded-md font-mono text-xs font-black shrink-0",
              stockClassification === 'mamul' ? "bg-white dark:bg-slate-900 text-indigo-900" : "bg-slate-700 text-indigo-300"
            )}>
              {classificationCounts.mamul}
            </span>
          </button>

          {/* MAMÜL DIŞI STOKLAR */}
          <button
            type="button"
            onClick={() => {
              setStockClassification('mamul_disi');
            }}
            className={cn(
              "py-2.5 px-3.5 rounded-xl text-left transition-all border flex items-center justify-between cursor-pointer",
              stockClassification === 'mamul_disi'
                ? "bg-amber-600 border-amber-400 text-white shadow-md ring-2 ring-amber-400/40"
                : "bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                stockClassification === 'mamul_disi' ? "bg-white dark:bg-slate-900/20 text-white" : "bg-slate-700 text-amber-400"
              )}>
                <Boxes className="w-4 h-4" />
              </div>
              <div className="truncate">
                <div className="text-xs font-black uppercase tracking-wider">Mamül Dışı Stoklar</div>
                <div className="text-[10px] text-slate-300/80">Hammadde, Yarı Mamül, Aks.</div>
              </div>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded-md font-mono text-xs font-black shrink-0",
              stockClassification === 'mamul_disi' ? "bg-white dark:bg-slate-900 text-amber-950" : "bg-slate-700 text-amber-300"
            )}>
              {classificationCounts.mamulDisi}
            </span>
          </button>
        </div>

        {/* Mamül Dışı Seçildiğinde Açılan Detaylı Alt Tür Kriterleri */}
        {stockClassification === 'mamul_disi' && (
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Mamül Dışı Türü:
            </span>
            <button
              type="button"
              onClick={() => setSubClassification('all')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                subClassification === 'all'
                  ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              )}
            >
              Tüm Mamül Dışı ({classificationCounts.mamulDisi})
            </button>
            <button
              type="button"
              onClick={() => setSubClassification('semi_finished')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1",
                subClassification === 'semi_finished'
                  ? "bg-amber-500 text-slate-950 font-black shadow-xs"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              )}
            >
              <Scissors className="w-3 h-3" />
              Yarı Mamül ({classificationCounts.semiFinished})
            </button>
            <button
              type="button"
              onClick={() => setSubClassification('raw_material')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1",
                subClassification === 'raw_material'
                  ? "bg-emerald-500 text-slate-950 font-black shadow-xs"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              )}
            >
              <Layers className="w-3 h-3" />
              Hammadde ({classificationCounts.rawMaterial})
            </button>
            <button
              type="button"
              onClick={() => setSubClassification('accessory')}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1",
                subClassification === 'accessory'
                  ? "bg-purple-400 text-slate-950 font-black shadow-xs"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              )}
            >
              <Tag className="w-3 h-3" />
              Aksesuar & Sarf ({classificationCounts.accessory})
            </button>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          3. ARAMA VE İKİNCİL FİLTRELEME ÇUBUĞU
         ════════════════════════════════════════════════════════════════ */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/90 shadow-2xs space-y-2.5">
        <div className="flex flex-col md:flex-row gap-2.5 items-center justify-between">
          {/* Arama Kutusu */}
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="MODEL ADI, KOD, RENK, RAF VEYA BARKOD ARA..." 
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 placeholder:text-slate-400 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Hızlı Filtre Dropdown'ları */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {categories.length > 0 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">Tüm Kategoriler ({categories.length})</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}

            {brands.length > 0 && (
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">Tüm Markalar ({brands.length})</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="name">Sırala: İsim (A-Z)</option>
              <option value="code">Sırala: Ürün Kodu</option>
              <option value="stock_desc">Sırala: Stok (Çoktan Aza)</option>
              <option value="stock_asc">Sırala: Stok (Azdan Çoğa)</option>
            </select>
          </div>
        </div>

        {/* Durum Rozetleri (Kırık, Kritik, Tükendi) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Durum:
          </span>

          <button
            onClick={() => setFilterType('all')}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
              filterType === 'all' 
                ? "bg-slate-900 text-white shadow-xs" 
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
            )}
          >
            Tümü ({processedProducts.length})
          </button>

          <button
            onClick={() => setFilterType('broken')}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1",
              filterType === 'broken' 
                ? "bg-rose-600 text-white shadow-xs" 
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
            )}
          >
            <AlertTriangle className="w-3 h-3 text-rose-500" />
            Kırık Bedenler ({summaryStats.brokenColorsCount})
          </button>

          <button
            onClick={() => setFilterType('critical')}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
              filterType === 'critical' 
                ? "bg-amber-600 text-white shadow-xs" 
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
            )}
          >
            Kritik Stok ({summaryStats.criticalCount})
          </button>

          <button
            onClick={() => setFilterType('out_of_stock')}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
              filterType === 'out_of_stock' 
                ? "bg-slate-800 text-white shadow-xs" 
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
            )}
          >
            Tükenenler ({summaryStats.outOfStockCount})
          </button>

          {/* Aktif Liste Özeti */}
          <div className="ml-auto text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 hidden sm:block">
            Toplam Stok: <span className="text-emerald-700 font-black">{summaryStats.totalStock}</span> Adet/Çift
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          4. STOK LİSTESİ: ŞIK, DÜZGÜN VE DARALTILDIĞINDA KOMPAKT SATIRLAR
         ════════════════════════════════════════════════════════════════ */}
      <div className={cn("transition-all", rowDensity === 'compact' ? "space-y-1.5" : "space-y-2.5")}>
        {processedProducts.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Seçilen Kriterlere Uygun Kayıt Bulunamadı</h3>
            <p className="text-xs text-slate-400 mt-1">Arama teriminizi veya "Mamül / Mamül Dışı" kriter seçiminizi değiştirerek tekrar deneyebilirsiniz.</p>
          </div>
        ) : (
          processedProducts.map((p) => {
            const isExpanded = isProductExpanded(p.id);
            const meta = CATEGORY_TYPE_META[p.catType];
            const Icon = meta.icon;

            return (
              <div 
                key={p.id || p.code}
                id={`product-card-${p.id}`}
                className={cn(
                  "bg-white dark:bg-slate-900 rounded-xl border transition-all duration-150 overflow-hidden",
                  isExpanded 
                    ? "border-indigo-300 ring-2 ring-indigo-500/10 shadow-sm" 
                    : "border-slate-200 dark:border-slate-700/90 hover:border-slate-300 shadow-2xs hover:shadow-xs"
                )}
              >
                {/* ────────────────────────────────────────────────────────────
                    KOMPAKT & ŞIK ÜST SATIR (Daraltılmış Hal)
                   ──────────────────────────────────────────────────────────── */}
                <div 
                  onClick={() => toggleProductExpand(p.id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 cursor-pointer select-none transition-colors",
                    rowDensity === 'compact' ? "py-2 px-3 sm:px-3.5" : "py-2.5 px-3.5 sm:px-4",
                    isExpanded 
                      ? "bg-slate-50 dark:bg-slate-800/50/90 border-b border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100" 
                      : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:bg-slate-800/50/80 text-slate-900 dark:text-slate-100"
                  )}
                >
                  {/* SOL TARAF: Ok, Resim, Kod, Kategori Türü, İsim ve Etiketler */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Aç / Kapat Butonu */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProductExpand(p.id);
                      }}
                      className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center transition-transform shrink-0 cursor-pointer",
                        isExpanded ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200"
                      )}
                      title={isExpanded ? "Detayı Kapat" : "Detayı Aç"}
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    {/* Mini Küçük Resim */}
                    <div className={cn(
                      "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs",
                      rowDensity === 'compact' ? "w-8 h-8" : "w-10 h-10"
                    )}>
                      {p.image ? (
                        <img 
                          src={p.image} 
                          alt={p.name} 
                          className="w-full h-full object-contain p-0.5" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Icon className="w-4 h-4 text-slate-400" />
                      )}
                    </div>

                    {/* Stok Kodu */}
                    <span className="font-mono text-xs font-black text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/90 px-2 py-0.5 rounded shrink-0">
                      {p.code}
                    </span>

                    {/* Kategori Türü Rozeti (MAMÜL / YARI MAMÜL / HAMMADDE / AKSESUAR) */}
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0",
                      meta.badgeClass
                    )}>
                      {meta.badgeLabel}
                    </span>

                    {/* Model / Ürün Adı & Ek İpuçları */}
                    <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 truncate">
                        {p.name}
                      </span>

                      {/* Kompakt Yan Etiketler */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5 sm:mt-0 shrink-0">
                        {p.brand && (
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded hidden sm:inline-block">
                            {p.brand}
                          </span>
                        )}

                        {p.subType && (
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.2 rounded hidden md:inline-block">
                            {p.subType}
                          </span>
                        )}

                        {p.shelf && (
                          <span className="text-[10px] font-medium text-slate-400 items-center gap-0.5 hidden lg:inline-flex">
                            <MapPin className="w-2.5 h-2.5" />
                            {p.shelf}
                          </span>
                        )}

                        {p.hasBrokenSize && (
                          <span className="text-[9px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded inline-flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Kırık Beden
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SAĞ TARAF: Stok Rakamı, Renk Bazlı Dağılım ve Koli Bilgisi */}
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    {/* Renk Bazlı Stok Dağılımı (Varyant Stoklarından) */}
                    {p.variantBarcodes && p.variantBarcodes.length > 0 && p.colorRows.length > 0 ? (
                      <div className="hidden md:flex flex-wrap items-center gap-1 max-w-[430px] justify-end">
                        {p.colorRows.slice(0, 4).map(c => {
                          const sw = getColorSwatch(c.color);
                          return (
                            <span
                              key={c.color}
                              title={`${c.color}: ${formatColorQty(c.colorTotalStock, p.templateMultiplier, p.unit || 'Çift')}${p.templateMultiplier > 1 ? ` (${c.colorTotalStock} ${p.unit || 'Çift'})` : ''}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5",
                                c.colorTotalStock <= 0
                                  ? "border-rose-200 bg-rose-50/70"
                                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                              )}
                            >
                              <span className="w-2 h-2 rounded-full border shrink-0" style={{ backgroundColor: sw.bg, borderColor: sw.border }} />
                              <span className="text-[9px] font-black uppercase text-slate-600 dark:text-slate-300">{c.color}</span>
                              <span className={cn(
                                "text-[9px] font-mono font-black",
                                c.colorTotalStock <= 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
                              )}>
                                {formatColorQty(c.colorTotalStock, p.templateMultiplier, p.unit || 'Çift')}
                              </span>
                            </span>
                          );
                        })}
                        {p.colorRows.length > 4 && (
                          <span
                            title={p.colorRows.slice(4).map(c => `${c.color}: ${formatColorQty(c.colorTotalStock, p.templateMultiplier, p.unit || 'Çift')}${p.templateMultiplier > 1 ? ` (${c.colorTotalStock} ${p.unit || 'Çift'})` : ''}`).join('\n')}
                            className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-black text-indigo-700 cursor-help"
                          >
                            +{p.colorRows.length - 4} renk
                          </span>
                        )}
                      </div>
                    ) : p.colorRows.length > 1 && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50/80 border border-indigo-100 px-2 py-0.5 rounded-full hidden sm:inline-flex items-center gap-1">
                        <Palette className="w-3 h-3 text-indigo-500" />
                        {p.colorRows.length} Renk
                      </span>
                    )}

                    {/* Koli / Multiplier Tahmini (Ayakkabılar İçin) */}
                    {p.multiplier && p.multiplier > 1 && (
                      <span className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded hidden md:inline-block">
                        ~{(p.finalStock / p.multiplier).toFixed(1)} Koli
                      </span>
                    )}

                    {/* Stok Miktarı */}
                    <div className="text-right min-w-[70px]">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className={cn(
                          "font-mono font-black",
                          rowDensity === 'compact' ? "text-sm" : "text-base",
                          p.finalStock <= 0 
                            ? "text-rose-600" 
                            : p.isCritical 
                              ? "text-amber-600" 
                              : "text-emerald-700"
                        )}>
                          {p.finalStock}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                          {p.unit || 'Çift'}
                        </span>
                      </div>

                      {p.finalStock <= 0 ? (
                        <div className="text-[8px] font-black uppercase tracking-wider text-rose-600">Tükendi</div>
                      ) : p.isCritical ? (
                        <div className="text-[8px] font-black uppercase tracking-wider text-amber-600">Kritik Stok</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* ────────────────────────────────────────────────────────────
                    GENİŞLETİLMİŞ ALT DETAY: RENKLER, ASORTİ TABLOSU VEYA MALZEME BİLGİSİ
                   ──────────────────────────────────────────────────────────── */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      key={`expanded-detail-${p.id}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50/60 p-3 sm:p-4 space-y-3"
                    >
                      {/* Üst Bilgi Şeridi */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border",
                            meta.badgeExpandedClass
                          )}>
                            {meta.label}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-medium">
                            Şablon / Paket: <b>{p.templateName}</b> ({p.templateMultiplier} {p.secondaryUnit || p.unit}/Koli)
                          </span>
                          {p.shelf && (
                            <>
                              <span className="text-slate-400">•</span>
                              <span className="text-slate-600 font-medium">
                                Depo/Raf: <b>{p.shelf} {p.location ? `(${p.location})` : ''}</b>
                              </span>
                            </>
                          )}
                        </div>

                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          Alış: <b className="text-slate-800 dark:text-slate-200">₺{p.buyingPrice || 0}</b> • Satış: <b className="text-slate-800 dark:text-slate-200">₺{p.sellingPrice || 0}</b> • Min: <b className="text-slate-800 dark:text-slate-200">{p.minStock || 0} {p.unit}</b>
                        </div>
                      </div>

                      {/* Renk ve Beden Matrisi */}
                      <div className="space-y-2.5">
                        {p.colorRows.map((c, cIdx) => (
                          <div 
                            key={`${p.id}-${c.color}-${cIdx}`}
                            className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden"
                          >
                            {/* Renk Başlık Şeridi */}
                            <div className="p-2 sm:px-3 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                {/* Color Swatch / Mini image */}
                                {c.colorImage ? (
                                  <div className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
                                    <img 
                                      src={c.colorImage} 
                                      alt={c.color} 
                                      className="w-full h-full object-contain p-0.5" 
                                      referrerPolicy="no-referrer" 
                                    />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 font-black text-[10px] shrink-0">
                                    {c.color.slice(0, 2).toUpperCase()}
                                  </div>
                                )}

                                <span className="text-xs font-black uppercase text-slate-900 dark:text-slate-100">
                                  {c.color}
                                </span>

                                {c.isColorBroken && (
                                  <span className="text-[9px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Kırık Beden ({c.sizesWithoutStockCount} Beden 0)
                                  </span>
                                )}

                                {!c.isColorBroken && c.colorTotalStock > 0 && (
                                  <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded flex items-center gap-1">
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    Tam Seri
                                  </span>
                                )}

                                {/* Koli Barkodu */}
                                {c.boxBarcode && (
                                  <div className="flex items-center gap-1 ml-2 text-[10px]">
                                    <span className="text-slate-400 font-bold uppercase">Barkod:</span>
                                    <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                      {c.boxBarcode}
                                    </span>
                                    <button 
                                      onClick={() => handleCopyBarcode(c.boxBarcode!)}
                                      className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 cursor-pointer"
                                      title="Barkodu Kopyala"
                                    >
                                      {copiedBarcode === c.boxBarcode ? (
                                        <Check className="w-3 h-3 text-emerald-600" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Renk Toplam Stoğu */}
                              <div className="flex items-center gap-1 self-end sm:self-center font-mono text-xs">
                                <span className="text-slate-400 font-bold uppercase text-[10px]">Varyant Stoğu:</span>
                                <span className={cn(
                                  "font-black",
                                  c.colorTotalStock <= 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
                                )}>
                                  {c.colorTotalStock} {p.unit || 'Çift'}
                                </span>
                                {c.estimatedBoxes > 0 && (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    (~{c.estimatedBoxes.toFixed(1)} Koli)
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Beden Matrisi Tablosu */}
                            {p.isFootwear && c.sizeList.length > 1 ? (
                              <div className="p-2 overflow-x-auto">
                                <table className="w-full text-center border-collapse min-w-[450px]">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800/90 text-slate-600 text-[10px] font-black uppercase tracking-wider border border-slate-200 dark:border-slate-700">
                                      <th className="py-1.5 px-2 text-left w-28 border-r border-slate-200 dark:border-slate-700 bg-slate-200/70">
                                        Beden / Numara
                                      </th>
                                      {c.sizeList.map((s, sIdx) => (
                                        <th 
                                          key={`${s.size}-${sIdx}`}
                                          className="py-1.5 px-2 border-r border-slate-200 dark:border-slate-700 last:border-r-0 font-mono text-xs font-black text-slate-900 dark:text-slate-100"
                                        >
                                          {s.size}
                                        </th>
                                      ))}
                                      <th className="py-1.5 px-2 bg-indigo-50/80 text-indigo-900 border-l border-indigo-100 font-black w-20">
                                        TOPLAM
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Koli Şablon Dağılımı */}
                                    {c.sizeList.some(s => (s.templateRatio || 0) > 0) && (
                                      <tr className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50/40">
                                        <td className="py-1.5 px-2 text-left font-bold text-[9px] uppercase tracking-wider text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                          Koli Şablonu
                                        </td>
                                        {c.sizeList.map((s, sIdx) => (
                                          <td 
                                            key={`ratio-${s.size}-${sIdx}`}
                                            className="py-1.5 px-2 border-r border-slate-100 dark:border-slate-800 last:border-r-0 font-mono font-bold text-slate-400 text-xs"
                                          >
                                            {s.templateRatio || '-'}
                                          </td>
                                        ))}
                                        <td className="py-1.5 px-2 border-l border-indigo-100 bg-indigo-50/40 font-mono font-black text-indigo-600 text-xs">
                                          {p.templateMultiplier}
                                        </td>
                                      </tr>
                                    )}

                                    {/* Mevcut Stok */}
                                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                                      <td className="py-2 px-2 text-left font-black text-xs uppercase tracking-wider text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50/80">
                                        Mevcut Stok
                                      </td>
                                      {c.sizeList.map((s, sIdx) => {
                                        const isZero = (s.stock || 0) === 0;
                                        return (
                                          <td 
                                            key={`stock-${s.size}-${sIdx}`}
                                            className={cn(
                                              "py-2 px-2 border-r border-slate-200 dark:border-slate-700 last:border-r-0 font-mono text-xs font-black transition-colors",
                                              isZero 
                                                ? "bg-rose-50/80 text-rose-600" 
                                                : "bg-emerald-50/40 text-emerald-800"
                                            )}
                                          >
                                            {isZero ? (
                                              <span className="text-[10px] font-bold text-rose-500">0</span>
                                            ) : (
                                              <span>{s.stock}</span>
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="py-2 px-2 border-l border-indigo-200 bg-indigo-50 font-mono text-sm font-black text-indigo-700">
                                        {c.colorTotalStock}
                                      </td>
                                    </tr>

                                    {/* Beden Tekil Barkodu */}
                                    <tr className="text-[9px] text-slate-400 bg-slate-50 dark:bg-slate-800/50/30">
                                      <td className="py-1 px-2 text-left font-bold text-[8px] uppercase tracking-wider text-slate-400 border-r border-slate-200 dark:border-slate-700">
                                        Beden Barkod
                                      </td>
                                      {c.sizeList.map((s, sIdx) => (
                                        <td 
                                          key={`bc-${s.size}-${sIdx}`}
                                          className="py-1 px-1.5 border-r border-slate-100 dark:border-slate-800 last:border-r-0 font-mono text-[9px]"
                                        >
                                          {s.barcode ? (
                                            <span 
                                              onClick={() => handleCopyBarcode(s.barcode!)}
                                              className="cursor-pointer hover:text-indigo-600 hover:underline inline-flex items-center gap-0.5"
                                              title={`Kopyala: ${s.barcode}`}
                                            >
                                              {s.barcode.length > 8 ? `...${s.barcode.slice(-6)}` : s.barcode}
                                              {copiedBarcode === s.barcode && <Check className="w-2.5 h-2.5 text-emerald-600" />}
                                            </span>
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )}
                                        </td>
                                      ))}
                                      <td className="py-1 px-2 border-l border-indigo-100 bg-indigo-50/20 text-slate-400 text-[9px]">
                                        {c.sizeList.length} Beden
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              /* Standart / Boyutsuz Stok Bilgi Çubuğu */
                              <div className="p-2.5 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900">
                                <div className="flex items-center gap-3">
                                  <span>Birim: <b className="text-slate-900 dark:text-slate-100">{p.unit}</b></span>
                                  <span>•</span>
                                  <span>Mevcut Miktar: <b className="text-emerald-700 font-mono font-black">{c.colorTotalStock} {p.unit}</b></span>
                                  {p.minStock > 0 && (
                                    <>
                                      <span>•</span>
                                      <span>Kritik Eşik: <b className="text-slate-900 dark:text-slate-100">{p.minStock} {p.unit}</b></span>
                                    </>
                                  )}
                                </div>
                                {c.boxBarcode && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-400 text-[10px] uppercase font-bold">Stok Barkodu:</span>
                                    <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                      {c.boxBarcode}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
