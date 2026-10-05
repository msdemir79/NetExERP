-- ==========================================================
-- Görsel yedek tabloları (#51: görselleri DB'den ayırma)
-- ----------------------------------------------------------
-- Ürün/renk görselleri, kullanıcı avatarı ve firma logosu eskiden
-- base64 data URL olarak ilgili kolonlarda (products.image LONGTEXT,
-- products.colorImages JSON, users.avatar TEXT, settings.company JSON)
-- tutuluyordu. `scripts/migrate-images-to-files.mts` bu değerleri diske
-- (/uploads) taşıyıp kolonları URL'e çevirir.
--
-- Bu geçiş, dönüştürme ÖNCESİ orijinal base64 değerlerini koruyan yedek
-- tabloları oluşturur; böylece migration tamamen geri alınabilir kalır
-- (veri kaybı yok). Yedekler doğrulandıktan sonra ayrı bir temizlik
-- geçişiyle (009) düşürülebilir — o geçiş bilinçli olarak henüz eklenmedi.
--
-- Additive: hiçbir mevcut kolon değiştirilmez veya düşürülmez.
-- ==========================================================

CREATE TABLE IF NOT EXISTS `products_image_backup` (
  `productId`   BIGINT UNSIGNED NOT NULL,
  `image`       LONGTEXT        NULL,
  `colorImages` JSON            NULL,
  `backedUpAt`  DATETIME        NULL,
  PRIMARY KEY (`productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS `users_avatar_backup` (
  `userId`     BIGINT UNSIGNED NOT NULL,
  `avatar`     TEXT            NULL,
  `backedUpAt` DATETIME        NULL,
  PRIMARY KEY (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS `settings_company_backup` (
  `id`         VARCHAR(50) NOT NULL,
  `company`    JSON        NULL,
  `backedUpAt` DATETIME    NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Mevcut base64 değerlerini yedekle (INSERT IGNORE: ilk yedek korunur,
-- migration script'i birden çok kez çalışsa bile orijinalin üzerine yazılmaz).
INSERT IGNORE INTO `products_image_backup` (`productId`, `image`, `colorImages`, `backedUpAt`)
SELECT `id`, `image`, `colorImages`, NOW() FROM `products`
WHERE (`image` IS NOT NULL AND `image` <> '') OR `colorImages` IS NOT NULL;

INSERT IGNORE INTO `users_avatar_backup` (`userId`, `avatar`, `backedUpAt`)
SELECT `id`, `avatar`, NOW() FROM `users`
WHERE `avatar` IS NOT NULL AND `avatar` <> '';

INSERT IGNORE INTO `settings_company_backup` (`id`, `company`, `backedUpAt`)
SELECT `id`, `company`, NOW() FROM `settings`
WHERE `company` IS NOT NULL;
