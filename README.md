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

## Kurulum

**Gereksinimler:** Node.js 20+, MySQL 8.0+

```bash
npm install

# Veritabanını kurar: .env oluşturur, veritabanını ve kullanıcıyı
# açar, db/schema.sql'i uygular. Root şifresini sorar.
npm run db:setup

npm run dev
```

Uygulama http://localhost:3000 adresinde açılır.

Veriler yerel MySQL veritabanında saklanır. Sunucu ilk açılışta boş tabloları örnek fabrika verileriyle (TDHP hesap planı, hammadde/mamul ürünler, reçeteler, personel) otomatik doldurur. Bağlantı bilgileri `.env` dosyasından okunur (`.env.example` şablonundan üretilir).

> `npm run db:setup` yerine kurulumu elle yapmak isterseniz: `db/schema.sql` dosyasını MySQL'de çalıştırın, ardından `.env` içindeki `DB_*` değerlerini kendi kullanıcı bilgilerinizle doldurun.

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm run dev` | Geliştirme sunucusunu başlatır (Express + Vite middleware, port 3000) |
| `npm run db:setup` | Veritabanını, uygulama kullanıcısını ve tabloları kurar |
| `npm run db:columns` | `db/schema.sql`'den `server/columns.ts` kaynak tanımlarını üretir |
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
- **Yazdırma / PDF:** iframe tabanlı yazdırma servisi, html2canvas + jsPDF
- **Barkod:** html5-qrcode ile kamera okuyucu, Code-128 / QR üretimi
