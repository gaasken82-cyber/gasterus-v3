BEGIN;

CREATE TABLE IF NOT EXISTS member_notifications (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'DEPOSIT_APPROVED','WITHDRAW_APPROVED','WALLET_REJECTED',
    'TOGEL_WIN','SPORTSBOOK_WIN','BET_SETTLED','SYSTEM'
  )),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  amount BIGINT,
  reference_type TEXT,
  reference_id TEXT,
  action_url TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(member_id, notification_type, reference_type, reference_id)
);
CREATE INDEX IF NOT EXISTS member_notifications_member_idx
  ON member_notifications(member_id, read_at, created_at DESC);

COMMIT;
