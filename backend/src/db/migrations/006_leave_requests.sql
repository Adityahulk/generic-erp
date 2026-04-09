CREATE TABLE IF NOT EXISTS leave_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  branch_id    UUID NOT NULL REFERENCES branches(id),
  user_id      UUID NOT NULL REFERENCES users(id),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  leave_type   VARCHAR(50) NOT NULL DEFAULT 'casual',
  reason       TEXT,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by  UUID REFERENCES users(id),
  reviewed_at  TIMESTAMPTZ,
  manager_note TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_leave_requests_company ON leave_requests(company_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_leave_requests_branch_status ON leave_requests(branch_id, status) WHERE is_deleted = FALSE;
CREATE INDEX idx_leave_requests_user ON leave_requests(user_id) WHERE is_deleted = FALSE;
