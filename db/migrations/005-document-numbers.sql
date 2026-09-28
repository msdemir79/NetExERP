-- ==========================================================
-- Belge/fiş numarası sayaçları (item 8: concurrency hardening)
-- ----------------------------------------------------------
-- Numara üretimi eskiden COUNT(*)+1 ile kilitsiz yapılıyordu;
-- eşzamanlı iki istek aynı numarayı hesaplayıp UNIQUE çakışması
-- (ER_DUP_ENTRY → 500) üretebiliyordu. Bu tablo, her (scope,prefix,year)
-- için atomik (satır kilitli) bir sayaç tutar. Sayaç satırı ilk
-- kullanımda hedef tablodaki mevcut maksimum numaradan tembel olarak
-- başlatılır; böylece mevcut verilerle çakışmaz.
-- ==========================================================
CREATE TABLE IF NOT EXISTS `documentNumbers` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scope`      VARCHAR(50)     NOT NULL,
  `prefix`     VARCHAR(20)     NOT NULL,
  `year`       INT             NOT NULL,
  `lastNumber` BIGINT          NOT NULL DEFAULT 0,
  `updatedAt`  DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_documentNumbers_scope_prefix_year` (`scope`, `prefix`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_turkish_ci;
