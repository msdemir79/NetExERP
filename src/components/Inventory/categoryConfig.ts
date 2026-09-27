import { ShoppingBag, Layers, Scissors, Wrench } from 'lucide-react';
import { StockCategoryType, Product } from '../../types';

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

export const getProductCategoryType = (p: Product): StockCategoryType => {
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
