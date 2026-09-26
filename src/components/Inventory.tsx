import React, { useState, useRef, useMemo, useEffect } from 'react';
import { api } from '../api/client';
import { useApiQuery } from '../hooks/useApiQuery';
import {
  Package,
  Plus,
  Search,
  AlertTriangle,
  ArrowUp,
  Palette,
  Ruler,
  Eye,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  Barcode,
  Settings,
  Camera,
  Printer,
  Sparkles,
  Layers,
  CheckCircle2,
  Edit2,
  Boxes,
  Tag,
  ShoppingBag,
  Scissors,
  Wrench,
  Grid,
  BookOpen,
  BarChart3,
  FileText,
  Calendar,
  FileDown,
  RotateCcw,
  Building2
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import Modal from './Modal';
import { erpService, formatQuantity } from '../services/erpService';
import { resizeAndOptimizeImage } from '../utils/imageUtils';
import PageHeader from './PageHeader';
import DataGrid, { GridColumn, StatusPill } from './Common/DataGrid';
import CameraBarcodeScannerModal, { type ScannerMode } from './Common/CameraBarcodeScannerModal';
import { StockCategoryType, Product, AssortmentTemplate, BarcodeVariant } from '../types';
import { printTabularReport } from '../lib/printService';
import { getColorSwatch } from '../lib/colorSwatches';
import { exportToCsv } from '../lib/exportService';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

// Category Definitions & Configurations
export interface CategoryConfig {
  id: StockCategoryType;
  title: string;
  subtitle: string;
  badge: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  icon: any;
  defaultUnits: string[];
  subTypes: string[];
}

export const CATEGORY_CONFIGS: Record<StockCategoryType, CategoryConfig> = {
  finished: {
    id: 'finished',
    title: 'Mamul (Bitmiş Ayakkabı)',
    subtitle: 'Satışa hazır spor, klasik, bot, terlik ve sneaker modelleri',
    badge: 'MAMUL',
    colorClass: 'indigo',
    bgClass: 'bg-indigo-50/80',
    borderClass: 'border-indigo-200',
    textClass: 'text-indigo-700',
    icon: ShoppingBag,
    defaultUnits: ['Çift', 'Koli', 'Adet'],
    subTypes: ['Spor', 'Sneaker', 'Bot & Çizme', 'Klasik', 'Loafer', 'Sandalet', 'Terlik', 'Çocuk Ayakkabısı', 'Güvenlik & İş']
  },
  semi_finished: {
    id: 'semi_finished',
    title: 'Yarı Mamul (Taban / Parça)',
    subtitle: 'Bedenli taban, mostra, fuspet, salpa veya standart ökçe, saya parçaları',
    badge: 'YARI MAMUL',
    colorClass: 'sky',
    bgClass: 'bg-sky-50/80',
    borderClass: 'border-sky-200',
    textClass: 'text-sky-700',
    icon: Layers,
    defaultUnits: ['Çift', 'Adet', 'Takım', 'Paket'],
    subTypes: ['Taban (Sole)', 'Mostra (Astar)', 'Fuspet (Tabanlık)', 'İç Taban (Salpa)', 'Saya Parçası', 'Ökçe / Topuk', 'Bombe & Fort', 'Çelik Bel']
  },
  raw_material: {
    id: 'raw_material',
    title: 'Hammadde (Deri / Kumaş)',
    subtitle: 'Metraj veya alan bazlı vidala, süet, astar deri, tekstil, eva plaka',
    badge: 'HAMMADDE',
    colorClass: 'amber',
    bgClass: 'bg-amber-50/80',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-700',
    icon: Scissors,
    defaultUnits: ['dm²', 'm²', 'Metre', 'Kg', 'Ayak (Sqft)', 'Tabaka', 'Rulo', 'Litre'],
    subTypes: ['Vidala Deri', 'Nubuk Deri', 'Süet Deri', 'Astar Deri', 'Tekstil Kumaş', 'Kanvas', 'Eva Levha', 'Kauçuk Hamuru', 'Sünger', 'Neolit / Köstek']
  },
  accessory: {
    id: 'accessory',
    title: 'Aksesuar & Sarf Malzeme',
    subtitle: 'Toka, bağcık, fermuar, yapıştırıcı ilaç, boya, kutu ve koli sarfları',
    badge: 'AKSESUAR & SARF',
    colorClass: 'emerald',
    bgClass: 'bg-emerald-50/80',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-700',
    icon: Wrench,
    defaultUnits: ['Adet', 'Çift', 'Paket', 'Kutu', 'Koli', 'Kg', 'Litre', 'Bobin', 'Rulo', 'Teneke'],
    subTypes: ['Bağcık', 'Toka', 'Fermuar', 'Kuşgözü & Zımba', 'Arma & Logo', 'Yapıştırıcı / İlaç', 'Sertleştirici & Primer', 'Boya & Cila', 'Dikiş İpliği', 'Ayakkabı Kutusu', 'Koli & Ambalaj']
  }
};

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
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'general' | 'stock' | 'tdhp'>('general');

  useEffect(() => {
    if (isDetailModalOpen) setDetailTab('general');
  }, [isDetailModalOpen, selectedProduct?.id]);

  // Statement / Movement Ledger Modal Filter States
  const [statementTypeFilter, setStatementTypeFilter] = useState<'all' | 'in' | 'out' | 'production_in' | 'production_out'>('all');
  const [statementSearch, setStatementSearch] = useState('');
  const [statementDateRange, setStatementDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });

  // Compute movement logs and running balance for selectedProduct
  const productLogs = useMemo(() => {
    if (!selectedProduct || !inventoryLogs) return [];
    
    let filtered = inventoryLogs.filter(l => l.productId === selectedProduct.id);

    if (statementDateRange.start) {
      const startDate = new Date(statementDateRange.start);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(l => l.date && new Date(l.date) >= startDate);
    }
    if (statementDateRange.end) {
      const endDate = new Date(statementDateRange.end);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(l => l.date && new Date(l.date) <= endDate);
    }

    if (statementTypeFilter !== 'all') {
      filtered = filtered.filter(l => l.type === statementTypeFilter);
    }

    if (statementSearch.trim()) {
      const s = statementSearch.toLowerCase();
      filtered = filtered.filter(l => 
        (l.description || '').toLowerCase().includes(s) ||
        (l.color || '').toLowerCase().includes(s) ||
        (l.size || '').toLowerCase().includes(s)
      );
    }

    // Sort chronologically (oldest to newest) to calculate running balance accurately
    const sorted = [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    const withBalance = sorted.map(log => {
      const qty = Number(log.quantity) || 0;
      runningBalance += qty;
      return {
        ...log,
        runningBalance
      };
    });

    return withBalance.reverse();
  }, [selectedProduct, inventoryLogs, statementDateRange, statementTypeFilter, statementSearch]);

  const statementStats = useMemo(() => {
    if (!productLogs || productLogs.length === 0) {
      return { totalIn: 0, totalOut: 0, netChange: 0, totalCount: 0 };
    }
    let totalIn = 0;
    let totalOut = 0;
    productLogs.forEach(l => {
      const q = Number(l.quantity) || 0;
      if (q > 0) totalIn += q;
      else totalOut += Math.abs(q);
    });
    return {
      totalIn,
      totalOut,
      netChange: totalIn - totalOut,
      totalCount: productLogs.length
    };
  }, [productLogs]);

  const statementColumns = useMemo<GridColumn<(typeof productLogs)[number]>[]>(() => [
    {
      key: 'date',
      title: 'Tarih & Saat',
      render: (log) => (
        <span className="font-mono text-[11px] text-slate-600">
          {log.date ? format(new Date(log.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-'}
        </span>
      ),
      filterValue: (log) => (log.date ? format(new Date(log.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '')
    },
    {
      key: 'type',
      title: 'Hareket Tipi',
      render: (log) => {
        if (log.type === 'in') return <StatusPill tone="green">Stok Girişi</StatusPill>;
        if (log.type === 'out') return <StatusPill tone="red">Stok Çıkışı</StatusPill>;
        if (log.type === 'production_in') return <StatusPill tone="violet">Üretim Girişi</StatusPill>;
        if (log.type === 'production_out') return <StatusPill tone="amber">Hammadde Sarf</StatusPill>;
        return <StatusPill tone="slate">{log.type}</StatusPill>;
      },
      filterValue: (log) =>
        log.type === 'in' ? 'Stok Girişi' :
        log.type === 'out' ? 'Stok Çıkışı' :
        log.type === 'production_in' ? 'Üretim Girişi' :
        log.type === 'production_out' ? 'Hammadde Sarf' :
        (log.type || '')
    },
    {
      key: 'variant',
      title: 'Renk / Beden',
      render: (log) => (
        <span className="text-slate-700 dark:text-slate-200 text-[11px]">
          {[log.color, log.size].filter(Boolean).join(' / ') || '-'}
        </span>
      ),
      filterValue: (log) => [log.color, log.size].filter(Boolean).join(' ')
    },
    {
      key: 'quantity',
      title: 'Giriş (+)',
      align: 'right',
      render: (log) => {
        const qty = Number(log.quantity) || 0;
        return (
          <span className="font-mono font-bold text-emerald-600">
            {qty > 0 ? `+${qty}` : '-'}
          </span>
        );
      },
      filterValue: (log) => `${Number(log.quantity) || 0}`
    },
    {
      key: 'quantityOut',
      title: 'Çıkış (-)',
      align: 'right',
      render: (log) => {
        const qty = Number(log.quantity) || 0;
        return (
          <span className="font-mono font-bold text-rose-600">
            {qty <= 0 ? `-${Math.abs(qty)}` : '-'}
          </span>
        );
      },
      filterValue: (log) => `${Math.abs(Number(log.quantity) || 0)}`
    },
    {
      key: 'runningBalance',
      title: 'Yürüyen Bakiye',
      align: 'right',
      render: (log) => (
        <span className="font-mono font-black text-slate-900 dark:text-slate-100">
          {log.runningBalance} <span className="text-[10px] text-slate-400 font-semibold">{selectedProduct?.unit}</span>
        </span>
      ),
      filterValue: (log) => `${log.runningBalance}`
    },
    {
      key: 'description',
      title: 'Açıklama / Belge',
      render: (log) => (
        <span className="text-slate-600 text-[11px]">{log.description || '-'}</span>
      ),
      filterValue: (log) => log.description || ''
    }
  ], [selectedProduct]);

  const handlePrintStatement = () => {
    if (!selectedProduct || !productLogs || productLogs.length === 0) return;

    const headers = ['TARİH & SAAT', 'HAREKET TİPİ', 'VARYANT / RENK / BEDEN', 'GİRİŞ (+)', 'ÇIKIŞ (-)', 'YÜRÜYEN BAKİYE', 'AÇIKLAMA'];
    const rows = productLogs.map(l => {
      const dateFormatted = l.date ? format(new Date(l.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-';
      const typeLabel = 
        l.type === 'in' ? 'Stok Girişi' :
        l.type === 'out' ? 'Stok Çıkışı' :
        l.type === 'production_in' ? 'Üretim Girişi' :
        l.type === 'production_out' ? 'Hammadde Sarf' : l.type;

      const variantLabel = [l.color, l.size].filter(Boolean).join(' / ') || '-';
      const qty = Number(l.quantity) || 0;
      const inQty = qty > 0 ? `+${qty}` : '-';
      const outQty = qty < 0 ? `${Math.abs(qty)}` : '-';

      return [
        dateFormatted,
        typeLabel,
        variantLabel,
        inQty,
        outQty,
        `${l.runningBalance} ${selectedProduct.unit}`,
        l.description || '-'
      ];
    });

    printTabularReport(
      `Stok Kart Ekstresi: ${selectedProduct.name} (${selectedProduct.code})`,
      `Detaylı Stok Hareket Ve Bakiyeleri Dökümü - Birim: ${selectedProduct.unit}`,
      headers,
      rows,
      [
        { label: 'Mevcut Stok', value: `${formatQuantity(selectedProduct.stock)} ${selectedProduct.unit}` },
        { label: 'Toplam Giriş', value: `+${formatQuantity(statementStats.totalIn)} ${selectedProduct.unit}` },
        { label: 'Toplam Çıkış', value: `-${formatQuantity(statementStats.totalOut)} ${selectedProduct.unit}` },
        { label: 'İşlem Adedi', value: statementStats.totalCount }
      ]
    );
  };

  const handleExportStatementCsv = () => {
    if (!selectedProduct || !productLogs || productLogs.length === 0) return;

    const headers = ['Tarih', 'Ürün Kodu', 'Ürün Adı', 'Hareket Tipi', 'Renk/Beden', 'Giriş', 'Çıkış', 'Yürüyen Bakiye', 'Birim', 'Açıklama'];
    const rows = productLogs.map(l => {
      const dateFormatted = l.date ? format(new Date(l.date), 'dd.MM.yyyy HH:mm', { locale: tr }) : '-';
      const typeLabel = 
        l.type === 'in' ? 'Stok Girişi' :
        l.type === 'out' ? 'Stok Çıkışı' :
        l.type === 'production_in' ? 'Üretim Girişi' :
        l.type === 'production_out' ? 'Hammadde Sarf' : l.type;

      const variantLabel = [l.color, l.size].filter(Boolean).join(' / ') || '-';
      const qty = Number(l.quantity) || 0;
      return [
        dateFormatted,
        selectedProduct.code,
        selectedProduct.name,
        typeLabel,
        variantLabel,
        qty > 0 ? qty : 0,
        qty < 0 ? Math.abs(qty) : 0,
        l.runningBalance,
        selectedProduct.unit,
        l.description || '-'
      ];
    });

    exportToCsv(`${selectedProduct.code}_Stok_Ekstresi.csv`, headers, rows);
  };

  // Active Tab inside Add/Edit Modal: 'general' | 'matrix' | 'images' | 'barcodes' | 'accounting'
  const [activeTab, setActiveTab] = useState<'general' | 'matrix' | 'images' | 'barcodes' | 'accounting'>('general');
  const [barcodeSubTab, setBarcodeSubTab] = useState<'box' | 'variants'>('box');
  const [showColorPanel, setShowColorPanel] = useState(false);

  // Asorti (beden × renk matrisi) akışı — yalnızca kullanıcı "Asorti Ekle" dediğinde devreye girer
  const [assortMode, setAssortMode] = useState(false);
  const [savedBanner, setSavedBanner] = useState<{ code: string; mode: 'created' | 'updated' | 'next' | 'assortSaved'; summary?: string } | null>(null);
  const submitIntentRef = useRef<'save' | 'saveNew'>('save');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Form State for Stock Card
  const [categoryType, setCategoryType] = useState<StockCategoryType>('finished');
  const [hasSizeVariants, setHasSizeVariants] = useState<boolean>(false);
  const [subType, setSubType] = useState<string>('Spor');
  
  const [productForm, setProductForm] = useState({
    code: '',
    name: '',
    brand: '',
    unit: 'Çift',
    shelf: '',
    location: '',
    stock: 0,
    minStock: 5,
    buyingPrice: 0,
    sellingPrice: 0,
    multiplier: 1,
    secondaryUnit: 'Çift',
    accountingCode: '157.01',
    salesAccountCode: '600.01',
    purchaseAccountCode: '620.01',
    vatRate: 20,
    notes: '',
    preferredSupplierId: undefined as number | undefined
  });

  // Variant & Matrix Data
  const [colors, setColors] = useState<string[]>([]);
  const [newColor, setNewColor] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);
  const [colorBoxBarcodes, setColorBoxBarcodes] = useState<{ color: string; barcode: string }[]>([]);
  const [variantBarcodes, setVariantBarcodes] = useState<BarcodeVariant[]>([]);
  const [matrixData, setMatrixData] = useState<Record<string, Record<string, number>>>({});

  // Image upload state
  const [mainImage, setMainImage] = useState<string | undefined>(undefined);
  const [colorImages, setColorImages] = useState<{ color: string; image: string }[]>([]);

  // Adjust Stock modal state
  const [adjustData, setAdjustData] = useState({
    type: 'in' as 'in' | 'out',
    quantity: 1,
    selectedColor: '',
    selectedSize: '',
    description: 'Manuel stok düzeltme'
  });

  // Template Manager state
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateItems, setNewTemplateItems] = useState<{ size: string; quantity: number }[]>([
    { size: '40', quantity: 1 },
    { size: '41', quantity: 2 },
    { size: '42', quantity: 3 },
    { size: '43', quantity: 3 },
    { size: '44', quantity: 2 },
    { size: '45', quantity: 1 }
  ]);

  // Barcode Settings state
  const [barcodeSettings, setBarcodeSettings] = useState<{
    barcodeType: 'EAN-13' | 'CODE-128' | 'CODE-39';
    barcodePrefix: string;
    nextBarcodeSequence: number;
  }>({
    barcodeType: 'CODE-128',
    barcodePrefix: '869',
    nextBarcodeSequence: 1000000
  });

  // Load barcode settings when opening settings modal
  React.useEffect(() => {
    if (isSettingsModalOpen) {
      erpService.getBarcodeSettings().then(s => {
        setBarcodeSettings({
          barcodeType: s.barcodeType || 'CODE-128',
          barcodePrefix: s.barcodePrefix || '869',
          nextBarcodeSequence: s.nextBarcodeSequence || 1000000
        });
      });
    }
  }, [isSettingsModalOpen]);

  // Live Camera Barcode / QR Scanner State
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [cameraScannerMode, setCameraScannerMode] = useState<ScannerMode>('stock_count');

  // Helper to determine active category of a product
  const getProductCategoryType = (p: Product): StockCategoryType => {
    if (p.categoryType) return p.categoryType;
    if (p.isRawMaterial) {
      // Check subType or unit to distinguish accessory vs raw material
      const lowerName = (p.name || '').toLowerCase();
      const lowerCat = (p.category || '').toLowerCase();
      if (
        lowerName.includes('toka') || lowerName.includes('bağcık') || lowerName.includes('fermuar') || 
        lowerName.includes('ilaç') || lowerName.includes('yapıştırıcı') || lowerName.includes('kutu') || 
        lowerCat.includes('aksesuar') || lowerCat.includes('sarf')
      ) {
        return 'accessory';
      }
      return 'raw_material';
    }
    if (p.isFootwear || (p.variantBarcodes && p.variantBarcodes.length > 0)) {
      const lowerName = (p.name || '').toLowerCase();
      if (lowerName.includes('taban') || lowerName.includes('mostra') || lowerName.includes('fuspet') || lowerName.includes('salpa') || lowerName.includes('ökçe')) {
        return 'semi_finished';
      }
      return 'finished';
    }
    return 'finished';
  };

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

  // Reset form handler
  const resetForm = () => {
    setCategoryType('finished');
    setHasSizeVariants(false);
    setSubType('Spor');
    setProductForm({
      code: '',
      name: '',
      brand: '',
      unit: 'Çift',
      shelf: '',
      location: '',
      stock: 0,
      minStock: 5,
      buyingPrice: 0,
      sellingPrice: 0,
      multiplier: 1,
      secondaryUnit: 'Çift',
      accountingCode: '157.01',
      salesAccountCode: '600.01',
      purchaseAccountCode: '620.01',
      vatRate: 20,
      notes: '',
      preferredSupplierId: undefined
    });
    setColors([]);
    setNewColor('');
    setSelectedTemplateId(undefined);
    setColorBoxBarcodes([]);
    setVariantBarcodes([]);
    setMatrixData({});
    setMainImage(undefined);
    setColorImages([]);
    setIsEditMode(false);
    setSelectedProduct(null);
    setActiveTab('general');
    setShowColorPanel(false);
    setAssortMode(false);
    setSavedBanner(null);
  };

  // Open Add Modal
  const handleOpenAddModal = (initialCategory?: StockCategoryType) => {
    resetForm();
    const cat = initialCategory || (selectedCategoryTab === 'all' ? 'finished' : selectedCategoryTab);
    applyCategoryChange(cat);
    setIsAddModalOpen(true);
  };

  // Change category handler in form — birim ve TDHP kodlarını uygular; asorti/renk otomatik AÇILMAZ
  const applyCategoryChange = (newCat: StockCategoryType) => {
    setCategoryType(newCat);
    const defaults: Record<StockCategoryType, { unit: string; accountingCode: string; salesAccountCode: string; purchaseAccountCode: string }> = {
      finished: { unit: 'Çift', accountingCode: '157.01', salesAccountCode: '600.01', purchaseAccountCode: '620.01' },
      semi_finished: { unit: 'Çift', accountingCode: '152.01', salesAccountCode: '600.01', purchaseAccountCode: '710.01' },
      raw_material: { unit: 'dm²', accountingCode: '150.01', salesAccountCode: '600.20', purchaseAccountCode: '150.01' },
      accessory: { unit: 'Adet', accountingCode: '150.02', salesAccountCode: '600.20', purchaseAccountCode: '150.02' }
    };
    const d = defaults[newCat];
    setProductForm(prev => ({
      ...prev,
      unit: d.unit,
      secondaryUnit: d.unit,
      multiplier: 1,
      accountingCode: d.accountingCode,
      salesAccountCode: d.salesAccountCode,
      purchaseAccountCode: d.purchaseAccountCode,
      vatRate: 20
    }));
    setSubType(CATEGORY_CONFIGS[newCat]?.subTypes[0] || 'Standart');
    setAssortMode(false);
    setHasSizeVariants(false);
  };

  // "Asorti Ekle" — beden × renk matrisi akışını başlatır (renk ve numara şablonu zorunlu olur)
  const handleStartAssortment = () => {
    setAssortMode(true);
    setHasSizeVariants(true);
    setActiveTab('matrix');
  };

  const handleCancelAssortment = () => {
    setAssortMode(false);
    setHasSizeVariants(false);
    setActiveTab('general');
  };

  // Open Edit Modal
  const handleOpenEditModal = (product: Product) => {
    setSelectedProduct(product);
    setIsEditMode(true);
    setAssortMode(false);
    setSavedBanner(null);

    const cat = getProductCategoryType(product);
    setCategoryType(cat);
    setHasSizeVariants(product.hasSizeVariants ?? (cat === 'finished' || Boolean(product.isFootwear && product.assortmentTemplateId)));
    setSubType(product.subType || product.category || (cat === 'finished' ? 'Spor' : 'Standart'));

    setProductForm({
      code: product.code || '',
      name: product.name || '',
      brand: product.brand || '',
      unit: product.unit || 'Çift',
      shelf: product.shelf || '',
      location: product.location || '',
      stock: product.stock || 0,
      minStock: product.minStock || 5,
      buyingPrice: product.buyingPrice || 0,
      sellingPrice: product.sellingPrice || 0,
      multiplier: product.multiplier || 1,
      secondaryUnit: product.secondaryUnit || product.unit || 'Çift',
      accountingCode: product.accountingCode || (cat === 'finished' ? '157.01' : cat === 'semi_finished' ? '152.01' : '150.01'),
      salesAccountCode: product.salesAccountCode || '600.01',
      purchaseAccountCode: product.purchaseAccountCode || (cat === 'finished' ? '620.01' : '150.01'),
      vatRate: product.vatRate ?? 20,
      notes: product.notes || '',
      preferredSupplierId: product.preferredSupplierId
    });

    setColors(product.colors ? [...product.colors] : []);
    setSelectedTemplateId(product.assortmentTemplateId);
    setColorBoxBarcodes(product.colorBoxBarcodes ? [...product.colorBoxBarcodes] : []);
    setVariantBarcodes(product.variantBarcodes ? [...product.variantBarcodes] : []);
    setMainImage(product.image);
    setColorImages(product.colorImages ? [...product.colorImages] : []);

    // Reconstruct matrix data from variantBarcodes if available
    const matrix: Record<string, Record<string, number>> = {};
    if (product.variantBarcodes && product.variantBarcodes.length > 0) {
      product.variantBarcodes.forEach(vb => {
        if (!matrix[vb.color]) matrix[vb.color] = {};
        matrix[vb.color][vb.size] = vb.stock || 0;
      });
    }
    setMatrixData(matrix);

    setActiveTab('general');
    setIsAddModalOpen(true);
  };

  // Color add/remove
  const addColor = () => {
    if (!newColor.trim()) return;
    const clean = newColor.trim().toUpperCase();
    if (!colors.includes(clean)) {
      setColors([...colors, clean]);
    }
    setNewColor('');
  };

  const removeColor = (colorToRemove: string) => {
    setColors(colors.filter(c => c !== colorToRemove));
    setColorBoxBarcodes(colorBoxBarcodes.filter(b => b.color !== colorToRemove));
    setVariantBarcodes(variantBarcodes.filter(v => v.color !== colorToRemove));
    setColorImages(colorImages.filter(ci => ci.color !== colorToRemove));
  };

  // Image upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeAndOptimizeImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
        setMainImage(base64);
      } catch (err) {
        console.error('Error optimizing image:', err);
      }
    }
  };

  const handleColorImageUpload = async (color: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await resizeAndOptimizeImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.85 });
        setColorImages(prev => {
          const filtered = prev.filter(ci => ci.color !== color);
          return [...filtered, { color, image: base64 }];
        });
      } catch (err) {
        console.error('Error optimizing color image:', err);
      }
    }
  };

  // Barcode Generation
  const handleGenerateBarcodes = async () => {
    const activeTemplate = templates?.find(t => t.id === (selectedTemplateId || selectedProduct?.assortmentTemplateId));
    const effectiveAssortment = activeTemplate ? activeTemplate.items : (selectedProduct?.assortment || []);

    const productPayload = {
      isFootwear: hasSizeVariants,
      hasSizeVariants,
      colors: colors.length > 0 ? colors : ['Genel'],
      assortment: effectiveAssortment
    };

    try {
      const { colorBoxBarcodes: generatedBox, variantBarcodes: generatedVar } = await erpService.generateAutomatedBarcodes(productPayload);
      
      // Preserve existing stock counts in matrix if any
      const updatedVars = generatedVar.map(gv => {
        const existingStock = matrixData[gv.color]?.[gv.size] || 0;
        return { ...gv, stock: existingStock };
      });

      setColorBoxBarcodes(generatedBox);
      setVariantBarcodes(updatedVars);
    } catch (err) {
      console.error('Barcode generation error:', err);
    }
  };

  // Auto-distribute total stock proportionally based on template ratios
  const handleAutoDistributeStock = (totalAmount: number) => {
    const activeTemplate = templates?.find(t => t.id === (selectedTemplateId || selectedProduct?.assortmentTemplateId));
    if (!activeTemplate || activeTemplate.items.length === 0 || colors.length === 0) return;

    const totalRatio = activeTemplate.items.reduce((acc, it) => acc + (it.quantity || 1), 0);
    const amountPerColor = Math.floor(totalAmount / colors.length);

    const newMatrix: Record<string, Record<string, number>> = {};

    colors.forEach(col => {
      newMatrix[col] = {};
      activeTemplate.items.forEach(it => {
        const proportion = it.quantity / totalRatio;
        const itemStock = Math.round(amountPerColor * proportion);
        newMatrix[col][it.size] = itemStock;
      });
    });

    setMatrixData(newMatrix);

    // Update variantBarcodes stocks
    setVariantBarcodes(prev => prev.map(vb => {
      const s = newMatrix[vb.color]?.[vb.size] || 0;
      return { ...vb, stock: s };
    }));

    // Update total stock
    let calculatedTotal = 0;
    Object.values(newMatrix).forEach(sizes => {
      Object.values(sizes).forEach(qty => {
        calculatedTotal += qty;
      });
    });
    setProductForm(prev => ({ ...prev, stock: calculatedTotal }));
  };

  // Form Submit (Add or Edit)
  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    const intent = submitIntentRef.current;
    submitIntentRef.current = 'save';

    if (!productForm.name.trim()) {
      alert('Lütfen Malzeme/Ürün Adını giriniz.');
      return;
    }

    if (assortMode) {
      if (colors.length === 0) {
        alert('Asorti kaydetmek için en az 1 renk girmelisiniz.');
        setActiveTab('matrix');
        return;
      }
      if (!selectedTemplateId) {
        alert('Asorti kaydetmek için bir numara (beden) şablonu seçmelisiniz.');
        setActiveTab('matrix');
        return;
      }
    }

    let finalCode = productForm.code.trim().toUpperCase();
    if (!finalCode && isEditMode && selectedProduct?.code) {
      finalCode = selectedProduct.code;
    }
    if (!finalCode) {
      const prefixes: Record<StockCategoryType, string> = { finished: 'MAM', semi_finished: 'YRM', raw_material: 'HMD', accessory: 'AKS' };
      const prefix = prefixes[categoryType] || 'STK';
      const existingCodes = new Set((products || []).map(p => (p.code || '').toUpperCase()));
      let seq = 1;
      do {
        finalCode = `${prefix}-${String(seq).padStart(4, '0')}`;
        seq++;
      } while (existingCodes.has(finalCode));
    }

    const activeTemplate = templates?.find(t => t.id === (selectedTemplateId || selectedProduct?.assortmentTemplateId));
    const effectiveAssortment = hasSizeVariants ? (activeTemplate ? activeTemplate.items : (selectedProduct?.assortment || [])) : undefined;

    // Calculate total stock from matrix if size-variant based
    let finalStock = Number(productForm.stock) || 0;
    let finalVariantBarcodes = variantBarcodes;

    if (hasSizeVariants && Object.keys(matrixData).length > 0) {
      let matrixTotal = 0;
      Object.entries(matrixData).forEach(([col, sizes]) => {
        Object.entries(sizes).forEach(([size, qty]) => {
          matrixTotal += Number(qty) || 0;
        });
      });

      if (matrixTotal > 0 || !isEditMode) {
        finalStock = matrixTotal;
      }

      // Sync variantBarcodes with matrix stocks
      if (finalVariantBarcodes.length > 0) {
        finalVariantBarcodes = finalVariantBarcodes.map(vb => ({
          ...vb,
          stock: matrixData[vb.color]?.[vb.size] !== undefined ? matrixData[vb.color][vb.size] : (vb.stock || 0)
        }));
      }
    }

    const payload: Partial<Product> = {
      code: finalCode,
      name: productForm.name.trim(),
      brand: productForm.brand.trim(),
      categoryType,
      hasSizeVariants,
      subType,
      category: subType,
      unit: productForm.unit,
      secondaryUnit: productForm.secondaryUnit || productForm.unit,
      multiplier: Number(productForm.multiplier) || 1,
      stock: finalStock,
      minStock: Number(productForm.minStock) || 0,
      buyingPrice: Number(productForm.buyingPrice) || 0,
      sellingPrice: Number(productForm.sellingPrice) || 0,
      isRawMaterial: categoryType === 'raw_material' || categoryType === 'accessory',
      isFootwear: categoryType === 'finished' || (categoryType === 'semi_finished' && hasSizeVariants),
      shelf: productForm.shelf.trim(),
      location: productForm.location.trim(),
      accountingCode: productForm.accountingCode?.trim() || undefined,
      salesAccountCode: productForm.salesAccountCode?.trim() || undefined,
      purchaseAccountCode: productForm.purchaseAccountCode?.trim() || undefined,
      vatRate: Number(productForm.vatRate) || 20,
      preferredSupplierId: productForm.preferredSupplierId || undefined,
      preferredSupplierName: contacts?.find(c => c.id === productForm.preferredSupplierId)?.name || undefined,
      notes: productForm.notes.trim(),
      colors: colors && colors.length > 0 ? colors : undefined,
      assortmentTemplateId: hasSizeVariants ? selectedTemplateId : undefined,
      assortment: effectiveAssortment,
      colorBoxBarcodes: colorBoxBarcodes.length > 0 ? colorBoxBarcodes : undefined,
      variantBarcodes: finalVariantBarcodes.length > 0 ? finalVariantBarcodes : undefined,
      image: mainImage,
      colorImages: colorImages.length > 0 ? colorImages : undefined,
      updatedAt: new Date()
    };

    try {
      if (isEditMode && selectedProduct?.id) {
        await erpService.updateProduct(selectedProduct.id, payload);

        const wasAssort = assortMode;
        setAssortMode(false);
        if (wasAssort) {
          const sizeCount = activeTemplate?.items.length || 0;
          setSavedBanner({
            code: finalCode,
            mode: 'assortSaved',
            summary: `${colors.length} renk × ${sizeCount} numara = ${colors.length * sizeCount} varyant`
          });
        } else {
          setSavedBanner({ code: finalCode, mode: 'updated' });
        }

        const refreshed = await api.products.get(selectedProduct.id);
        if (refreshed) setSelectedProduct(refreshed);
      } else {
        const createdId = await erpService.addProduct({
          ...payload,
          createdAt: new Date()
        });

        if (intent === 'saveNew') {
          const keptCategory = categoryType;
          resetForm();
          applyCategoryChange(keptCategory);
          setSavedBanner({ code: finalCode, mode: 'next' });
          setTimeout(() => nameInputRef.current?.focus(), 80);
        } else {
          // Modal açık kalır; kart düzenleme moduna geçer ve "Asorti Ekle" teklifi gösterilir
          setIsEditMode(true);
          setProductForm(prev => ({ ...prev, code: finalCode }));
          setSelectedProduct({ ...(payload as Product), id: Number(createdId), createdAt: new Date() });
          setSavedBanner({ code: finalCode, mode: 'created' });
        }
      }
    } catch (err: any) {
      console.error('Error saving product:', err);
      alert('Kayıt kaydedilirken bir hata oluştu: ' + (err.message || err));
    }
  };

  // Delete product handler
  const handleDeleteProduct = async (id: number) => {
    try {
      setDeleteError(null);
      await erpService.deleteProduct(id);
      setDeleteConfirmId(null);
      setIsDetailModalOpen(false);
      setSelectedProduct(null);
    } catch (err: any) {
      setDeleteError(err.message || 'Ürün silinemedi.');
    }
  };

  // Adjust Stock submit handler
  const handleAdjustStockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct?.id) return;

    try {
      const variant = (selectedProduct.hasSizeVariants || selectedProduct.isFootwear) && adjustData.selectedColor && adjustData.selectedSize
        ? { color: adjustData.selectedColor, size: adjustData.selectedSize }
        : undefined;

      await erpService.adjustStock(
        selectedProduct.id,
        Number(adjustData.quantity) || 1,
        adjustData.type,
        adjustData.description,
        variant
      );

      setIsAdjustModalOpen(false);
      setSelectedProduct(null);
    } catch (err: any) {
      alert('Stok hareketi işlenirken hata oluştu: ' + (err.message || err));
    }
  };

  // Assortment Template Save
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim()) return;

    try {
      await api.assortmentTemplates.create({
        name: newTemplateName.trim(),
        items: newTemplateItems
      });
      setNewTemplateName('');
      alert('Asorti şablonu başarıyla eklendi.');
    } catch (err) {
      console.error('Template save error:', err);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (confirm('Bu asorti şablonunu silmek istediğinize emin misiniz?')) {
      await api.assortmentTemplates.remove(id);
    }
  };

  // Barcode Settings Save
  const handleSaveBarcodeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await erpService.updateBarcodeSettings(barcodeSettings);
      setIsSettingsModalOpen(false);
      alert('Barkod ayarları başarıyla güncellendi.');
    } catch (err) {
      console.error('Barcode settings error:', err);
    }
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
                setAdjustData({
                  type: 'in',
                  quantity: 1,
                  selectedColor: product.colors?.[0] || '',
                  selectedSize: product.variantBarcodes?.[0]?.size || '',
                  description: 'Stok hareketi'
                });
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
                setStatementDateRange({ start: '', end: '' });
                setStatementTypeFilter('all');
                setStatementSearch('');
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
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => { setIsAddModalOpen(false); resetForm(); }}
        title={isEditMode ? `Stok Kartını Düzenle: ${selectedProduct?.name}` : 'Yeni Stok Kartı Oluştur'}
        className="max-w-4xl"
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setIsAddModalOpen(false); resetForm(); }}
              className="px-5 py-2 rounded-xl font-bold text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800 transition-colors"
            >
              {isEditMode ? 'Kapat' : 'Vazgeç'}
            </button>
            {!isEditMode && (
              <button
                type="submit"
                form="stock-card-form"
                onClick={() => { submitIntentRef.current = 'saveNew'; }}
                title="Kartı kaydeder, formu temizleyip yeni kart için hazır bırakır"
                className="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-95"
              >
                Kaydet ve Yeni
              </button>
            )}
            <button
              type="submit"
              form="stock-card-form"
              onClick={() => { submitIntentRef.current = 'save'; }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-indigo-600/30 active:scale-95 transition-all"
            >
              {isEditMode
                ? (assortMode ? 'Asortiyi Kaydet' : 'Güncellemeyi Kaydet')
                : (assortMode ? 'Kartı Kaydet ve Matrise Geç' : 'Kartı Envantere Ekle')}
            </button>
          </div>
        }
      >
        <form id="stock-card-form" onSubmit={handleSubmitProduct} className="space-y-6">
          {/* Compact Category Strip (combobox) */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Stok Kategorisi</div>
                <div className="text-[9px] text-slate-400 font-medium">
                  {isEditMode ? 'Kategori kayıttan sonra değiştirilemez' : 'Birim ve muhasebe kodları otomatik uygulanır'}
                </div>
              </div>
            </div>
            <select
              value={categoryType}
              disabled={isEditMode}
              onChange={e => applyCategoryChange(e.target.value as StockCategoryType)}
              className={cn(
                "flex-1 sm:max-w-[320px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none",
                isEditMode && "opacity-60 cursor-not-allowed"
              )}
            >
              {(Object.keys(CATEGORY_CONFIGS) as StockCategoryType[]).map(catKey => (
                <option key={catKey} value={catKey}>
                  {CATEGORY_CONFIGS[catKey].title}
                </option>
              ))}
            </select>
          </div>

          {/* Step Tabs Navigation */}
          <div className="flex border-b border-slate-200 dark:border-slate-700/80 gap-6 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                activeTab === 'general' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              1. Genel Bilgiler
            </button>
            {hasSizeVariants && (
              <button
                type="button"
                onClick={() => setActiveTab('matrix')}
                className={cn(
                  "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                  activeTab === 'matrix' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
                )}
              >
                2. Varyant & Matris
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('images')}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                activeTab === 'images' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              {hasSizeVariants ? '3.' : '2.'} Görsel Galerisi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('barcodes')}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap",
                activeTab === 'barcodes' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              {hasSizeVariants ? '4.' : '3.'} Barkod Yönetimi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('accounting')}
              className={cn(
                "pb-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5",
                activeTab === 'accounting' ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400 hover:text-slate-600"
              )}
            >
              <BookOpen className="w-3.5 h-3.5" />
              {hasSizeVariants ? '5.' : '4.'} Muhasebe (TDHP)
            </button>
          </div>

          {/* Kayıt / Asorti durum şeridi */}
          {savedBanner && !assortMode && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-200 flex-1 min-w-[180px]">
                {savedBanner.mode === 'next' && (
                  <><span className="font-mono">{savedBanner.code}</span> kaydedildi. Yeni kart için formu doldurup kaydedebilirsiniz.</>
                )}
                {savedBanner.mode === 'created' && (
                  <><span className="font-mono">{savedBanner.code}</span> kaydedildi. Aynı ekrandan düzenlemeye devam edebilirsiniz.</>
                )}
                {savedBanner.mode === 'updated' && (
                  <><span className="font-mono">{savedBanner.code}</span> güncellendi.</>
                )}
                {savedBanner.mode === 'assortSaved' && (
                  <>Asorti kaydedildi: <span className="font-mono">{savedBanner.code}</span>{savedBanner.summary ? ` — ${savedBanner.summary}` : ''}.</>
                )}
              </div>
              {(savedBanner.mode === 'created' || savedBanner.mode === 'updated') && !hasSizeVariants && (categoryType === 'finished' || categoryType === 'semi_finished') && (
                <button
                  type="button"
                  onClick={handleStartAssortment}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[11px] uppercase tracking-wide shadow-sm active:scale-95 transition-all"
                >
                  <Grid className="w-3.5 h-3.5" />
                  Asorti Ekle
                </button>
              )}
            </div>
          )}

          {/* Asorti modu rehberi */}
          {assortMode && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800">
              <div className="flex items-center gap-2 text-[11px] font-bold text-indigo-800 dark:text-indigo-200">
                <Grid className="w-4 h-4 shrink-0" />
                <span>Asorti modu: en az 1 renk ve 1 numara şablonu girmelisiniz. "Asortiyi Kaydet" ile tamamlayın.</span>
              </div>
              <button
                type="button"
                onClick={handleCancelAssortment}
                className="px-3 py-1.5 rounded-xl font-bold text-[11px] text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100/60 transition-colors"
              >
                Asortiden Vazgeç
              </button>
            </div>
          )}

          {/* Asorti ekleme teklifi (mevcut kartı düzenlerken) */}
          {!savedBanner && !assortMode && isEditMode && !hasSizeVariants && (categoryType === 'finished' || categoryType === 'semi_finished') && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border bg-gradient-to-r from-indigo-50/80 to-slate-50 dark:from-indigo-950/40 dark:to-slate-900/40 border-indigo-100 dark:border-indigo-900">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Grid className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Beden / Numara Asortisi Ekleyin</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Stok ve satışı numara bazlı takip etmek isterseniz ekleyin. Suni deri gibi sadece renk gereken ürünlerde gerek yoktur; renkleri "Genel Bilgiler" sekmesindeki renk panelinden girebilirsiniz.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartAssortment}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-[11px] uppercase tracking-wide shadow-sm active:scale-95 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Asorti Ekle
              </button>
            </div>
          )}

          {/* TAB 1: GENERAL INFO */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Stok / Malzeme Kodu
                    </label>
                    <span className="text-[9px] text-indigo-500 font-bold">Boşsa otomatik üretilir</span>
                  </div>
                  <input
                    type="text"
                    value={productForm.code}
                    onChange={e => setProductForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    placeholder="Boş bırakılırsa otomatik kod atanır"
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold uppercase focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>

                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Stok Kartı / Malzeme Adı *
                  </label>
                  <input
                    type="text"
                    required
                    ref={nameInputRef}
                    value={productForm.name}
                    onChange={e => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Örn: Oxford Deri Klasik Ayakkabı, Termo Taban Siyah, Siyah Vidala Deri..."
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Marka / Model</label>
                  <input
                    type="text"
                    value={productForm.brand}
                    onChange={e => setProductForm(prev => ({ ...prev, brand: e.target.value }))}
                    placeholder="Örn: ProShoes, DeriSan..."
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ana Birim *</label>
                  <select
                    value={productForm.unit}
                    onChange={e => setProductForm(prev => ({ ...prev, unit: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  >
                    {(CATEGORY_CONFIGS[categoryType]?.defaultUnits || ['Çift', 'Adet', 'Kg', 'dm²', 'Metre']).map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Depo Raf / Adres</label>
                  <input
                    type="text"
                    value={productForm.shelf}
                    onChange={e => setProductForm(prev => ({ ...prev, shelf: e.target.value }))}
                    placeholder="Örn: A-12, Taban-04..."
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                </div>
              </div>

              {/* Alt Tür (tek noktadan yönetim) */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Malzeme / Ürün Alt Türü</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={subType}
                      onChange={e => setSubType(e.target.value)}
                      placeholder="Örn: Termo Taban, Vidala Deri, 8mm Eva, Spor..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 placeholder:text-slate-400 placeholder:font-normal focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none shadow-sm transition-all"
                      list="subtype-suggestions"
                    />
                    <datalist id="subtype-suggestions">
                      {Array.from(new Set([
                        ...(CATEGORY_CONFIGS[categoryType]?.subTypes || []),
                        ...(products ? products.map(p => p.subType).filter(Boolean) as string[] : [])
                      ])).map(st => (
                        <option key={`gen-st-${st}`} value={st} />
                      ))}
                    </datalist>
                  </div>
                  {subType && (
                    <button
                      type="button"
                      onClick={() => setSubType('')}
                      title="Temizle"
                      className="p-2.5 rounded-xl bg-slate-200/70 hover:bg-slate-300 text-slate-600 text-xs font-bold transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {(CATEGORY_CONFIGS[categoryType]?.subTypes || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(CATEGORY_CONFIGS[categoryType]?.subTypes || []).map(st => {
                      const isSelected = subType?.toLowerCase().trim() === st.toLowerCase().trim();
                      return (
                        <button
                          key={`btn-st-${st}`}
                          type="button"
                          onClick={() => setSubType(st)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border",
                            isSelected
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-sm font-black"
                              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 hover:text-slate-900 dark:text-slate-100"
                          )}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Pricing & Stock Numbers */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Alış Fiyatı (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.buyingPrice}
                    onChange={e => setProductForm(prev => ({ ...prev, buyingPrice: Number(e.target.value) }))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Satış Fiyatı (₺)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={productForm.sellingPrice}
                    onChange={e => setProductForm(prev => ({ ...prev, sellingPrice: Number(e.target.value) }))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-indigo-600 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    {hasSizeVariants ? 'Toplam Stok (Oto)' : 'Başlangıç Stoğu'}
                  </label>
                  <input
                    type="number"
                    disabled={hasSizeVariants && Object.keys(matrixData).length > 0}
                    value={productForm.stock}
                    onChange={e => setProductForm(prev => ({ ...prev, stock: Number(e.target.value) }))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-black outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Kritik Stok Uyarısı</label>
                  <input
                    type="number"
                    value={productForm.minStock}
                    onChange={e => setProductForm(prev => ({ ...prev, minStock: Number(e.target.value) }))}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              {/* TDHP Muhasebe Özeti & Hızlı Erişim */}
              <div className="p-3.5 bg-gradient-to-r from-indigo-50/80 to-slate-50 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-sm">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center flex-wrap gap-1.5">
                      <span>TDHP Stok Kodu:</span>
                      <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-indigo-200 text-indigo-700 font-black">
                        {productForm.accountingCode || 'Belirtilmedi'}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        | Satış: <span className="font-mono text-slate-700 dark:text-slate-200 font-bold">{productForm.salesAccountCode || '600.01'}</span>
                        | Alış: <span className="font-mono text-slate-700 dark:text-slate-200 font-bold">{productForm.purchaseAccountCode || '150.01'}</span>
                        | KDV: <span className="font-mono text-slate-700 dark:text-slate-200 font-bold">%{productForm.vatRate ?? 20}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      Fatura ve stok hareketlerinde bu hesap kodlarına otomatik yevmiye kaydı işlenir.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('accounting')}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all whitespace-nowrap shadow-sm active:scale-95"
                >
                  Hesap Planı Detayları &rarr;
                </button>
              </div>

              {/* Öncelikli Tedarikçi Firma (MRP Malzeme İhtiyaç Otomasyonu) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-600 flex items-center justify-center font-black">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span>Öncelikli Tedarikçi Firma (MRP Satın Alma)</span>
                      {categoryType === 'raw_material' && (
                        <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.2 rounded font-black uppercase">
                          Hammadde Önerisi
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      MRP üretim planında hammadde eksik çıktığında doğrudan atanacak varsayılan satın alma firması.
                    </p>
                  </div>
                </div>
                <select
                  value={productForm.preferredSupplierId || ''}
                  onChange={e => setProductForm(prev => ({ ...prev, preferredSupplierId: Number(e.target.value) || undefined }))}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-slate-100 min-w-[220px] focus:outline-none"
                >
                  <option value="">-- Öncelikli Tedarikçi Yok --</option>
                  {contacts?.filter(c => c.type === 'supplier' || c.type === 'both').map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Color Options for ALL Categories (collapsible) */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowColorPanel(p => !p)}
                  className="w-full p-4 flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Palette className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Renk Seçenekleri & Varyantlar
                    </span>
                    <span className={cn(
                      "text-[10px] font-black px-2.5 py-0.5 rounded-full border shrink-0",
                      colors.length > 0
                        ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700"
                    )}>
                      {colors.length > 0 ? `${colors.length} Renk` : 'Opsiyonel'}
                    </span>
                    {colors.length > 0 && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold truncate hidden sm:inline">
                        {colors.join(', ')}
                      </span>
                    )}
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform shrink-0", showColorPanel && "rotate-180")} />
                </button>

                {showColorPanel && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                      {categoryType === 'raw_material' ? 'Deri, Suni Deri, Kumaş, Astar renkleri' :
                       categoryType === 'accessory' ? 'Bağcık, Toka, İplik, Fermuar renkleri' :
                       categoryType === 'semi_finished' ? 'Mostra, Fuspet, Taban renk varyantları' : 'Ayakkabı renk varyantları'}
                    </div>

                    {/* Color Input and Popular Color Badges */}
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Renk adı yazıp Enter'a veya Ekle'ye basınız (Örn: SİYAH, BEYAZ, GRİ, TABA, FÜME)..."
                          value={newColor}
                          onChange={e => setNewColor(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } }}
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold uppercase focus:bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                        />
                        <button
                          type="button"
                          onClick={addColor}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all"
                        >
                          Ekle
                        </button>
                      </div>

                      {/* Quick Color Suggestions */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Hızlı Seçim:</span>
                        {['SİYAH', 'BEYAZ', 'GRİ', 'TABA', 'KAHVE', 'LACİVERT', 'BEJ', 'BORDO', 'HAKİ', 'KIRMIZI', 'HARDAL', 'NUBUK', 'ŞEFFAF'].map(quickCol => {
                          const isAdded = colors.includes(quickCol);
                          return (
                            <button
                              key={quickCol}
                              type="button"
                              onClick={() => {
                                if (isAdded) {
                                  removeColor(quickCol);
                                } else {
                                  setColors([...colors, quickCol]);
                                }
                              }}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-1",
                                isAdded
                                  ? "bg-indigo-600 text-white shadow-sm"
                                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                              )}
                            >
                              {quickCol}
                              {isAdded && <X className="w-2.5 h-2.5 ml-0.5 opacity-80" />}
                            </button>
                          );
                        })}
                      </div>

                      {/* Active Selected Colors Chips */}
                      {colors.length > 0 ? (
                        <div className="pt-2 flex flex-wrap gap-2">
                          {colors.map(col => (
                            <span
                              key={col}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-900 border-2 border-indigo-100 rounded-xl text-xs font-black uppercase text-indigo-950 shadow-sm"
                            >
                              <span className="w-2 h-2 rounded-full bg-indigo-600" />
                              {col}
                              <button
                                type="button"
                                onClick={() => removeColor(col)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-0.5 rounded-md hover:bg-rose-50"
                                title={`${col} rengini kaldır`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 font-medium">
                          ⚠️ Henüz bir renk eklenmedi. Örnek: Deniz suni deri için yukarıdan <b>SİYAH</b>, <b>BEYAZ</b> ve <b>GRİ</b> renklerini seçebilir veya özel renk yazabilirsiniz.
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-400 font-medium">
                      💡 Bu renkler üretim reçetelerinde (BoM), siparişlerde ve stok hareketlerinde otomatik filtrelenir ve malzeme eşleştirmelerinde kullanılır.
                    </div>
                  </div>
                )}
              </div>

              {/* Next Step */}
              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab(hasSizeVariants ? 'matrix' : 'images')}
                  className="flex items-center justify-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-600 transition-all shadow-md"
                >
                  <span>Sonraki Adım</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: VARIANT & MATRIX */}
          {activeTab === 'matrix' && hasSizeVariants && (
            <div className="space-y-6">
              {/* Color & Template selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                {/* Colors */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    1. Renk Varyantları
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Örn: Siyah, Kahve, Taba, Beyaz..."
                      value={newColor}
                      onChange={e => setNewColor(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } }}
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold uppercase outline-none"
                    />
                    <button
                      type="button"
                      onClick={addColor}
                      className="bg-slate-900 hover:bg-indigo-600 text-white px-4 rounded-xl font-bold text-xs"
                    >
                      Ekle
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {colors.map(col => (
                      <span key={col} className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-black uppercase text-slate-700 dark:text-slate-200 shadow-sm">
                        {col}
                        <button type="button" onClick={() => removeColor(col)} className="text-slate-400 hover:text-rose-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Assortment Template */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                    2. Asorti / Numara Şablonu
                  </label>
                  <select
                    value={selectedTemplateId || ''}
                    onChange={e => setSelectedTemplateId(Number(e.target.value) || undefined)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                  >
                    <option value="">Şablon Seçiniz</option>
                    {templates?.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>

                  {/* Auto Distribute helper */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const total = prompt('Dağıtılacak toplam stok miktarını giriniz (Örn: 120):', '120');
                        if (total && !isNaN(Number(total))) {
                          handleAutoDistributeStock(Number(total));
                        }
                      }}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Şablon Oranlarına Göre Otomatik Dağıt
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Matrix Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Grid className="w-4 h-4 text-indigo-600" /> Canlı Stok Matrisi
                  </h4>
                  <div className="text-[10px] text-slate-400 font-bold">
                    Her numara için başlangıç veya güncel stok adetlerini giriniz
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-2xl bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                        <th className="p-3 text-left font-black text-slate-600 uppercase w-32">Renk / Numara</th>
                        {templates?.find(t => t.id === (selectedTemplateId || selectedProduct?.assortmentTemplateId))?.items.map((it, idx) => (
                          <th key={idx} className="p-3 text-center border-l border-slate-200 dark:border-slate-700 font-black text-slate-800 dark:text-slate-200">
                            {it.size}
                            <div className="text-[9px] text-slate-400 font-semibold">Oran: {it.quantity}</div>
                          </th>
                        )) || (
                          <th className="p-6 text-center text-slate-400 font-semibold italic">
                            Lütfen yukarıdan bir Asorti Şablonu seçiniz
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {colors.length === 0 ? (
                        <tr>
                          <td colSpan={20} className="p-8 text-center text-slate-400 font-semibold italic">
                            Lütfen önce en az 1 renk ekleyiniz
                          </td>
                        </tr>
                      ) : (
                        colors.map(col => (
                          <tr key={col} className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:bg-slate-800/50/50">
                            <td className="p-3 font-black text-slate-900 dark:text-slate-100 uppercase">{col}</td>
                            {templates?.find(t => t.id === (selectedTemplateId || selectedProduct?.assortmentTemplateId))?.items.map((it, sIdx) => (
                              <td key={sIdx} className="p-1.5 border-l border-slate-100 dark:border-slate-800">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={matrixData[col]?.[it.size] || ''}
                                  onChange={e => {
                                    const val = Number(e.target.value) || 0;
                                    setMatrixData(prev => ({
                                      ...prev,
                                      [col]: {
                                        ...(prev[col] || {}),
                                        [it.size]: val
                                      }
                                    }));
                                  }}
                                  className="w-full text-center py-2 border border-slate-200 dark:border-slate-700 rounded-lg font-black text-slate-800 dark:text-slate-200 focus:bg-indigo-50/50 focus:border-indigo-300 outline-none"
                                />
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                >
                  Geri Dön
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-600 transition-all shadow-md"
                >
                  <span>Görsel Adımı</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: IMAGES */}
          {activeTab === 'images' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Catalog Image */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Ana Katalog Fotoğrafı
                  </label>
                  <div className="aspect-square bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden relative flex items-center justify-center group hover:border-indigo-400 transition-colors">
                    {mainImage ? (
                      <>
                        <img src={mainImage} alt="Main" className="w-full h-full object-contain" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <label className="cursor-pointer bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-1.5 rounded-lg text-xs font-bold">
                            Değiştir
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                          </label>
                          <button
                            type="button"
                            onClick={() => setMainImage(undefined)}
                            className="bg-rose-600 text-white p-1.5 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center justify-center p-6 text-center">
                        <Camera className="w-8 h-8 text-slate-300 mb-2 group-hover:text-indigo-500 transition-colors" />
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Fotoğraf Yükle</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                    )}
                  </div>
                </div>

                {/* Color-based images */}
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Renk Varyantı Fotoğrafları
                  </label>
                  {colors.length === 0 ? (
                    <div className="p-8 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-center text-slate-400 text-xs font-semibold">
                      Varyant sekmesinden renk tanımladığınızda renk bazlı fotoğraflar buraya eklenebilir.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {colors.map(col => {
                        const colImg = colorImages.find(ci => ci.color === col)?.image;
                        return (
                          <div key={col} className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">
                              <span>{col}</span>
                              {colImg && (
                                <button
                                  type="button"
                                  onClick={() => setColorImages(prev => prev.filter(ci => ci.color !== col))}
                                  className="text-rose-500 hover:text-rose-700"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <label className="cursor-pointer block aspect-square bg-white dark:bg-slate-900 border border-dashed border-slate-300 rounded-lg overflow-hidden flex items-center justify-center hover:border-indigo-400 transition-colors">
                              {colImg ? (
                                <img src={colImg} alt={col} className="w-full h-full object-contain" />
                              ) : (
                                <Camera className="w-5 h-5 text-slate-300" />
                              )}
                              <input type="file" accept="image/*" onChange={e => handleColorImageUpload(col, e)} className="hidden" />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab(hasSizeVariants ? 'matrix' : 'general')}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                >
                  Geri Dön
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('barcodes')}
                  className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-indigo-600 transition-all shadow-md"
                >
                  <span>Barkod Yönetimine Geç</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: BARCODES */}
          {activeTab === 'barcodes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setBarcodeSubTab('box')}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                      barcodeSubTab === 'box' ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    Koli / Kutu Barkodları
                  </button>
                  {hasSizeVariants && (
                    <button
                      type="button"
                      onClick={() => setBarcodeSubTab('variants')}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                        barcodeSubTab === 'variants' ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      Beden & Varyant Barkodları
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleGenerateBarcodes}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Otomatik Barkod Üret</span>
                </button>
              </div>

              {/* Barcodes Content */}
              {barcodeSubTab === 'box' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {colorBoxBarcodes.map((b, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                        <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-200 uppercase">
                          <span>{b.color} Koli Barkodu</span>
                          <button
                            type="button"
                            onClick={() => setColorBoxBarcodes(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={b.barcode}
                          onChange={e => {
                            const updated = [...colorBoxBarcodes];
                            updated[idx].barcode = e.target.value;
                            setColorBoxBarcodes(updated);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono text-xs font-bold outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setColorBoxBarcodes(prev => [...prev, { color: colors[0] || 'Genel', barcode: `869${Date.now().toString().slice(-9)}` }])}
                    className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Elle Koli Barkodu Ekle
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-1">
                    {variantBarcodes.map((v, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-black text-slate-700 dark:text-slate-200 uppercase">
                          <span>{v.color} / No: {v.size}</span>
                          <button
                            type="button"
                            onClick={() => setVariantBarcodes(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={v.barcode}
                          onChange={e => {
                            const updated = [...variantBarcodes];
                            updated[idx].barcode = e.target.value;
                            setVariantBarcodes(updated);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 font-mono text-xs font-bold outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setVariantBarcodes(prev => [...prev, { color: colors[0] || 'Genel', size: 'Standart', barcode: `869${Date.now().toString().slice(-9)}`, stock: 0 }])}
                    className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Elle Varyant Barkodu Ekle
                  </button>
                </div>
              )}

              {/* Back Navigation */}
              <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('images')}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                >
                  Geri Dön
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: ACCOUNTING (TDHP) */}
          {activeTab === 'accounting' && (
            <div className="space-y-5">
              {/* Presets / Information Bar */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-black text-indigo-900 uppercase tracking-wider">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    Tek Düzen Hesap Planı (TDHP) Entegrasyonu
                  </div>
                  <span className="text-[11px] font-bold text-indigo-600 bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    Otomatik Yevmiye Eşlemesi
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bu stok kartı kaydedildiğinde, tanımlanan tüm TDHP hesapları (Stok, Satış Geliri ve Alış/Maliyet) Muhasebe Modülünde <strong>otomatik olarak açılır</strong>. Faturalara veya irsaliyelere eklendiğinde ise sistem bu hesap kodlarını doğrudan yevmiye maddelerine aktarır.
                </p>

                {/* Quick Presets */}
                <div className="pt-1">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                    Hızlı Şablon Uygula:
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setProductForm(prev => ({
                        ...prev,
                        accountingCode: '157.01',
                        salesAccountCode: '600.01',
                        purchaseAccountCode: '620.01',
                        vatRate: 20
                      }))}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white border border-indigo-200/70 rounded-xl text-left transition-all group shadow-sm"
                    >
                      <div className="text-[11px] font-black group-hover:text-white text-indigo-900">Mamul (Ayakkabı)</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-100 font-mono">157 / 600 / 620</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProductForm(prev => ({
                        ...prev,
                        accountingCode: '150.01',
                        salesAccountCode: '600.20',
                        purchaseAccountCode: '150.01',
                        vatRate: 20
                      }))}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white border border-indigo-200/70 rounded-xl text-left transition-all group shadow-sm"
                    >
                      <div className="text-[11px] font-black group-hover:text-white text-indigo-900">İlk Madde (Deri/Kumaş)</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-100 font-mono">150.01 / 600 / 150</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProductForm(prev => ({
                        ...prev,
                        accountingCode: '152.01',
                        salesAccountCode: '600.01',
                        purchaseAccountCode: '710.01',
                        vatRate: 20
                      }))}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white border border-indigo-200/70 rounded-xl text-left transition-all group shadow-sm"
                    >
                      <div className="text-[11px] font-black group-hover:text-white text-indigo-900">Yarı Mamul (Taban/Mostra)</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-100 font-mono">152.01 / 600 / 710</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setProductForm(prev => ({
                        ...prev,
                        accountingCode: '153.01',
                        salesAccountCode: '600.20',
                        purchaseAccountCode: '153.01',
                        vatRate: 20
                      }))}
                      className="p-2 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white border border-indigo-200/70 rounded-xl text-left transition-all group shadow-sm"
                    >
                      <div className="text-[11px] font-black group-hover:text-white text-indigo-900">Ticari Mal / Aksesuar</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 group-hover:text-indigo-100 font-mono">153.01 / 600 / 153</div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Form inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Stok Hesabı */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      1. Stok Bilanço Hesabı (Aktif)
                    </label>
                    <span className="text-[10px] font-bold text-indigo-600">150, 152, 153, 157 Grubu</span>
                  </div>
                  <input
                    type="text"
                    value={productForm.accountingCode}
                    onChange={e => setProductForm(prev => ({ ...prev, accountingCode: e.target.value }))}
                    list="tdhp-stock-accounts"
                    placeholder="Örn: 157.01, 150.01..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                  <div className="text-[11px] mt-1">
                    {productForm.accountingCode?.trim() && (
                      tdhpAccounts?.some(a => a.code.toLowerCase() === productForm.accountingCode.trim().toLowerCase()) ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Tanımlı TDHP Hesabı: {tdhpAccounts?.find(a => a.code.toLowerCase() === productForm.accountingCode.trim().toLowerCase())?.name}
                        </span>
                      ) : (
                        <span className="text-indigo-700 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          Otomatik Açılacak: Kaydedildiğinde Tek Düzen Hesap Planına eklenecektir.
                        </span>
                      )
                    )}
                    {!productForm.accountingCode?.trim() && (
                      <span className="text-slate-500 dark:text-slate-400">Envanter giriş/çıkışlarında borç/alacak çalışan aktif stok hesabı.</span>
                    )}
                  </div>
                </div>

                {/* 2. Satış Gelir Hesabı */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      2. Yurtiçi Satış Gelir Hesabı
                    </label>
                    <span className="text-[10px] font-bold text-indigo-600">600 Grubu</span>
                  </div>
                  <input
                    type="text"
                    value={productForm.salesAccountCode}
                    onChange={e => setProductForm(prev => ({ ...prev, salesAccountCode: e.target.value }))}
                    list="tdhp-sales-accounts"
                    placeholder="Örn: 600.01 (Mamul Satışları)..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                  <div className="text-[11px] mt-1">
                    {productForm.salesAccountCode?.trim() && (
                      tdhpAccounts?.some(a => a.code.toLowerCase() === productForm.salesAccountCode.trim().toLowerCase()) ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Tanımlı Gelir Hesabı: {tdhpAccounts?.find(a => a.code.toLowerCase() === productForm.salesAccountCode.trim().toLowerCase())?.name}
                        </span>
                      ) : (
                        <span className="text-indigo-700 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          Otomatik Açılacak: Kaydedildiğinde 600 grubu altına eklenecektir.
                        </span>
                      )
                    )}
                    {!productForm.salesAccountCode?.trim() && (
                      <span className="text-slate-500 dark:text-slate-400">Satış faturasında alacak kaydı açılacak gelir hesabı.</span>
                    )}
                  </div>
                </div>

                {/* 3. Alış / Maliyet Hesabı */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      3. Alış / Maliyet Hesabı
                    </label>
                    <span className="text-[10px] font-bold text-indigo-600">150, 620, 710 Grubu</span>
                  </div>
                  <input
                    type="text"
                    value={productForm.purchaseAccountCode}
                    onChange={e => setProductForm(prev => ({ ...prev, purchaseAccountCode: e.target.value }))}
                    list="tdhp-purchase-accounts"
                    placeholder="Örn: 620.01 (Mamul Maliyeti) veya 150.01..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                  />
                  <div className="text-[11px] mt-1">
                    {productForm.purchaseAccountCode?.trim() && (
                      tdhpAccounts?.some(a => a.code.toLowerCase() === productForm.purchaseAccountCode.trim().toLowerCase()) ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Tanımlı Hesap: {tdhpAccounts?.find(a => a.code.toLowerCase() === productForm.purchaseAccountCode.trim().toLowerCase())?.name}
                        </span>
                      ) : (
                        <span className="text-indigo-700 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-indigo-600" />
                          Otomatik Açılacak: Kaydedildiğinde TDHP planına eklenecektir.
                        </span>
                      )
                    )}
                    {!productForm.purchaseAccountCode?.trim() && (
                      <span className="text-slate-500 dark:text-slate-400">Alış faturasında veya satılan mamul maliyeti mahsubunda kullanılır.</span>
                    )}
                  </div>
                </div>

                {/* 4. KDV Oranı (%) */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      4. Varsayılan KDV Oranı (%)
                    </label>
                    <span className="text-[10px] font-bold text-indigo-600">391 / 191 Hesapları</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={productForm.vatRate}
                      onChange={e => setProductForm(prev => ({ ...prev, vatRate: Number(e.target.value) }))}
                      className="w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 outline-none"
                    />
                    <div className="flex gap-1.5 flex-1">
                      {[0, 1, 10, 20].map(rate => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setProductForm(prev => ({ ...prev, vatRate: rate }))}
                          className={cn(
                            "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                            productForm.vatRate === rate
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800"
                          )}
                        >
                          %{rate}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Fatura hesaplamalarında 391 Hesaplanan KDV veya 191 İndirilecek KDV için uygulanır.
                  </p>
                </div>
              </div>

              {/* Datalists for Accounts Auto-suggest */}
              <datalist id="tdhp-stock-accounts">
                {tdhpAccounts
                  ?.filter(a => a.code.startsWith('15'))
                  .reduce((acc, a) => acc.some(x => x.code === a.code) ? acc : [...acc, a], [] as typeof tdhpAccounts)
                  .map(a => (
                    <option key={`stk-${a.id || a.code}`} value={a.code}>{a.name}</option>
                  ))}
              </datalist>
              <datalist id="tdhp-sales-accounts">
                {tdhpAccounts
                  ?.filter(a => a.code.startsWith('60'))
                  .reduce((acc, a) => acc.some(x => x.code === a.code) ? acc : [...acc, a], [] as typeof tdhpAccounts)
                  .map(a => (
                    <option key={`sls-${a.id || a.code}`} value={a.code}>{a.name}</option>
                  ))}
              </datalist>
              <datalist id="tdhp-purchase-accounts">
                {tdhpAccounts
                  ?.filter(a => a.code.startsWith('15') || a.code.startsWith('62') || a.code.startsWith('71'))
                  .reduce((acc, a) => acc.some(x => x.code === a.code) ? acc : [...acc, a], [] as typeof tdhpAccounts)
                  .map(a => (
                    <option key={`prc-${a.id || a.code}`} value={a.code}>{a.name}</option>
                  ))}
              </datalist>

              {/* Back Navigation */}
              <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 dark:bg-slate-800"
                >
                  Genel Bilgilere Dön
                </button>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* PRODUCT DETAIL MODAL                                                     */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title="Stok Kartı Detayı & Analizi"
        className="max-w-3xl"
      >
        {selectedProduct && (() => {
          const cat = getProductCategoryType(selectedProduct);
          const cfg = CATEGORY_CONFIGS[cat];
          const isLow = selectedProduct.stock <= (selectedProduct.minStock || 0);
          const vbs: BarcodeVariant[] = selectedProduct.variantBarcodes || [];
          const hasMatrix = (selectedProduct.hasSizeVariants || selectedProduct.isFootwear) && vbs.length > 0;
          const activeTab = detailTab === 'stock' && !hasMatrix ? 'general' : detailTab;
          const matrixSizes = Array.from(new Set(vbs.map(v => v.size)))
            .sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b, 'tr'));
          const variantColors = Array.from(new Set(vbs.map(v => v.color)));
          const definedColors = selectedProduct.colors || [];
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
                    {selectedProduct.image ? (
                      <img src={selectedProduct.image} alt={selectedProduct.name} className="w-full h-full object-contain" />
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
                        {selectedProduct.code}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{selectedProduct.name}</h3>
                    <div className="text-xs font-bold text-slate-400 uppercase">
                      {selectedProduct.brand} {selectedProduct.subType && `• ${selectedProduct.subType}`}
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Mevcut Stok</div>
                  <div className={cn("text-3xl font-black font-mono", isLow ? "text-rose-600" : "text-indigo-600")}>
                    {formatQuantity(selectedProduct.stock)} <span className="text-xs uppercase">{selectedProduct.unit}</span>
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
                    ₺{(selectedProduct.buyingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Satış Fiyatı</div>
                  <div className="text-sm font-black font-mono text-indigo-600 mt-0.5">
                    ₺{(selectedProduct.sellingPrice || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Depo Raf</div>
                  <div className="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedProduct.shelf || 'Tanımlanmadı'}
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Kritik Limit</div>
                  <div className="text-sm font-black font-mono text-rose-600 mt-0.5">
                    {selectedProduct.minStock || 0} {selectedProduct.unit}
                  </div>
                </div>
              </div>

              {/* Defined Color Options */}
              {selectedProduct.colors && selectedProduct.colors.length > 0 && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <Palette className="w-4 h-4 text-indigo-600" /> Tanımlı Renk Seçenekleri
                    </h4>
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                      {selectedProduct.colors.length} Renk
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedProduct.colors.map(c => {
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
                    KDV: %{selectedProduct.vatRate ?? 20}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 shadow-sm">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Stok Hesabı (Aktif)</div>
                    <div className="font-mono font-black text-xs text-indigo-700 mt-1">
                      {selectedProduct.accountingCode || '157.01 (Varsayılan)'}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {tdhpAccounts?.find(a => a.code === selectedProduct.accountingCode)?.name || 'Mamuller / Stok Hesabı'}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 shadow-sm">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Satış Gelir Hesabı</div>
                    <div className="font-mono font-black text-xs text-slate-800 dark:text-slate-200 mt-1">
                      {selectedProduct.salesAccountCode || '600.01 (Varsayılan)'}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {tdhpAccounts?.find(a => a.code === selectedProduct.salesAccountCode)?.name || 'Yurtiçi Satışlar'}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 shadow-sm">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Alış / Maliyet Hesabı</div>
                    <div className="font-mono font-black text-xs text-slate-800 dark:text-slate-200 mt-1">
                      {selectedProduct.purchaseAccountCode || '620.01 (Varsayılan)'}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {tdhpAccounts?.find(a => a.code === selectedProduct.purchaseAccountCode)?.name || 'Satılan Malzeme/Mamul'}
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
                {deleteConfirmId === selectedProduct.id ? (
                  <div className="flex items-center gap-2 bg-rose-50 p-2 rounded-xl border border-rose-200">
                    <span className="text-xs font-black text-rose-700 px-2">Silmek istiyor musunuz?</span>
                    <button
                      onClick={() => handleDeleteProduct(selectedProduct.id!)}
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
                    onClick={() => setDeleteConfirmId(selectedProduct.id!)}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition-colors border border-rose-200"
                  >
                    <Trash2 className="w-4 h-4" /> Kartı Sil
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      setStatementDateRange({ start: '', end: '' });
                      setStatementTypeFilter('all');
                      setStatementSearch('');
                      setIsStatementModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-purple-600" /> Stok Ekstresi / Hareketler
                  </button>

                  <button
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      if (selectedProduct?.id) navigate(`/inventory/barcode?product=${selectedProduct.id}`);
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
                  >
                    <Barcode className="w-4 h-4" /> Barkod Yazdır
                  </button>

                  <button
                    onClick={() => {
                      setIsDetailModalOpen(false);
                      handleOpenEditModal(selectedProduct);
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

      {/* ========================================================================= */}
      {/* ADJUST STOCK MODAL                                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Hızlı Stok Hareketi"
        className="max-w-md"
      >
        {selectedProduct && (
          <form onSubmit={handleAdjustStockSubmit} className="space-y-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
              <div className="text-[10px] font-bold text-slate-400 uppercase">Seçili Kart</div>
              <div className="text-xs font-black text-slate-900 dark:text-slate-100">{selectedProduct.name} ({selectedProduct.code})</div>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Güncel Stok: <span className="font-mono font-black text-indigo-600">{formatQuantity(selectedProduct.stock)} {selectedProduct.unit}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">İşlem Türü</label>
                <select
                  value={adjustData.type}
                  onChange={e => setAdjustData(prev => ({ ...prev, type: e.target.value as 'in' | 'out' }))}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                >
                  <option value="in">Stok Girişi (+)</option>
                  <option value="out">Stok Çıkışı (-)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Miktar ({selectedProduct.unit})</label>
                <input
                  type="number"
                  required
                  step="any"
                  min="0.01"
                  value={adjustData.quantity}
                  onChange={e => setAdjustData(prev => ({ ...prev, quantity: Number(e.target.value) }))}
                  className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-black outline-none"
                />
              </div>
            </div>

            {/* If product has colors */}
            {selectedProduct.colors && selectedProduct.colors.length > 0 && (
              <div className={cn("grid gap-3", (selectedProduct.hasSizeVariants || selectedProduct.isFootwear) ? "grid-cols-2" : "grid-cols-1")}>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">İşlem Yapılacak Renk</label>
                  <select
                    value={adjustData.selectedColor}
                    onChange={e => setAdjustData(prev => ({ ...prev, selectedColor: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                  >
                    <option value="">Genel / Tümü</option>
                    {selectedProduct.colors.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {(selectedProduct.hasSizeVariants || selectedProduct.isFootwear) && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Numara / Beden</label>
                    <select
                      value={adjustData.selectedSize}
                      onChange={e => setAdjustData(prev => ({ ...prev, selectedSize: e.target.value }))}
                      className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                    >
                      <option value="">Tüm Bedenler</option>
                      {selectedProduct.variantBarcodes?.map((v, i) => (
                        <option key={i} value={v.size}>{v.size}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hareket Açıklaması</label>
              <input
                type="text"
                required
                value={adjustData.description}
                onChange={e => setAdjustData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Örn: İmalat girişi, Fire çıkışı, Sayım düzeltmesi..."
                className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-slate-900 hover:bg-indigo-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider transition-colors shadow-md"
            >
              Hareketi Onayla ve Kaydet
            </button>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* ASSORTMENT TEMPLATES MANAGER MODAL                                       */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        title="Asorti & Numara Şablonları"
        className="max-w-2xl"
      >
        <div className="space-y-6">
          {/* Create new template */}
          <form onSubmit={handleSaveTemplate} className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">Yeni Şablon Ekle</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase">Şablon Adı</label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Erkek 40-45 (12'li), Taban 36-45..."
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold outline-none"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold text-xs"
                >
                  Şablonu Kaydet
                </button>
              </div>
            </div>
          </form>

          {/* Existing Templates list */}
          <div className="space-y-3">
            <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-tight">Mevcut Şablonlar</h4>
            <div className="space-y-2">
              {templates?.map(t => (
                <div key={t.id} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-xs font-black text-slate-900 dark:text-slate-100">{t.name}</div>
                    <div className="flex flex-wrap gap-1">
                      {t.items.map((it, idx) => (
                        <span key={idx} className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-600">
                          {it.size} ({it.quantity})
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteTemplate(t.id!)}
                    className="p-2 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* BARCODE CONFIGURATION MODAL                                              */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title="Barkod Formatı ve Sıra Numarası"
        className="max-w-md"
      >
        <form onSubmit={handleSaveBarcodeSettings} className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barkod Standardı</label>
            <select
              value={barcodeSettings.barcodeType}
              onChange={e => setBarcodeSettings(prev => ({ ...prev, barcodeType: e.target.value as any }))}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none"
            >
              <option value="CODE-128">CODE-128 (Esnek Alfamerik & Kompakt)</option>
              <option value="EAN-13">EAN-13 (Uluslararası Perakende Standart)</option>
              <option value="CODE-39">CODE-39 (Endüstriyel)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Barkod Ön Eki (Prefix)</label>
            <input
              type="text"
              value={barcodeSettings.barcodePrefix}
              onChange={e => setBarcodeSettings(prev => ({ ...prev, barcodePrefix: e.target.value }))}
              placeholder="Örn: 869"
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sıradaki Sayaç (Sequence)</label>
            <input
              type="number"
              value={barcodeSettings.nextBarcodeSequence}
              onChange={e => setBarcodeSettings(prev => ({ ...prev, nextBarcodeSequence: Number(e.target.value) }))}
              className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md"
          >
            Ayarları Kaydet
          </button>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* STOK KART EKSTRESİ & HAREKET RAPORU MODAL                               */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isStatementModalOpen}
        onClose={() => setIsStatementModalOpen(false)}
        title={`Stok Kart Ekstresi: ${selectedProduct?.name || ''}`}
        size="2xl"
      >
        {selectedProduct && (
          <div className="space-y-5">
            {/* Stock Summary Header Card */}
            <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900/10 flex items-center justify-center shrink-0 border border-white/10">
                    <FileText className="w-5 h-5 text-purple-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white dark:bg-slate-900/15 text-purple-200">
                        {selectedProduct.code}
                      </span>
                      {selectedProduct.brand && (
                        <span className="text-[10px] text-slate-300 uppercase font-bold tracking-wider">
                          {selectedProduct.brand}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-black text-white">{selectedProduct.name}</h3>
                  </div>
                </div>

                {/* Print & Export Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrintStatement}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900/10 hover:bg-white dark:bg-slate-900/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/15"
                  >
                    <Printer className="w-3.5 h-3.5 text-purple-300" />
                    <span>Ekstre Yazdır</span>
                  </button>
                  <button
                    onClick={handleExportStatementCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Excel'e Aktar</span>
                  </button>
                </div>
              </div>

              {/* KPI Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="bg-white dark:bg-slate-900/5 p-2.5 rounded-xl border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mevcut Stok</div>
                  <div className="text-base font-black font-mono text-emerald-400 mt-0.5">
                    {formatQuantity(selectedProduct.stock)} <span className="text-xs uppercase">{selectedProduct.unit}</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/5 p-2.5 rounded-xl border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Toplam Giriş (+)</div>
                  <div className="text-base font-black font-mono text-indigo-300 mt-0.5">
                    +{formatQuantity(statementStats.totalIn)} <span className="text-xs uppercase">{selectedProduct.unit}</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/5 p-2.5 rounded-xl border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Toplam Çıkış (-)</div>
                  <div className="text-base font-black font-mono text-rose-300 mt-0.5">
                    -{formatQuantity(statementStats.totalOut)} <span className="text-xs uppercase">{selectedProduct.unit}</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900/5 p-2.5 rounded-xl border border-white/10">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">İşlem Adedi</div>
                  <div className="text-base font-black font-mono text-amber-300 mt-0.5">
                    {statementStats.totalCount} <span className="text-xs">Hareket</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80 rounded-2xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={statementSearch}
                    onChange={e => setStatementSearch(e.target.value)}
                    placeholder="Açıklama, renk veya beden ile filtrele..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                  {statementSearch && (
                    <button onClick={() => setStatementSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
                  <input
                    type="date"
                    value={statementDateRange.start}
                    onChange={e => setStatementDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="text-xs font-bold text-slate-700 dark:text-slate-200 outline-none bg-transparent"
                  />
                  <span className="text-slate-300 font-black">-</span>
                  <input
                    type="date"
                    value={statementDateRange.end}
                    onChange={e => setStatementDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="text-xs font-bold text-slate-700 dark:text-slate-200 outline-none bg-transparent pr-1"
                  />
                </div>

                {(statementDateRange.start || statementDateRange.end || statementSearch || statementTypeFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setStatementDateRange({ start: '', end: '' });
                      setStatementTypeFilter('all');
                      setStatementSearch('');
                    }}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                    title="Filtreleri Temizle"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Sıfırla</span>
                  </button>
                )}
              </div>

              {/* Movement Type Filter Tabs */}
              <div className="flex flex-wrap gap-1 border-t border-slate-200 dark:border-slate-700/60 pt-2">
                {[
                  { id: 'all', label: 'Tüm Hareketler' },
                  { id: 'in', label: 'Stok Girişi (+)' },
                  { id: 'out', label: 'Stok Çıkışı (-)' },
                  { id: 'production_in', label: 'Üretim Girişi (+)' },
                  { id: 'production_out', label: 'Hammadde Sarf (-)' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setStatementTypeFilter(tab.id as any)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      statementTypeFilter === tab.id
                        ? "bg-purple-600 text-white shadow-xs"
                        : "bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 dark:border-slate-800/80"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Movement Ledger Table */}
            <DataGrid<(typeof productLogs)[number]>
              columns={statementColumns}
              data={productLogs}
              rowKey={(log) => log.id ?? `${log.date}-${log.quantity}-${log.runningBalance}`}
              maxHeight="380px"
              emptyMessage="Seçilen kriterlere uygun stok kartı hareketi kaydedilmedi."
            />
          </div>
        )}
      </Modal>

      {/* Kamera ile Canlı Barkod/Karekod Okuyucu Modalı */}
      <CameraBarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        initialMode={cameraScannerMode}
      />
    </div>
  );
}
