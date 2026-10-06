/**
 * Electron geliştirme modu.
 *
 *   1. `npm run dev` ile tam geliştirme sunucusunu (tsx server.ts + Vite HMR)
 *      ayrı süreç olarak başlatır.
 *   2. /api/health hazır olana dek bekler.
 *   3. Electron'u PROERP_DEV_URL ile açar; main.cjs geliştirme kipini tanır.
 *   4. Electron kapandığında sunucu sürecini de düzgün kapatır.
 *
 * Kullanım: npm run electron:dev
 */
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEV_PORT = Number(process.env.PROERP_DEV_PORT || 5173);
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;

// Windows'ta npm aslında npm.cmd'dir; Node 24 shell'siz .cmd spawn'ını
// reddeder (EINVAL). cmd kabuğu üzerinden ve yalnız sabit argümanlarla çalıştırılır.
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const shellOpt = process.platform === 'win32';

function log(msg) {
  console.log(`[electron-dev] ${msg}`);
}

function healthReady() {
  return new Promise((resolve) => {
    const req = http.get(`${DEV_URL}/api/health`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await healthReady()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const server = spawn(npmCmd, ['run', 'dev'], {
  cwd: root,
  env: { ...process.env, PORT: String(DEV_PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: shellOpt,
});
server.stdout.on('data', (c) => process.stdout.write(`[server] ${c}`));
server.stderr.on('data', (c) => process.stderr.write(`[server] ${c}`));

let electron = null;
function shutdown(code) {
  if (electron && !electron.killed) electron.kill();
  if (server && !server.killed) {
    // Windows'ta npm.cmd ağacı: /T ile tüm alt süreçler sonlandırılır.
    const kill = spawn(process.platform === 'win32' ? 'taskkill' : 'kill',
      process.platform === 'win32' ? ['/PID', String(server.pid), '/T', '/F'] : [String(server.pid)],
      { stdio: 'ignore' });
    kill.on('close', () => process.exit(code));
    kill.on('error', () => process.exit(code));
    return;
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

log(`Geliştirme sunucusu bekleniyor: ${DEV_URL}`);
const ok = await waitForServer();
if (!ok) {
  log('HATA: Geliştirme sunucusu zamanında hazır olmadı (DB ayarlarını kontrol edin).');
  shutdown(1);
}

log('Sunucu hazır; Electron başlatılıyor...');
electron = spawn(npmCmd, ['exec', '--', 'electron', '.'], {
  cwd: root,
  env: { ...process.env, PROERP_DEV_URL: DEV_URL },
  stdio: 'inherit',
  shell: shellOpt,
});
electron.on('exit', (code) => {
  log(`Electron kapandı (code=${code}).`);
  shutdown(code ?? 0);
});
