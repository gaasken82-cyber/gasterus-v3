-- Audit untung-rugi riil per game.
--
-- Setiap settlement run menyimpan agregat per game: jumlah baris, total stake,
-- total bayar, EV riil (bayar/stake) dan EV teori (P(jp) x multiplier dari
-- config pasar). EV riil di atas 1,00 berarti platform membayar lebih besar dari
-- peluang jp game tersebut, jadi harus langsung diperiksa operator.
--
-- UNIQUE (market_id, period, game_code) + UPSERT membuat pencatatan idempoten:
-- run yang diulang atau settlement kedua untuk periode yang sama menimpa baris
-- yang sama, bukan menambah dobel.
CREATE TABLE IF NOT EXISTS game_settlement_audit (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID REFERENCES settlement_runs(id) ON DELETE SET NULL,
  market_id BIGINT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  game_code TEXT NOT NULL,
  line_count INTEGER NOT NULL DEFAULT 0,
  total_stake BIGINT NOT NULL DEFAULT 0,
  total_payout BIGINT NOT NULL DEFAULT 0,
  realized_ev NUMERIC(12,6) NOT NULL DEFAULT 0,
  theoretical_ev NUMERIC(12,6),
  anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, period, game_code)
);

CREATE INDEX IF NOT EXISTS game_settlement_audit_market_idx
  ON game_settlement_audit (market_id, period DESC);

CREATE INDEX IF NOT EXISTS game_settlement_audit_anomaly_idx
  ON game_settlement_audit (anomaly, recorded_at DESC)
  WHERE anomaly;