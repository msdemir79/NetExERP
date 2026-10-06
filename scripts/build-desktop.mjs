/**
 * Masaüstü paketi hazırlama (electron-builder öncesi sahnelama).
 *
 * Adımlar:
 *   1. npm run build → dist/ (vite arayüz + esbuild server.cjs)
 *   2. electron-build/backend/ klasörünü sıfırdan kur:
 *        - server.cjs (+ harita)          → fork ile çalışacak Node süreci
 *        - web/                            → React üretim derlemesi (STATIC_DIR)
 *        - schema.sql + migrations/        → ilk kurulum sihirbazı için
 *        - package.json (express/mysql2/dotenv) + npm install --omit=dev
 *   3. electron-builder devreyi girer (dist script'i).
 *
 * Kullanım: node scripts/build-desktop.mjs
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const staging = path.join(root, 'electron-build', 'backend');

function log(msg) {
  console.log(`[build-desktop] ${msg}`);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} → çıkış kodu ${res.status}`);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.vite') continue; // vite build önbelleği pakete girmez
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.rmSync(path.join(root, 'electron-build'), { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

log('1/4 Arayüz ve sunucu derlemesi (npm run build)...');
run('npm', ['run', 'build'], { cwd: root });

const dist = path.join(root, 'dist');
if (!fs.existsSync(path.join(dist, 'server.cjs'))) {
  throw new Error('dist/server.cjs üretilmedi; derleme başarısız.');
}

log('2/4 Backend sahnelemesi: server.cjs, web/, şema, migrasyonlar...');
fs.copyFileSync(path.join(dist, 'server.cjs'), path.join(staging, 'server.cjs'));
const map = path.join(dist, 'server.cjs.map');
if (fs.existsSync(map)) fs.copyFileSync(map, path.join(staging, 'server.cjs.map'));
copyDir(dist, path.join(staging, 'web'));
fs.rmSync(path.join(staging, 'web', 'server.cjs'), { force: true });
fs.rmSync(path.join(staging, 'web', 'server.cjs.map'), { force: true });

fs.copyFileSync(path.join(root, 'db', 'schema.sql'), path.join(staging, 'schema.sql'));
fs.mkdirSync(path.join(staging, 'migrations'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'db', 'migrations'))) {
  if (f.endsWith('.sql')) {
    fs.copyFileSync(path.join(root, 'db', 'migrations', f), path.join(staging, 'migrations', f));
  }
}

log('3/4 Backend çalışma zamanı bağımlılıkları (express, mysql2, dotenv)...');
const backendPkg = {
  name: 'proerp-backend',
  version: pkg.version,
  private: true,
  description: 'ProERP masaüstü paketi yerel sunucusu',
  main: 'server.cjs',
  dependencies: {
    express: pkg.dependencies.express,
    mysql2: pkg.dependencies.mysql2,
    dotenv: pkg.dependencies.dotenv,
  },
};
fs.writeFileSync(path.join(staging, 'package.json'), JSON.stringify(backendPkg, null, 2));
run('npm', ['install', '--omit=dev', '--omit=optional', '--no-audit', '--no-fund'], { cwd: staging });

log('4/4 Sahneleme tamamlandı: electron-build/backend');
console.log('[build-desktop] Şimdi installer için: npm run dist');
