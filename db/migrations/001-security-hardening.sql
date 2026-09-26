-- ============================================================================
-- Güvenlik sıkılaştırma geçişi (mevcut kurulumlar için)
--
-- Yeni kurulumlarda db/schema.sql zaten bu kolonları içermez. Daha önce
-- kurulmuş bir veritabanında kalan kullanılabilir alanları temizler:
--
--   pinCode          : düz metin parola/PIN kolonu (kaldırılır)
--   sessionToken     : oturum belirteci artık sunucu belleğinde tutulur
--   sessionExpiresAt : oturum ömrü sunucu tarafından yönetilir
--
-- Kullanım: npm run db:migrate
--
-- Not: passwordHash/passwordSalt kolonları KORUNUR. Eski sha256 kayıtları,
-- kullanıcının ilk başarılı girişinde sunucu tarafından scrypt biçimine
-- yükseltilir; bu nedenle veri kaybı olmaz.
-- ============================================================================

-- MySQL 8 `DROP COLUMN IF EXISTS` desteklemediği için varlık kontrolü
-- information_schema üzerinden yapılır.

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'pinCode');
SET @sql = IF(@exists > 0, 'ALTER TABLE `users` DROP COLUMN `pinCode`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'sessionToken');
SET @sql = IF(@exists > 0, 'ALTER TABLE `users` DROP COLUMN `sessionToken`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'sessionExpiresAt');
SET @sql = IF(@exists > 0, 'ALTER TABLE `users` DROP COLUMN `sessionExpiresAt`', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
