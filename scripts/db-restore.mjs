/**
 * Yedekten geri yükleme (recovery).
 *
 * Kullanım:
 *   npm run db:restore -- --list                 mevcut yedekleri listele
 *   npm run db:restore -- backups/proerp-<zaman>          önizleme (yıkıcı değil)
 *   npm run db:restore -- backups/proerp-<zaman> --force  GERÇEKTEN geri yükle
 *
 * Bayraklar:
 *   --from=<klasör>   yedek klasörü (pozisyonel argüman yerine kullanılabilir)
 *   --force           geri yüklemeyi gerçekten uygula (yoksa yalnızca önizleme)
 *   --yes             interaktif onay sorusunu atla (TTY'de --force ile birlikte)
 *   --no-uploads      uploads/ klasörünü geri yükleme (yalnızca SQL)
 *   --list            backups/ altındaki yedekleri göster ve çık
 *
 * Güvenlik: parola argv ile DEĞİL MYSQL_PWD env ile geçirilir. Bu işlem MEVCUT
 * veritabanının ÜZERİNE YAZAR ve geri alınamaz; önce güncel bir db:backup alın.
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { resolveMysqlBin, binNotFoundMessage } from './mysql-bin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(root, '.env') });

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: String(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'proerp',
  user: process.env.DB_USER || 'proerp',
  password: process.env.DB_PASSWORD || '',
};

function uploadsDir() {
  const configured = process.env.UPLOAD_DIR || path.join('data', 'uploads');
  return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
}

const argv = process.argv.slice(2);
const getFlag = (name) => argv.find((a) => a === `--${name}`) !== undefined;
const getOpt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const positional = argv.filter((a) => !a.startsWith('--'));

const LIST = getFlag('list');
const FORCE = getFlag('force');
const YES = getFlag('yes');
const NO_UPLOADS = getFlag('no-uploads');
const fromArg = getOpt('from') || positional[0];

function backupsRoot() {
  return path.join(root, 'backups');
}

async function askPassword() {
  if (cfg.password) return cfg.password;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`Veritabanı parolası (${cfg.user}): `, resolve));
  rl.close();
  return answer;
}

function readManifest(dir) {
  const p = path.join(dir, 'manifest.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function listBackups() {
  const base = backupsRoot();
  if (!fs.existsSync(base)) { console.log('Hiç yedek yok (backups/ bulunamadı).'); return; }
  const prefix = `${cfg.database}-`;
  const dirs = fs
    .readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
    .map((e) => e.name)
    .sort();
  if (!dirs.length) { console.log(`Hiç yedek yok (backups/${prefix}* bulunamadı).`); return; }
  console.log(`Mevcut yedekler (backups/), hedef veritabanı: ${cfg.database}\n`);
  for (const name of dirs) {
    const full = path.join(base, name);
    const m = readManifest(full);
    const dumpExists = fs.existsSync(path.join(full, 'dump.sql'));
    const uploadsDirExists = fs.existsSync(path.join(full, 'uploads'));
    const when = m?.createdAt ? new Date(m.createdAt).toLocaleString('tr-TR') : '?';
    const size = m?.dumpBytes ? `${(m.dumpBytes / 1024).toFixed(1)} KB` : '?';
    console.log(`  ${name}  ${when}  dump:${size}  ${dumpExists ? '' : '[dump.sql YOK]'} uploads:${uploadsDirExists ? 'var' : 'yok'}`);
  }
  console.log('\nGeri yükleme: npm run db:restore -- backups/<klasör> [--force]');
}

function resolveBackupDir() {
  if (!fromArg) return null;
  const p = path.isAbsolute(fromArg) ? fromArg : path.resolve(root, fromArg);
  return fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : null;
}

async function confirmForce(dbName) {
  if (YES) return true;
  if (!process.stdin.isTTY) {
    // İnteraktif değil (CI/boru): --force yeterli sayıldı, onay sorulamıyor.
    return true;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(`ONAY: "${dbName}" veritabanının üzerine yazılacak. Devam için veritabanı adını yazın: `, resolve),
  );
  rl.close();
  return answer.trim() === dbName;
}

async function main() {
  if (LIST) { listBackups(); return; }

  const dir = resolveBackupDir();
  if (!dir) {
    console.error('Geçerli bir yedek klasörü belirtilmedi.');
    console.error('Kullanım: npm run db:restore -- backups/proerp-<zaman> [--force]');
    console.error('Mevcut yedekler için: npm run db:restore -- --list\n');
    process.exit(1);
  }

  const dumpFile = path.join(dir, 'dump.sql');
  if (!fs.existsSync(dumpFile)) {
    console.error(`Yedek geçersiz: "${dir}" içinde dump.sql yok.\n`);
    process.exit(1);
  }

  const mysql = resolveMysqlBin('mysql', 'MYSQL_PATH');
  if (!mysql) {
    console.error(binNotFoundMessage('mysql', 'MYSQL_PATH'));
    process.exit(1);
  }

  const manifest = readManifest(dir);
  const srcUploads = path.join(dir, 'uploads');
  const willRestoreUploads = !NO_UPLOADS && fs.existsSync(srcUploads);

  console.log('──────────── GERİ YÜKLEME PLANI ────────────');
  console.log(`  Kaynak klasör : ${dir}`);
  if (manifest?.createdAt) console.log(`  Yedek tarihi  : ${new Date(manifest.createdAt).toLocaleString('tr-TR')}`);
  console.log(`  Hedef         : ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  console.log(`  SQL           : dump.sql (${(fs.statSync(dumpFile).size / 1024).toFixed(1)} KB) → üzerine yazılacak`);
  console.log(`  Görseller     : ${willRestoreUploads ? `uploads/ → ${uploadsDir()} (üzerine yazılacak)` : NO_UPLOADS ? 'atlanıyor (--no-uploads)' : 'yedekte yok'}`);
  console.log('  UYARI         : Bu işlem mevcut verileri DEĞİŞTİRİR ve geri alınamaz.');
  console.log('────────────────────────────────────────────\n');

  if (!FORCE) {
    console.log('Bu bir ÖNİZLEMEDİR; hiçbir değişiklik yapılmadı.');
    console.log('Geri yüklemek için aynı komuta --force ekleyin.\n');
    return;
  }

  if (!(await confirmForce(cfg.database))) {
    console.error('\nOnaylanmadı; geri yükleme iptal edildi.\n');
    process.exit(1);
  }

  const password = await askPassword();

  console.log('SQL geri yükleniyor...');
  let fd;
  try {
    fd = fs.openSync(dumpFile, 'r');
    const res = spawnSync(
      mysql,
      [`--host=${cfg.host}`, `--port=${cfg.port}`, `--user=${cfg.user}`, cfg.database],
      { encoding: 'utf8', env: { ...process.env, MYSQL_PWD: password }, stdio: [fd, 'pipe', 'pipe'] },
    );
    if (res.error) {
      console.error('\nmysql çalıştırılamadı: ' + res.error.message + '\n');
      process.exit(1);
    }
    if (res.status !== 0) {
      console.error('\nSQL geri yükleme başarısız (mysql çıktı kodu ' + res.status + '):');
      const msg = (res.stderr || '').trim();
      if (msg) console.error(msg);
      console.error('\nVeritabanı kısmen geri yüklenmiş olabilir. Yedeği kontrol edin.\n');
      process.exit(1);
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  console.log('SQL geri yüklendi.');

  if (willRestoreUploads) {
    console.log('Görseller geri yükleniyor...');
    fs.cpSync(srcUploads, uploadsDir(), { recursive: true });
    console.log('Görseller geri yüklendi.');
  }

  console.log('\nGeri yükleme tamam.');
  console.log('Çalışan uygulama sunucusu varsa yeniden başlatın (npm run dev / npm start).\n');
}

main().catch((err) => {
  console.error('\nGeri yükleme hatası: ' + (err?.message || err) + '\n');
  process.exit(1);
});
