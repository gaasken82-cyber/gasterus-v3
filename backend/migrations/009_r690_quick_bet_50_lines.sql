-- R6.9.0 Quick Bet 2D: Besar/Kecil/Ganjil/Genap always expands to exactly 50 selections.
-- Ensure every TOTO market accepts at least 50 rows in one order while preserving larger configured limits.
ALTER TABLE market_betting_configs ALTER COLUMN max_rows SET DEFAULT 50;
UPDATE market_betting_configs SET max_rows=GREATEST(max_rows,50),updated_at=now() WHERE max_rows<50;
