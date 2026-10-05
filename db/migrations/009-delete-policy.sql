-- ==========================================================
-- 009: Silme politikası — denetim izi ve muhasebe dönemi kilidi
-- Additive, yıkıcı DEĞİL: hiçbir satır silinmez/değiştirilmez.
--
-- 1) periodLocks.scope: tablo bugüne kadar yalnızca İK (puantaj/bordro)
--    dönem kilidi için kullanılıyordu. Muhasebe dönemi kilidi aynı tabloda
--    'accounting' kapsamıyla tutulur; mevcut satırlar DEFAULT 'hr' alır.
-- 2) auditLogs.reason/recordSummary: silme işlemlerinde kullanıcının girdiği
--    zorunlu gerekçe ve silinen kaydın tek satırlık tanıtıcısı ("hangi kayıt
--    silindi" sorusunun cevabı). Satır içeriğinin kopyası tutulmaz, geri yükleme yoktur.
-- ==========================================================
ALTER TABLE `periodLocks`
  ADD COLUMN `scope` ENUM('hr','accounting') NOT NULL DEFAULT 'hr' AFTER `id`;

ALTER TABLE `periodLocks`
  DROP INDEX `uq_periodLocks_month_year`,
  ADD UNIQUE KEY `uq_periodLocks_scope_month_year` (`scope`, `month`, `year`);

ALTER TABLE `auditLogs`
  ADD COLUMN `reason` TEXT NULL AFTER `details`,
  ADD COLUMN `recordSummary` VARCHAR(500) NULL AFTER `reason`;

ALTER TABLE `auditLogs`
  ADD KEY `idx_auditLogs_action_timestamp` (`action`, `timestamp`);
