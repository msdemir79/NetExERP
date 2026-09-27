import { useState, useMemo } from 'react';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  ArrowUp,
  Ruler,
  Eye,
  X,
  Barcode,
  Settings,
  Camera,
  Edit2,
  Boxes,
  Grid,
  BarChart3,
  FileText
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { formatQuantity } from '../lib/inventoryCalculator';
import PageHeader from './PageHeader';
import DataGrid, { GridColumn, StatusPill } from './Common/DataGrid';
import CameraBarcodeScannerModal, { type ScannerMode } from './Common/CameraBarcodeScannerModal';
import AdjustStockModal from './Inventory/AdjustStockModal';
import ProductDetailModal from './Inventory/ProductDetailModal';
import AssortmentTemplatesModal from './Inventory/AssortmentTemplatesModal';
import BarcodeSettingsModal from './Inventory/BarcodeSettingsModal';
import StockStatementModal from './Inventory/StockStatementModal';
import StockCardFormModal from './Inventory/StockCardFormModal';
import { CATEGORY_CONFIGS, getProductCategoryType } from './Inventory/categoryConfig';
import { StockCategoryType, Product } from '../types';


export default function Inventory() {
  const navigate = useNavigate();
  const products = useApiQuery(() => api.products.list(), [], ['products']);
  const templates = useApiQuery(() => api.assortmentTemplates.list(), [], ['assortmentTemplates']);
  const tdhpAccounts = useApiQuery(() => api.accounts.list(), [], ['accounts']);
  const inventoryLogs = useApiQuery(() => api.inventoryLogs.list(), [], ['inventoryLogs']);
  const contacts = useApiQuery(() => api.contacts.list(), [], ['contacts']);

  // Navigation & Filter States
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'all' | StockCategoryType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [filterVariantOnly, setFilterVariantOnly] = useState(false);

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [stockCardEditProduct, setStockCardEditProduct] = useState<Product | null>(null);
  const [stockCardInitialCategory, setStockCardInitialCategory] = useState<StockCategoryType>('finished');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);


  // Adjust Stock modal state

  // Live Camera Barcode / QR Scanner State
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScannerMode, setCameraScannerMode] = useState<ScannerMode>('stock_count');

  // Helper to determine active category of a product


  // Filtered Products
  const filteredProducts = useMemo(() => {
    if (!products) return [];

    return products.filter(p => {
      const pCat = getProductCategoryType(p);

      // Category tab filter
      if (selectedCategoryTab !== 'all' && pCat !== selectedCategoryTab) {
        return false;
      }

      // Low stock filter
      if (filterLowStock && p.stock > p.minStock) {
        return false;
      }

      // Variant only filter
      if (filterVariantOnly && !p.hasSizeVariants && !p.isFootwear && (!p.variantBarcodes || p.variantBarcodes.length === 0)) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesCode = p.code?.toLowerCase().includes(term);
        const matchesName = p.name?.toLowerCase().includes(term);
        const matchesBrand = p.brand?.toLowerCase().includes(term);
        const matchesCategory = p.category?.toLowerCase().includes(term);
        const matchesSubType = p.subType?.toLowerCase().includes(term);
        const matchesShelf = p.shelf?.toLowerCase().includes(term);
        const matchesColors = p.colors?.some(c => c.toLowerCase().includes(term));
        const matchesBarcode = p.colorBoxBarcodes?.some(b => b.barcode.includes(term)) || p.variantBarcodes?.some(v => v.barcode.includes(term));

        if (!matchesCode && !matchesName && !matchesBrand && !matchesCategory && !matchesSubType && !matchesShelf && !matchesColors && !matchesBarcode) {
          return false;
        }
      }

      return true;
    });
  }, [products, selectedCategoryTab, searchTerm, filterLowStock, filterVariantOnly]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = {
      all: products?.length || 0,
      finished: 0,
      semi_finished: 0,
      raw_material: 0,
      accessory: 0
    };
    if (products) {
      products.forEach(p => {
        const cat = getProductCategoryType(p);
        counts[cat] = (counts[cat] || 0) + 1;
      });
    }
    return counts;
  }, [products]);

  const productColumns = useMemo<GridColumn<Product>[]>(() => [
    {
      key: 'name',
      title: 'Stok / Malzeme Kartı',
      render: (product) => (
        <div className="flex items-center gap-3">
          <div className="w-14 h-10 rounded-lg bg-white border border-slate-200 dark:border-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center p-0.5">
            {product.image ? (
              <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
            ) : (
              <Package className="w-5 h-5 text-slate-300" />
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-[10px] font-black px-1.5 py-px rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                {product.code}
              </span>
              {product.accountingCode && (
                <span className="font-mono text-[9px] font-bold px-1.5 py-px rounded bg-indigo-50 border border-indigo-200 text-indigo-700 whitespace-nowrap" title={`TDHP Stok Hesabı: ${product.accountingCode}`}>
                  TDHP: {product.accountingCode}
                </span>
              )}
              {product.shelf && (
                <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">
                  Raf: {product.shelf}
                </span>
              )}
            </div>
            <div className="font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
              {product.name}
              {product.brand && (
                <span className="ml-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {product.brand}
                </span>
              )}
            </div>
          </div>
        </div>
      ),
      filterValue: (product) => `${product.code || ''} ${product.name || ''} ${product.brand || ''} ${product.shelf || ''} ${product.colorBoxBarcodes?.map(b => b.barcode).join(' ') || ''} ${product.variantBarcodes?.map(v => v.barcode).join(' ') || ''}`
    },
    {
      key: 'categoryType',
      title: 'Kategori & Tür',
      render: (product) => {
        const cfg = CATEGORY_CONFIGS[getProductCategoryType(product)];
        return (
          <div className="space-y-0.5">
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border whitespace-nowrap",
              `${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}`
            )}>
              <cfg.icon className="w-3 h-3" />
              {cfg.badge}
            </span>
            {product.subType && (
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase leading-tight truncate">
                {product.subType}
              </div>
            )}
          </div>
        );
      },
      filterValue: (product) => {
        const cfg = CATEGORY_CONFIGS[getProductCategoryType(product)];
        return `${cfg.badge} ${product.subType || ''}`;
      }
    },
    {
      key: 'variant',
      title: 'Beden & Varyant',
      render: (product) => {
        const isVariant = product.hasSizeVariants || product.isFootwear || (product.variantBarcodes && product.variantBarcodes.length > 0);
        if ((product.colors && product.colors.length > 0) || isVariant) {
          return (
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 flex-wrap">
                {product.colors && product.colors.length > 0 ? (
                  <>
                    {product.colors.slice(0, 3).map(col => (
                      <span key={col} className="text-[9px] font-black uppercase px-1.5 py-px bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                        {col}
                      </span>
                    ))}
                    {product.colors.length > 3 && (
                      <span className="text-[9px] font-black text-slate-400" title={product.colors.join(', ')}>
                        +{product.colors.length - 3}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[9px] text-slate-400 font-bold">Matris Var</span>
                )}
              </div>
              {product.variantBarcodes && product.variantBarcodes.length > 0 && (
                <div className="text-[9px] font-mono text-indigo-600 font-bold leading-tight">
                  {product.variantBarcodes.length} Beden Varyantı
                </div>
              )}
            </div>
          );
        }
        return <span className="text-[10px] text-slate-400 font-semibold italic">Tekil Stok</span>;
      },
      filterValue: (product) => `${(product.colors || []).join(' ')} ${product.variantBarcodes && product.variantBarcodes.length > 0 ? 'matris varyant' : ''}`
    },
    {
      key: 'sellingPrice',
      title: 'Fiyat (Alış / Satış)',
      align: 'right',
      render: (product) => (
        <div className="whitespace-nowrap">
          <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-tight">
            ₺{(product.sellingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[9px] text-slate-400 font-bold leading-tight">
            Alış: ₺{(product.buyingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
        </div>
      ),
      filterValue: (product) => `${product.sellingPrice || 0}`
    },
    {
      key: 'stock',
      title: 'Mevcut Stok',
      align: 'right',
      render: (product) => {
        const isLow = product.stock <= (product.minStock || 0);
        return (
          <div className="space-y-0.5 whitespace-nowrap">
            <div className={cn(
              "text-sm font-black font-mono inline-flex items-baseline gap-1 leading-tight",
              isLow ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
            )}>
              <span>{formatQuantity(product.stock)}</span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{product.unit}</span>
            </div>
            {isLow && (
              <div className="flex justify-end">
                <StatusPill tone="red" className="text-[9px] uppercase">
                  <AlertTriangle className="w-3 h-3" /> Kritik (Min: {product.minStock})
                </StatusPill>
              </div>
            )}
            {product.multiplier && product.multiplier > 1 && product.secondaryUnit && (
              <div className="text-[9px] text-indigo-500 font-bold uppercase leading-tight">
                ({formatQuantity(product.stock * product.multiplier)} {product.secondaryUnit})
              </div>
            )}
          </div>
        );
      },
      filterValue: (product) => `${product.stock ?? 0}`
    }
  ], []);

  // Open the stock card form in ADD mode (optionally preselecting a category).
  const handleOpenAddModal = (initialCategory?: StockCategoryType) => {
    const cat = initialCategory || (selectedCategoryTab === 'all' ? 'finished' : selectedCategoryTab);
    setStockCardEditProduct(null);
    setStockCardInitialCategory(cat);
    setIsAddModalOpen(true);
  };

  // Open the stock card form in EDIT mode for an existing product.
  const handleOpenEditModal = (product: Product) => {
    setStockCardEditProduct(product);
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Primary Actions */}
      <PageHeader
        title="Stok & Malzeme Envanteri"
        subtitle="Mamul ayakkabı, bedenli yarı mamul (taban/mostra/fuspet), hammadde ve sarf malzeme kartları"
        badge="Stok Yönetimi"
        icon={Package}
        iconColor="indigo"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCameraScannerMode('stock_count');
                setIsCameraScannerOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800 rounded-lg text-xs font-bold text-purple-700 dark:text-purple-300 transition-colors cursor-pointer shadow-xs"
              title="Cihaz veya tablet kamerasıyla barkod okutarak hızlı stok sayımı ve mal kabulü yap"
            >
              <Camera className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Kamera ile Canlı Sayım / Mal Kabul</span>
            </button>

            <Link
              to="/reports?tab=stock"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg text-xs font-semibold text-indigo-700 transition-colors"
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Stok Raporu</span>
            </Link>

            <Link
              to="/inventory/templates"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 rounded-lg text-xs font-bold text-indigo-700 transition-colors shadow-xs"
              title="100x150, 60x40 ve diğer termal barkod etiket şablonlarını yönet ve tasarla"
            >
              <Barcode className="w-3.5 h-3.5 text-indigo-600" />
              <span>Barkod & Etiket Şablonları</span>
            </Link>

            <button
              onClick={() => setIsTemplateModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <Ruler className="w-3.5 h-3.5 text-indigo-500" />
              <span>Asorti Şablonları</span>
            </button>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Barkod Ayarları</span>
            </button>

            <button
              onClick={() => handleOpenAddModal()}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-1.5 rounded-lg font-semibold text-xs transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Stok Kartı</span>
            </button>
          </div>
        }
      />

      {/* Category Filter Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* All items */}
        <button
          onClick={() => setSelectedCategoryTab('all')}
          className={cn(
            "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between group",
            selectedCategoryTab === 'all'
              ? "bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-900/10"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 hover:border-slate-300 text-slate-800 dark:text-slate-200"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={cn(
              "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
              selectedCategoryTab === 'all' ? "bg-white dark:bg-slate-900/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600"
            )}>
              TÜMÜ
            </span>
            <Boxes className={cn("w-4 h-4", selectedCategoryTab === 'all' ? "text-white/70" : "text-slate-400")} />
          </div>
          <div>
            <div className="text-2xl font-black">{categoryCounts.all}</div>
            <div className={cn("text-[11px] font-semibold mt-0.5", selectedCategoryTab === 'all' ? "text-slate-300" : "text-slate-500 dark:text-slate-400")}>
              Toplam Stok Kartı
            </div>
          </div>
        </button>

        {/* 4 Specialized Categories */}
        {(Object.keys(CATEGORY_CONFIGS) as StockCategoryType[]).map(catKey => {
          const cfg = CATEGORY_CONFIGS[catKey];
          const IconComp = cfg.icon;
          const isSelected = selectedCategoryTab === catKey;

          return (
            <button
              key={catKey}
              onClick={() => setSelectedCategoryTab(catKey)}
              className={cn(
                "p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between group",
                isSelected
                  ? "bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-900/10"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 hover:border-slate-300 text-slate-800 dark:text-slate-200"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                  isSelected ? "bg-white dark:bg-slate-900/20 text-white" : `${cfg.bgClass} ${cfg.textClass}`
                )}>
                  {cfg.badge}
                </span>
                <IconComp className={cn("w-4 h-4", isSelected ? "text-white/70" : "text-slate-400")} />
              </div>
              <div>
                <div className="text-2xl font-black">{categoryCounts[catKey]}</div>
                <div className={cn("text-[11px] font-semibold mt-0.5 truncate", isSelected ? "text-slate-300" : "text-slate-500 dark:text-slate-400")}>
                  {cfg.title.split(' ')[0]} Kartları
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Products Table */}
      <DataGrid<Product>
        columns={productColumns}
        data={filteredProducts}
        rowKey="id"
        emptyMessage="Arama kriterlerinize uygun stok kartı bulunamadı veya henüz stok kartı eklenmedi."
        toolbar={
          <div className="flex flex-col md:flex-row items-center gap-2 flex-1 w-full">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Stok Kodu, Ürün Adı, Marka, Barkod veya Renk ile ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                onClick={() => setFilterLowStock(!filterLowStock)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border",
                  filterLowStock
                    ? "bg-rose-50 border-rose-200 text-rose-700 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100"
                )}
              >
                <AlertTriangle className={cn("w-3.5 h-3.5", filterLowStock ? "text-rose-600" : "text-slate-400")} />
                <span>Kritik Stok</span>
              </button>

              <button
                onClick={() => setFilterVariantOnly(!filterVariantOnly)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border",
                  filterVariantOnly
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100"
                )}
              >
                <Grid className={cn("w-3.5 h-3.5", filterVariantOnly ? "text-indigo-600" : "text-slate-400")} />
                <span>Bedenli / Matris</span>
              </button>
            </div>
          </div>
        }
        rowActions={(product) => (
          <>
            <button
              onClick={() => { setSelectedProduct(product); setIsDetailModalOpen(true); }}
              title="Kart Detayı"
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:text-slate-100 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => navigate(`/inventory/barcode?product=${product.id}`)}
              title="Barkod Yazdır"
              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
            >
              <Barcode className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                setSelectedProduct(product);
                setIsAdjustModalOpen(true);
              }}
              title="Stok Hareketi Giriş/Çıkış"
              className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                setSelectedProduct(product);
                setIsStatementModalOpen(true);
              }}
              title="Stok Kart Ekstresi / Hareket Raporu"
              className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => handleOpenEditModal(product)}
              title="Kartı Düzenle"
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 hover:text-slate-900 dark:text-slate-100 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      />

      {/* ========================================================================= */}
      {/* ADD / EDIT STOCK CARD MODAL                                              */}
      {/* ========================================================================= */}
      <StockCardFormModal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); setStockCardEditProduct(null); }}
        editProduct={stockCardEditProduct}
        initialCategory={stockCardInitialCategory}
        products={products}
        templates={templates}
        contacts={contacts}
        tdhpAccounts={tdhpAccounts}
      />

      {/* ========================================================================= */}
      {/* PRODUCT DETAIL MODAL                                                     */}
      {/* ========================================================================= */}
      <ProductDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        product={selectedProduct}
        tdhpAccounts={tdhpAccounts}
        onDeleted={() => setSelectedProduct(null)}
        onOpenStatement={() => setIsStatementModalOpen(true)}
        onEdit={handleOpenEditModal}
      />

      {/* ========================================================================= */}
      {/* ADJUST STOCK MODAL                                                       */}
      {/* ========================================================================= */}
      <AdjustStockModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        product={selectedProduct}
        onSubmitted={() => setSelectedProduct(null)}
      />

      {/* ========================================================================= */}
      {/* ASSORTMENT TEMPLATES MANAGER MODAL                                       */}
      {/* ========================================================================= */}
      <AssortmentTemplatesModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        templates={templates}
      />

      {/* ========================================================================= */}
      {/* BARCODE CONFIGURATION MODAL                                              */}
      {/* ========================================================================= */}
      <BarcodeSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* ========================================================================= */}
      {/* STOK KART EKSTRESİ & HAREKET RAPORU MODAL                               */}
      {/* ========================================================================= */}
      <StockStatementModal
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
        product={selectedProduct}
        inventoryLogs={inventoryLogs}
      />

      {/* Kamera ile Canlı Barkod/Karekod Okuyucu Modalı */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        initialMode={cameraScannerMode}
      />
    </div>
  );
}
