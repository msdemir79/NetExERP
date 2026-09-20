/**
 * Türkçe Karakter & Metin Dönüşüm Araçları (Turkish String Utilities)
 * Türkçe karakterlerin (İ-i, I-ı, Ş-ş, Ğ-ğ, Ü-ü, Ö-ö, Ç-ç) bozulmadan
 * doğru büyük/küçük harf dönüşümünü ve aramasını garanti eder.
 */

/**
 * Metni Türkçe kurallarına uygun olarak tamamen BÜYÜK HARFE çevirir.
 * Örn: "ziylan taban a.ş." -> "ZİYLAN TABAN A.Ş."
 * Örn: "istanbul" -> "İSTANBUL"
 * Örn: "ışık" -> "IŞIK"
 */
export function toTurkishUpper(text?: string | null): string {
  if (!text) return '';
  return String(text).toLocaleUpperCase('tr-TR');
}

/**
 * Metni Türkçe kurallarına uygun olarak tamamen KÜÇÜK HARFE çevirir.
 * Örn: "ZİYLAN TABAN A.Ş." -> "ziylan taban a.ş."
 * Örn: "İSTANBUL" -> "istanbul"
 * Örn: "IŞIK" -> "ışık"
 */
export function toTurkishLower(text?: string | null): string {
  if (!text) return '';
  return String(text).toLocaleLowerCase('tr-TR');
}

/**
 * Metni Türkçe kurallarına uygun olarak Baş Harfleri Büyük (Title Case) yapar.
 * 'İ' ve 'I' harflerini ve noktalı karakterleri bozmaz.
 * Örn: "ZİYLAN TABAN A.Ş." -> "Ziylan Taban A.Ş."
 * Örn: "İSTANBUL TİCARET" -> "İstanbul Ticaret"
 */
export function toTurkishTitle(text?: string | null): string {
  if (!text) return '';
  const str = String(text).trim();
  if (!str) return '';

  return str
    .toLocaleLowerCase('tr-TR')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      if (word.length === 0) return '';
      // A.Ş. / LTD. / ŞTİ. gibi kısaltmaları koru
      if (word.includes('.') && word.length <= 4) {
        return word.toLocaleUpperCase('tr-TR');
      }
      return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
    })
    .join(' ');
}

/**
 * Arama teriminin hedef metin içerisinde Türkçe karakter duyarsız olarak
 * bulunup bulunmadığını kontrol eder.
 * Örn: "ziylan" araması "ZİYLAN TABAN A.Ş." ile eşleşir.
 * Örn: "istanbul" araması "İSTANBUL" ile eşleşir.
 * Örn: "ışık" araması "IŞIK" ile eşleşir.
 */
export function turkishIncludes(source?: string | null, query?: string | null): boolean {
  if (!query) return true;
  if (!source) return false;

  const normalizedSource = toTurkishLower(source);
  const normalizedQuery = toTurkishLower(query).trim();

  if (!normalizedQuery) return true;
  return normalizedSource.includes(normalizedQuery);
}

/**
 * İki Türkçe metni alfabetik olarak sıralar.
 */
export function turkishCompare(a?: string | null, b?: string | null): number {
  const strA = a || '';
  const strB = b || '';
  return strA.localeCompare(strB, 'tr-TR', { sensitivity: 'base' });
}

/**
 * Bozulmuş Türkçe karakter dizilerini onarır (Örn: 'zİylan' -> 'ZİYLAN' veya 'Ziylan')
 */
export function sanitizeTurkishText(text?: string | null): string {
  if (!text) return '';
  let str = String(text);
  // 'zİ' gibi küçük harf ardına gelen büyük İ bozulmalarını onar
  str = str.replace(/([a-zğüşıöç])İ/g, '$1i');
  str = str.replace(/([a-zğüşıöç])I/g, '$1ı');
  return str.trim();
}
