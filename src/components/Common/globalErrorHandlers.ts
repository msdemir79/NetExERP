import { showToast } from '../../lib/feedback';

/**
 * React ağacının DIŞINDA oluşan hataları görünür kılar.
 *
 * DURUM NOTU (C1 ile ilişkili): Projede `@types/react` / `@types/react-dom`
 * kurulu değildir, bu yüzden `Component` tabanlı bir hata sınırı derlenemiyor
 * (`this.props` / `this.setState` tiplenmiyor). Gerçek render-hatası sınırı,
 * tipler kurulduktan sonra buraya eklenecektir. O zamana kadar en sık karşılaşılan
 * sessiz hata sınıfı burada kapatılır:
 *
 *   • `window.onerror`      → render dışı senkron hatalar
 *   • `unhandledrejection`  → `.catch()`'siz promise redleri (H5 sınıfı)
 *
 * Böylece kullanıcı sessiz bir beyaz ekran / donmuş spinner yerine ne olduğunu
 * gösteren bir bildirim alır. `main.tsx` içinde bir kez kurulur.
 */
export function installGlobalErrorHandlers(): () => void {
  // Aynı hatayı kısa sürede tekrar tekrar bildirmemek için tekilleştirme.
  const seenAt = new Map<string, number>();
  const WINDOW_MS = 8000;

  const report = (prefix: string, value: unknown) => {
    const message = value instanceof Error ? value.message : String(value ?? '');
    const text = message ? `${prefix}: ${message}` : prefix;
    const now = Date.now();
    const last = seenAt.get(text);
    if (last !== undefined && now - last < WINDOW_MS) return;
    seenAt.set(text, now);
    if (seenAt.size > 50) {
      for (const [key, at] of seenAt) {
        if (now - at > WINDOW_MS) seenAt.delete(key);
      }
    }
    console.error('[global]', text, value);
    showToast(text, 'error');
  };

  const onError = (event: ErrorEvent) => {
    report('Beklenmeyen hata', event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    report('İşlem tamamlanamadı', event.reason);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
