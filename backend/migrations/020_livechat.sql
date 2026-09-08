-- 020_livechat.sql — Live Chat Enterprise (standalone, terpisah dari sportsbook)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL DEFAULT 'Guest',
  status        TEXT NOT NULL DEFAULT 'waiting',     -- waiting | active | closed
  assigned_to   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  ip_hash       TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           BIGSERIAL PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender       TEXT NOT NULL,                        -- member | agent | system
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, id);
