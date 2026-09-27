-- ============================================================================
-- Yabanci anahtar (FK) butunlugu gecisi
--
-- db/schema.sql'de halihazirda 10 FK tanimlidir (orderItems->orders,
-- invoiceItems->invoices, waybillItems->waybills, recipes/inventoryLogs/
-- workOrders->products, ve 4 IK tablosu->employees). Bu gecis, kod seviyesinde
-- var olan ama DB seviyesinde ZORLANMAYAN mantiksal referanslari ekler;
-- boylece dogrudan SQL, bulk islemler veya yaris durumlari altinda bile
-- oksuz kayit olusamaz (uygulama guard'lari icin savunma derinligi).
--
-- ILKE (yikici degil):
--   * NOT NULL yapisal referanslar  -> ON DELETE RESTRICT  (silme engellenir;
--     zaten uygulama guard'i once 409 doner, bu DB seviyesi ikinci kalkan).
--   * Nullable referanslar          -> ON DELETE SET NULL   (ebeveyn silinirse
--     bag NULL'lanir; cocuk kayit KORUNUR, veri kaybı yok).
--   * Veri BOZAN 'ON DELETE CASCADE' hicbir yeni FK'de kullanilmaz.
--
-- GUVENLIK:
--   * Her FK yalnizca yoksa eklenir (information_schema kontrolu) -> idempotent.
--   * SET NULL FK'lerden once varsa oksuz baglar NULL'lanir (zaten gecersiz
--     isaretci; kayit silinmez).
--   * RESTRICT FK'ler yalnizca OKSUZ YOKSA eklenir; oksuz varsa ALTER atlanir
--     (migration patlamaz, once veri duzeltilmelidir).
--   * journalEntries.documentId ve payrollRecords.paidFromId POLIMORFIK
--     (documentType/paidFromType'a gore farkli tabloya isaret eder) -> FK EKLENMEZ.
--
-- Kullanım: npm run db:migrate
-- Not: Yeni kurulumlarda db/schema.sql bu FK'leri zaten icerir.
-- ============================================================================

-- orders.contactId -> contacts [fk_orders_contact] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `orders` c WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND CONSTRAINT_NAME='fk_orders_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- orderItems.productId -> products [fk_orderItems_product] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `orderItems` c WHERE c.`productId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`id` = c.`productId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orderItems' AND CONSTRAINT_NAME='fk_orderItems_product' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `orderItems` ADD CONSTRAINT `fk_orderItems_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoices.contactId -> contacts [fk_invoices_contact] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `invoices` c WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND CONSTRAINT_NAME='fk_invoices_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybills.contactId -> contacts [fk_waybills_contact] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `waybills` c WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybills' AND CONSTRAINT_NAME='fk_waybills_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `waybills` ADD CONSTRAINT `fk_waybills_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- users.roleId -> roles [fk_users_role] (RESTRICT)
SET @orph := (SELECT COUNT(*) FROM `users` c WHERE c.`roleId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `roles` p WHERE p.`id` = c.`roleId`));
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND CONSTRAINT_NAME='fk_users_role' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0 AND @orph=0, 'ALTER TABLE `users` ADD CONSTRAINT `fk_users_role` FOREIGN KEY (`roleId`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoices.orderId -> orders [fk_invoices_order] (SET NULL)
UPDATE `invoices` c SET c.`orderId` = NULL WHERE c.`orderId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` p WHERE p.`id` = c.`orderId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND CONSTRAINT_NAME='fk_invoices_order' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoices.waybillId -> waybills [fk_invoices_waybill] (SET NULL)
UPDATE `invoices` c SET c.`waybillId` = NULL WHERE c.`waybillId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `waybills` p WHERE p.`id` = c.`waybillId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoices' AND CONSTRAINT_NAME='fk_invoices_waybill' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoices` ADD CONSTRAINT `fk_invoices_waybill` FOREIGN KEY (`waybillId`) REFERENCES `waybills` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoiceItems.productId -> products [fk_invoiceItems_product] (SET NULL)
UPDATE `invoiceItems` c SET c.`productId` = NULL WHERE c.`productId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`id` = c.`productId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoiceItems' AND CONSTRAINT_NAME='fk_invoiceItems_product' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoiceItems` ADD CONSTRAINT `fk_invoiceItems_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- invoiceItems.orderItemId -> orderItems [fk_invoiceItems_orderItem] (SET NULL)
UPDATE `invoiceItems` c SET c.`orderItemId` = NULL WHERE c.`orderItemId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orderItems` p WHERE p.`id` = c.`orderItemId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='invoiceItems' AND CONSTRAINT_NAME='fk_invoiceItems_orderItem' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `invoiceItems` ADD CONSTRAINT `fk_invoiceItems_orderItem` FOREIGN KEY (`orderItemId`) REFERENCES `orderItems` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybills.orderId -> orders [fk_waybills_order] (SET NULL)
UPDATE `waybills` c SET c.`orderId` = NULL WHERE c.`orderId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` p WHERE p.`id` = c.`orderId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybills' AND CONSTRAINT_NAME='fk_waybills_order' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybills` ADD CONSTRAINT `fk_waybills_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybills.invoiceId -> invoices [fk_waybills_invoice] (SET NULL)
UPDATE `waybills` c SET c.`invoiceId` = NULL WHERE c.`invoiceId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `invoices` p WHERE p.`id` = c.`invoiceId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybills' AND CONSTRAINT_NAME='fk_waybills_invoice' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybills` ADD CONSTRAINT `fk_waybills_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybillItems.productId -> products [fk_waybillItems_product] (SET NULL)
UPDATE `waybillItems` c SET c.`productId` = NULL WHERE c.`productId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `products` p WHERE p.`id` = c.`productId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybillItems' AND CONSTRAINT_NAME='fk_waybillItems_product' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybillItems` ADD CONSTRAINT `fk_waybillItems_product` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- waybillItems.orderItemId -> orderItems [fk_waybillItems_orderItem] (SET NULL)
UPDATE `waybillItems` c SET c.`orderItemId` = NULL WHERE c.`orderItemId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orderItems` p WHERE p.`id` = c.`orderItemId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='waybillItems' AND CONSTRAINT_NAME='fk_waybillItems_orderItem' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `waybillItems` ADD CONSTRAINT `fk_waybillItems_orderItem` FOREIGN KEY (`orderItemId`) REFERENCES `orderItems` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workOrders.orderId -> orders [fk_workOrders_order] (SET NULL)
UPDATE `workOrders` c SET c.`orderId` = NULL WHERE c.`orderId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` p WHERE p.`id` = c.`orderId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workOrders' AND CONSTRAINT_NAME='fk_workOrders_order' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `workOrders` ADD CONSTRAINT `fk_workOrders_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workOrders.orderItemId -> orderItems [fk_workOrders_orderItem] (SET NULL)
UPDATE `workOrders` c SET c.`orderItemId` = NULL WHERE c.`orderItemId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orderItems` p WHERE p.`id` = c.`orderItemId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workOrders' AND CONSTRAINT_NAME='fk_workOrders_orderItem' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `workOrders` ADD CONSTRAINT `fk_workOrders_orderItem` FOREIGN KEY (`orderItemId`) REFERENCES `orderItems` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- workOrders.recipeId -> recipes [fk_workOrders_recipe] (SET NULL)
UPDATE `workOrders` c SET c.`recipeId` = NULL WHERE c.`recipeId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `recipes` p WHERE p.`id` = c.`recipeId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workOrders' AND CONSTRAINT_NAME='fk_workOrders_recipe' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `workOrders` ADD CONSTRAINT `fk_workOrders_recipe` FOREIGN KEY (`recipeId`) REFERENCES `recipes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- transactions.contactId -> contacts [fk_transactions_contact] (SET NULL)
UPDATE `transactions` c SET c.`contactId` = NULL WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND CONSTRAINT_NAME='fk_transactions_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `transactions` ADD CONSTRAINT `fk_transactions_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- transactions.orderId -> orders [fk_transactions_order] (SET NULL)
UPDATE `transactions` c SET c.`orderId` = NULL WHERE c.`orderId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` p WHERE p.`id` = c.`orderId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='transactions' AND CONSTRAINT_NAME='fk_transactions_order' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `transactions` ADD CONSTRAINT `fk_transactions_order` FOREIGN KEY (`orderId`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.assortmentTemplateId -> assortmentTemplates [fk_products_assortmentTemplate] (SET NULL)
UPDATE `products` c SET c.`assortmentTemplateId` = NULL WHERE c.`assortmentTemplateId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `assortmentTemplates` p WHERE p.`id` = c.`assortmentTemplateId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND CONSTRAINT_NAME='fk_products_assortmentTemplate' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `products` ADD CONSTRAINT `fk_products_assortmentTemplate` FOREIGN KEY (`assortmentTemplateId`) REFERENCES `assortmentTemplates` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- products.preferredSupplierId -> contacts [fk_products_supplier] (SET NULL)
UPDATE `products` c SET c.`preferredSupplierId` = NULL WHERE c.`preferredSupplierId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`preferredSupplierId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND CONSTRAINT_NAME='fk_products_supplier' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `products` ADD CONSTRAINT `fk_products_supplier` FOREIGN KEY (`preferredSupplierId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.contactId -> contacts [fk_checks_contact] (SET NULL)
UPDATE `checks` c SET c.`contactId` = NULL WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.endorsedToContactId -> contacts [fk_checks_endorsedContact] (SET NULL)
UPDATE `checks` c SET c.`endorsedToContactId` = NULL WHERE c.`endorsedToContactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`endorsedToContactId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_endorsedContact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_endorsedContact` FOREIGN KEY (`endorsedToContactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.journalEntryId -> journalEntries [fk_checks_journalEntry] (SET NULL)
UPDATE `checks` c SET c.`journalEntryId` = NULL WHERE c.`journalEntryId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `journalEntries` p WHERE p.`id` = c.`journalEntryId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_journalEntry' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_journalEntry` FOREIGN KEY (`journalEntryId`) REFERENCES `journalEntries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.targetBankAccountId -> bankAccounts [fk_checks_targetBank] (SET NULL)
UPDATE `checks` c SET c.`targetBankAccountId` = NULL WHERE c.`targetBankAccountId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `bankAccounts` p WHERE p.`id` = c.`targetBankAccountId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_targetBank' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_targetBank` FOREIGN KEY (`targetBankAccountId`) REFERENCES `bankAccounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- checks.targetCashBoxId -> cashBoxes [fk_checks_targetCashBox] (SET NULL)
UPDATE `checks` c SET c.`targetCashBoxId` = NULL WHERE c.`targetCashBoxId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `cashBoxes` p WHERE p.`id` = c.`targetCashBoxId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='checks' AND CONSTRAINT_NAME='fk_checks_targetCashBox' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `checks` ADD CONSTRAINT `fk_checks_targetCashBox` FOREIGN KEY (`targetCashBoxId`) REFERENCES `cashBoxes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.contactId -> contacts [fk_collectionReceipts_contact] (SET NULL)
UPDATE `collectionReceipts` c SET c.`contactId` = NULL WHERE c.`contactId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `contacts` p WHERE p.`id` = c.`contactId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_contact' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_contact` FOREIGN KEY (`contactId`) REFERENCES `contacts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.cashBoxId -> cashBoxes [fk_collectionReceipts_cashBox] (SET NULL)
UPDATE `collectionReceipts` c SET c.`cashBoxId` = NULL WHERE c.`cashBoxId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `cashBoxes` p WHERE p.`id` = c.`cashBoxId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_cashBox' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_cashBox` FOREIGN KEY (`cashBoxId`) REFERENCES `cashBoxes` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.bankAccountId -> bankAccounts [fk_collectionReceipts_bank] (SET NULL)
UPDATE `collectionReceipts` c SET c.`bankAccountId` = NULL WHERE c.`bankAccountId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `bankAccounts` p WHERE p.`id` = c.`bankAccountId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_bank' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_bank` FOREIGN KEY (`bankAccountId`) REFERENCES `bankAccounts` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.checkId -> checks [fk_collectionReceipts_check] (SET NULL)
UPDATE `collectionReceipts` c SET c.`checkId` = NULL WHERE c.`checkId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `checks` p WHERE p.`id` = c.`checkId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_check' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_check` FOREIGN KEY (`checkId`) REFERENCES `checks` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.invoiceId -> invoices [fk_collectionReceipts_invoice] (SET NULL)
UPDATE `collectionReceipts` c SET c.`invoiceId` = NULL WHERE c.`invoiceId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `invoices` p WHERE p.`id` = c.`invoiceId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_invoice' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_invoice` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- collectionReceipts.journalEntryId -> journalEntries [fk_collectionReceipts_journalEntry] (SET NULL)
UPDATE `collectionReceipts` c SET c.`journalEntryId` = NULL WHERE c.`journalEntryId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `journalEntries` p WHERE p.`id` = c.`journalEntryId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='collectionReceipts' AND CONSTRAINT_NAME='fk_collectionReceipts_journalEntry' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `collectionReceipts` ADD CONSTRAINT `fk_collectionReceipts_journalEntry` FOREIGN KEY (`journalEntryId`) REFERENCES `journalEntries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payrollRecords.journalEntryId -> journalEntries [fk_payrollRecords_journalEntry] (SET NULL)
UPDATE `payrollRecords` c SET c.`journalEntryId` = NULL WHERE c.`journalEntryId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `journalEntries` p WHERE p.`id` = c.`journalEntryId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payrollRecords' AND CONSTRAINT_NAME='fk_payrollRecords_journalEntry' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `payrollRecords` ADD CONSTRAINT `fk_payrollRecords_journalEntry` FOREIGN KEY (`journalEntryId`) REFERENCES `journalEntries` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- auditLogs.userId -> users [fk_auditLogs_user] (SET NULL)
UPDATE `auditLogs` c SET c.`userId` = NULL WHERE c.`userId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `users` p WHERE p.`id` = c.`userId`);
SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auditLogs' AND CONSTRAINT_NAME='fk_auditLogs_user' AND CONSTRAINT_TYPE='FOREIGN KEY');
SET @sql := IF(@fk=0, 'ALTER TABLE `auditLogs` ADD CONSTRAINT `fk_auditLogs_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'DO 0');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
