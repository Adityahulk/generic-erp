-- Unified leave: new tables, attendance.status, remove legacy leave_requests

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status VARCHAR(20);

DROP TABLE IF EXISTS leave_requests CASCADE;

CREATE TABLE leave_types (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL,
  code                  VARCHAR(20) NOT NULL,
  days_per_year         INTEGER NOT NULL DEFAULT 0,
  is_paid               BOOLEAN NOT NULL DEFAULT TRUE,
  carry_forward         BOOLEAN NOT NULL DEFAULT FALSE,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE INDEX idx_leave_types_company ON leave_types(company_id) WHERE is_active = TRUE;

CREATE TABLE leave_applications (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id             UUID REFERENCES branches(id),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  leave_type_id         UUID NOT NULL REFERENCES leave_types(id),
  from_date             DATE NOT NULL,
  to_date               DATE NOT NULL,
  total_days            NUMERIC(4,1) NOT NULL,
  half_day              BOOLEAN NOT NULL DEFAULT FALSE,
  reason                TEXT NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by           UUID REFERENCES users(id),
  review_note           TEXT,
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT chk_leave_app_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX idx_leave_apps_company ON leave_applications(company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_leave_apps_user ON leave_applications(user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_leave_apps_branch_pending ON leave_applications(company_id, branch_id, status)
  WHERE is_deleted = FALSE AND status = 'pending';

CREATE TRIGGER set_updated_at_leave_types
  BEFORE UPDATE ON leave_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_leave_applications
  BEFORE UPDATE ON leave_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
