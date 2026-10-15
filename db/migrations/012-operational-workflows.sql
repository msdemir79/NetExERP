CREATE TABLE IF NOT EXISTS stockReservations (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `productId` BIGINT UNSIGNED NOT NULL,
  `orderId` BIGINT UNSIGNED NULL,
  `workOrderId` BIGINT UNSIGNED NULL,
  `color` VARCHAR(80) NULL,
  `size` VARCHAR(50) NULL,
  `quantity` DECIMAL(15,4) NOT NULL,
  `remainingQuantity` DECIMAL(15,4) NOT NULL,
  `status` ENUM('active','consumed','released') NOT NULL DEFAULT 'active',
  `createdBy` BIGINT UNSIGNED NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `releasedAt` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reservations_product_status` (`productId`,`status`),
  KEY `idx_reservations_order` (`orderId`),
  KEY `idx_reservations_workOrder` (`workOrderId`),
  CONSTRAINT `fk_reservation_product` FOREIGN KEY (`productId`) REFERENCES products (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_reservation_order` FOREIGN KEY (`orderId`) REFERENCES orders (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_reservation_workOrder` FOREIGN KEY (`workOrderId`) REFERENCES workOrders (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS qualityChecks (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workOrderId` BIGINT UNSIGNED NOT NULL,
  `inspectedQuantity` DECIMAL(15,4) NOT NULL,
  `rejectedQuantity` DECIMAL(15,4) NOT NULL DEFAULT 0,
  `result` ENUM('pass','fail') NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `notes` TEXT NOT NULL,
  `createdBy` BIGINT UNSIGNED NOT NULL,
  `approvedBy` BIGINT UNSIGNED NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `approvedAt` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_quality_workOrder_status` (`workOrderId`,`status`),
  CONSTRAINT `fk_quality_workOrder` FOREIGN KEY (`workOrderId`) REFERENCES workOrders (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

CREATE TABLE IF NOT EXISTS purchaseRequests (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `requestNumber` VARCHAR(50) NOT NULL,
  `supplierId` BIGINT UNSIGNED NOT NULL,
  `items` JSON NOT NULL,
  `totalAmount` DECIMAL(15,2) NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `notes` TEXT NOT NULL,
  `decisionReason` TEXT NULL,
  `createdBy` BIGINT UNSIGNED NOT NULL,
  `approvedBy` BIGINT UNSIGNED NULL,
  `orderId` BIGINT UNSIGNED NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decidedAt` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchase_request_number` (`requestNumber`),
  KEY `idx_purchase_requests_status` (`status`),
  CONSTRAINT `fk_purchase_request_supplier` FOREIGN KEY (`supplierId`) REFERENCES contacts (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_purchase_request_order` FOREIGN KEY (`orderId`) REFERENCES orders (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
