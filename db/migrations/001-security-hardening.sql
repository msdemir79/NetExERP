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
-- Kullanım:
--   mysql -u proerp -p proerp < db/migrations/001-security-hardening.sql
--
-- Not: passwordHash/passwordSalt kolonları KORUNUR. Eski sha256 kayıtları,
-- kullanıcının ilk başarılı girişinde sunucu tarafından scrypt biçimine
-- yükseltilir; bu nedenle veri kaybı olmaz.
-- ============================================================================

DROP PROCEDURE IF EXISTS proerp_drop_column_if_exists;

DELIMITER //
CREATE PROCEDURE proerp_drop_column_if_exists(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL proerp_drop_column_if_exists('users', 'pinCode');
CALL proerp_drop_column_if_exists('users', 'sessionToken');
CALL proerp_drop_column_if_exists('users', 'sessionExpiresAt');

DROP PROCEDURE IF EXISTS proerp_drop_column_if_exists;
