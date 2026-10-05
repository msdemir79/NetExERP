import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';

export interface PopoverOptions {
  /** Panelin asgari genişliği; tetikleyici daha genişse onun genişliği kullanılır. */
  width: number;
  maxHeight: number;
  /** Tetikleyici ile panel arası boşluk (px). */
  gap?: number;
  /** 'end' = panelin sağ kenarı tetikleyicinin sağ kenarına hizalanır (satır içi menüler). */
  align?: 'start' | 'end';
}

export interface PopoverState {
  panelRef: React.RefObject<HTMLDivElement | null>;
  style: React.CSSProperties | null;
}

/**
 * Sabit konumlu açılır panel. Konum tetikleyiciye göre hesaplanır, altta yer
 * dar ise panel üste doğru açılır; ekran kenarlarına çarpmaz.
 *
 * Dışarı tıklama, ESC, pencere boyutu değişimi ve panel dışındaki kaydırma
 * paneli kapatır. Panelin kendi listesinin kayması konumu değiştirmediği için
 * kapatmaz (capture fazındaki scroll dinleyicisi tüm alt öğeleri de görür).
 * ESC'te olay yayılımı kesilir ki panel bir modalın içindeyse alttaki modal
 * da kapanmasın.
 */
export function usePopover(
  triggerRef: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  { width, maxHeight, gap = 4, align = 'start' }: PopoverOptions,
): PopoverState {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!isOpen) {
      setStyle(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = Math.max(rect.width, width);
    const preferredLeft = align === 'end' ? rect.right - panelWidth : rect.left;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - panelWidth - 8));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < maxHeight && rect.top > spaceBelow;
    setStyle({
      position: 'fixed',
      left,
      width: panelWidth,
      maxHeight,
      ...(openUpward ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap }),
    });
  }, [isOpen, triggerRef, width, maxHeight, gap, align]);

  useEffect(() => {
    if (!isOpen) return;
    const close = () => closeRef.current();
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    const onMove = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [isOpen, triggerRef]);

  return { panelRef, style };
}
