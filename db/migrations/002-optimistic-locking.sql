-- ============================================================================
-- İyimser kilitleme (optimistic locking) geçişi
--
-- Her tabloya `version` kolonu ekler. API katmanı bu sayacı her güncellemede
-- artırır; istemci okuduğu sürümü `expectedVersion` olarak gönderirse,
-- araya giren başka bir düzenleme 409 VERSION_CONFLICT ile reddedilir.
--
-- Kullanım: npm run db:migrate   (veya: mysql -u proerp -p proerp < bu_dosya.sql)
-- Not: Yeni kurulumlarda db/schema.sql bu kolonu zaten içerir.
-- ============================================================================

ALTER TABLE `contacts` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `assortmentTemplates` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `barcodeTemplates` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `products` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `recipes` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `workOrders` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `inventoryLogs` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `transactions` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `settings` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `orders` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `orderItems` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `invoices` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `invoiceItems` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `waybills` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `waybillItems` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `accounts` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `journalEntries` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `cashBoxes` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `bankAccounts` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `checks` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `collectionReceipts` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `employees` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `attendanceRecords` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `leaveRequests` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `advanceRequests` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `payrollRecords` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `periodLocks` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `roles` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `users` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
ALTER TABLE `auditLogs` ADD COLUMN `version` INT NOT NULL DEFAULT 1;
