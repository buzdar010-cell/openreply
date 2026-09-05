-- Barcode-sourced products become real rows in `dishes` (source distinguishes
-- them from the hand-curated 228) -- this reuses every existing dish
-- mechanism (search, portion resolution, editing, logging) instead of a
-- parallel system. dish_id for these is "upc_<barcode>".
ALTER TABLE dishes ADD COLUMN source TEXT NOT NULL DEFAULT 'curated';

-- Barcodes that matched nothing in our own table, Open Food Facts, or a
-- label-photo AI extraction -- queued for manual review, same reasoning as
-- unmatched_logs for text/photo descriptions.
CREATE TABLE unmatched_barcodes (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  barcode TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_unmatched_barcodes_created ON unmatched_barcodes(created_at);
