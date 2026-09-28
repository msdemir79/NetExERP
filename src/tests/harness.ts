/**
 * Faz 3/4 test harness'ı (item 5, 6, 10).
 *
 * Oturumlar sunucu sürecinde in-memory tutulduğu için (server/auth.ts → Map),
 * harici bir istemci dev sunucuya geçerli bir token üretemez. Bu harness aynı
 * süreç içinde ephemeral bir Express sunucusu başlatır ve `createSession` ile
 * doğrudan geçerli bir oturum mint eder; böylece gerçek HTTP + gerçek DB +
 * gerçek RBAC/op yolu üzerinden test koşabilir (parola gerekmez).
 *
 * Testler canlı veritabanına karşı koşar ve 'TEST-FAZ3'/'TEST-FAZ4' işaretli
 * veri bırakabilir; proje tamamlandığında DB sıfırlanacaktır.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import type { AddressInfo } from 'node:net';
import { createApiRouter } from '../../server/api.js';
import { createSession } from '../../server/auth.js';

export interface TestServer {
  baseUrl: string;
  token: string;
  close: () => Promise<void>;
}

/** Ephemeral portta, mint edilmiş super_admin oturumuyla bir test sunucusu başlatır. */
export async function startTestServer(userId = 1): Promise<TestServer> {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));
  app.use('/api', createApiRouter());
  // Router kendi hata middleware'ine sahip; yine de yakalanmayanlar için yedek.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (!res.headersSent) res.status(status).json({ error: err?.message || 'Sunucu hatası.', code: err?.code });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const session = createSession({ userId, ip: '127.0.0.1', userAgent: 'proerp-test-harness' });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    token: session.token,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface ApiResponse<T = any> {
  status: number;
  data: T | null;
  text: string;
}

/** Authorization: Bearer <token> ile bir API isteği yapar ve JSON'u çözer. */
export async function api<T = any>(
  srv: TestServer,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const res = await fetch(`${srv.baseUrl}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${srv.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data, text };
}

/** Eşzamanlılık sınırlı bir iş havuzu çalıştırır; her öğe için ms cinsinden gecikme toplar. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<{ latencies: number[]; errors: number; durationMs: number; total: number }> {
  const latencies: number[] = [];
  let errors = 0;
  let cursor = 0;
  const start = Date.now();

  async function lane(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      const t0 = performance.now();
      try {
        await worker(items[i], i);
      } catch {
        errors++;
      }
      latencies.push(performance.now() - t0);
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: lanes }, () => lane()));
  return { latencies, errors, durationMs: Date.now() - start, total: items.length };
}

/** Yüzdelik dilim (p50/p95/p99 vb.). Boş dizide 0 döner. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function summarizeLatency(latencies: number[]): {
  min: number; avg: number; p50: number; p90: number; p95: number; p99: number; max: number;
} {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0] ?? 0,
    avg: sorted.length ? sum / sorted.length : 0,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}
