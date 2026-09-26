import React, { useState } from 'react';
import {
  Barcode,
  Plus,
  Search,
  Printer,
  Copy,
  Trash2,
  Edit3,
  RefreshCw
} from 'lucide-react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import { BarcodeTemplate } from '../../types';
import { barcodeTemplateService } from '../../services/barcodeTemplateService';
import { LabelTemplateDesignerModal } from './LabelTemplateDesignerModal';
import DataGrid, { GridColumn, StatusPill } from '../Common/DataGrid';
import { turkishIncludes } from '../../lib/turkishUtils';
import { cn } from '../../lib/utils';

const getEffectiveSize = (t: BarcodeTemplate) => {
  const isLandscape = t.orientation === 'landscape';
  return {
    w: isLandscape ? Math.max(t.widthMm, t.heightMm) : Math.min(t.widthMm, t.heightMm),
    h: isLandscape ? Math.min(t.widthMm, t.heightMm) : Math.max(t.widthMm, t.heightMm),
  };
};

const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'shipping': return 'Lojistik Koli';
    case 'box': return 'Asorti Koli';
    case 'shoe_box': return 'Tekil Kutu';
    case 'shelf': return 'Raf / Stok';
    default: return 'Özel Şablon';
  }
};

export const BarcodeTemplatesManager: React.FC = () => {
  const templates = useApiQuery(() => api.barcodeTemplates.list(), [], ['barcodeTemplates']) || [];
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSize, setFilterSize] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  
  const [isDesignerModalOpen, setIsDesignerModalOpen] = useState(false);
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<BarcodeTemplate | null>(null);
  const [printingTemplateId, setPrintingTemplateId] = useState<number | null>(null);

  // Filtered Templates
  const filteredTemplates = templates.filter(t => {
    const matchesSearch = turkishIncludes(t.name || '', searchTerm) ||
      turkishIncludes(t.description || '', searchTerm) ||
      turkishIncludes(`${t.widthMm}x${t.heightMm}`, searchTerm);

    const matchesSize = filterSize === 'all' || 
      (filterSize === '100x150' && (t.presetSize === '100x150' || (t.widthMm === 100 && t.heightMm === 150))) ||
      (filterSize === '60x40' && (t.presetSize === '60x40' || (t.widthMm === 60 && t.heightMm === 40))) ||
      (filterSize === '100x80' && (t.presetSize === '100x80' || (t.widthMm === 100 && t.heightMm === 80))) ||
      (filterSize === 'other' && !['100x150', '60x40', '100x80'].includes(t.presetSize));

    const matchesType = filterType === 'all' || t.type === filterType;

    return matchesSearch && matchesSize && matchesType;
  });

  // Action Handlers
  const handleOpenNew = () => {
    setSelectedTemplateForEdit(null);
    setIsDesignerModalOpen(true);
  };

  const handleEdit = (template: BarcodeTemplate) => {
    setSelectedTemplateForEdit(template);
    setIsDesignerModalOpen(true);
  };

  const handleDuplicate = async (id: number) => {
    await barcodeTemplateService.duplicate(id);
  };

  const handleDelete = async (id: number, name: string) => {
    if (confirm(`"${name}" şablonunu silmek istediğinize emin misiniz?`)) {
      await barcodeTemplateService.delete(id);
    }
  };

  const handleResetDefaults = async () => {
    if (confirm('Tüm barkod şablonları fabrika ayarlarına sıfırlansın mı? Mevcut özel tasarımlarınız silinecektir.')) {
      await barcodeTemplateService.resetDefaults();
    }
  };

  const handleQuickTestPrint = async (template: BarcodeTemplate) => {
    if (!template.id) return;
    setPrintingTemplateId(template.id);
    try {
      await barcodeTemplateService.printDirect(template, {
        companyName: template.config?.companyHeaderText || 'PROERP AYAKKABI SANAYİ',
        productCode: 'AYK-OXF-2026',
        productName: 'Hakiki Deri Erkek Klasik Oxford',
        color: 'SİYAH / BLACK',
        material: 'Dana Derisi',
        size: '42',
        assortmentMatrix: { '40': 1, '41': 2, '42': 3, '43': 3, '44': 2, '45': 1 },
        totalPairs: 12,
        barcode: '8690123456789',
        price: 1850,
        currency: 'TL',
        orderNumber: 'SIP-2026-0042',
        customerName: 'METRO AYAKKABI SAN. TİC. LTD. ŞTİ.',
        boxNumber: 1,
        totalBoxes: 10,
        weightKg: 14.5,
        desi: 18,
        customNote: template.config?.customNoteText || 'DİKKAT: NEMDEN KORUYUNUZ.'
      });
    } catch (err) {
      console.error('Test baskı hatası:', err);
    } finally {
      setPrintingTemplateId(null);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'shipping':
        return <StatusPill tone="blue">Lojistik Koli</StatusPill>;
      case 'box':
        return <StatusPill tone="violet">Asorti Koli</StatusPill>;
      case 'shoe_box':
        return <StatusPill tone="amber">Tekil Kutu</StatusPill>;
      case 'shelf':
        return <StatusPill tone="green">Raf / Stok</StatusPill>;
      default:
        return <StatusPill tone="slate">Özel Şablon</StatusPill>;
    }
  };

  const templateColumns = React.useMemo<GridColumn<BarcodeTemplate>[]>(() => [
    {
      key: 'type',
      title: 'Tür',
      render: (t) => getTypeBadge(t.type),
      filterValue: (t) => getTypeLabel(t.type),
    },
    {
      key: 'size',
      title: 'Boyut',
      align: 'center',
      render: (t) => {
        const { w, h } = getEffectiveSize(t);
        const is100x150 = (t.widthMm === 100 && t.heightMm === 150) || t.presetSize === '100x150';
        const is60x40 = (t.widthMm === 60 && t.heightMm === 40) || t.presetSize === '60x40';
        return (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-black px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-md">
            <span className={cn(
              "w-1.5 h-1.5 rounded-full",
              is100x150 ? "bg-blue-500" : is60x40 ? "bg-amber-500" : "bg-slate-300 dark:bg-slate-600"
            )} />
            {w} × {h} mm
          </span>
        );
      },
      filterValue: (t) => {
        const { w, h } = getEffectiveSize(t);
        return `${w}x${h}`;
      },
    },
    {
      key: 'orientation',
      title: 'Yön',
      align: 'center',
      render: (t) => (
        <span className="text-[10px] text-slate-400 font-bold uppercase">
          {t.orientation === 'portrait' ? 'Dikey' : 'Yatay'}
        </span>
      ),
      filterValue: (t) => t.orientation === 'portrait' ? 'Dikey' : 'Yatay',
    },
    {
      key: 'name',
      title: 'Şablon',
      render: (t) => {
        const { w, h } = getEffectiveSize(t);
        return (
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{t.name}</h3>
            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
              {t.description || `${w}x${h} mm termal etiket şablonu.`}
            </p>
          </div>
        );
      },
      filterValue: (t) => `${t.name} ${t.description || ''}`,
    },
    {
      key: 'layers',
      title: 'Katmanlar',
      filterable: false,
      render: (t) => (
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
          {t.config?.showCompanyHeader && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Firma Ünvanı</span>}
          {t.config?.showAssortmentTable && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Asorti Matrisi</span>}
          {t.config?.showBarcode && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Barkod ({t.config?.barcodeType || 'CODE-128'})</span>}
          {t.config?.showLogisticsIcons && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Taşıma Piktogramı</span>}
          {t.config?.showPrice && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Fiyat</span>}
          {t.config?.showBoxSerial && <span className="bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Koli No</span>}
        </div>
      ),
    },
  ], []);

  return (
    <div className="space-y-6">
      
      {/* 1. ÜST BAŞLIK VE HIZLI AKSİYONLAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Barcode className="w-6 h-6 text-indigo-600" />
            <span>Termal Barkod & Etiket Şablonları</span>
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold mt-0.5">
            100x150 mm koli sevkiyatı, 60x40 mm ayakkabı kutusu ve tüm özel termal rulo boyutları için hazır tasarım şablonları.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
            title="Fabrika varsayılan şablonlarını geri yükle"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Varsayılanları Yükle</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNew}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Şablon Tasarla</span>
          </button>
        </div>
      </div>

      {/* 2. HIZLI BOYUT KARTLARI (PRESETS SUMMARY) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilterSize(filterSize === '100x150' ? 'all' : '100x150')}
          className={cn(
            "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
            filterSize === '100x150'
              ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl">📦</span>
            <span className={cn(
              "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
              filterSize === '100x150' ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            )}>
              100x150 mm
            </span>
          </div>
          <div className={cn("text-xs font-bold", filterSize === '100x150' ? "text-white" : "text-slate-900 dark:text-slate-100")}>
            Lojistik Koli Barkodu
          </div>
          <div className={cn("text-[10px]", filterSize === '100x150' ? "text-indigo-100" : "text-slate-500")}>
            Kargo, ambar & sevkiyat
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterSize(filterSize === '60x40' ? 'all' : '60x40')}
          className={cn(
            "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
            filterSize === '60x40'
              ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl">👟</span>
            <span className={cn(
              "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
              filterSize === '60x40' ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            )}>
              60x40 mm
            </span>
          </div>
          <div className={cn("text-xs font-bold", filterSize === '60x40' ? "text-white" : "text-slate-900 dark:text-slate-100")}>
            Tekil Kutu Barkodu
          </div>
          <div className={cn("text-[10px]", filterSize === '60x40' ? "text-indigo-100" : "text-slate-500")}>
            Tek çift kutu & EAN-13
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterSize(filterSize === '100x80' ? 'all' : '100x80')}
          className={cn(
            "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
            filterSize === '100x80'
              ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl">🏷️</span>
            <span className={cn(
              "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
              filterSize === '100x80' ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            )}>
              100x80 mm
            </span>
          </div>
          <div className={cn("text-xs font-bold", filterSize === '100x80' ? "text-white" : "text-slate-900 dark:text-slate-100")}>
            Asortili Koli Etiketi
          </div>
          <div className={cn("text-[10px]", filterSize === '100x80' ? "text-indigo-100" : "text-slate-500")}>
            8-10-12 çift asorti matrisi
          </div>
        </button>

        <button
          type="button"
          onClick={() => setFilterSize(filterSize === 'other' ? 'all' : 'other')}
          className={cn(
            "p-3.5 rounded-2xl border text-left transition-all cursor-pointer",
            filterSize === 'other'
              ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xl">📐</span>
            <span className={cn(
              "text-[10px] font-mono font-black px-1.5 py-0.5 rounded",
              filterSize === 'other' ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
            )}>
              Özel & Diğer
            </span>
          </div>
          <div className={cn("text-xs font-bold", filterSize === 'other' ? "text-white" : "text-slate-900 dark:text-slate-100")}>
            80x60, 50x30, 40x25 mm
          </div>
          <div className={cn("text-[10px]", filterSize === 'other' ? "text-indigo-100" : "text-slate-500")}>
            Raf, aksesuar & mini etiketler
          </div>
        </button>
      </div>

      {/* 3. ŞABLON LİSTESİ (DataGrid) */}
      {filteredTemplates.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
          <Barcode className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Arama Kriterine Uygun Şablon Bulunamadı</h3>
          <p className="text-xs text-slate-500 mt-1">Filtreleri temizleyebilir veya yeni bir barkod şablonu oluşturabilirsiniz.</p>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-indigo-700 transition-colors"
          >
            Varsayılan Şablonları Yükle
          </button>
        </div>
      ) : (
        <DataGrid
          columns={templateColumns}
          data={filteredTemplates}
          rowKey={(t) => t.id ?? t.name}
          toolbar={(
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Şablon adı, boyut veya açıklama ara..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <option value="all">Tüm Kullanım Amaçları</option>
                <option value="shipping">Lojistik Koli</option>
                <option value="box">Asortili Koli</option>
                <option value="shoe_box">Tekil Kutu</option>
                <option value="shelf">Raf & Depo</option>
                <option value="custom">Özel Boyut</option>
              </select>
            </div>
          )}
          rowActions={(t) => (
            <>
              <button
                type="button"
                onClick={() => handleQuickTestPrint(t)}
                disabled={printingTemplateId === t.id}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                title="Hızlı Test Baskısı Al"
              >
                <Printer className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => t.id && handleDuplicate(t.id)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Şablonu Kopyala"
              >
                <Copy className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => t.id && handleDelete(t.id, t.name)}
                className="p-2 text-rose-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                title="Şablonu Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleEdit(t)}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Tasarla / Düzenle</span>
              </button>
            </>
          )}
        />
      )}

      {/* TASARIMCI / DÜZENLEME MODALI */}
      {isDesignerModalOpen && (
        <LabelTemplateDesignerModal
          isOpen={isDesignerModalOpen}
          onClose={() => {
            setIsDesignerModalOpen(false);
            setSelectedTemplateForEdit(null);
          }}
          templateToEdit={selectedTemplateForEdit}
        />
      )}

    </div>
  );
};
