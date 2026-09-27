import type { Account } from '../../types';
import type { PillTone } from '../Common/DataGrid';

// Map class digit to Account Group name (matching standard TDHP)
export const GROUP_NAMES: Record<string, string> = {
  '1': '1 DÖNEN VARLIKLAR',
  '2': '2 DURAN VARLIKLAR',
  '3': '3 KISA VADELİ YABANCI KAYNAKLAR',
  '4': '4 UZUN VADELİ YABANCI KAYNAKLAR',
  '5': '5 ÖZKAYNAKLAR',
  '6': '6 GELİR TABLOSU HESAPLARI',
  '7': '7 MALİYET HESAPLARI (7/A SEÇENEĞİ)',
  '8': '8 SERBEST HESAPLAR',
  '9': '9 NAZIM HESAPLARI',
};

export const LEVEL_META: Record<number, { tone: PillTone; label: string }> = {
  1: { tone: 'slate', label: '1: Sınıf' },
  2: { tone: 'cyan', label: '2: Grup' },
  3: { tone: 'green', label: '3: Ana' },
  4: { tone: 'violet', label: '4: Alt' },
  5: { tone: 'amber', label: '5: Muavin' },
};

// Get TDHP account group name from the account code / type
export function getAccountGroup(acc: Account): string {
  const firstChar = acc.code.charAt(0);
  if (GROUP_NAMES[firstChar]) return GROUP_NAMES[firstChar];
  return acc.type === 'asset' ? '1 DÖNEN VARLIKLAR' :
         acc.type === 'liability' ? '3 KISA VADELİ YABANCI KAYNAKLAR' :
         acc.type === 'equity' ? '5 ÖZKAYNAKLAR' :
         acc.type === 'revenue' ? '6 GELİR TABLOSU' :
         acc.type === 'cost' ? '7 MALİYET HESAPLARI' : 'DİĞER';
}
