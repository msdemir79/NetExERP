-- ==========================================================
-- 004: Cari hareket (transactions) iptal/void desteği
-- Additive, yıkıcı DEĞİL: mevcut satırlar DEFAULT 'posted' alır.
-- Fiziksel DELETE yerine cancel + ters kayıt (reversal) modeli.
-- ==========================================================
ALTER TABLE `transactions`
  ADD COLUMN `status` ENUM('posted','cancelled') NOT NULL DEFAULT 'posted' AFTER `version`,
  ADD COLUMN `cancelledAt` DATETIME NULL AFTER `status`,
  ADD COLUMN `reversalOfId` BIGINT UNSIGNED NULL AFTER `cancelledAt`;

ALTER TABLE `transactions`
  ADD KEY `idx_transactions_status` (`status`),
  ADD KEY `idx_transactions_reversalOfId` (`reversalOfId`);
