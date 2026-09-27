/**
 * Canlı güncelleme kanalı (Server-Sent Events).
 *
 * Ayrı modül olmasının nedeni: hem api.ts (generic CRUD/commit) hem de
 * businessOps.ts (atomik finans/stok uçları) döngüsel import oluşturmadan
 * `broadcast` yayımlayabilsin.
 */
import type { Request, Response } from 'express';

type SseClient = { id: number; res: Response };

const sseClients = new Set<SseClient>();
let sseSeq = 0;

export function broadcast(resource: string, action: 'create' | 'update' | 'delete' | 'seed' | 'refresh', ids: (number | string)[] = []) {
  const payload = `data: ${JSON.stringify({ resource, action, ids, at: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function sseHandler(req: Request, res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`retry: 3000\n\n`);
  res.write(`data: ${JSON.stringify({ resource: '*', action: 'refresh', ids: [], at: Date.now() })}\n\n`);

  const client: SseClient = { id: ++sseSeq, res };
  sseClients.add(client);

  const ping = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* kapanmış bağlantı */
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients.delete(client);
  });
}
