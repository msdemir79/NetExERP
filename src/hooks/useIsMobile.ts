import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Tailwind `md` kırılımının (768px) altını veya yerel mobil uygulamayı (Capacitor) "mobil" sayar.
 * Layout bileşenleri masaüstü tablo yerine mobil kart düzeni gibi farklı görünümler seçmek için kullanır.
 */
export function useIsMobile(breakpointPx = 768): boolean {
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();
  const query = `(max-width: ${breakpointPx - 1}px)`;
  const [isMobile, setIsMobile] = useState(() =>
    isNative || (typeof window !== 'undefined' ? window.matchMedia(query).matches : false)
  );

  useEffect(() => {
    if (isNative) {
      setIsMobile(true);
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query, isNative]);

  return isMobile;
}
