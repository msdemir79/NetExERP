/**
 * Üretim başlatma sarmalayıcısı (sıfır bağımlılık, platformdan bağımsız).
 *
 * `npm start` HER ZAMAN production modunda çalışmalıdır; aksi halde derlenmiş
 * sunucu (dist/server.cjs) geliştirme modunda kalkar:
 *   • Vite dev middleware'i yüklenir (üretimde devDependency'ler budanmışsa çöker),
 *   • oturum çerezinin `Secure` bayrağı kapalı kalır,
 *   • CSP ve HSTS başlıkları gönderilmez,
 *   • /api/health veritabanı sürümünü sızdırır,
 *   • /ops/reseed yıkıcı-op kapısı (ALLOW_DESTRUCTIVE_OPS) devre dışı kalır.
 *
 * TUZAK (düzeltildi): `.env.example` şablonu `NODE_ENV=development` içeriyor ve
 * `db:setup` bu şablonu `.env`'e kopyalıyor. dotenv, mevcut `process.env`
 * değerlerinin ÜZERİNE YAZMADIĞI için, `NODE_ENV` yalnızca *boşsa* sabitlemek
 * yetmiyordu — `.env`'deki `development` değeri kazanıyor ve `npm start`
 * sessizce geliştirme modunda açılıyordu. Bu yüzden değer burada KOŞULSUZ
 * production'a çekilir ve farklı bir değer verilmişse uyarılır.
 *
 * Kullanım: npm start  (→ node scripts/start.mjs)
 * Geliştirme için `npm run dev` kullanılır (NODE_ENV=development, vite middleware).
 */
if (process.env.NODE_ENV !== 'production') {
  if (process.env.NODE_ENV) {
    console.warn(
      `UYARI: NODE_ENV="${process.env.NODE_ENV}" verilmiş; "npm start" her zaman ` +
        'production modunda çalışır. Geliştirme için "npm run dev" kullanın.',
    );
  }
  process.env.NODE_ENV = 'production';
}

await import('../dist/server.cjs');
