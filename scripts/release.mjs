/**
 * ProERP sürüm çıkarma yardımcısı.
 *
 * Kullanım:
 *   npm run release -- patch   → 1.0.0 → 1.0.1 (hata düzeltmesi)
 *   npm run release -- minor   → 1.0.0 → 1.1.0 (yeni özellik)
 *   npm run release -- major   → 1.0.0 → 2.0.0 (yıkıcı değişiklik)
 *   ... --push                 → yerel adımlardan sonra netexerp uzak deposuna
 *                                etiketle birlikte iter (origin'e DOKUNMAZ)
 *
 * Akış:
 *   1. Çalışma ağacı temiz mi? (kullanıcının işlenmemiş değişikliklerini ezmez)
 *   2. package.json + package-lock.json sürümü yükseltilir (npm version)
 *   3. release-notes/vX.Y.Z.md şablondan oluşturulur (YENİ/DÜZELTME/PERFORMANS)
 *   4. "chore(release): vX.Y.Z" commit'i + "vX.Y.Z" etiketi
 *   5. Etiketi itince .github/workflows/release.yml testleri koşup kurulum
 *      paketini GitHub Release olarak yayınlar — masaüstü istemciler
 *      güncellemeyi otomatik görür.
 *
 * Sürüm notlarını özelleştirmek isterseniz 3. adımdan sonra durdurup dosyayı
 * elle düzenleyin, sonra commit --amend + git tag -f ile düzeltin.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUSH_REMOTE = 'netexerp';
const PUSH_REMOTE_URL_FRAGMENT = 'msdemir79/NetExERP';

const BUMP_TYPES = { patch: true, minor: true, major: true };

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  return { status: res.status, stdout: (res.stdout || '').trim() };
}

function mustRun(cmd, args, opts = {}) {
  const res = run(cmd, args, opts);
  if (res.status !== 0) {
    console.error(`HATA: ${cmd} ${args.join(' ')} başarısız.`);
    process.exit(1);
  }
  return res;
}

function die(msg) {
  console.error(`HATA: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const doPush = args.includes('--push');
const bumpType = args.find((a) => BUMP_TYPES[a]);
if (!bumpType) {
  die('Kullanım: npm run release -- <patch|minor|major> [--push]');
}

// 1. Çalışma ağacı temiz olmalı — işlenmemiş değişiklik ezilmez.
const status = mustRun('git', ['status', '--porcelain']);
if (status.stdout) {
  console.error('Çalışma ağacı temiz değil; önce mevcut değişiklikleri commit edin:');
  console.error(status.stdout);
  process.exit(1);
}

const branch = mustRun('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout;
if (branch !== 'master') {
  die(`Şu an '${branch}' dalındasınız; release yalnızca master dalından çıkar.`);
}

if (doPush) {
  const remoteUrl = mustRun('git', ['remote', 'get-url', PUSH_REMOTE]).stdout;
  if (!remoteUrl.includes(PUSH_REMOTE_URL_FRAGMENT)) {
    die(`${PUSH_REMOTE} uzak deposu ${PUSH_REMOTE_URL_FRAGMENT} adresine bakmıyor (bulunan: ${remoteUrl}).`);
  }
}

// 2. Sürümü yükselt (package.json + package-lock.json).
// Sürüm npm çıktısından değil paketten okunur: npm'in --json çıktısı
// kabuk/yürütmeye göre değişkendir (düz "v1.0.1" basabilir).
mustRun('npm', ['version', bumpType, '--no-git-tag-version']);
const newVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const tagName = `v${newVersion}`;

// 3. Sürüm notu şablonu (GitHub Release gövdesi + uygulama içi güncelleme
//    penceresinde aynı dosya gösterilir).
const notesDir = path.join(root, 'release-notes');
fs.mkdirSync(notesDir, { recursive: true });
const notesFile = path.join(notesDir, `${tagName}.md`);
if (!fs.existsSync(notesFile)) {
  fs.writeFileSync(
    notesFile,
    `# ProERP ${newVersion}

## YENİ
- (bu sürümde eklenen özellikler)

## DÜZELTME
- (bu sürümde giderilen hatalar)

## PERFORMANS
- (iyileştirmeler)
`,
    'utf8',
  );
}

// 4. Commit + etiket. Sürüm notu dosyası da aynı commit'te gider.
mustRun('git', ['add', 'package.json', 'package-lock.json', `release-notes/${tagName}.md`]);
mustRun('git', ['commit', '-m', `chore(release): ${tagName}`]);
mustRun('git', ['tag', '-a', tagName, '-m', `ProERP ${newVersion}`]);

console.log(`\nSürüm ${newVersion} hazır (commit + ${tagName} etiketi).`);

if (doPush) {
  mustRun('git', ['push', PUSH_REMOTE, 'master', '--follow-tags']);
  console.log(`${PUSH_REMOTE} uzak deposuna itildi; GitHub Actions release işini başlattı.`);
  console.log(`https://github.com/${PUSH_REMOTE_URL_FRAGMENT}/actions üzerinden izleyin.`);
} else {
  console.log('\nSonraki adımlar:');
  console.log(`  1. Notları gözden geçir/düzenle: release-notes/${tagName}.md`);
  console.log('     (düzenlediyseniz: git add ... && git commit --amend --no-edit && git tag -f ' + tagName + ')');
  console.log(`  2. Yayınla: git push ${PUSH_REMOTE} master --follow-tags`);
  console.log(`  3. İzle: https://github.com/${PUSH_REMOTE_URL_FRAGMENT}/actions`);
}
