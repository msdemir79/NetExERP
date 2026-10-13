-- ==========================================================
-- 010 - KALIP (LAST) TAKİP MODÜLÜ
-- Additive, yıkıcı DEĞİL: yalnızca yeni tablolar ekler.
--
-- Ayakkabı kalıpları çift bazında, numara kırılımlı ve konum
-- kovaları (fabrika / fason / bakım / hurda) ile takip edilir.
-- Bir çift her anda TEK kovada durur => çift sayımı mükerrer olmaz.
-- Numara kümesi mevcut asorti şablonlarından (assortmentTemplates)
-- türer; molds.assortmentTemplateId bu bağı kurar.
-- ==========================================================

-- Kalıp ana kartı
CREATE TABLE IF NOT EXISTS molds (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`                 VARCHAR(50)     NOT NULL,
  `name`                 VARCHAR(255)    NOT NULL,
  `productId`            BIGINT UNSIGNED NULL,
  `moldType`             VARCHAR(50)     NULL,
  `brand`                VARCHAR(100)    NULL,
  `sizeRange`            VARCHAR(50)     NULL,
  `material`             VARCHAR(50)     NULL,
  `supplierId`           BIGINT UNSIGNED NULL,
  `supplierName`         VARCHAR(255)    NULL,
  `purchaseCost`         DECIMAL(15,2)   NULL,
  `currency`             VARCHAR(10)     NULL DEFAULT 'TRY',
  `firstRecordDate`      DATETIME        NULL,
  `description`          TEXT            NULL,
  `image`                LONGTEXT        NULL,
  `barcode`              VARCHAR(80)     NULL,
  `assortmentTemplateId` BIGINT UNSIGNED NULL,
  `assortment`           JSON            NULL,
  `isActive`             TINYINT(1)      NOT NULL DEFAULT 1,
  `createdAt`            DATETIME        NULL,
  `updatedAt`            DATETIME        NULL,
  `version`              INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_molds_code` (`code`),
  KEY `idx_molds_name` (`name`),
  KEY `idx_molds_productId` (`productId`),
  KEY `idx_molds_supplierId` (`supplierId`),
  KEY `idx_molds_assortmentTemplateId` (`assortmentTemplateId`),
  KEY `idx_molds_isActive` (`isActive`),
  CONSTRAINT fk_molds_product     FOREIGN KEY (`productId`)            REFERENCES products (`id`)            ON DELETE SET NULL,
  CONSTRAINT fk_molds_supplier    FOREIGN KEY (`supplierId`)           REFERENCES contacts (`id`)            ON DELETE SET NULL,
  CONSTRAINT fk_molds_assortment  FOREIGN KEY (`assortmentTemplateId`) REFERENCES assortmentTemplates (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Kalıp stok kovaları: (kalıp, numara, konum, fason cari, iş emri) başına çift.
-- subcontractId/workOrderId 0 = "yok" (UNIQUE içinde NULL çalışmadığı için).
CREATE TABLE IF NOT EXISTS moldStock (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `moldId`        BIGINT UNSIGNED NOT NULL,
  `size`          VARCHAR(50)     NOT NULL,
  `locationType`  VARCHAR(30)     NOT NULL,
  `subcontractId` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `workOrderId`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `pairs`         DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `looseLeft`     INT             NOT NULL DEFAULT 0,
  `looseRight`    INT             NOT NULL DEFAULT 0,
  `updatedAt`     DATETIME        NULL,
  `version`       INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_moldStock_bucket` (`moldId`, `size`, `locationType`, `subcontractId`, `workOrderId`),
  KEY `idx_moldStock_moldId` (`moldId`),
  KEY `idx_moldStock_locationType` (`locationType`),
  CONSTRAINT fk_moldStock_mold FOREIGN KEY (`moldId`) REFERENCES molds (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Kalıp hareket başlıkları (ledger; yalnızca op'lar yazar)
CREATE TABLE IF NOT EXISTS moldMovements (
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `movementNo`        VARCHAR(50)     NOT NULL,
  `type`              VARCHAR(30)     NOT NULL,
  `date`              DATETIME        NOT NULL,
  `moldId`            BIGINT UNSIGNED NOT NULL,
  `fromLocationType`  VARCHAR(30)     NULL,
  `fromSubcontractId` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `fromWorkOrderId`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `toLocationType`    VARCHAR(30)     NULL,
  `toSubcontractId`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `toWorkOrderId`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `sendId`            BIGINT UNSIGNED NULL,
  `userId`            BIGINT UNSIGNED NULL,
  `deliveredBy`       VARCHAR(150)    NULL,
  `receivedBy`        VARCHAR(150)    NULL,
  `description`       TEXT            NULL,
  `documentRef`       VARCHAR(80)     NULL,
  `createdAt`         DATETIME        NULL,
  `version`           INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_moldMovements_no` (`movementNo`),
  KEY `idx_moldMovements_moldId` (`moldId`),
  KEY `idx_moldMovements_type` (`type`),
  KEY `idx_moldMovements_date` (`date`),
  CONSTRAINT fk_moldMovements_mold FOREIGN KEY (`moldId`) REFERENCES molds (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;

-- Kalıp hareket satırları (numara bazında çift / tek parça)
CREATE TABLE IF NOT EXISTS moldMovementItems (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `movementId` BIGINT UNSIGNED NOT NULL,
  `moldId`     BIGINT UNSIGNED NOT NULL,
  `size`       VARCHAR(50)     NOT NULL,
  `pairs`      DECIMAL(15,4)   NOT NULL DEFAULT 0,
  `looseLeft`  INT             NOT NULL DEFAULT 0,
  `looseRight` INT             NOT NULL DEFAULT 0,
  `version`    INT             NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_moldMovementItems_movementId` (`movementId`),
  KEY `idx_moldMovementItems_moldId` (`moldId`),
  CONSTRAINT fk_moldMovementItems_movement FOREIGN KEY (`movementId`) REFERENCES moldMovements (`id`) ON DELETE CASCADE,
  CONSTRAINT fk_moldMovementItems_mold     FOREIGN KEY (`moldId`)     REFERENCES molds (`id`)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
