BEGIN;

CREATE TABLE IF NOT EXISTS member_compliance_profiles (
  member_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  kyc_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (kyc_status IN ('UNVERIFIED','PENDING','VERIFIED','REJECTED','REVIEW')),
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  country_code TEXT,
  date_of_birth DATE,
  verification_provider TEXT,
  verification_reference TEXT,
  verified_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_compliance_risk_idx ON member_compliance_profiles(risk_level,risk_score DESC);
CREATE INDEX IF NOT EXISTS member_compliance_kyc_idx ON member_compliance_profiles(kyc_status,updated_at DESC);

CREATE TABLE IF NOT EXISTS kyc_reviews (
  id UUID PRIMARY KEY,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('PENDING','VERIFIED','REJECTED','REVIEW')),
  document_type TEXT,
  document_reference TEXT,
  provider_name TEXT,
  provider_reference TEXT,
  review_notes TEXT,
  requested_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_reviews_member_idx ON kyc_reviews(member_id,created_at DESC);
CREATE INDEX IF NOT EXISTS kyc_reviews_status_idx ON kyc_reviews(status,created_at DESC);

CREATE TABLE IF NOT EXISTS responsible_play_profiles (
  member_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deposit_daily_limit BIGINT CHECK (deposit_daily_limit IS NULL OR deposit_daily_limit >= 0),
  deposit_weekly_limit BIGINT CHECK (deposit_weekly_limit IS NULL OR deposit_weekly_limit >= 0),
  deposit_monthly_limit BIGINT CHECK (deposit_monthly_limit IS NULL OR deposit_monthly_limit >= 0),
  spend_daily_limit BIGINT CHECK (spend_daily_limit IS NULL OR spend_daily_limit >= 0),
  session_minutes_limit INTEGER CHECK (session_minutes_limit IS NULL OR session_minutes_limit BETWEEN 15 AND 1440),
  cooling_off_until TIMESTAMPTZ,
  self_excluded_until TIMESTAMPTZ,
  pending_limits JSONB,
  pending_effective_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'MEMBER' CHECK (source IN ('MEMBER','ADMIN','SYSTEM')),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY,
  member_id UUID REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('MEMBER','ADMIN','SYSTEM')),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  username_hint TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events(event_type,created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_member_idx ON security_events(member_id,created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_ip_idx ON security_events(ip_address,created_at DESC);

CREATE TABLE IF NOT EXISTS risk_alerts (
  id UUID PRIMARY KEY,
  member_id UUID REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  title TEXT NOT NULL,
  description TEXT,
  fingerprint TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','RESOLVED','DISMISSED')),
  assigned_to UUID REFERENCES users(id),
  resolution TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS risk_alerts_open_fingerprint_idx ON risk_alerts(fingerprint) WHERE status IN ('OPEN','IN_REVIEW');
CREATE INDEX IF NOT EXISTS risk_alerts_queue_idx ON risk_alerts(status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS support_cases (
  id UUID PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  member_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ASSIGNED','WAITING_MEMBER','RESOLVED','CLOSED')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  member_note TEXT,
  assigned_to UUID REFERENCES users(id),
  resolution TEXT,
  created_by UUID REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_cases_status_idx ON support_cases(status,priority,created_at DESC);
CREATE INDEX IF NOT EXISTS support_cases_member_idx ON support_cases(member_id,created_at DESC);

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY,
  business_date DATE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('DEPOSIT','WITHDRAW')),
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  system_amount BIGINT NOT NULL DEFAULT 0,
  external_amount BIGINT NOT NULL DEFAULT 0,
  difference_amount BIGINT NOT NULL DEFAULT 0,
  transaction_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('MATCHED','MISMATCH','REVIEW')),
  reference_note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconciliation_runs_date_idx ON reconciliation_runs(business_date DESC,created_at DESC);

INSERT INTO system_settings(setting_key,setting_value,description,is_public) VALUES
 ('compliance.withdraw','{"requireVerifiedKyc":false}'::jsonb,'Optional KYC gate before withdrawal',FALSE)
ON CONFLICT(setting_key) DO NOTHING;

INSERT INTO roles(code,name,permissions) VALUES
 ('COMPLIANCE','Compliance','["members:read","compliance:read","compliance:write","responsible:write","risk:read","risk:write","reports:read"]'::jsonb),
 ('ANALYST','Analyst','["members:read","wallet:read","bets:read","reports:read","risk:read"]'::jsonb)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,permissions=EXCLUDED.permissions;

UPDATE roles SET permissions='["approvals:read","approvals:approve","bets:read","wallet:read","members:read","content:write","compliance:read","risk:read","support:write","reports:read"]'::jsonb WHERE code='SUPERVISOR';
UPDATE roles SET permissions='["wallet:read","wallet:review","members:read","payments:write","reconciliation:write","reports:read"]'::jsonb WHERE code='FINANCE';
UPDATE roles SET permissions='["members:read","bets:read","wallet:read","support:write","compliance:read"]'::jsonb WHERE code='SUPPORT';
UPDATE roles SET permissions='["audit:read","roles:write","mfa:reset","sessions:revoke","members:credential-reset","security:read","risk:read","risk:write","compliance:read","compliance:write","responsible:write"]'::jsonb WHERE code='SECURITY';

COMMIT;
