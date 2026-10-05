/**
 * MySQL istemci araçlarını (mysqldump / mysql) bulmaya yarayan ortak yardımcı.
 *
 * Çözüm sırası: env override → PATH → yaygın Windows kurulum dizinleri.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

/**
 * @param {string} tool 'mysqldump' veya 'mysql'
 * @param {string} envVar tam yolu override eden ortam değişkeni (ör. MYSQLDUMP_PATH)
 * @returns {string|null} çalıştırılabilirin tam yolu veya null
 */
export function resolveMysqlBin(tool, envVar) {
  const exe = process.platform === 'win32' ? `${tool}.exe` : tool;

  const override = process.env[envVar];
  if (override && fs.existsSync(override)) return override;

  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', [exe], {
    encoding: 'utf8',
  });
  if (which.status === 0 && which.stdout.trim()) {
    const first = which.stdout.trim().split(/\r?\n/)[0];
    if (fs.existsSync(first)) return first;
  }

  if (process.platform === 'win32') {
    const bases = ['C:\\Program Files\\MySQL', 'C:\\Program Files (x86)\\MySQL'];
    const candidates = [];
    for (const base of bases) {
      if (!fs.existsSync(base)) continue;
      for (const entry of fs.readdirSync(base)) {
        const p = path.join(base, entry, 'bin', exe);
        if (fs.existsSync(p)) candidates.push(p);
      }
    }
    if (candidates.length) {
      candidates.sort();
      return candidates[candidates.length - 1];
    }
  }

  return null;
}

export function binNotFoundMessage(tool, envVar) {
  const winEx = tool === 'mysqldump'
    ? 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe'
    : 'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysql.exe';
  return [
    `${tool} bulunamadı.`,
    `Ya PATH'e ekleyin ya da tam yolu ${envVar} ile verin:`,
    `  Windows:   set ${envVar}=${winEx}`,
    `  Linux/mac: export ${envVar}=/usr/bin/${tool}`,
    '',
  ].join('\n');
}
