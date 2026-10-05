/**
 * Common shoe & material color swatches shared across reports, lists and selectors.
 */

const COLOR_PALETTE: { [key: string]: { bg: string; border: string; textDark?: boolean } } = {
  'siyah': { bg: '#0f172a', border: '#334155' },
  'black': { bg: '#0f172a', border: '#334155' },
  'beyaz': { bg: '#ffffff', border: '#cbd5e1', textDark: true },
  'white': { bg: '#ffffff', border: '#cbd5e1', textDark: true },
  'taba': { bg: '#b45309', border: '#92400e' },
  'tan': { bg: '#b45309', border: '#92400e' },
  'kahve': { bg: '#78350f', border: '#451a03' },
  'kahverengi': { bg: '#78350f', border: '#451a03' },
  'brown': { bg: '#78350f', border: '#451a03' },
  'lacivert': { bg: '#1e3a8a', border: '#172554' },
  'navy': { bg: '#1e3a8a', border: '#172554' },
  'haki': { bg: '#4d7c0f', border: '#365314' },
  'khaki': { bg: '#4d7c0f', border: '#365314' },
  'bordo': { bg: '#881337', border: '#4c0519' },
  'burgundy': { bg: '#881337', border: '#4c0519' },
  'gri': { bg: '#64748b', border: '#475569' },
  'grey': { bg: '#64748b', border: '#475569' },
  'gray': { bg: '#64748b', border: '#475569' },
  'bej': { bg: '#fef3c7', border: '#fde68a', textDark: true },
  'beige': { bg: '#fef3c7', border: '#fde68a', textDark: true },
  'vizon': { bg: '#a8a29e', border: '#78716c' },
  'antrasit': { bg: '#334155', border: '#1e293b' },
  'camel': { bg: '#d97706', border: '#b45309' },
  'kırmızı': { bg: '#dc2626', border: '#991b1b' },
  'red': { bg: '#dc2626', border: '#991b1b' },
  'mavi': { bg: '#2563eb', border: '#1d4ed8' },
  'blue': { bg: '#2563eb', border: '#1d4ed8' },
  'sarı': { bg: '#eab308', border: '#ca8a04', textDark: true },
  'yellow': { bg: '#eab308', border: '#ca8a04', textDark: true },
  'yeşil': { bg: '#16a34a', border: '#15803d' },
  'green': { bg: '#16a34a', border: '#15803d' },
  'ten': { bg: '#fed7aa', border: '#fdba74', textDark: true },
  'naturel': { bg: '#f5f5f4', border: '#e7e5e4', textDark: true }
};

/** Türkçe büyük/küçük harf farkını katlar: SIYAH = Siyah = siyah. */
function foldTurkishKey(value: string): string {
  return (value || '')
    .trim()
    .toLocaleUpperCase('tr')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');
}

const FOLDED_PALETTE = new Map<string, string>(
  Object.entries(COLOR_PALETTE).map(([key, value]) => [foldTurkishKey(key), value.bg.toUpperCase()]),
);

/**
 * Exact palette HEX for a color name, or null when the palette has no such entry.
 * Unlike getColorSwatch this never matches by contained keyword, so a non-null
 * result is safe to persist (data migrations rely on it not inventing values).
 */
export function getPaletteHex(colorName: string): string | null {
  const hex = FOLDED_PALETTE.get(foldTurkishKey(colorName));
  return hex && /^#[0-9A-F]{6}$/.test(hex) ? hex : null;
}

/**
 * Ürüne bağlı merkezî renk kartlarından (colorRefs) ada göre gerçek HEX'i bulur.
 * Liste/rapor ekranları renk ADI ile çalışmaya devam eder; kartı olmayan eski
 * kayıtlar için undefined döner ve çağıran palet yedeğine düşer.
 */
export function hexFromColorRefs(
  refs: { name?: string | null; hexCode?: string | null }[] | undefined | null,
  colorName?: string | null,
): string | undefined {
  if (!refs?.length || !colorName) return undefined;
  const key = foldTurkishKey(colorName);
  const hit = refs.find((ref) => foldTurkishKey(ref.name || '') === key);
  return hit?.hexCode || undefined;
}

/**
 * Resolve a swatch for a color name (exact match first, then longest contained keyword).
 */
export function getColorSwatch(colorName: string): { bg: string; border: string; textDark?: boolean } {
  const key = (colorName || '').toLowerCase().trim();
  if (COLOR_PALETTE[key]) return COLOR_PALETTE[key];

  let bestKey: string | null = null;
  for (const paletteKey of Object.keys(COLOR_PALETTE)) {
    if (key.includes(paletteKey) && (!bestKey || paletteKey.length > bestKey.length)) {
      bestKey = paletteKey;
    }
  }
  return bestKey ? COLOR_PALETTE[bestKey] : { bg: '#e2e8f0', border: '#cbd5e1', textDark: true };
}

/**
 * Format a per-color stock quantity as koli (when a koli size is defined) or as pieces.
 */
export function formatColorQty(stock: number, koliSize: number, unit: string): string {
  if (koliSize > 1) {
    const boxes = stock / koliSize;
    return `${Number.isInteger(boxes) ? boxes : boxes.toFixed(1)} Koli`;
  }
  return `${stock} ${unit}`;
}
