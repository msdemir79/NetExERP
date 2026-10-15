-- İş emirlerine üretim hattı (line) alanı: Kontrol Merkezi'nde hat bazında
-- filtreleme/izleme için. Additive, NULL-geçer → mevcut kayıtlar etkilenmez.
ALTER TABLE workOrders
  ADD COLUMN `line` VARCHAR(50) NULL AFTER `materialStatus`;
