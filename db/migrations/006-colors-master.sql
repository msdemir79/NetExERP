-- ==========================================================
-- 006: Merkezi Renk Tanımlama (Color Master)
-- ----------------------------------------------------------
-- Renk bugüne kadar serbest metin olarak ürün kartlarında
-- (products.colors JSON), varyant/koli barkodlarında ve hareket/
-- belge satırlarında (inventoryLogs.color, orderItems.color,
-- waybillItems.color, invoiceItems.color, workOrders.color,
-- recipes.targetColor) tutuluyordu. Aynı rengin "SİYAH / Siyah /
-- SIYAH" gibi farklı yazımları raporlarda ve stok kartı ekstresinde
-- ayrı renk gibi görünüyordu; HEX/Pantone/üretici kodu ise hiç
-- tutulmuyordu.
--
-- Bu geçiş merkezi `colors` tablosunu TEK DOĞRULUK KAYNAĞI yapar:
--   * colors          → renk künyesi (kod, ad, grup, HEX, RGB,
--                       Pantone, üretici kodu, aktiflik)
--   * productColors   → ürün ↔ renk çoktan-çoğa bağı (products.colors
--                       JSON dizisinin yerini alır)
--   * satır tabloları → nullable `colorId` FK (metin kolonları belge
--                       üzerinde yazan tarihsel değeri korumak için
--                       bırakılır; yeni yazımlarda ikisi birlikte dolar)
--
-- İLKE (yıkıcı değil):
--   * Bu dosya YALNIZCA additive DDL içerir; hiçbir kolon düşürülmez,
--     hiçbir mevcut veri değiştirilmez.
--   * colors.code UNIQUE'dir; colors.name UNIQUE DEĞİLDİR (aynı ad
--     farklı üretici kodlarıyla birden çok kez var olabilir).
--   * productColors.colorId ON DELETE RESTRICT → kullanılan bir renk
--     fiziksel silinemez (uygulama zaten "Sil → Pasifleştir" kullanır).
--   * Satır tablolarındaki colorId ON DELETE SET NULL → renk silinse
--     bile tarihsel belge satırı korunur.
--   * Mevcut renk metinlerinden `colors` + `productColors` doldurma
--     işi SQL'e değil, JSON çözme + Türkçe büyük/küçük harf
--     normalizasyonu gerektirdiği için scripts/backfill-colors-master.mts
--     betiğine bırakılmıştır (dry-run varsayılan, --apply ile yazar).
--
-- Kullanım: npm run db:migrate
-- ==========================================================

-- ----------------------------------------------------------
-- 1) colors — merkezi renk künyesi
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `colors` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`             VARCHAR(50)     NOT NULL,
  `name`             VARCHAR(100)    NOT NULL,
  `groupName`        VARCHAR(100)    NULL,
  `hexCode`          VARCHAR(7)      NULL,
  `rgbCode`          VARCHAR(20)     NULL,
  `pantoneCode`      VARCHAR(50)     NULL,
  `manufacturerCode` VARCHAR(50)     NULL,
  `description`      TEXT            NULL,
  `isActive`         TINYINT(1)      NOT NULL DEFAULT 1,
  `createdAt`        DATETIME        NULL,
  `updatedAt`        DATETIME        NULL,
  `version`          INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_colors_code` (`code`),
  KEY `idx_colors_name` (`name`),
  KEY `idx_colors_groupName` (`groupName`),
  KEY `idx_colors_isActive` (`isActive`),
  KEY `idx_colors_manufacturerCode` (`manufacturerCode`),
  KEY `idx_colors_pantoneCode` (`pantoneCode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ----------------------------------------------------------
-- 2) productColors — ürün ↔ renk bağı (products.colors JSON'un yerine)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `productColors` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `productId` BIGINT UNSIGNED NOT NULL,
  `colorId`   BIGINT UNSIGNED NOT NULL,
  `sortOrder` INT             NOT NULL DEFAULT 0,
  `createdAt` DATETIME        NULL,
  `version`   INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_productColors_product_color` (`productId`, `colorId`),
  KEY `idx_productColors_colorId` (`colorId`),
  CONSTRAINT `fk_productColors_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_productColors_color`   FOREIGN KEY (`colorId`)   REFERENCES `colors` (`id`)   ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- ----------------------------------------------------------
-- 3) Satır tablolarına nullable colorId + FK (idempotent)
-- ----------------------------------------------------------

-- inventoryLogs.colorId -> colors [fk_inventoryLogs_color] (SET NULL)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inventoryLogs' AND COLUMN_NAME='colorId');
SET @sql := IF(@col=0, 'ALTER TABLE `inventoryLogs` ADD COLUMN `colorId` BIGINT UNSIGNED NULL AFTER `color`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='inventoryLogs' AND CONSTRAINT_NAME='fk_inventoryLogs_color' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `inventoryLogs` ADD CONSTRAINT `fk_inventoryLogs_color` FOREIGN KEY (`colorId`) REFERENCES `colors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orderItems.colorId -> colors [fk_orderItems_color] (SET NULL)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orderItems' AND COLUMN_NAME='colorId');
SET @sql := IF(@col=0, 'ALTER TABLE `orderItems` ADD COLUMN `colorId` BIGINT UNSIGNED NULL AFTER `color`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orderItems' AND CONSTRAINT_NAME='fk_orderItems_color' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `orderItems` ADD CONSTRAINT `fk_orderItems_color` FOREIGN KEY (`colorId`) REFERENCES `colors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybillItems.colorId -> colors [fk_waybillItems_color] (SET NULL)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybillItems' AND COLUMN_NAME='colorId');
SET @sql := IF(@col=0, 'ALTER TABLE `waybillItems` ADD COLUMN `colorId` BIGINT UNSIGNED NULL AFTER `color`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybillItems' AND CONSTRAINT_NAME='fk_waybillItems_color' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybillItems` ADD CONSTRAINT `fk_waybillItems_color` FOREIGN KEY (`colorId`) REFERENCES `colors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoiceItems.colorId -> colors [fk_invoiceItems_color] (SET NULL)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoiceItems' AND COLUMN_NAME='colorId');
SET @sql := IF(@col=0, 'ALTER TABLE `invoiceItems` ADD COLUMN `colorId` BIGINT UNSIGNED NULL AFTER `color`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoiceItems' AND CONSTRAINT_NAME='fk_invoiceItems_color' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoiceItems` ADD CONSTRAINT `fk_invoiceItems_color` FOREIGN KEY (`colorId`) REFERENCES `colors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workOrders.colorId -> colors [fk_workOrders_color] (SET NULL)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workOrders' AND COLUMN_NAME='colorId');
SET @sql := IF(@col=0, 'ALTER TABLE `workOrders` ADD COLUMN `colorId` BIGINT UNSIGNED NULL AFTER `color`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workOrders' AND CONSTRAINT_NAME='fk_workOrders_color' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `workOrders` ADD CONSTRAINT `fk_workOrders_color` FOREIGN KEY (`colorId`) REFERENCES `colors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- recipes.targetColorId -> colors [fk_recipes_targetColor] (SET NULL)
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='recipes' AND COLUMN_NAME='targetColorId');
SET @sql := IF(@col=0, 'ALTER TABLE `recipes` ADD COLUMN `targetColorId` BIGINT UNSIGNED NULL AFTER `targetColor`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='recipes' AND CONSTRAINT_NAME='fk_recipes_targetColor' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `recipes` ADD CONSTRAINT `fk_recipes_targetColor` FOREIGN KEY (`targetColorId`) REFERENCES `colors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------
-- 4) RBAC: yeni `colors` yetki modülünü mevcut rollerin
--    permissions JSON'una ekle (idempotent).
--    Okuma zaten readAuthOnly (oturum yeter); bu blok ekranın
--    görünürlüğünü ve yazma yetkilerini belirler.
-- ----------------------------------------------------------
UPDATE `roles`
   SET `permissions` = JSON_SET(COALESCE(`permissions`, JSON_OBJECT()), '$.colors',
        JSON_OBJECT('view', TRUE, 'create', FALSE, 'edit', FALSE, 'delete', FALSE, 'export', TRUE, 'approve', FALSE))
 WHERE JSON_EXTRACT(COALESCE(`permissions`, JSON_OBJECT()), '$.colors') IS NULL;

-- Depo/satın alma ve sistem yöneticisi renk kütüphanesini tam yönetir.
UPDATE `roles`
   SET `permissions` = JSON_SET(`permissions`, '$.colors',
        JSON_OBJECT('view', TRUE, 'create', TRUE, 'edit', TRUE, 'delete', TRUE, 'export', TRUE, 'approve', FALSE))
 WHERE `code` IN ('super_admin', 'warehouse_keeper');

-- Üretim şefi renk tanımlayabilir/düzenleyebilir ama pasifleştiremez.
UPDATE `roles`
   SET `permissions` = JSON_SET(`permissions`, '$.colors',
        JSON_OBJECT('view', TRUE, 'create', TRUE, 'edit', TRUE, 'delete', FALSE, 'export', TRUE, 'approve', FALSE))
 WHERE `code` = 'production_manager';
