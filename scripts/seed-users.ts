/**
 * Eksik rol kullanıcılarını eklemeli (additive) olarak oluşturur.
 *
 * `db/schema.sql` tabloları kurar ama kullanıcı seed'lemez; bu yüzden canlı DB'de
 * yalnızca süper admin kalabiliyor ve `npm run test:rbac` / `test:colors` (Test 10)
 * rol kullanıcılarını bulamıyor. Bu betik src/data/initialUsers.ts listesinden
 * EKSİK olan kullanıcıları açar:
 *   - Var olan kullanıcı adları ASLA dokunulmaz (ne güncellenir ne silinir).
 *   - Kimlikler (id) initialUsers sırasına sabitlenir; testler userId 2 =
 *     sales_manager varsayar. İstenen id doluysa o kullanıcı atlanır ve uyarılır.
 *   - Parola scrypt ile (server/auth.ts) rastgele üretilir ve YALNIZCA bu
 *     çalıştırmanın konsol çıktısına bir kez yazılır; hiçbir dosyaya/log'a gitmez.
 *
 * Kullanım:
 *   npx tsx scripts/seed-users.ts            # kuru çalıştırma (yazmaz)
 *   npx tsx scripts/seed-users.ts --apply    # uygular
 */
import { query, closePool } from '../server/db.js';
import { hashPassword, validatePasswordStrength } from '../server/auth.js';
import { INITIAL_USERS } from '../src/data/initialUsers.js';

const APPLY = process.argv.includes('--apply');

function randomPassword(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set: string, n: number) =>
    Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join('');
  return `${pick(letters, 4)}-${pick(digits, 4)}!`;
}

async function main(): Promise<void> {
  const roles = (await query('SELECT `id`, `code` FROM `roles`')) as any[];
  const roleByCode = new Map<string, number>(roles.map((r) => [String(r.code), Number(r.id)]));

  const existing = (await query('SELECT `id`, `username` FROM `users`')) as any[];
  const takenUsernames = new Set(existing.map((u) => String(u.username).toLocaleLowerCase('tr')));
  const takenIds = new Set(existing.map((u) => Number(u.id)));

  const planned: { id: number; user: (typeof INITIAL_USERS)[number]; password: string }[] = [];
  for (let i = 0; i < INITIAL_USERS.length; i++) {
    const user = INITIAL_USERS[i];
    const id = i + 1;
    if (takenUsernames.has(String(user.username).toLocaleLowerCase('tr'))) continue;
    if (takenIds.has(id)) {
      console.warn(`  ! ${user.username} atlandı: id ${id} başka bir kullanıcıda.`);
      continue;
    }
    const roleId = roleByCode.get(user.roleCode);
    if (!roleId) {
      console.warn(`  ! ${user.username} atlandı: '${user.roleCode}' rolü tabloda yok.`);
      continue;
    }
    planned.push({ id, user, password: randomPassword() });
  }

  console.log(`\nRol kullanıcı seed — ${APPLY ? 'UYGULANIYOR' : 'KURU ÇALIŞTIRMA'}`);
  console.log(`Mevcut kullanıcı: ${existing.length} | açılacak: ${planned.length}\n`);
  for (const p of planned) {
    console.log(`  + id ${p.id} | ${p.user.username} | ${p.user.fullName} | ${p.user.roleCode}`);
  }

  if (!APPLY) {
    console.log('\nHiçbir kayıt değiştirilmedi. Uygulamak için: --apply\n');
    return;
  }

  const issued: { username: string; password: string }[] = [];
  for (const p of planned) {
    const strengthError = validatePasswordStrength(p.password);
    if (strengthError) throw new Error(`${p.user.username}: ${strengthError}`);
    const { hash, salt } = await hashPassword(p.password);
    await query(
      `INSERT INTO \`users\`
         (\`id\`, \`username\`, \`fullName\`, \`email\`, \`phone\`, \`title\`, \`department\`,
          \`roleId\`, \`roleCode\`, \`roleName\`, \`status\`, \`color\`,
          \`passwordHash\`, \`passwordSalt\`, \`createdAt\`, \`updatedAt\`, \`notes\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
      [
        p.id,
        p.user.username,
        p.user.fullName,
        p.user.email,
        p.user.phone,
        p.user.title,
        p.user.department,
        roleByCode.get(p.user.roleCode)!,
        p.user.roleCode,
        p.user.roleName,
        p.user.status,
        p.user.color,
        hash,
        salt,
        p.user.notes,
      ],
    );
    issued.push({ username: p.user.username, password: p.password });
  }

  console.log(`\n${issued.length} kullanıcı açıldı. Başlangıç parolaları (bir kez, yalnızca burada):`);
  for (const u of issued) console.log(`  ${u.username}  →  ${u.password}`);
  console.log('\nBu satırı not alın; parolalar başka hiçbir yere yazılmaz.\n');
}

main()
  .catch((err) => { console.error('Seed hatası:', err); process.exitCode = 1; })
  .finally(() => closePool());
