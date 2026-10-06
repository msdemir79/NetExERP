'use strict';

/**
 * ProERP Electron ana süreci (main process).
 *
 * Mimari:
 *   Electron (bu dosya)
 *     ├── Backend: child_process.fork ile ayrı Node süreci olarak dist/server.cjs
 *     │     (ELECTRON_RUN_AS_NODE=1; Express + MySQL; http://127.0.0.1:<port>)
 *     └── Arayüz: React üretim derlemesi backend üzerinden yüklenir (aynı kaynak;
 *           oturum çerezi, SSE, CSRF ve CSP davranışı web dağıtımıyla birebir aynı).
 *
 * İlk çalıştırmada yapılandırma yoksa kurulum sihirbazı (setup.html) açılır;
 * yapılandırma %APPDATA%/ProERP/config.json içinde tutulur — renderer'a asla
 * sızmaz, yalnızca sihirbaz penceresine (file:// kaynaklı) IPC ile verilir.
 */

const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { fork, spawnSync } = require('child_process');

const APP_ID = 'com.dmrayakabi.proerp';
const DEFAULT_PORT = 3000;
const HEALTH_TIMEOUT_MS = 45_000;
const HEALTH_INTERVAL_MS = 400;
const BACKEND_SHUTDOWN_TIMEOUT_MS = 12_000;

/* ------------------------------------------------------------------ */
/* Ortam ve yollar                                                      */
/* ------------------------------------------------------------------ */

const isDev = !app.isPackaged;
const DEV_URL = process.env.PROERP_DEV_URL || '';
const SMOKE_TEST = process.env.PROERP_SMOKE === '1';
// E2E güncelleme testi: '1' (denetle+indir+kur), 'download' (kurulum hariç).
const UPDATE_SMOKE_MODE = process.env.PROERP_UPDATE_SMOKE || '';
// E2E testi: güncellemeyi GitHub yerine yerel generic sunucudan dene.
const UPDATE_FEED_OVERRIDE = process.env.PROERP_UPDATE_FEED || '';

function backendDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'backend') : path.join(__dirname, '..');
}

function dbSchemaPath() {
  return app.isPackaged ? path.join(backendDir(), 'schema.sql') : path.join(backendDir(), 'db', 'schema.sql');
}

function dbMigrationsDir() {
  return app.isPackaged ? path.join(backendDir(), 'migrations') : path.join(backendDir(), 'db', 'migrations');
}

const userDataDir = () => app.getPath('userData');
const configPath = () => path.join(userDataDir(), 'config.json');
const logsDir = () => path.join(userDataDir(), 'logs');
const uploadDir = () => path.join(userDataDir(), 'data', 'uploads');
const iconPath = () => path.join(__dirname, 'icon.png');

/** mysql2: paketlenmiş uygulamada asar dışındaki backend/node_modules'ten yüklenir. */
let mysqlPromise = null;
function loadMysql() {
  if (!mysqlPromise) {
    mysqlPromise = new Promise((resolve, reject) => {
      try {
        resolve(require('mysql2/promise'));
      } catch {
        try {
          resolve(require(path.join(backendDir(), 'node_modules', 'mysql2', 'promise')));
        } catch (err) {
          reject(err);
        }
      }
    });
  }
  return mysqlPromise;
}

/* ------------------------------------------------------------------ */
/* Günlük (log) sistemi — %APPDATA%/ProERP/logs                        */
/* ------------------------------------------------------------------ */

function rotateIfNeeded(file, maxBytes = 5 * 1024 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > maxBytes) {
      try { fs.rmSync(`${file}.1`); } catch { /* yok */ }
      fs.renameSync(file, `${file}.1`);
    }
  } catch { /* dosya henüz yok */ }
}

function appendLine(file, line) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    rotateIfNeeded(file);
    fs.appendFileSync(file, line);
  } catch (err) {
    if (isDev) console.error('Log yazılamadı:', err?.message || err);
  }
}

function log(...parts) {
  const line = `${new Date().toISOString()} ${parts.join(' ')}\n`;
  appendLine(path.join(logsDir(), 'main.log'), line);
  if (isDev) process.stdout.write(`[main] ${line}`);
}

const backendLogPath = () => path.join(logsDir(), 'backend.log');

function logBackend(chunk) {
  appendLine(backendLogPath(), chunk);
}

function backendLogTail(maxChars = 4000) {
  try {
    const content = fs.readFileSync(backendLogPath(), 'utf8');
    return content.length > maxChars ? content.slice(-maxChars) : content;
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* Yapılandırma — %APPDATA%/ProERP/config.json                         */
/* ------------------------------------------------------------------ */

const DB_NAME_RE = /^[A-Za-z0-9_]+$/;
const HOST_RE = /^[A-Za-z0-9._-]+$/;

function defaultConfig() {
  return {
    mode: 'local',
    port: DEFAULT_PORT,
    remoteUrl: '',
    db: { host: 'localhost', port: 3306, name: 'proerp', user: 'proerp', password: '' },
    seedPassword: '',
    seedShown: false,
  };
}

function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const cfg = defaultConfig();
  if (raw.mode === 'remote') {
    cfg.mode = 'remote';
    let url = String(raw.remoteUrl || '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
    let parsed = null;
    try { parsed = new URL(url); } catch { return null; }
    if (!/^https?:$/.test(parsed.protocol)) return null;
    cfg.remoteUrl = parsed.origin;
  } else {
    cfg.mode = 'local';
    const db = raw.db && typeof raw.db === 'object' ? raw.db : {};
    cfg.db.host = String(db.host || 'localhost').trim() || 'localhost';
    cfg.db.port = Number(db.port) > 0 && Number(db.port) < 65536 ? Math.floor(Number(db.port)) : 3306;
    cfg.db.name = String(db.name || 'proerp').trim();
    cfg.db.user = String(db.user || '').trim();
    cfg.db.password = String(db.password ?? '');
    if (!HOST_RE.test(cfg.db.host) || !DB_NAME_RE.test(cfg.db.name) || !cfg.db.user) return null;
    const port = Number(raw.port);
    cfg.port = port > 0 && port < 65536 ? Math.floor(port) : DEFAULT_PORT;
    cfg.seedPassword = String(raw.seedPassword || '');
  }
  cfg.seedShown = Boolean(raw.seedShown);
  return cfg;
}

function loadConfig() {
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(configPath(), 'utf8')));
  } catch {
    return null;
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(userDataDir(), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
  log('Yapılandırma kaydedildi (parola loglanmaz).');
}

/** Log'a parolayı asla yazmamak için maskeleme. */
function describeConfig(cfg) {
  if (!cfg) return '(yok)';
  if (cfg.mode === 'remote') return `uzak sunucu: ${cfg.remoteUrl}`;
  return `yerel; db=${cfg.db.user}@${cfg.db.host}:${cfg.db.port}/${cfg.db.name} port=${cfg.port}`;
}

/* ------------------------------------------------------------------ */
/* Durum                                                                */
/* ------------------------------------------------------------------ */

let mainWindow = null;
let setupWindow = null;
let errorWindow = null;
let splashWindow = null;
let backend = null;
let backendUrl = '';
let currentConfig = null;
let appQuitting = false;
let bootToken = 0;
let lastError = null;
let seedCredentialsBlock = '';

/* ------------------------------------------------------------------ */
/* Otomatik güncelleme (electron-updater, GitHub Releases)              */
/*                                                                     */
/* Akış: paketli sürümde açılışta arka planda denetim → yeni sürüm     */
/* varsa kullanıcıya seçenek sunulur (zorunlu değil) → indirme devam   */
/* ederken uygulama kullanılabilir → indirilince "Şimdi Yeniden         */
/* Başlat" ile backend zarif kapanışı + kurulum + yeni sürüm başlar.   */
/* Denetim hatası (çevrimdışı vb.) uygulamayı ASLA engellemez.         */
/* ------------------------------------------------------------------ */

let autoUpdater = null;
let updateState = { status: 'idle' };
let updateDialogShown = false;
let startupCheckDone = false;

function updatesEnabled() {
  // Geliştirme ortamında gereksiz güncelleme denetimi yapılmaz.
  return app.isPackaged || UPDATE_SMOKE_MODE !== '';
}

function normalizeReleaseNotes(info) {
  const raw = info?.releaseNotes;
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    return raw.map((r) => String(r?.note ?? r ?? '').trim()).filter(Boolean).join('\n');
  }
  if (typeof raw === 'object') return String(raw.note ?? '').trim();
  return '';
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch, at: new Date().toISOString() };
  log('Güncelleme durumu:', JSON.stringify(updateState));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:state', updateState);
  }
}

async function checkForUpdates() {
  if (!autoUpdater) return { ok: false, error: 'Güncellemeler bu ortamda etkin değil.' };
  updateDialogShown = false;
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    const message = err?.message || String(err);
    setUpdateState({ status: 'error', message });
    return { ok: false, error: message };
  }
}

function safeDownloadUpdate() {
  if (!autoUpdater) return { ok: false, error: 'Güncellemeler bu ortamda etkin değil.' };
  if (updateState.status === 'downloading' || updateState.status === 'downloaded') return { ok: true };
  setUpdateState({ status: 'downloading', percent: 0 });
  autoUpdater.downloadUpdate().catch((err) => {
    setUpdateState({ status: 'error', message: err?.message || String(err) });
  });
  return { ok: true };
}

async function installUpdateNow() {
  if (!autoUpdater || updateState.status !== 'downloaded') {
    return { ok: false, error: 'İndirilmiş bir güncelleme yok.' };
  }
  // before-quit normalde preventDefault + app.exit(0) yapar; app.exit,
  // quitAndInstall'in başlattığı NSIS kurulumunu atlayıp yeni sürümün
  // kurulmasını engeller. Bu yüzden appQuitting'i ÖNCE set edip backend'i
  // burada zarifçe durduruyoruz; before-quit artık müdahale etmez.
  appQuitting = true;
  log('Güncelleme kuruluyor; backend durduruluyor...');
  await stopBackend();
  autoUpdater.quitAndInstall(true, true);
  return { ok: true };
}

function handleUpdateAvailable(info) {
  setUpdateState({
    status: 'available',
    version: info?.version || '',
    releaseDate: info?.releaseDate || '',
    releaseNotes: normalizeReleaseNotes(info),
  });
  if (UPDATE_SMOKE_MODE) {
    autoUpdater.downloadUpdate().catch((err) => log('İndirme başlatılamadı:', err?.message || err));
    return;
  }
  if (updateDialogShown || !mainWindow || mainWindow.isDestroyed()) return;
  updateDialogShown = true;
  const detail = [
    `Mevcut sürüm: ${app.getVersion()}`,
    `Yeni sürüm: ${info?.version || ''}`,
    '',
    normalizeReleaseNotes(info) || 'Sürüm notları için Ayarlar → Sistem ekranına bakabilirsiniz.',
  ].join('\n');
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: 'ProERP Güncellemesi',
      message: 'Yeni ProERP sürümü bulundu.',
      detail,
      buttons: ['Güncellemeyi İndir', 'Daha Sonra'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    .then(({ response }) => {
      if (response === 0) safeDownloadUpdate();
    })
    .catch(() => { /* pencere kapandı */ });
}

function initAutoUpdater() {
  if (!updatesEnabled()) return;
  let updater;
  try {
    updater = require('electron-updater');
  } catch (err) {
    log('electron-updater yüklenemedi (güncellemeler devre dışı):', err?.message || err);
    return;
  }
  autoUpdater = updater.autoUpdater;
  autoUpdater.autoDownload = false; // indirme kullanıcı onayına bağlı
  autoUpdater.autoInstallOnAppQuit = false; // yeniden başlatma kullanıcıya kalmış
  if (UPDATE_FEED_OVERRIDE) {
    autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_OVERRIDE });
  }

  autoUpdater.on('checking-for-update', () => setUpdateState({ status: 'checking' }));
  autoUpdater.on('update-available', handleUpdateAvailable);
  autoUpdater.on('update-not-available', (info) => {
    setUpdateState({ status: 'not-available', version: info?.version || app.getVersion() });
    if (UPDATE_SMOKE_MODE) {
      log(`SMOKE: UPDATE-NOT-AVAILABLE PASS — güncel (${info?.version || app.getVersion()})`);
      app.quit();
    }
  });
  autoUpdater.on('download-progress', (p) => {
    const percent = Math.max(0, Math.min(100, Math.round(p?.percent || 0)));
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(p?.percent > 0 ? p.percent / 100 : 0.01);
    }
    setUpdateState({
      status: 'downloading',
      percent,
      transferred: p?.transferred || 0,
      total: p?.total || 0,
      bytesPerSecond: p?.bytesPerSecond || 0,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setProgressBar(-1);
    setUpdateState({
      status: 'downloaded',
      version: info?.version || '',
      releaseDate: info?.releaseDate || '',
      releaseNotes: normalizeReleaseNotes(info),
    });
    if (UPDATE_SMOKE_MODE) {
      // Bütünlük doğrulaması (SHA-512 + blockmap) geçildi.
      log(`SMOKE: UPDATE-DOWNLOADED PASS — v${info?.version} indirildi ve doğrulandı.`);
      if (UPDATE_SMOKE_MODE === 'download') {
        app.quit();
      } else {
        installUpdateNow();
      }
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) return;
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'ProERP Güncellemesi',
        message: 'Yeni sürüm hazır.',
        detail: `ProERP ${info?.version || ''} indirildi.\n"Şimdi Yeniden Başlat" derseniz güncelleme otomatik uygulanır; manuel kurulum dosyası çalıştırmanız gerekmez.`,
        buttons: ['Şimdi Yeniden Başlat', 'Daha Sonra'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 0) installUpdateNow();
      })
      .catch(() => { /* pencere kapandı */ });
  });
  autoUpdater.on('error', (err) => {
    // Çevrimdışı / sunucuya ulaşılamıyor: ERP çalışmaya devam eder.
    setUpdateState({ status: 'error', message: err?.message || String(err) });
  });
}

function scheduleStartupUpdateCheck() {
  if (!autoUpdater || startupCheckDone) return;
  startupCheckDone = true;
  // Uygulama tam açıldıktan sonra arka planda denetle (spec: açılışı bloklamaz).
  setTimeout(() => {
    checkForUpdates().catch(() => { /* hata durumu event ile işlendi */ });
  }, 3000);
}

/* ------------------------------------------------------------------ */
/* HTTP yardımcıları                                                    */
/* ------------------------------------------------------------------ */

function httpGetJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch { /* bozuk gövde */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (err) => reject(err));
  });
}

/**
 * /api/health yanıtını bekler.
 *   200            → { ok: true }
 *   503 (db_error) → { ok: false, dbError }
 *   yanıt yok      → timeout'a dek yeniden dener
 */
async function waitForHealth(baseUrl, { timeoutMs = HEALTH_TIMEOUT_MS, onTick } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastNetworkError = null;
  while (Date.now() < deadline) {
    try {
      const res = await httpGetJson(`${baseUrl}/api/health`);
      if (res.status === 200 && res.json?.status === 'ok') return { ok: true };
      if (res.status === 503) return { ok: false, dbError: res.json?.database?.error || 'Veritabanı bağlantısı kurulamadı.' };
      lastNetworkError = `Beklenmeyen sağlık yanıtı (HTTP ${res.status})`;
    } catch (err) {
      lastNetworkError = err?.code === 'timeout' ? 'Zaman aşımı' : (err?.message || String(err));
    }
    if (onTick && Date.now() % 2000 < HEALTH_INTERVAL_MS) onTick();
    await new Promise((r) => setTimeout(r, HEALTH_INTERVAL_MS));
  }
  return { ok: false, timeout: true, error: lastNetworkError || 'Zaman aşımı' };
}

/* ------------------------------------------------------------------ */
/* Backend süreci                                                       */
/* ------------------------------------------------------------------ */

function checkPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

async function findFreePort(preferred) {
  for (let p = preferred; p < preferred + 50; p++) {
    if (await checkPortFree(p)) return p;
  }
  throw new Error(`Boş port bulunamadı (${preferred}-${preferred + 49}).`);
}

function stopBackend() {
  return new Promise((resolve) => {
    if (!backend) return resolve();
    const proc = backend;
    backend = null;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    proc.once('exit', finish);
    try { proc.send({ type: 'shutdown' }); } catch { /* kanal kapalı */ }
    setTimeout(() => {
      if (!done) {
        log('Backend zarif kapanış süresinde çıkmadı; süreç sonlandırılıyor.');
        try { proc.kill(); } catch { /* zaten çıkmış */ }
        setTimeout(finish, 1500);
      }
    }, BACKEND_SHUTDOWN_TIMEOUT_MS - 1500);
  });
}

async function startBackend(cfg) {
  const port = await findFreePort(cfg.port);
  if (port !== cfg.port) log(`Uyarı: ${cfg.port} portu meşgul; ${port} kullanılıyor.`);

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  Object.assign(env, {
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
    STATIC_DIR: path.join(backendDir(), 'web'),
    UPLOAD_DIR: uploadDir(),
    // Masaüstünde sunucu düz HTTP üzerinden yerel makinede çalıştığı için
    // Secure çerez bayrağı kapatılır (yoksa Chromium çerezi reddeder).
    COOKIE_SECURE: 'false',
    DB_HOST: cfg.db.host,
    DB_PORT: String(cfg.db.port),
    DB_USER: cfg.db.user,
    DB_PASSWORD: cfg.db.password,
    DB_NAME: cfg.db.name,
    SEED_USER_PASSWORD: cfg.seedPassword || '',
  });

  const entry = app.isPackaged ? path.join(backendDir(), 'server.cjs') : '';
  if (app.isPackaged && !fs.existsSync(entry)) {
    throw new Error('Backend bulunamadı (kurulum bozuk olabilir): ' + entry);
  }

  log(`Backend başlatılıyor: node ${app.isPackaged ? 'resources/backend/server.cjs' : '(geliştirme)'} port=${port}`);

  if (!app.isPackaged) {
    // Geliştirme: backend scripts/electron-dev.mjs tarafından ayrıca çalıştırılır.
    backend = null;
    return port;
  }

  seedCredentialsBlock = '';
  let seedCapturing = false;
  const child = fork(entry, [], {
    cwd: backendDir(),
    env,
    execPath: process.execPath,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  backend = child;

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      logBackend(`${line}\n`);
      // Seed parola bloğu: başlık satırı ile "geri döndürülemez" satırı arası.
      if (seedCapturing) {
        seedCredentialsBlock += `${line}\n`;
        if (line.includes('geri döndürülemez')) seedCapturing = false;
      } else if (line.includes('İlk giriş parolaları')) {
        seedCredentialsBlock = `${line}\n`;
        seedCapturing = true;
      }
    }
  });
  child.stderr.on('data', (chunk) => logBackend(chunk.toString('utf8')));
  child.on('exit', (code, signal) => {
    logBackend(`\n[backend çıkış: code=${code} signal=${signal}]\n`);
    log(`Backend süreci sonlandı (code=${code} signal=${signal}).`);
    if (backend === child) backend = null;
    if (!appQuitting && mainWindow) {
      showFatalError(
        'Sunucu beklenmedik şekilde durdu.',
        'Arka uç sunucusu çalışmayı kesti. Ayrıntılar için günlük kayıtlarına bakın.',
        true,
      );
    }
  });

  return port;
}

/* ------------------------------------------------------------------ */
/* Pencereler                                                           */
/* ------------------------------------------------------------------ */

const BASE_WEB_PREFS = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  spellcheck: false,
};

// IPC whitelist: her pencere tipi yalnız kendi preload'unu alır.
const PRELOAD_APP = path.join(__dirname, 'preload.cjs');
const PRELOAD_SETUP = path.join(__dirname, 'preload-setup.cjs');
const PRELOAD_SPLASH = path.join(__dirname, 'preload-splash.cjs');

function isAppUrl(target, base) {
  try {
    const u = new URL(target);
    const b = new URL(base);
    return u.origin === b.origin;
  } catch {
    return false;
  }
}

function applyWebContentGuards(contents, baseUrl) {
  contents.setWindowOpenHandler(({ url }) => {
    // Yazdırma pencereleri: blob: ve about:blank (printService deseni).
    if (url.startsWith('blob:') || url === 'about:blank' || isAppUrl(url, baseUrl)) {
      return { action: 'allow' };
    }
    log(`Pencere açma isteği reddedildi (dış adres): ${url}`);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, baseUrl)) {
      event.preventDefault();
      log(`Gezinme engellendi (dış adres): ${url}`);
    }
  });
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 280,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    center: true,
    show: true,
    backgroundColor: '#0f172a',
    icon: iconPath(),
    webPreferences: { ...BASE_WEB_PREFS, preload: PRELOAD_SPLASH },
  });
  splashWindow.on('closed', () => { splashWindow = null; });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function splashStatus(text) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash:status', text);
  }
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'ProERP',
    icon: iconPath(),
    backgroundColor: '#0f172a',
    webPreferences: { ...BASE_WEB_PREFS, preload: PRELOAD_APP },
  });
  mainWindow.setMenu(null);

  applyWebContentGuards(mainWindow.webContents, url);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) splashWindow.close();
    mainWindow.show();
    mainWindow.maximize();
    if (seedCredentialsBlock && currentConfig && !currentConfig.seedShown) {
      // İlk kurulumda üretilen rastgele parolalar sunucu konsoluna yazılır;
      // masaüstünde konsol olmadığından bir kez burada gösterilir.
      currentConfig.seedShown = true;
      try { saveConfig(currentConfig); } catch { /* önemli değil */ }
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'İlk giriş parolaları',
        message: 'İlk kurulum parolaları aşağıdadır — güvenli bir yere kaydedin.',
        detail: seedCredentialsBlock.trim(),
        buttons: ['Tamam'],
        noLink: true,
      });
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.once('did-finish-load', () => {
    scheduleStartupUpdateCheck();
    if (SMOKE_TEST) {
      log(`SMOKE: PASS — ana pencere yüklendi (${url}).`);
      app.quit();
    }
  });
  mainWindow.loadURL(url).catch((err) => {
    log('Ana pencere yüklenemedi:', err?.message || err);
    showFatalError('Arayüz yüklenemedi.', String(err?.message || err), true);
  });
}

function createErrorWindow(message, detail, canOpenSettings) {
  if (errorWindow && !errorWindow.isDestroyed()) errorWindow.destroy();
  errorWindow = new BrowserWindow({
    width: 720,
    height: 560,
    show: false,
    resizable: true,
    icon: iconPath(),
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: { ...BASE_WEB_PREFS, preload: PRELOAD_APP },
  });
  errorWindow.setMenu(null);
  lastError = { message, detail, canOpenSettings, at: new Date().toISOString() };
  errorWindow.once('ready-to-show', () => {
    if (splashWindow) splashWindow.close();
    errorWindow.show();
  });
  errorWindow.on('closed', () => { errorWindow = null; });
  errorWindow.loadFile(path.join(__dirname, 'error.html'));
}

function showFatalError(message, detail, canOpenSettings = true) {
  log(`HATA: ${message} — ${detail}`);
  if (errorWindow || !mainWindow) {
    createErrorWindow(message, detail, canOpenSettings);
  } else {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'ProERP',
      message,
      detail,
      buttons: ['Tamam'],
      noLink: true,
    });
  }
}

function createSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 780,
    height: 860,
    show: false,
    resizable: true,
    minimizable: true,
    icon: iconPath(),
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: { ...BASE_WEB_PREFS, preload: PRELOAD_SETUP },
  });
  setupWindow.setMenu(null);
  setupWindow.once('ready-to-show', () => {
    if (splashWindow) splashWindow.close();
    setupWindow.show();
  });
  setupWindow.on('closed', () => {
    setupWindow = null;
    if (!mainWindow && !errorWindow && !appQuitting && !currentConfig) {
      // İlk kurulum sihirbazı kapatıldı ve kayıtlı yapılandırma yok → çık.
      app.quit();
    }
  });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
}

/* ------------------------------------------------------------------ */
/* Başlatma akışı                                                       */
/* ------------------------------------------------------------------ */

async function launchApp(cfg) {
  const token = ++bootToken;
  currentConfig = cfg;
  if (!splashWindow) createSplash();
  splashStatus('Hazırlanıyor...');

  try {
    if (isDev && DEV_URL) {
      splashStatus('Geliştirme sunucusu denetleniyor...');
      const health = await waitForHealth(DEV_URL, { timeoutMs: 15_000 });
      if (token !== bootToken) return;
      if (!health.ok) {
        createErrorWindow('Geliştirme sunucusu yanıt vermiyor.', `${DEV_URL}\n\n${health.error || health.dbError || ''}\n\nÖnce "npm run electron:dev" ile başlatın.`, false);
        return;
      }
      backendUrl = DEV_URL;
      createMainWindow(`${DEV_URL}/`);
      return;
    }

    if (cfg.mode === 'remote') {
      splashStatus(`Sunucuya bağlanılıyor: ${cfg.remoteUrl}`);
      const health = await waitForHealth(cfg.remoteUrl, { timeoutMs: 15_000 });
      if (token !== bootToken) return;
      if (!health.ok) {
        createErrorWindow(
          'ProERP sunucusuna ulaşılamadı.',
          `${cfg.remoteUrl} adresindeki sunucu yanıt vermiyor.\n\n${health.error || health.dbError || ''}\n\nAğ bağlantısını ve sunucunun çalıştığını kontrol edin.`,
          true,
        );
        return;
      }
      backendUrl = cfg.remoteUrl;
      splashStatus('Arayüz açılıyor...');
      createMainWindow(`${cfg.remoteUrl}/`);
      return;
    }

    // Yeni uygulama sürümü şema değişikliği getirdiyse migration'ları
    // backend BAŞLATILMADAN önce ve yedek alarak uygula. Başarısızsa arka
    // uç hiç başlamaz → yarım şemada çalışma / veri kaybı riski oluşmaz.
    if (app.isPackaged) {
      const migrationResult = await runStartupMigrations(cfg);
      if (token !== bootToken) return;
      if (!migrationResult.ok) {
        log('Startup migration başarısız; backend başlatılmıyor.');
        createErrorWindow('Veritabanı güncellemesi uygulanamadı.', migrationResult.detail, true);
        return;
      }
    }

    const port = await startBackend(cfg);
    if (token !== bootToken) return;
    backendUrl = `http://127.0.0.1:${port}`;
    splashStatus('Sunucu başlatılıyor...');
    const health = await waitForHealth(backendUrl, {
      onTick: () => splashStatus('Sunucu başlatılıyor... (MySQL bağlantısı bekleniyor)'),
    });
    if (token !== bootToken) return;
    if (health.ok) {
      splashStatus('Arayüz açılıyor...');
      createMainWindow(`${backendUrl}/`);
      return;
    }
    if (health.dbError) {
      createErrorWindow(
        'MySQL veritabanı bağlantısı kurulamadı.',
        `${health.dbError}\n\nAyarları kontrol edin: Sunucu, Port, Veritabanı, Kullanıcı ve Şifre.\nMySQL servisinin çalıştığından emin olun.`,
        true,
      );
      await stopBackend();
      return;
    }
    createErrorWindow(
      'Sunucu zamanında hazır hâle gelmedi.',
      `${health.error || ''}\n\n--- Son sunucu günlükleri ---\n${backendLogTail(2000)}`,
      true,
    );
    await stopBackend();
  } catch (err) {
    if (token !== bootToken) return;
    log('Başlatma hatası:', err?.stack || err);
    createErrorWindow('Uygulama başlatılamadı.', String(err?.message || err), true);
    await stopBackend();
  }
}

/* ------------------------------------------------------------------ */
/* Veritabanı kurulum yardımcıları (sihirbaz için)                      */
/* ------------------------------------------------------------------ */

function splitSqlStatements(sql) {
  const withoutComments = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function quoteIdent(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

function quoteLiteral(value) {
  return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
}

function schemaStatements() {
  const raw = fs.readFileSync(dbSchemaPath(), 'utf8');
  return splitSqlStatements(raw).filter((stmt) => {
    const head = stmt.slice(0, 200).toUpperCase();
    return !head.startsWith('CREATE DATABASE') && !head.startsWith('USE ');
  });
}

function migrationFiles() {
  try {
    return fs
      .readdirSync(dbMigrationsDir())
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    return [];
  }
}

async function connectDb(cfg, { withDatabase = true, multipleStatements = false } = {}) {
  const mysql = await loadMysql();
  return mysql.createConnection({
    host: cfg.db.host,
    port: cfg.db.port,
    user: cfg.db.user,
    password: cfg.db.password,
    database: withDatabase ? cfg.db.name : undefined,
    charset: 'utf8mb4',
    multipleStatements,
  });
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id        VARCHAR(255) NOT NULL,
      appliedAt DATETIME     NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci
  `);
}

async function setupTestConnection(cfg) {
  const mysql = await loadMysql();
  try {
    const conn = await mysql.createConnection({
      host: cfg.db.host,
      port: cfg.db.port,
      user: cfg.db.user,
      password: cfg.db.password,
      database: cfg.db.name,
      charset: 'utf8mb4',
      connectTimeout: 8000,
    });
    try {
      const [ver] = await conn.query('SELECT VERSION() AS v');
      const [tables] = await conn.query(
        'SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
        [cfg.db.name],
      );
      const hasSchema = Number(tables[0]?.n || 0) > 0;
      let pendingMigrations = 0;
      if (hasSchema) {
        await ensureMigrationsTable(conn);
        const [applied] = await conn.query('SELECT id FROM schema_migrations');
        const appliedSet = new Set(applied.map((r) => r.id));
        pendingMigrations = migrationFiles().filter((f) => !appliedSet.has(f)).length;
      }
      return {
        ok: true,
        serverVersion: ver[0]?.v,
        databaseExists: true,
        hasSchema,
        pendingMigrations,
      };
    } finally {
      await conn.end();
    }
  } catch (err) {
    if (err?.code === 'ER_BAD_DB_ERROR') {
      return { ok: true, databaseExists: false, hasSchema: false, message: 'Veritabanı bulunamadı; "Veritabanı Oluştur" ile kurulabilir.' };
    }
    return { ok: false, error: err?.message || String(err) };
  }
}

async function setupInitDatabase({ dbCfg, adminUser, adminPassword, createAppUser }) {
  const mysql = await loadMysql();
  let admin;
  try {
    admin = await mysql.createConnection({
      host: dbCfg.db.host,
      port: dbCfg.db.port,
      user: adminUser,
      password: adminPassword,
      charset: 'utf8mb4',
      connectTimeout: 8000,
    });
  } catch (err) {
    return { ok: false, error: `Yönetici bağlantısı kurulamadı: ${err?.message || err}` };
  }
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdent(dbCfg.db.name)} CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci`,
    );

    if (createAppUser) {
      const hosts = dbCfg.db.host === 'localhost' ? ['localhost', '%'] : ['%'];
      for (const h of hosts) {
        const account = `${quoteIdent(dbCfg.db.user)}@${quoteLiteral(h)}`;
        await admin.query(`CREATE USER IF NOT EXISTS ${account} IDENTIFIED BY ${quoteLiteral(dbCfg.db.password)}`);
        await admin.query(`ALTER USER ${account} IDENTIFIED BY ${quoteLiteral(dbCfg.db.password)}`);
        await admin.query(`GRANT ALL PRIVILEGES ON ${quoteIdent(dbCfg.db.name)}.* TO ${account}`);
      }
      await admin.query('FLUSH PRIVILEGES');
    }

    // Şema: yönetici bağlantısıyla (yetki garantili) uygulanır.
    for (const stmt of schemaStatements()) {
      await admin.query(`USE ${quoteIdent(dbCfg.db.name)}`);
      await admin.query(stmt);
    }

    // Taban çizgisi: taze kurulumda schema.sql güncel kabul edilir.
    await ensureMigrationsTable(admin);
    for (const file of migrationFiles()) {
      await admin.query('INSERT IGNORE INTO schema_migrations (id, appliedAt) VALUES (?, NOW())', [file]);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    try { await admin.end(); } catch { /* yok */ }
  }
}

async function setupApplySchema(cfg) {
  let conn;
  try {
    conn = await connectDb(cfg);
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
  try {
    for (const stmt of schemaStatements()) await conn.query(stmt);
    await ensureMigrationsTable(conn);
    for (const file of migrationFiles()) {
      await conn.query('INSERT IGNORE INTO schema_migrations (id, appliedAt) VALUES (?, NOW())', [file]);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    try { await conn.end(); } catch { /* yok */ }
  }
}

async function setupRunMigrations(cfg) {
  let conn;
  try {
    conn = await connectDb(cfg, { multipleStatements: true });
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
  try {
    await ensureMigrationsTable(conn);
    const [applied] = await conn.query('SELECT id FROM schema_migrations');
    const appliedSet = new Set(applied.map((r) => r.id));
    let count = 0;
    for (const file of migrationFiles()) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(dbMigrationsDir(), file), 'utf8');
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (id, appliedAt) VALUES (?, NOW())', [file]);
      count++;
    }
    return { ok: true, applied: count };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), appliedFile: true };
  } finally {
    try { await conn.end(); } catch { /* yok */ }
  }
}

/* ------------------------------------------------------------------ */
/* Güncelleme sonrası migration güvenliği                                */
/*                                                                      */
/* Yeni uygulama sürümü şema değişikliği getirdiyse migration'lar      */
/* backend BAŞLATILMADAN önce uygulanır: yarım uygulanan şema üzerinde */
/* çalışma riski olmaz. Öncesinde mysqldump ile yedek alınır; yedek    */
/* alınamasa da (mysqldump yok) uygulama bloklanmaz, durum loglanır.   */
/* ------------------------------------------------------------------ */

function resolveMysqldump() {
  const fromEnv = process.env.MYSQLDUMP_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    const res = spawnSync(which, ['mysqldump'], { encoding: 'utf8', timeout: 10_000 });
    const first = String(res.stdout || '').split(/\r?\n/).find(Boolean);
    if (res.status === 0 && first) return first.trim();
  } catch { /* PATH'te yok */ }
  if (process.platform === 'win32') {
    const roots = [
      process.env.ProgramFiles || 'C:\\Program Files',
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    ];
    for (const root of roots) {
      const mysqlDir = path.join(root, 'MySQL');
      let entries = [];
      try { entries = fs.readdirSync(mysqlDir); } catch { continue; }
      const candidates = entries.filter((e) => /^MySQL Server \d/.test(e)).sort().reverse();
      for (const c of candidates) {
        const exe = path.join(mysqlDir, c, 'bin', 'mysqldump.exe');
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return null;
}

function backupDatabaseBeforeMigration(cfg) {
  return new Promise((resolve) => {
    const dump = resolveMysqldump();
    if (!dump) {
      log('UYARI: mysqldump bulunamadı; migration öncesi otomatik yedek alınamadı.');
      resolve({ ok: false, reason: 'mysqldump bulunamadı' });
      return;
    }
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const outDir = path.join(userDataDir(), 'backups', `${cfg.db.name}-pre-migration-${stamp}`);
    const dumpFile = path.join(outDir, 'dump.sql');
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch (err) {
      log('UYARI: yedek klasörü oluşturulamadı:', err?.message || err);
      resolve({ ok: false, reason: err?.message || String(err) });
      return;
    }
    log(`Migration öncesi veritabanı yedeği alınıyor: ${outDir}`);
    // Parola argv üzerinden değil MYSQL_PWD ile geçirilir (process listesinde görünmez).
    const res = spawnSync(
      dump,
      [
        `--host=${cfg.db.host}`,
        `--port=${cfg.db.port}`,
        `--user=${cfg.db.user}`,
        '--single-transaction',
        '--quick',
        '--routines',
        '--triggers',
        '--set-gtid-purged=OFF',
        `--result-file=${dumpFile}`,
        cfg.db.name,
      ],
      { env: { ...process.env, MYSQL_PWD: cfg.db.password }, timeout: 120_000 },
    );
    const failed =
      res.error ||
      res.status !== 0 ||
      !fs.existsSync(dumpFile) ||
      fs.statSync(dumpFile).size === 0;
    if (failed) {
      const reason = res.error?.message || `mysqldump çıkış kodu ${res.status}`;
      log('UYARI: migration öncesi yedek alınamadı:', reason);
      try { fs.rmSync(outDir, { recursive: true, force: true }); } catch { /* önemsiz */ }
      resolve({ ok: false, reason });
      return;
    }
    resolve({ ok: true, dir: outDir, bytes: fs.statSync(dumpFile).size });
  });
}

async function runStartupMigrations(cfg) {
  try {
    const test = await setupTestConnection(cfg);
    if (!test.ok) {
      return {
        ok: false,
        detail: [
          'Veritabanı güncellemeleri denetlenemedi:',
          '',
          test.error || '',
          '',
          'MySQL servisinin çalıştığını ve bağlantı ayarlarının doğru olduğunu kontrol edin.',
        ].join('\n'),
      };
    }
    if (!test.databaseExists) {
      // Henüz kurulum yapılmamış; sihirbaz şemayı kuracak.
      return { ok: true, note: 'veritabanı henüz yok (kurulum sihirbazı çalışacak)' };
    }
    if (!test.hasSchema || !test.pendingMigrations) return { ok: true };

    splashStatus(`Veritabanı güncellemeleri uygulanıyor (${test.pendingMigrations} değişiklik)...`);
    log(`Bekleyen migration: ${test.pendingMigrations} dosya.`);
    const backup = await backupDatabaseBeforeMigration(cfg);
    const result = await setupRunMigrations(cfg);
    if (!result.ok) {
      return {
        ok: false,
        detail: [
          'Veritabanı güncellemesi sırasında hata oluştu. Uygulama, güncelleme tamamlanmadan başlatılamaz (veri güvenliği için).',
          '',
          result.error || '',
          '',
          backup.ok
            ? `Güncelleme öncesi veritabanı yedeği alındı: ${backup.dir}`
            : 'Güncelleme öncesi yedek alınamadı (mysqldump bulunamadı olabilir).',
          '',
          'Sorunu çözdükten sonra ProERP\'yi yeniden açın; kalan güncellemeler kaldığı yerden uygulanır.',
        ].join('\n'),
      };
    }
    log(
      `Migration tamamlandı: ${result.applied} dosya uygulandı.` +
        (backup.ok ? ` Yedek: ${backup.dir} (${(backup.bytes / 1024).toFixed(1)} KB)` : ' (yedek alınamadı)'),
    );
    return { ok: true, applied: result.applied, backupDir: backup.ok ? backup.dir : null };
  } catch (err) {
    return { ok: false, detail: `Beklenmeyen hata: ${err?.message || String(err)}` };
  }
}

async function setupTestRemote(remoteUrl) {
  let url = String(remoteUrl || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  let origin = null;
  try { origin = new URL(url).origin; } catch { return { ok: false, error: 'Geçersiz adres.' }; }
  try {
    const res = await httpGetJson(`${origin}/api/health`, 6000);
    if (res.status === 200 && res.json?.status === 'ok') return { ok: true, origin };
    if (res.status === 503) return { ok: false, error: 'Sunucuya ulaşıldı ancak veritabanı bağlantısı hatalı.', origin };
    return { ok: false, error: `Beklenmeyen yanıt (HTTP ${res.status}).`, origin };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), origin };
  }
}

/* ------------------------------------------------------------------ */
/* IPC — yalnız güvenilir kaynaklardan                                 */
/* ------------------------------------------------------------------ */

function senderIsSetupWindow(event) {
  try {
    const url = event.senderFrame?.url || '';
    return url.startsWith('file://') && url.includes('setup.html');
  } catch {
    return false;
  }
}

function senderIsLocalPage(event) {
  try {
    return (event.senderFrame?.url || '').startsWith('file://');
  } catch {
    return false;
  }
}

function setupGuard(handler) {
  return async (event, payload) => {
    if (!senderIsSetupWindow(event)) {
      log(`IPC reddedildi (yetkisiz kaynak): ${event.senderFrame?.url}`);
      throw new Error('Yetkisiz istek.');
    }
    return handler(payload);
  };
}

function localGuard(handler) {
  return async (event, payload) => {
    if (!senderIsLocalPage(event)) {
      log(`IPC reddedildi (yetkisiz kaynak): ${event.senderFrame?.url}`);
      throw new Error('Yetkisiz istek.');
    }
    return handler(payload);
  };
}

/**
 * Uygulama (http://127.0.0.1 arayüzü) ve yerel sayfalar (error.html) için
 * guard: güncelleme API'si ana pencereden kullanılabilir. Ana pencere,
 * kendi preload'unu yükleyen bizim BrowserWindow'umuzdur (contextIsolation
 * açık, nodeIntegration kapalı) — dış sayfa yüklenmesi applyWebContentGuards
 * ile zaten engellenir.
 */
function senderIsMainWindow(event) {
  try {
    return Boolean(mainWindow) && !mainWindow.isDestroyed() && event.sender.id === mainWindow.webContents.id;
  } catch {
    return false;
  }
}

function appGuard(handler) {
  return async (event, payload) => {
    if (!senderIsLocalPage(event) && !senderIsMainWindow(event)) {
      log(`IPC reddedildi (yetkisiz kaynak): ${event.senderFrame?.url}`);
      throw new Error('Yetkisiz istek.');
    }
    return handler(payload);
  };
}

function registerIpc() {
  ipcMain.handle('setup:getState', setupGuard(() => ({
    configured: Boolean(currentConfig),
    config: currentConfig,
    version: app.getVersion(),
    productName: 'ProERP',
    dev: isDev,
  })));

  ipcMain.handle('setup:testConnection', setupGuard((cfg) => setupTestConnection(normalizeConfig(cfg)).catch((err) => ({ ok: false, error: err?.message || String(err) }))));
  ipcMain.handle('setup:testRemote', setupGuard((payload) => setupTestRemote(payload?.remoteUrl)));
  ipcMain.handle('setup:initDatabase', setupGuard((payload) => setupInitDatabase(payload).catch((err) => ({ ok: false, error: err?.message || String(err) }))));
  ipcMain.handle('setup:applySchema', setupGuard((cfg) => setupApplySchema(normalizeConfig(cfg)).catch((err) => ({ ok: false, error: err?.message || String(err) }))));
  ipcMain.handle('setup:runMigrations', setupGuard((cfg) => setupRunMigrations(normalizeConfig(cfg)).catch((err) => ({ ok: false, error: err?.message || String(err) }))));

  ipcMain.handle('setup:save', setupGuard((raw) => {
    const cfg = normalizeConfig(raw);
    if (!cfg) return { ok: false, error: 'Ayarlar eksik veya geçersiz.' };
    saveConfig(cfg);
    currentConfig = cfg;
    return { ok: true, config: cfg };
  }));

  ipcMain.handle('setup:finish', setupGuard(async (raw) => {
    const cfg = normalizeConfig(raw);
    if (!cfg) return { ok: false, error: 'Ayarlar eksik veya geçersiz.' };
    saveConfig(cfg);
    currentConfig = cfg;
    if (setupWindow) {
      setupWindow.destroy();
      setupWindow = null;
    }
    if (errorWindow) {
      errorWindow.destroy();
      errorWindow = null;
    }
    if (mainWindow) {
      // Ayar değişikliği sonrası yeniden başlat: eski arayüzü kapat.
      mainWindow.destroy();
      mainWindow = null;
    }
    await launchApp(cfg);
    return { ok: true };
  }));

  ipcMain.handle('app:getStatus', localGuard(() => ({
    error: lastError,
    backendUrl,
    version: app.getVersion(),
    logsDir: logsDir(),
  })));

  ipcMain.handle('app:retry', localGuard(async () => {
    if (!currentConfig) {
      createSetupWindow();
      return { ok: true };
    }
    if (errorWindow) {
      errorWindow.destroy();
      errorWindow = null;
    }
    await stopBackend();
    launchApp(currentConfig);
    return { ok: true };
  }));

  ipcMain.handle('app:openSettings', localGuard(() => {
    if (errorWindow) {
      errorWindow.destroy();
      errorWindow = null;
    }
    createSetupWindow();
    return { ok: true };
  }));

  ipcMain.handle('app:openLogs', localGuard(() => {
    fs.mkdirSync(logsDir(), { recursive: true });
    shell.openPath(logsDir());
    return { ok: true };
  }));

  // --- Sistem bilgisi ve otomatik güncelleme (Ayarlar → Sistem) ---

  ipcMain.handle('app:getVersion', localGuard(() => ({
    version: app.getVersion(),
    productName: 'ProERP',
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    updatesEnabled: Boolean(autoUpdater),
  })));

  ipcMain.handle('update:getState', appGuard(() => updateState));
  ipcMain.handle('update:check', appGuard(() => checkForUpdates()));
  ipcMain.handle('update:download', appGuard(() => safeDownloadUpdate()));
  ipcMain.handle('update:install', appGuard(() => installUpdateNow()));
}

/* ------------------------------------------------------------------ */
/* Güvenlik ve indirme politikaları                                     */
/* ------------------------------------------------------------------ */

function installSessionPolicies() {
  const s = session.defaultSession;

  // Kamera (barkod/karekod okuyucu) yalnız uygulama kaynaklarından istenebilir.
  s.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents?.getURL?.() || '';
    const isHttp = /^https?:/i.test(url);
    if (permission === 'media' && isHttp) return callback(true);
    log(`İzin reddedildi: ${permission} — ${url}`);
    callback(false);
  });
  s.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    if (permission === 'media' && /^https?:/i.test(requestingOrigin)) return true;
    return false;
  });

  // Excel/CSV/PDF dışa aktarımları: kullanıcıya kaydetme diyaloğu gösterilir.
  s.on('will-download', (event, item) => {
    const win = BrowserWindow.fromWebContents(item.getWebContents()) || mainWindow;
    const defaultPath = path.join(app.getPath('downloads'), item.getFilename());
    const savePath = win
      ? dialog.showSaveDialogSync(win, { defaultPath })
      : dialog.showSaveDialogSync({ defaultPath });
    if (savePath) {
      item.setSavePath(savePath);
    } else {
      event.preventDefault();
      item.cancel();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Uygulama yaşam döngüsü                                               */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindow || setupWindow || errorWindow || splashWindow;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.setAppUserModelId(APP_ID);

  app.whenReady().then(() => {
    log(`ProERP ${app.getVersion()} başlatıldı (electron ${process.versions.electron}, node ${process.versions.node}, paketli=${app.isPackaged}).`);
    fs.mkdirSync(logsDir(), { recursive: true });
    fs.mkdirSync(uploadDir(), { recursive: true });
    registerIpc();
    installSessionPolicies();
    initAutoUpdater();

    const cfg = loadConfig();
    if (cfg) {
      log(`Kayıtlı yapılandırma bulundu: ${describeConfig(cfg)}`);
      launchApp(cfg);
    } else if (isDev && DEV_URL) {
      log(`Geliştirme modu: ${DEV_URL} (kayıtlı yapılandırma gerekmez).`);
      launchApp({ mode: 'local' });
    } else {
      log('Yapılandırma yok; ilk kurulum sihirbazı açılıyor.');
      createSetupWindow();
    }

    app.on('activate', () => {
      if (process.platform === 'darwin' && !mainWindow && !setupWindow && !errorWindow && currentConfig) {
        launchApp(currentConfig);
      }
    });
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('render-process-gone', (_e, details) => {
      log(`Renderer süreci çöktü: ${details?.reason} (${details?.exitCode}).`);
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', (event) => {
    if (appQuitting) return;
    appQuitting = true;
    event.preventDefault();
    log('Uygulama kapatılıyor; backend durduruluyor...');
    stopBackend().finally(() => app.exit(0));
  });

  process.on('uncaughtException', (err) => {
    log(`Yakalanmamış hata (main): ${err?.stack || err}`);
    try {
      dialog.showErrorBox('ProERP — Beklenmeyen Hata', `${err?.message || err}\n\nGünlükler: ${logsDir()}`);
    } catch { /* diyalog gösterilemiyor */ }
  });
}
