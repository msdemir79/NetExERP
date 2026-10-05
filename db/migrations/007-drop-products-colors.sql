-- ==========================================================
-- 007: products.colors JSON kolonunun kaldırılması
-- ----------------------------------------------------------
-- 006 ile merkezi `colors` + `productColors` kuruldu ve
-- scripts/backfill-colors-master.mts mevcut tüm renk metinlerini
-- kartlara ve ürün bağlarına taşıdı (doğrulandı: bağı olmayan
-- renk metni = 0). Kolon artık hiçbir okuma/yazma yolunda
-- kullanılmıyor; server/columns.ts'ten de çıkarıldığı için
-- API üzerinden doldurulması zaten mümkün değil.
--
-- Şartname kuralı: "Renk bilgisi stok tablosunda tekrar eden
-- metin olarak tutulmamalı; colors tek doğruluk kaynağıdır."
-- Bu yüzden kolon düşürülür; böylece iki ayrı kaynak arasında
-- sessiz tutarsızlık oluşması imkânsız hale gelir.
--
-- VERİ GÜVENLİĞİ:
--   * Renk verisi KAYBOLMAZ: ürün↔renk bağı productColors'ta,
--     belge/movement satırlarındaki tarihsel metin ise kendi
--     kolonlarında (inventoryLogs.color, orderItems.color, ...)
--     durmaya devam eder.
--   * Geçiş idempotent'tir: kolon yoksa hiçbir şey yapılmaz.
--   * Kolon düşmeden önce backfill'in koşulmuş olması gerekir
--     (aksi halde products.colors metni bağlanmamış olur).
--
-- Kullanım: npm run db:migrate
-- ==========================================================

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME='colors');
SET @sql := IF(@col>0, 'ALTER TABLE `products` DROP COLUMN `colors`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
