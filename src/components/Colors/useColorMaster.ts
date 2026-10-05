import { useCallback, useMemo } from 'react';
import { api } from '../../api/client';
import { useApiQuery } from '../../hooks/useApiQuery';
import type { ColorMaster } from '../../types';

/** Türkçe büyük/küçük harf katlaması: siyah = SİYAH = Siyah. */
export function foldColorName(value?: string | null): string {
  return (value || '').trim().toLocaleUpperCase('tr').replace(/İ/g, 'I');
}

/**
 * Merkezi renk kartları (tüm kayıtlar, pasifler dahil). Pasif renkler yeni
 * seçimde listelenmez ama mevcut bir kayıtta seçiliyse adı kaybolmaz.
 */
export function useColorMaster(): ColorMaster[] {
  return useApiQuery(() => api.colors.list({ orderBy: 'name', orderDir: 'asc' }), [], ['colors']) ?? [];
}

/**
 * Renk ADI → merkezî kart HEX çözücüsü. Belge satırları, raporlar ve barkod
 * ekranları tarihsel olarak renk metni tutar; gerçek HEX buradan bulunur, kartı
 * olmayan eski kayıtlar için `undefined` döner (çağıran palet yedeğine düşer).
 */
export function useColorHexByName(): (name?: string | null) => string | undefined {
  const colors = useColorMaster();
  const hexByName = useMemo(() => {
    const map = new Map<string, string>();
    colors.forEach((c) => {
      const key = foldColorName(c.name);
      if (key && c.hexCode && !map.has(key)) map.set(key, c.hexCode);
    });
    return map;
  }, [colors]);

  return useCallback((name?: string | null) => {
    const key = foldColorName(name);
    return key ? hexByName.get(key) : undefined;
  }, [hexByName]);
}
