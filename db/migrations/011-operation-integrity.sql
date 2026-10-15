CREATE TABLE IF NOT EXISTS operationRequests (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `userId` BIGINT UNSIGNED NOT NULL,
  `scope` VARCHAR(100) NOT NULL,
  `requestKey` VARCHAR(100) NOT NULL,
  `payloadHash` CHAR(64) NOT NULL,
  `result` JSON NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_operation_request` (`userId`, `scope`, `requestKey`),
  KEY `idx_operation_completed` (`completedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
