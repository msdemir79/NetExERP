/**
 * Kullanıcı parolasını komut satırından sıfırlar (kilitlenme kurtarma aracı).
 *
 * Kullanım:
 *   npm run user:password -- <kullanıcı adı>            → rastgele güçlü parola üretir
 *   npm run user:password -- <kullanıcı adı> YeniParola1 → parolayı doğrudan atar
 *   npm run user:password -- --list                     → kullanıcı adlarını listeler
 *
 * Parola, uygulamanın kullandığı scrypt biçimiyle (server/auth.ts) saklanır.
 * Not: Çalışan sunucunun bellekteki oturumları bu işlemden etkilenmez;
 * parola sıfırlaması sonrası sunucuyu yeniden başlatın.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { hashPassword, validatePasswordStrength } from '../server/auth.js';

dotenv.config();

const args = process.argv.slice(2).filter((a) => a !== '--');
const listOnly = args.includes('--list');
const [usernameArg, passwordArg] = args.filter((a) => !a.startsWith('--'));

function randomPassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
  return `${pick(letters, 4)}-${pick(digits, 4)}!`;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'proerp',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'proerp',
    charset: 'utf8mb4_turkish_ci',
  });

  try {
    const [rows] = await conn.query<any[]>(
      'SELECT `id`, `username`, `fullName`, `status` FROM `users` ORDER BY `username`',
    );

    if (listOnly || !usernameArg) {
      console.log('\nKayıtlı kullanıcılar:');
      for (const r of rows) {
        console.log(`  • ${String(r.username).padEnd(14)} ${r.fullName || ''}  [${r.status}]`);
      }
      console.log('\nParola sıfırlamak için: npm run user:password -- <kullanıcı adı> [yeni parola]\n');
      return;
    }

    const user = rows.find((r) => String(r.username).toLowerCase() === usernameArg.toLowerCase());
    if (!user) {
      console.error(`\n"${usernameArg}" kullanıcısı bulunamadı. Kullanıcıları listelemek için: npm run user:password -- --list\n`);
      process.exitCode = 1;
      return;
    }

    const password = passwordArg || randomPassword();
    const strengthError = validatePasswordStrength(password);
    if (strengthError) {
      console.error(`\n${strengthError}\n`);
      process.exitCode = 1;
      return;
    }

    const { hash, salt } = await hashPassword(password);
    await conn.query('UPDATE `users` SET `passwordHash` = ?, `passwordSalt` = ?, `updatedAt` = NOW() WHERE `id` = ?', [
      hash,
      salt,
      user.id,
    ]);

    console.log('');
    console.log(`  Kullanıcı : ${user.username} (${user.fullName || '-'})`);
    console.log(`  Yeni parola: ${password}`);
    console.log('');
    console.log(passwordArg ? '  Parola güncellendi.' : '  Rastgele parola üretildi ve kaydedildi. Bu satırı not alın.');
    console.log('  Çalışan sunucuyu yeniden başlatarak açık oturumları kapatın.');
    console.log('');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('\nParola sıfırlanamadı:', err?.message || err);
  console.error('MySQL bağlantı ayarlarını (.env içindeki DB_*) kontrol edin.\n');
  process.exitCode = 1;
});

