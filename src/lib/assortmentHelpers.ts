import type { Product, OrderItem } from '../types';

export interface SizedRowGroup {
  productId: number;
  productCode: string;
  productName: string;
  color: string;
  unit: string;
  moldCode?: string;
  moldGroup?: string;
  unitPrice: number;
  taxRate: number;
  sizeQuantities: { [size: string]: number };
  totalQuantity: number;
  totalAmount: number;
  originalItemIds?: number[];
}

/**
 * Turkish currency to words converter (for official letter)
 */
export function numberToTurkishWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return 'SIFIR TÜRK LİRASI';

  const ones = ['', 'BİR', 'İKİ', 'ÜÇ', 'DÖRT', 'BEŞ', 'ALTI', 'YEDİ', 'SEKİZ', 'DOKUZ'];
  const tens = ['', 'ON', 'YİRMİ', 'OTUZ', 'KIRK', 'ELLİ', 'ALTMIŞ', 'YETMİŞ', 'SEKSEN', 'DOKSAN'];
  const groups = ['', 'BİN', 'MİLYON', 'MİLYAR', 'TRİLYON'];

  const parts = Math.abs(amount).toFixed(2).split('.');
  const integerPart = parseInt(parts[0], 10);
  const kurusPart = parseInt(parts[1], 10);

  function convertThreeDigits(n: number): string {
    let result = '';
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const o = n % 10;

    if (h === 1) result += 'YÜZ';
    else if (h > 1) result += ones[h] + 'YÜZ';

    if (t > 0) result += tens[t];
    if (o > 0) {
      if (!(h === 0 && t === 0 && o === 1 && result.length === 0)) {
        result += ones[o];
      } else {
        result += 'BİR';
      }
    }
    return result;
  }

  let num = integerPart;
  let groupIdx = 0;
  let liraWords = '';

  if (num === 0) {
    liraWords = 'SIFIR';
  } else {
    while (num > 0) {
      const chunk = num % 1000;
      if (chunk > 0) {
        let chunkWords = convertThreeDigits(chunk);
        if (groupIdx === 1 && chunk === 1) {
          chunkWords = '';
        }
        liraWords = chunkWords + groups[groupIdx] + liraWords;
      }
      num = Math.floor(num / 1000);
      groupIdx++;
    }
  }

  let kurusWords = '';
  if (kurusPart > 0) {
    const t = Math.floor(kurusPart / 10);
    const o = kurusPart % 10;
    kurusWords = tens[t] + (o > 0 ? ones[o] : '');
  }

  let finalStr = liraWords + ' TÜRK LİRASI';
  if (kurusPart > 0) {
    finalStr += ' ' + kurusWords + ' KURUŞ';
  }

  return finalStr;
}

/**
 * Standard adult male shoe size distribution ratio (40-45)
 */
const DEFAULT_MEN_RATIO = [
  { size: '40', weight: 1 },
  { size: '41', weight: 2 },
  { size: '42', weight: 3 },
  { size: '43', weight: 3 },
  { size: '44', weight: 2 },
  { size: '45', weight: 1 }
];

const DEFAULT_WOMEN_RATIO = [
  { size: '36', weight: 1 },
  { size: '37', weight: 3 },
  { size: '38', weight: 4 },
  { size: '39', weight: 3 },
  { size: '40', weight: 1 }
];

const DEFAULT_KIDS_RATIO = [
  { size: '26', weight: 1 },
  { size: '27', weight: 1 },
  { size: '28', weight: 1 },
  { size: '29', weight: 1 },
  { size: '30', weight: 1 }
];

/**
 * Checks if a product or order item qualifies as a footwear/sized component
 */
export function isFootwearProduct(prod?: Product, item?: OrderItem): boolean {
  if (!prod && !item) return false;
  if (item?.size && item.size.trim() !== '' && item.size.trim() !== '-') return true;
  if (!prod) return false;

  if (prod.hasSizeVariants || prod.isFootwear) return true;
  if (prod.categoryType === 'finished') return true;
  if (prod.assortmentTemplateId && prod.assortmentTemplateId > 0) return true;
  if (prod.assortment && prod.assortment.length > 0) return true;

  const subType = (prod.subType || '').toLowerCase();
  if (['taban', 'mostra', 'fuspet', 'salpa', 'saya', 'kalıp', 'bitmiş ayakkabı', 'mamul', 'fort', 'bombe'].includes(subType)) {
    return true;
  }

  const name = (prod.name || '').toLowerCase();
  if (name.includes('taban') || name.includes('mostra') || name.includes('fuspet') || name.includes('merdane') || name.includes('ayakkabı')) {
    return true;
  }

  if ((prod.unit || '').toLowerCase() === 'çift') {
    return true;
  }

  return false;
}

/**
 * Calculates a proportional size breakdown for a total quantity using template or default ratio
 */
export function calculateAssortmentBreakdown(
  totalQty: number,
  templateItems?: { size: string; quantity: number }[] | { size: string; weight: number }[],
  prodName?: string,
  moldGroup?: string
): { [size: string]: number } {
  let ratioItems: { size: string; weight: number }[] = [];

  if (templateItems && templateItems.length > 0) {
    ratioItems = templateItems.map(item => ({
      size: item.size,
      weight: (item as any).quantity || (item as any).weight || 1
    }));
  } else {
    // Pick standard based on mold or product name
    const combined = `${prodName || ''} ${moldGroup || ''}`.toLowerCase();
    if (combined.includes('kadın') || combined.includes('zenne') || combined.includes('36-40')) {
      ratioItems = DEFAULT_WOMEN_RATIO;
    } else if (combined.includes('patik') || combined.includes('çocuk') || combined.includes('26-30') || combined.includes('26-35')) {
      ratioItems = DEFAULT_KIDS_RATIO;
    } else {
      ratioItems = DEFAULT_MEN_RATIO;
    }
  }

  const totalWeight = ratioItems.reduce((acc, curr) => acc + (curr.weight || 0), 0);
  if (totalWeight <= 0) return {};

  const result: { [size: string]: number } = {};
  let accumulated = 0;

  ratioItems.forEach((item, index) => {
    if (index === ratioItems.length - 1) {
      // Last item gets remainder to ensure exact sum equals totalQty
      result[item.size] = Math.max(0, totalQty - accumulated);
    } else {
      const calculatedQty = Math.round((item.weight / totalWeight) * totalQty);
      result[item.size] = calculatedQty;
      accumulated += calculatedQty;
    }
  });

  return result;
}
