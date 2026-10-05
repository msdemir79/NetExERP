/**
 * Üretim başlatma sarmalayıcısı (sıfır bağımlılık, platformdan bağımsız).
 *
 * `npm start` her zaman NODE_ENV=production ile çalışmalıdır; aksi halde derlenmiş
 * sunucu (dist/server.cjs) geliştirme modunda kalkmaya çalışır: Vite dev middleware'i
 * yüklenir (üretimde devDependency'ler budanmışsa çöker), oturum çerezinin Secure
 * bayrağı kapalı kalır, /api/health DB sürümünü sızdırır ve yıkıcı-op kapısı devre
 * dışı kalır. .env NODE_ENV=development içerebildiği ve dotenv mevcut process.env
 * değerlerinin ÜZERİNE YAZMADIĞI için, NODE_ENV burada import'tan ÖNCE sabitlenir.
 *
 * Kullanım: npm start  (→ node scripts/start.mjs)
 */
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

await import('../dist/server.cjs');
