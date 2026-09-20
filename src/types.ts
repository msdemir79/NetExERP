export type EntityType = 'customer' | 'supplier' | 'both';
export type TransactionType = 'income' | 'expense';
export type InventoryMoveType = 'in' | 'out' | 'production_in' | 'production_out';

export interface Contact {
  id?: number;
  code?: string;                 // Cari Kodu (örn: CAR-001, MUS-0001, TED-0002)
  name: string;                  // Firma Ünvanı / Cari Adı
  companyTitle?: string;         // Resmi Ticari Ünvan
  contactPerson?: string;        // Yetkili Kişi
  type: EntityType;              // 'customer' | 'supplier' | 'both'
  category?: string;             // Toptancı, Perakende, Fason Saya, Taban Tedarikçisi, Aksesuar vs.
  email?: string;
  phone?: string;                // Sabit Telefon
  mobile?: string;               // GSM / Cep
  website?: string;
  address?: string;              // Fatura Adresi
  shippingAddress?: string;      // Sevkiyat / Depo Teslim Adresi
  city?: string;                 // İl
  district?: string;             // İlçe
  country?: string;              // Ülke
  taxOffice?: string;            // Vergi Dairesi
  taxNumber?: string;            // Vergi No
  tcKimlik?: string;             // TC Kimlik No
  paymentTermDays?: number;      // Vade Günü (örn: 30, 45, 60 gün)
  creditLimit?: number;          // Kredi / Risk Limiti (₺)
  discountRate?: number;         // Özel İskonto Oranı (%)
  bankName?: string;             // Banka Adı
  iban?: string;                 // IBAN Numarası
  bankAccountName?: string;      // Hesap Sahibi
  balance: number;               // Cari Bakiye
  currency?: string;             // Para Birimi (TRY, USD, EUR, GBP)
  accountCode?: string;          // TDHP Muhasebe Hesap Kodu (örn: 120.01.001 Müşteri, 320.01.001 Satıcı)
  notes?: string;                // Özel Notlar
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AssortmentTemplate {
  id?: number;
  name: string;
  items: {
    size: string;
    quantity: number;
  }[];
}

export type LabelPresetSize = '100x150' | '100x80' | '80x60' | '60x40' | '50x30' | '40x25' | 'custom';
export type LabelUsageType = 'box' | 'shoe_box' | 'assortment' | 'shelf' | 'shipping' | 'custom';

export interface BarcodeTemplateElementConfig {
  showCompanyHeader: boolean;
  companyHeaderText?: string;
  showProductCode: boolean;
  showProductName: boolean;
  showColor: boolean;
  showMaterial?: boolean;
  showAssortmentTable: boolean;
  showBarcode: boolean;
  barcodeType: 'CODE-128' | 'EAN-13' | 'QR';
  barcodeHeight: number;
  showBarcodeText: boolean;
  showPrice: boolean;
  priceCurrency?: string;
  showBoxSerial: boolean;
  showOrderInfo: boolean;
  showLogisticsIcons: boolean; // Kırılabilir, Şemsiye, Yukarı Ok
  showProductImage: boolean;
  imageSizeMm?: number; // 15, 20, 25, 30, 40 mm
  imagePosition?: 'top' | 'left' | 'right';
  imageFit?: 'contain' | 'cover';
  showWeightDesi: boolean;
  showCustomNote: boolean;
  customNoteText?: string;
  fontSizeScale?: 'sm' | 'md' | 'lg';
  borderStyle?: 'solid' | 'dashed' | 'none';
}

export interface BarcodeTemplate {
  id?: number;
  name: string;
  description?: string;
  type: LabelUsageType;
  presetSize: LabelPresetSize;
  widthMm: number;
  heightMm: number;
  orientation: 'portrait' | 'landscape';
  isDefault?: boolean;
  config: BarcodeTemplateElementConfig;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BarcodeVariant {
  size: string;
  color: string;
  barcode: string;
  stock?: number;
}

export interface CompanySettings {
  companyName?: string;
  companyTitle?: string;
  logo?: string; // Base64 data URL or image URL for company logo
  taxOffice?: string;
  taxNumber?: string;
  tradeRegistryNo?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  bankName?: string;
  iban?: string;
  currency?: string;
}

export interface StockModuleSettings {
  barcodeType: 'EAN-13' | 'CODE-128' | 'CODE-39';
  barcodePrefix: string;
  nextBarcodeSequence: number;
  autoBarcodeOnProductCreate: boolean;
  defaultCriticalStockThreshold: number;
  defaultShoeSizes: string[];
}

export interface OrderModuleSettings {
  salesOrderPrefix: string;
  purchaseOrderPrefix: string;
  waybillSalesPrefix: string;
  waybillPurchasePrefix: string;
  invoiceSalesPrefix: string;
  invoicePurchasePrefix: string;
  defaultVatRate: number;
  defaultCurrency: string;
  defaultPaymentTermDays: number;
  autoCreateWorkOrdersOnConfirm: boolean;
  autoDeductStockOnWaybill: boolean;
}

export interface ProductionModuleSettings {
  workOrderPrefix: string;
  defaultDailyCapacityPairs: number;
  scrapTolerancePercentage: number;
  autoConsumeMaterialsOnStart: boolean;
}

export interface FinanceAccountingModuleSettings {
  defaultCurrency: string;
  checkAlertDaysBeforeDue: number;
  defaultCustomerAccountCode: string;
  defaultSupplierAccountCode: string;
  defaultFinishedStockAccountCode: string;
  defaultRawMaterialAccountCode: string;
  defaultSalesRevenueAccountCode: string;
  defaultVatCalculatedAccountCode: string;
  defaultVatDeductibleAccountCode: string;
}

export interface HRModuleSettings {
  weeklyWorkHours: number;
  dailyWorkHours: number;
  weekendDays: number[];              // Hafta tatili günleri (0=Pazar ... 6=Cumartesi)
  overtimeWeekdayMultiplier: number;
  overtimeWeekendMultiplier: number;
  annualLeaveBaseDays: number;
  sgkEmployeeRate: number;
  unemploymentEmployeeRate: number;
  sgkEmployerRate: number;
  unemploymentEmployerRate: number;
  incomeTaxRate: number;              // Gelir vergisi 1. dilim oranı (%)
  stampTaxPerMille: number;           // Damga vergisi oranı (binde)
  minWageGross: number;
  minWageNet: number;
  minWageIncomeTaxExemption: number;
  minWageStampTaxExemption: number;
  sgkMonthlyHours: number;            // SGK'lı aylık yasal çalışma saati (225)
  nonSgkMonthlyHours: number;         // SGK'sız aylık çalışma saati (240)
}

export interface AppSettings {
  id?: string; // 'global'
  barcodeType: 'EAN-13' | 'CODE-128' | 'CODE-39';
  barcodePrefix?: string;
  nextBarcodeSequence: number;
  movementsReset?: boolean;
  productionReset?: boolean;
  company?: CompanySettings;
  stock?: Partial<StockModuleSettings>;
  order?: Partial<OrderModuleSettings>;
  production?: Partial<ProductionModuleSettings>;
  finance?: Partial<FinanceAccountingModuleSettings>;
  hr?: Partial<HRModuleSettings>;
}

export type StockCategoryType = 'finished' | 'semi_finished' | 'raw_material' | 'accessory';
export type ProductCategoryType = StockCategoryType;

export interface Product {
  id?: number;
  code: string;
  name: string;
  categoryType?: StockCategoryType; // 'finished' | 'semi_finished' | 'raw_material' | 'accessory'
  hasSizeVariants?: boolean;        // true for finished goods and size-variant semi-finished (Taban, Mostra, Fuspet, Salpa)
  subType?: string;                 // e.g. 'Taban', 'Mostra', 'Fuspet', 'Salpa', 'Saya', 'Deri', 'Tekstil', 'Toka', 'Bağcık', 'Yapıştırıcı'
  moldCode?: string;                // Kalıp Kodu (örn: 018)
  moldGroup?: string;               // Kalıp / Seri Grubu (örn: PTK _ PATİK (26-30))
  documentNo?: string;              // Belge No (örn: KİŞ 74)
  unit: string;                     // 'Çift', 'Adet', 'dm²', 'm²', 'Metre', 'Kg', 'Litre', 'Tabaka', 'Paket', 'Koli', 'Bobin', 'Rulo'
  secondaryUnit?: string;           // e.g., "Çift"
  multiplier?: number;              // e.g., 10 (items per box)
  stock: number;
  minStock: number;
  buyingPrice: number;
  sellingPrice: number;
  isRawMaterial: boolean;           // Compatibility flag (true for raw materials & accessories)
  barcode?: string;                 // Ana ürün / tekil barkod
  // Barcode support
  colorBoxBarcodes?: { color: string, barcode: string }[];
  variantBarcodes?: BarcodeVariant[];
  // Footwear & variant specific
  isFootwear?: boolean;             // Compatibility flag (true for finished goods & size-based semi-finished)
  colors?: string[];
  assortmentTemplateId?: number;    // Linked template
  assortment?: {
    size: string;
    quantity: number;
  }[];
  category?: string;
  brand?: string;
  image?: string;                   // Base64 or URL
  colorImages?: { color: string, image: string }[];
  shelf?: string;
  location?: string;
  accountingCode?: string;       // TDHP Stok Hesap Kodu (örn: 150.01 Hammadde, 152.01 Yarı Mamul, 153.01 Ticari Mal, 157.01 Mamul)
  salesAccountCode?: string;     // TDHP Satış Gelir Hesabı (örn: 600.01, 600.20)
  purchaseAccountCode?: string;  // TDHP Alış / Gider / Maliyet Hesabı (örn: 150.01, 153.01, 710.01)
  vatRate?: number;              // KDV Oranı (%) (örn: 20, 10, 1)
  preferredSupplierId?: number;  // Varsayılan / Öncelikli Tedarikçi Firma ID
  preferredSupplierName?: string;// Tedarikçi Firma Adı
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductVariant {
  color: string;
  size: string;
  barcode: string;
  stock: number;
  shelf?: string;
  location?: string;
}

export interface RecipeIngredient {
  productId: number;
  department?: string;             // 'KESİM' | 'BASKI' | 'SAYA' | 'BAĞCIK' | 'MONTA' | 'TEMİZLEME' | 'DİĞER'
  partName?: string;               // Açıklama / Parça Notu (örn: 'ÇEMBER', 'NAL', 'GAMBA', 'FORT', 'DİL ASTAR', 'TABAN', 'KUTU')
  color?: string;                  // Malzeme / Yarı mamul rengi / Kullanılacak Renk (Örn: Siyah, Beyaz, Saks)
  quantity: number;                // 1 çift/adet mamul için sarfiyat
  unit?: string;                   // Çift, dm2, Adet, Kg, Metre, Plak vb.
  isMatrixMatched?: boolean;       // Numara/Beden Matris Eşleşmeli (Taban, Mostra, Fuspet için sipariş asortisi ile 1:1 eşleşir)
  wasteRate?: number;              // Fire / Zayiat Oranı (%)
  notes?: string;
}

export interface Recipe {
  id?: number;
  productId: number;               // Mamul Ürün ID
  targetColor?: string;            // Belirli bir renk varyantı reçetesi mi (Örn: "Siyah" veya "Tüm Renkler")
  name?: string;
  ingredients: RecipeIngredient[];
  notes?: string;
  laborCost?: number;
  estimatedTimeMinutes?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ProductionStage = 
  | 'planning'         // Planlama & Reçete Hazırlık
  | 'cutting'          // Kesim (Saya / Taban)
  | 'printing'         // Baskı & Nakış & Lazer
  | 'sewing'           // Saya Dikim & Çatım
  | 'assembly'         // Montaj & Kalıplama & Tabanlama
  | 'finishing'        // Finisaj & Temizlik
  | 'quality_packing'  // Kalite Kontrol & Paketleme / Kolileme
  | 'completed';       // Tamamlandı (Mamul Depo)

export interface WorkOrderStageLog {
  stage: ProductionStage;
  stageName: string;
  status: 'pending' | 'in_progress' | 'completed';
  startedAt?: Date;
  completedAt?: Date;
  operator?: string;
  completedQuantity?: number;
  scrapQuantity?: number; // Fire adedi
  notes?: string;
}

export type MaterialReadinessStatus = 
  | 'no_recipe'            // Reçete Tanımlı Değil
  | 'pending_mrp'          // İhtiyaç Hesaplanmadı
  | 'materials_shortage'   // Eksik Hammadde Var
  | 'po_created'           // Satın Alma Siparişi Açıldı (Tedarikçi Yolda)
  | 'materials_ready'      // Malzemeler Yeterli / Hazır
  | 'materials_consumed';  // Malzemeler Üretimde Harcandı

export interface WorkOrder {
  id?: number;
  productId: number;
  quantity: number;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  completedAt?: Date;
  targetDate?: Date;
  
  // Link to Sales Order
  orderId?: number;
  orderItemId?: number;
  orderNumber?: string;
  customerName?: string;
  customerCode?: string;
  orderDate?: Date | string;
  documentNo?: string;        // Belge No (örn: KİŞ 74)
  moldCode?: string;          // Kalıp Kodu (örn: 018)
  moldGroup?: string;         // Kalıp / Seri Grubu (örn: PTK _ PATİK (26-30))
  
  // Product Variant info & Size Breakdown
  color?: string;
  size?: string;
  assortmentBreakdown?: { size: string; quantity: number }[];
  
  // Stages & Progress
  currentStage: ProductionStage;
  stages?: WorkOrderStageLog[];
  
  // MRP & Materials
  materialStatus?: MaterialReadinessStatus;
  recipeId?: number;
  
  // Barcode & Tracking
  barcode: string; // e.g. "WO-001024"
  notes?: string;
  operator?: string;
}

export interface MrpRequirementItem {
  rawMaterialId: number;
  rawMaterialName: string;
  rawMaterialCode: string;
  color?: string;
  categoryType?: ProductCategoryType;
  subType?: string;
  isMatrixMatched?: boolean;
  hasSizeMatrix?: boolean;
  sizeBreakdown?: {
    size: string;
    required: number;
    currentStock: number;
    onOrderQuantity?: number;
    shortage: number;
  }[];
  unit: string;
  currentStock: number;
  requiredQuantity: number;
  onOrderQuantity?: number;
  grossShortageQuantity?: number;
  shortageQuantity: number; // max(0, required - currentStock - onOrderQuantity)
  status: 'sufficient' | 'shortage' | 'po_created';
  activePurchaseOrders?: {
    orderId: number;
    orderNumber: string;
    supplierName?: string;
    quantity: number;
    date: Date | string;
    status: OrderStatus;
  }[];
  buyingPrice: number;
  estimatedCost: number;
  preferredSupplierId?: number;
  preferredSupplierName?: string;
  workOrderCount: number;
  affectedWorkOrderIds: number[];
  affectedWorkOrders?: {
    workOrderId: number;
    barcode: string;
    quantity: number;
    modelName?: string;
  }[];
  warehouseStock?: number;
}

export interface MrpCalculationResult {
  calculatedAt: Date;
  totalWorkOrders: number;
  totalRequiredMaterialsCount: number;
  shortageItemsCount: number;
  totalShortageCost: number;
  items: MrpRequirementItem[];
}

export interface Transaction {
  id?: number;
  contactId?: number;
  type: TransactionType;
  amount: number;
  description: string;
  date: Date;
  category: string;
  paymentMethod?: 'cash' | 'bank_transfer' | 'credit_card' | 'check' | 'other';
  documentNo?: string;
  orderId?: number;
}

export type OrderType = 'purchase' | 'sales';
export type OrderStatus = 'draft' | 'confirmed' | 'partially_shipped' | 'completed' | 'cancelled';
export type InvoicingStatus = 'not_invoiced' | 'partially_invoiced' | 'fully_invoiced';

export interface Order {
  id?: number;
  type: OrderType;
  orderNumber: string;
  contactId: number;
  date: Date;
  deliveryDate?: Date;
  status: OrderStatus;
  invoicingStatus?: InvoicingStatus;
  invoicedTotal?: number;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  grandTotal: number;
  notes?: string;
  currency: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrderItem {
  id?: number;
  orderId: number;
  productId: number;
  color?: string;
  size?: string;
  quantity: number;
  shippedQuantity: number;
  invoicedQuantity?: number;     // Şu ana kadar faturalandırılan miktar (kısmi fatura takibi)
  unitPrice: number;
  taxRate: number; // e.g., 20 for %20
  discountRate: number;
  total: number;
}

export type InvoiceType = 'sales' | 'purchase';
export type InvoiceStatus = 'draft' | 'issued' | 'cancelled';
export type InvoiceScenario = 'commercial' | 'basic' | 'return' | 'withholding' | 'export';
export type InvoicePaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface Invoice {
  id?: number;
  invoiceNumber: string;         // e.g., SAT-2026-000001, ALS-2026-000001 or GIB e-Archive No
  type: InvoiceType;             // 'sales' = Satış Faturası | 'purchase' = Alış Faturası
  scenario: InvoiceScenario;     // 'commercial' (Ticari) | 'basic' (Temel) | 'return' (İade) | 'withholding' (Tevkifatlı) | 'export' (İhracat)
  contactId: number;             // Müşteri veya Tedarikçi
  orderId?: number;              // Bağlı Sipariş (opsiyonel)
  orderNumber?: string;
  waybillId?: number;            // Bağlı İrsaliye (opsiyonel)
  waybillNumber?: string;        // Bağlı İrsaliye No
  date: Date;                    // Fatura Tarihi
  dueDate?: Date;                // Vade Tarihi
  ettn?: string;                 // e-Fatura UUID / ETTN
  subtotal: number;              // KDV Hariç Matrah Toplamı (₺)
  discountTotal: number;         // Toplam İskonto Tutarı (₺)
  taxTotal: number;              // Toplam KDV Tutarı (₺)
  withholdingRate?: number;      // Tevkifat Oranı (örn: 0, 2, 3, 5, 7, 9 -> 5/10)
  withholdingAmount?: number;    // Tevkifat KDV Tutarı (₺)
  grandTotal: number;            // Ödenecek / Fatura Toplam Tutarı (₺)
  currency: string;              // 'TRY' | 'USD' | 'EUR'
  exchangeRate?: number;
  paymentStatus: InvoicePaymentStatus; // 'unpaid' | 'partial' | 'paid'
  paidAmount?: number;
  status: InvoiceStatus;         // 'draft' | 'issued' | 'cancelled'
  notes?: string;
  isStockDeducted?: boolean;     // Otomatik stok hareketi yapıldı mı
  createdAt?: Date;
  updatedAt?: Date;
}

export interface InvoiceItem {
  id?: number;
  invoiceId: number;
  productId?: number;
  orderItemId?: number;          // Bağlı sipariş kalemi
  productCode: string;
  productName: string;
  color?: string;
  size?: string;
  quantity: number;              // Faturalanan Miktar (Çift / Adet)
  unit: string;                  // 'Çift', 'Adet', 'Metre', 'Kg', 'Paket' vb.
  unitPrice: number;             // Birim Fiyat (KDV Hariç)
  discountRate: number;          // İskonto %
  discountAmount: number;        // İskonto Tutarı
  taxRate: number;               // KDV % (0, 1, 10, 20)
  taxAmount: number;             // KDV Tutarı
  total: number;                 // Satır Net Tutarı (KDV Dahil)
}

export type WaybillType = 'sales' | 'purchase';
export type WaybillStatus = 'draft' | 'issued' | 'cancelled';
export type WaybillScenario = 'sevk' | 'matbu' | 'konsinye' | 'fason' | 'ihracat';

export interface Waybill {
  id?: number;
  waybillNumber: string;         // e.g., IRS-2026-000001, GIR-2026-000001 or GIB e-Waybill No
  type: WaybillType;             // 'sales' = Sevk / Satış İrsaliyesi | 'purchase' = Alış / Gelen İrsaliye
  scenario: WaybillScenario;     // 'sevk' (Sevk İrsaliyesi) | 'matbu' | 'konsinye' | 'fason' | 'ihracat'
  contactId: number;             // Müşteri veya Tedarikçi
  contactName?: string;          // Cari Adı / Ünvanı (Display cache)
  orderId?: number;              // Bağlı Sipariş (opsiyonel)
  orderNumber?: string;
  date: Date;                    // İrsaliye Düzenleme Tarihi
  shippingDate?: Date;           // Sevk Tarihi (alias)
  dispatchDate?: Date;           // Fiili Sevk Tarihi
  dispatchTime?: string;         // Fiili Sevk Saati (örn: "14:30")
  carrierTitle?: string;         // Taşıyıcı Firma / Kargo (örn: Yurtiçi Kargo, MNG, Özlem Lojistik)
  carrierTaxNo?: string;         // Taşıyıcı VKN / TCKN
  driverName?: string;           // Sürücü Adı Soyadı
  driverTc?: string;             // Sürücü TCKN
  vehiclePlate?: string;         // Taşıt Plakası (örn: 34 ABC 123)
  trailerPlate?: string;         // Dorse Plakası
  deliveryAddress?: string;      // Teslimat / Sevkiyat Adresi
  ettn?: string;                 // e-İrsaliye UUID / ETTN
  subtotal: number;              // KDV Hariç Matrah Toplamı (₺)
  discountTotal: number;         // Toplam İskonto Tutarı (₺)
  taxTotal: number;              // Toplam KDV Tutarı (₺)
  grandTotal: number;            // İrsaliye Toplam Tutarı (₺)
  totalQuantity: number;         // Toplam Sevk Miktarı (Çift/Adet)
  currency: string;              // 'TRY' | 'USD' | 'EUR'
  status: WaybillStatus;         // 'draft' | 'issued' | 'cancelled'
  isStockDeducted?: boolean;     // Otomatik stok hareketi yapıldı mı (default: true)
  invoicedStatus?: 'not_invoiced' | 'invoiced'; // Faturalaşma durumu
  invoiceId?: number;            // Bağlı Fatura ID
  invoiceNumber?: string;        // Bağlı Fatura No
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WaybillItem {
  id?: number;
  waybillId: number;
  productId?: number;
  orderItemId?: number;          // Bağlı sipariş kalemi
  productCode: string;
  productName: string;
  color?: string;
  size?: string;
  quantity: number;              // Sevk Edilen Miktar (Çift / Adet)
  unit: string;                  // 'Çift', 'Adet', 'Metre', 'Kg', 'Paket' vb.
  unitPrice: number;             // Birim Fiyat (KDV Hariç)
  discountRate: number;          // İskonto %
  discountAmount: number;        // İskonto Tutarı
  taxRate: number;               // KDV % (0, 1, 10, 20)
  taxAmount: number;             // KDV Tutarı
  total: number;                 // Satır Net Tutarı (KDV Dahil)
}

export interface InventoryLog {
  id?: number;
  productId: number;
  type: InventoryMoveType;
  quantity: number;
  date: Date;
  description: string;
  color?: string;
  size?: string;
}

// ==========================================
// TEK DÜZEN HESAP PLANI (TDHP) & GENEL MUHASEBE
// ==========================================

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost';

export interface Account {
  id?: number;
  code: string;            // e.g. "100", "100.01", "102.01", "120.01", "320.01", "600.20", "391.20"
  name: string;            // e.g. "MERKEZ TL KASASI", "GARANTİ BANKASI VADESİZ TL"
  type: AccountType;       // 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost'
  level: number;           // 1: Sınıf (1-7), 2: Grup (10-77), 3: Ana Hesap (100-770), 4: Alt/Muavin Hesap
  parentCode?: string;     // Üst hesap kodu (örn: "100" -> parent of "100.01")
  currency?: string;       // TRY, USD, EUR
  description?: string;
  isSystem?: boolean;      // Silinemez standart sistem hesabı mı
  isActive?: boolean;
}

export type JournalEntryType = 'mahsup' | 'tahsil' | 'tediye' | 'acilis' | 'kapanis';

export interface JournalEntryLine {
  id: string;              // unique row id
  accountCode: string;     // Hesap Kodu
  accountName: string;     // Hesap Adı
  description: string;     // Satır Açıklaması
  debit: number;           // Borç (₺)
  credit: number;          // Alacak (₺)
  contactId?: number;      // İlgili Cari (opsiyonel)
}

export interface JournalEntry {
  id?: number;
  entryNumber: string;     // YEV-2026-000001
  entryType: JournalEntryType; // 'mahsup' | 'tahsil' | 'tediye' | 'acilis' | 'kapanis'
  date: Date;              // Yevmiye Tarihi
  description: string;     // Genel Açıklama
  documentType?: 'invoice' | 'collection' | 'disbursement' | 'check' | 'manual' | 'opening';
  documentId?: number;     // Fatura veya Tahsilat ID'si
  documentNumber?: string; // Fatura / Makbuz No
  lines: JournalEntryLine[];
  totalDebit: number;      // Toplam Borç
  totalCredit: number;     // Toplam Alacak
  isBalanced: boolean;     // Borç === Alacak
  status: 'approved' | 'draft';
  createdAt: Date;
  updatedAt?: Date;
}

// ==========================================
// TAHSİLAT & FİNANS MODÜLÜ (KASA, BANKA, ÇEK-SENET)
// ==========================================

export interface CashBox {
  id?: number;
  code: string;            // KAS-01
  name: string;            // Merkez TL Kasası
  accountCode: string;     // 100.01
  currency: string;        // TRY, USD, EUR
  balance: number;
  responsiblePerson?: string;
  notes?: string;
  createdAt?: Date;
}

export interface BankAccount {
  id?: number;
  bankName: string;        // Garanti BBVA, Ziraat Bankası vb.
  branchName?: string;     // Kadıköy Şubesi
  accountNumber?: string;  // 12345678
  iban: string;            // TR...
  accountCode: string;     // 102.01
  currency: string;        // TRY, USD, EUR
  balance: number;
  notes?: string;
  createdAt?: Date;
}

export type CheckType = 'received_check' | 'given_check' | 'received_note' | 'given_note';

export type CheckStatus = 
  | 'portfolio'         // Portföyde (Kasada/Cüzdanda)
  | 'bank_collection'   // Tahsilde (Bankaya Verildi)
  | 'collected'         // Tahsil Edildi (Nakit/Banka ödendi)
  | 'endorsed'          // Ciro Edildi (Tedarikçiye verildi)
  | 'bounced'           // Karşılıksız / Protestolu
  | 'returned';         // İade Edildi

export interface CheckNote {
  id?: number;
  type: CheckType;         // Alınan Çek, Verilen Çek, Alınan Senet, Verilen Senet
  portfolioNumber: string; // Portföy No (PRF-2026-001)
  serialNumber: string;    // Çek/Senet No
  bankName?: string;       // Keşideci Bankası
  branchName?: string;     // Şube
  accountNumber?: string;  // Hesap No
  drawer: string;          // Keşideci (İmzalayan / Düzenleyen)
  drawerTaxNumber?: string;// Keşideci VKN / TCKN
  contactId: number;       // Hangi cariden alındı / kime verildi
  contactName: string;
  endorsedToContactId?: number; // Ciro edilen cari ID
  endorsedToContactName?: string;
  issueDate: Date;         // Tanzim Tarihi
  dueDate: Date;           // Vade Tarihi
  amount: number;          // Tutar
  currency: string;        // TRY, USD, EUR
  status: CheckStatus;     // 'portfolio' | 'bank_collection' | 'collected' | 'endorsed' | 'bounced' | 'returned'
  statusChangeDate?: Date;
  statusNotes?: string;
  accountCode?: string;    // 101.01 (Alınan Çekler) veya 103.01 (Verilen Çekler)
  journalEntryId?: number; // Bağlı muhasebe yevmiye fişi
  notes?: string;
  createdAt: Date;
}

export type ReceiptType = 'collection' | 'disbursement'; // Tahsilat (Giriş) | Tediye (Çıkış)
export type PaymentInstrument = 'cash' | 'bank' | 'check' | 'credit_card';

export interface CollectionReceipt {
  id?: number;
  receiptNumber: string;   // MAK-2026-000001
  type: ReceiptType;       // 'collection' (Tahsilat) | 'disbursement' (Tediye)
  date: Date;
  contactId: number;
  contactName: string;
  instrument: PaymentInstrument; // Nakit, Banka, Çek/Senet, Kredi Kartı
  cashBoxId?: number;
  bankAccountId?: number;
  checkId?: number;
  amount: number;
  currency: string;
  description: string;
  invoiceId?: number;      // İlişkili Fatura
  invoiceNumber?: string;
  journalEntryId?: number; // Bağlı muhasebe yevmiye fişi
  isAccounted?: boolean;   // Muhasebeleştirildi mi
  createdAt: Date;
}

// ==================== İNSAN KAYNAKLARI (HR) & BORDRO ====================

export type SgkStatus = 'sgk_li' | 'sgk_siz';
export type SalaryType = 'monthly_net' | 'monthly_gross' | 'daily' | 'hourly';
export type EmployeeDepartment = 
  | 'KESİM' 
  | 'SAYA' 
  | 'MONTA' 
  | 'FİNİSAJ' 
  | 'KALİTE & PAKET' 
  | 'DEPO & SEVKİYAT' 
  | 'MUHASEBE & FİNANS' 
  | 'YÖNETİM & İDARİ' 
  | 'DİĞER';

export interface Employee {
  id?: number;
  employeeCode: string;             // PER-001
  name: string;                     // Ad Soyad
  tcNo?: string;                    // T.C. Kimlik No
  phone?: string;                   // Telefon
  email?: string;                   // E-posta
  department: EmployeeDepartment;   // Çalıştığı departman
  position: string;                 // Görev/Ünvan (örn: Saya Ustası, Monta Operatörü, Muhasebeci)
  hireDate: Date;                   // İşe giriş tarihi
  terminationDate?: Date;           // İşten çıkış tarihi
  status: 'active' | 'passive';     // Çalışma durumu
  
  // Ücret ve Sigorta Yapılandırması
  sgkStatus: SgkStatus;             // 'sgk_li' (Sigortalı) | 'sgk_siz' (Sigortasız / Yevmiyeli / Harici)
  salaryType: SalaryType;           // 'monthly_net' | 'monthly_gross' | 'daily' | 'hourly'
  baseSalary: number;               // Taban Maaş / Günlük Yevmiye Tutarı (₺)
  agreedNetSalary?: number;         // Anlaşılan Net Ücret (₺)
  paymentMethod: 'bank' | 'cash';   // Banka IBAN veya Nakit (Elden)
  bankName?: string;
  iban?: string;

  // İzin Hak Ediş
  entitledAnnualLeave?: number;     // Yıllık Hak Edilen İzin (varsayılan 14 gün)
  usedAnnualLeave?: number;         // Kullanılan İzin
  
  // Personel Ek Bilgileri
  bloodGroup?: string;              // Kan Grubu
  emergencyContact?: string;        // Acil Durum Kişisi ve Tel
  address?: string;
  notes?: string;
  createdAt: Date;
}

export type AttendanceStatus = 
  | 'present'       // Geldi (N - Normal Çalışma)
  | 'absent'        // Devamsız (D - Gelmedi / Mazeretsiz)
  | 'weekly_rest'   // Hafta Tatili (H - Pazar)
  | 'paid_leave'    // Ücretli / Yıllık İzin (İ)
  | 'unpaid_leave'  // Ücretsiz İzin (Ü)
  | 'sick_leave'    // Sağlık Raporu (S)
  | 'public_holiday'// Resmi Tatil (R)
  | 'half_day';     // Yarım Gün

export interface AttendanceRecord {
  id?: number;
  employeeId: number;
  date: string;                     // YYYY-MM-DD
  month: number;                    // 1-12
  year: number;                     // 2026
  status: AttendanceStatus;
  checkInTime?: string;             // 08:30
  checkOutTime?: string;            // 18:30
  normalHours: number;              // 8
  overtimeHours: number;            // 2 (Fazla mesai saati)
  notes?: string;
}

export type LeaveType = 
  | 'annual'        // Yıllık Ücretli İzin
  | 'excuse'        // Mazeret İzni
  | 'unpaid'        // Ücretsiz İzin
  | 'sick'          // Sağlık / Rapor
  | 'marriage'      // Evlilik İzni
  | 'maternity'     // Doğum İzni
  | 'bereavement';  // Vefat İzni

export interface LeaveRequest {
  id?: number;
  employeeId: number;
  employeeName: string;
  leaveType: LeaveType;
  startDate: string;                // YYYY-MM-DD
  endDate: string;                  // YYYY-MM-DD
  days: number;                     // Gün sayısı
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  approvedBy?: string;
  createdAt: Date;
}

export interface AdvanceRequest {
  id?: number;
  employeeId: number;
  employeeName: string;
  date: Date;
  amount: number;
  description?: string;
  month: number;                    // Hangi ayın maaşından kesilecek
  year: number;
  status: 'pending' | 'paid' | 'rejected';
  isDeducted: boolean;              // Bordroda mahsup edildi mi
  createdAt: Date;
}

export interface PayrollRecord {
  id?: number;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  department: string;
  month: number;                    // 1-12
  year: number;                     // 2026
  sgkStatus: SgkStatus;             // 'sgk_li' | 'sgk_siz'
  salaryType: SalaryType;
  
  // Puantaj Özeti
  daysWorked: number;               // Fiili Çalışılan Gün (Örn: 26)
  weeklyRestDays: number;           // Hafta Tatili (Örn: 4)
  paidLeaveDays: number;            // Ücretli İzin Gün (Örn: 2)
  unpaidLeaveDays: number;          // Ücretsiz İzin Gün (Örn: 0)
  absentDays: number;               // Devamsız Gün (Örn: 0)
  totalDays: number;                // 30 gün üzerinden
  overtimeHours: number;            // Toplam Fazla Mesai Saati
  
  // Kazançlar
  baseSalary: number;               // Taban Brüt veya Anlaşılan Tutar
  basePay: number;                  // Günlük/Aylık Normal Çalışma Karşılığı
  overtimePay: number;              // Fazla Mesai Ücreti
  bonusPay: number;                 // Prim / İkramiye / Yol / Yemek
  totalGrossPay: number;            // Toplam Brüt / Hak Ediş
  
  // Kesintiler (SGK'lı Personel İçin)
  employeeSgkShare: number;         // SGK İşçi Payı (%14)
  employeeUnemploymentShare: number;// İşsizlik İşçi Payı (%1)
  incomeTaxBase?: number;           // Aylık Gelir Vergisi Matrahı
  previousCumulativeTaxBase?: number; // Önceki Kümülatif Vergi Matrahı
  cumulativeTaxBase?: number;       // Güncel Kümülatif Vergi Matrahı
  appliedTaxRate?: number;          // Uygulanan Vergi Dilimi Oranı (%)
  incomeTax: number;                // Gelir Vergisi (Asgari ücret muafiyeti düşülmüş)
  stampTax: number;                 // Damga Vergisi (Asgari ücret muafiyeti düşülmüş)
  totalLegalDeductions: number;     // Yasal Kesintiler Toplamı
  
  // Kuruş Cinsinden Hassas Tam Sayı Karşılıkları (Integer Kuruş)
  totalGrossPayKurus?: number;
  employeeSgkShareKurus?: number;
  employeeUnemploymentShareKurus?: number;
  incomeTaxKurus?: number;
  stampTaxKurus?: number;
  netSalaryKurus?: number;
  totalEmployerCostKurus?: number;
  
  // Şirket İçi Kesintiler (Her ikisi için)
  advanceDeduction: number;          // Avans Kesintisi
  otherDeductions: number;          // Diğer Kesintiler / Ceza
  
  // Net Ödenecek
  netSalary: number;                // Personele Ödenecek Net Tutar
  
  // İşveren Maliyeti (SGK'lı İçin)
  employerSgkShare: number;         // SGK İşveren Payı (%15.5)
  employerUnemploymentShare: number;// İşveren İşsizlik Payı (%2)
  totalEmployerCost: number;        // İşverene Toplam Maliyet
  
  // Ödeme & Muhasebe Durumu
  paymentStatus: 'unpaid' | 'paid';
  paidDate?: Date;
  paidFromType?: 'cash' | 'bank';
  paidFromId?: number;
  isAccounted?: boolean;            // Yevmiye fişine aktarıldı mı
  journalEntryId?: number;
  notes?: string;
  createdAt: Date;
}

export interface AttendancePeriodLock {
  id?: number;
  month: number;                     // 1-12
  year: number;                      // e.g. 2026
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: string;
  notes?: string;
}

// ==========================================
// KULLANICI & ROL TABANLI YETKİLENDİRME (RBAC)
// ==========================================

export type AppModule = 
  | 'dashboard'
  | 'inventory'
  | 'orders'
  | 'waybills'
  | 'invoices'
  | 'finance'
  | 'accounting'
  | 'hr'
  | 'production'
  | 'contacts'
  | 'reports'
  | 'users'
  | 'settings';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'approve';

export interface ModulePermission {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  export: boolean;
  approve: boolean;
}

export type RolePermissions = Record<AppModule, ModulePermission>;

export interface Role {
  id?: number;
  code: string;
  name: string;
  description: string;
  color?: string;
  isSystem?: boolean;
  permissions: RolePermissions;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserStatus = 'active' | 'passive' | 'suspended';

export interface AppUser {
  id?: number;
  username: string;
  fullName: string;
  email: string;
  phone?: string;
  title?: string;
  department?: string;
  roleId?: number;
  roleCode: string;
  roleName?: string;
  status: UserStatus;
  avatar?: string;
  color?: string;
  /**
   * Yalnızca yazma amaçlı sanal alan: kullanıcı oluştururken/güncellerken parola
   * göndermek için kullanılır. Sunucu parolayı scrypt ile saklar ve bu alanı
   * hiçbir zaman geri döndürmez; kalıcı bir kolonu yoktur.
   */
  password?: string;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  notes?: string;
}

export type AuditActionType = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'login' 
  | 'logout'
  | 'export' 
  | 'approve' 
  | 'status_change' 
  | 'permission_change'
  | 'system';

export interface AuditLog {
  id?: number;
  userId?: number;
  userName: string;
  userRole: string;
  action: AuditActionType;
  module: AppModule | 'auth' | 'system';
  entityId?: string | number;
  description: string;
  details?: string;
  ipAddress?: string;
  timestamp: Date;
}

export interface AccountStatementItem {
  id?: number;
  date: Date | string;
  documentNo?: string;
  type: string;
  typeLabel: string;
  description: string;
  contactName?: string;
  debit: number;   // Giriş (Tahsilat / Yatırılan)
  credit: number;  // Çıkış (Tediye / Çekilen)
  balance: number; // Kümülatif Yürüyen Bakiye
  sourceId?: number;
  sourceType?: string;
}

export interface AccountStatement {
  accountCode: string;
  accountName: string;
  currency: string;
  initialBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  startDate?: string;
  endDate?: string;
  items: AccountStatementItem[];
}

export interface CheckMovementReportItem {
  check: CheckNote;
  contactName?: string;
  bankAccountName?: string;
  cashBoxName?: string;
  agingCategory: 'overdue' | '0-30' | '31-60' | '61-90' | '90+';
  daysRemaining: number;
}



