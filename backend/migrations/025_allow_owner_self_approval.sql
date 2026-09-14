-- R6.95: Allow single-operator / OWNER to execute approvals without conflicting with the check constraint
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_check;
