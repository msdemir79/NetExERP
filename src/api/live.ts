import type { Id } from './client';

export interface ChangeEvent {
  resource: string;
  action: 'create' | 'update' | 'delete' | 'seed' | 'refresh';
  ids?: Id[];
}

type Listener = (ev: ChangeEvent) => void;

const listeners = new Set<Listener>();
let source: EventSource | null = null;
let started = false;

function emit(ev: ChangeEvent) {
  for (const listener of Array.from(listeners)) {
    try {
      listener(ev);
    } catch (err) {
      console.error('Canlı güncelleme dinleyicisi hata verdi:', err);
    }
  }
}

function ensureStarted() {
  if (started) return;
  started = true;
  try {
    source = new EventSource('/api/events');
    source.onmessage = (e) => {
      if (!e.data) return;
      try {
        const parsed = JSON.parse(e.data) as ChangeEvent;
        if (parsed && parsed.resource) emit(parsed);
      } catch {
        // yok sayılır: ping veya bozuk mesaj
      }
    };
    source.onerror = () => {
      // EventSource kendini otomatik yeniden bağlar; burada kapatmıyoruz.
    };
  } catch (err) {
    console.error('SSE bağlantısı kurulamadı:', err);
  }
}

/** Sunucudaki veri değişikliklerine abone olur. Dönen fonksiyon aboneliği iptal eder. */
export function subscribe(listener: Listener): () => void {
  ensureStarted();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Verilen kaynaklardan biri (veya genel bir yenileme) geldiğinde tetiklenecek abonelik. */
export function subscribeResources(resources: string[] | undefined, listener: () => void): () => void {
  if (!resources || resources.length === 0) {
    return subscribe(() => listener());
  }
  const wanted = new Set(resources);
  return subscribe((ev) => {
    if (ev.action === 'refresh' || wanted.has(ev.resource)) listener();
  });
}

export function closeLiveConnection() {
  if (source) {
    source.close();
    source = null;
  }
  started = false;
}
