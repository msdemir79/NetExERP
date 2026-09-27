# ProERP — Muhasebe ve Üretim

Ayakkabı ve imalat fabrikalarına özel; canlı kamera barkod/karekod okuyucu, üretim refakat kartı (rota fişi), reçeteli BOM hammadde sarfiyat düşümü, muhasebe, stok ve iş emri ERP yönetim sistemi.

## Modüller

| Modül | Kapsam |
|---|---|
| **Stok** | Ürün/hammadde kartları, asorti şablonları, renk×beden barkod varyantları, etiket tasarımcısı, barkod yazdırma |
| **Üretim** | İş emirleri, reçete (BOM), refakat kartı, kesim → saya → monta → finisaj bant takibi, hammadde sarfiyat düşümü, MRP |
| **Sipariş / İrsaliye / Fatura** | Beden matrisli sipariş girişi, sevk irsaliyesi, e-Fatura / e-Arşiv / e-İrsaliye (UBL-TR) |
| **Muhasebe** | TDHP hesap planı, yevmiye kaydı, mizan, kebir, çift taraflı kayıt doğrulama |
| **Finans** | Kasa, banka, çek/senet portföyü, tahsil makbuzu, yaşlandırma analizi |
| **İK** | Personel özlük, puantaj, izin, bordro, avans |
| **Yönetim** | Rol tabanlı yetkilendirme (RBAC), denetim kaydı (audit log), raporlar, ayarlar |

## Güvenlik

- **Oturum açma zorunludur.** Tüm `/api/*` uçları (sağlık kontrolü ve `POST /api/auth/login` hariç) geçerli bir oturum ister. Yetkilendirme istemcide değil **sunucuda** uygulanır: her istek, kaynağın bağlı olduğu modülün RBAC izniyle denetlenir (`server/auth.ts`, `server/registry.ts`, `server/api.ts`).
- **Parolalar scrypt (KDF) ile saklanır.** Tarayıcıda hash üretilmez. Eski kurulumlardaki `sha256` kayıtları, kullanıcının ilk başarılı girişinde otomatik olarak scrypt biçimine yükseltilir.
- **Oturum çerezi `httpOnly` + `SameSite=Strict`** olduğu için JavaScript oturum belirtecini okuyamaz; durum değiştiren istekler ayrıca `Sec-Fetch-Site`/`Origin` denetiminden geçer.
- **Giriş denemeleri sınırlıdır** (IP başına 30, kullanıcı başına 15 dakikada 8 hatalı deneme).
- **Hassas kolonlar dışa kapalıdır:** `passwordHash`/`passwordSalt` hiçbir API yanıtında dönmez ve istemci bu alanları yazamaz.
- **Yıkıcı işlemler Süper Admin'e kapalıdır:** tablo boşaltma (`POST /api/:kaynak/clear`), tüm verileri sıfırlama (`POST /api/ops/reseed`), `disableFkChecks` ile toplu geri yükleme. Üretim ortamında sıfırlama ek olarak `ALLOW_DESTRUCTIVE_OPS=true` gerektirir.
- **Denetim izi sunucu tarafından damgalanır:** kullanıcı kimliği, rol, IP ve zaman sunucudan yazılır; istemci yalnızca açıklama gönderir, `auditLogs` kaynağı istemciye salt-okunurdur.
- **Sunucu varsayılan olarak yalnızca `127.0.0.1` dinler.** Yerel ağa açmak için `.env` içinde `HOST=0.0.0.0` ayarlanır.

## Kurulum

**Gereksinimler:** Node.js 20+, MySQL 8.0+

```bash
npm install

# Veritabanını kurar: .env oluşturur, veritabanını ve kullanıcıyı
# açar, db/schema.sql'i uygular. Root şifresini sorar.
npm run db:setup

npm run dev
```

Uygulama http://localhost:3000 adresinde açılır ve **giriş ekranı** gelir.

İlk kurulumda kullanıcı parolaları sunucu konsoluna bir kez yazılır:

```
  İlk giriş parolaları (bu satırları güvenli bir yere kaydedin):
    • mdemir       → KxTq-4821!
    • ayildiz      → ...
```

Tüm demo kullanıcılara ortak bir parola vermek isterseniz `npm run db:setup` öncesinde `.env` içine `SEED_USER_PASSWORD=<parola>` yazın. Parolayı kaybettiyseniz komut satırından sıfırlayabilirsiniz:

```bash
npm run user:password -- --list                  # kullanıcı adlarını listeler
npm run user:password -- mdemir                  # rastgele yeni parola üretir
npm run user:password -- mdemir YeniParola1      # parolayı doğrudan atar
```

Parola sıfırlamasından sonra sunucuyu yeniden başlatın.

### Mevcut bir kurulumu güncelleme

Bu sürümde kimlik doğrulama sunucuya taşındı; `db/schema.sql` içinden `pinCode`, `sessionToken` ve `sessionExpiresAt` kolonları kaldırıldı. Yeni kurulumlarda bu kolonlar oluşturulmaz. Daha önce kurulmuş bir veritabanında kalan (artık okunmayan/yazılmayan) kolonları temizlemek için:

```bash
mysql -u proerp -p proerp < db/migrations/001-security-hardening.sql
```

Eski `sha256` parola kayıtları korunur; her kullanıcı ilk başarılı girişinde parolası otomatik olarak scrypt biçimine yükseltilir (parola değişmez).

> Eski sürüme geri dönmek isterseniz: geri döndükten sonra kullanıcıların parolaları scrypt biçiminde olduğu için giriş yapamazlar; `npm run user:password` ile parola atamanız gerekir.

Veriler yerel MySQL veritabanında saklanır. Sunucu ilk açılışta boş tabloları örnek fabrika verileriyle (TDHP hesap planı, hammadde/mamul ürünler, reçeteler, personel) otomatik doldurur. Bağlantı bilgileri `.env` dosyasından okunur (`.env.example` şablonundan üretilir).

> `npm run db:setup` yerine kurulumu elle yapmak isterseniz: `db/schema.sql` dosyasını MySQL'de çalıştırın, ardından `.env` içindeki `DB_*` değerlerini kendi kullanıcı bilgilerinizle doldurun.

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusunu başlatır (Express + Vite middleware, port 3000) |
| `npm run db:setup` | Veritabanını, uygulama kullanıcısını ve tabloları kurar |
| `npm run db:columns` | `db/schema.sql`'den `server/columns.ts` kaynak tanımlarını üretir |
| `npm run user:password` | Komut satırından kullanıcı parolası sıfırlar (kilitlenme kurtarma) |
| `npm run build` | Üretim derlemesi (`dist/`) |
| `npm start` | Derlenmiş uygulamayı çalıştırır |
| `npm run lint` | TypeScript tip kontrolü (`tsc --noEmit`) |
| `npm test` | Birim testleri (bordro, maliyet, muhasebe doğrulayıcı) |

## Mimari Notlar

- **Ön yüz:** React 19 + TypeScript + Vite, Tailwind CSS 4, react-router-dom 7
- **Veri:** MySQL 8 (InnoDB, `utf8mb4_turkish_ci`). Şema `db/schema.sql`; kolon adları TypeScript arayüzleriyle birebir aynıdır
- **API:** Express REST katmanı (`server/api.ts`). Kaynak tanımları `server/columns.ts` (otomatik üretilir) ve `server/registry.ts` (arama/sıralama/guard meta verisi)
- **Ön yüz veri erişimi:** `src/api/client.ts` üzerinden 30 kaynak için tipli istemci; salt-okunur sorgular `src/hooks/useApiQuery.ts`, canlı güncellemeler `/api/events` SSE akışı ile
- **Toplu işlemler:** Çok adımlı yazma işlemleri `POST /api/ops/commit` ile tek MySQL transaction'ında uygulanır
- **İş mantığı:** `src/services/` altındaki servis katmanı (erpService, accountingService, financeService, hrService, userService)
- **Saf hesaplamalar:** `src/lib/` (accountingValidator, payrollCalculator, inventoryCalculator, turkishUtils)
- **Sunucu:** Express, geliştirmede Vite middleware, üretimde statik dosya sunumu
- **Kimlik doğrulama:** `server/auth.ts` — scrypt parola saklama, bellekte oturum deposu, kaynak→modül/eylem izin denetimi, giriş hız sınırlayıcı. Oturum `httpOnly` çerez ile taşınır (`Authorization: Bearer <token>` de desteklenir)
- **Denetim izi:** `server/audit.ts` — tüm kayıtlar sunucu tarafında, asıl işlemle **aynı transaction** içinde üretilir (kimlik/rol/IP/zaman sunucudan). Kritik kaynakların (kullanıcı/rol/cari/ürün/fatura/kasa/banka/çek/makbuz/fiş/sipariş/irsaliye/iş emri/bordro/ayar) generic yazımları ve tüm kontrollü `ops` işlemleri otomatik auditlenir. `auditLogs` salt-okunur ve değiştirilemezdir: istemcinin denetim kaydı üretmesine veya geçmişi silmesine izin verilmez
- **Yetki matrisi:** Kaynak→modül eşlemesi `server/registry.ts` içindeki `module` alanındadır. `settings`, `contacts` ve `products` oturum sahibi herkesin okuyabildiği ortak referans verileridir; yazma her zaman modül iznine bağlıdır
- **Yetki simülasyonu:** Süper admin, `POST /api/auth/impersonate` ile bir kullanıcının yetkileriyle oturum açabilir. `impersonate/stop` kendi oturumuna döner; her geçiş denetim izine kaydedilir ve arayüzde bildirilir
- **Yazdırma / PDF:** iframe tabanlı yazdırma servisi, html2canvas + jsPDF
- **Barkod:** html5-qrcode ile kamera okuyucu, Code-128 / QR üretimi
