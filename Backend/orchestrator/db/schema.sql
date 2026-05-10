CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ORGANIZATIONS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free'
                  CHECK (plan IN ('free','pro','team','enterprise')),
  billing_email       TEXT,
  stripe_customer_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── USERS & MEMBERSHIPS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'google',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'developer'
               CHECK (role IN ('owner','admin','developer','viewer')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

-- ─── PROJECTS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  description  TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at  TIMESTAMPTZ,
  settings     JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_project_org_slug ON projects (org_id, slug);

CREATE TABLE IF NOT EXISTS environments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  base_url    TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  headers     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── VAULT ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vault_secrets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key              TEXT NOT NULL,
  encrypted_value  TEXT NOT NULL,
  iv               TEXT,
  environment      TEXT NOT NULL DEFAULT 'Development',
  secret_type      TEXT NOT NULL DEFAULT 'API Key',
  description      TEXT,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

-- ─── TEST SUITES ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS test_suites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  test_case_ids JSONB NOT NULL DEFAULT '[]',
  archived_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_test_suites_project ON test_suites (project_id) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS suite_schedules (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  suite_id           UUID NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
  cron               TEXT NOT NULL,
  branch             TEXT NOT NULL DEFAULT 'main',
  enabled            BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suite_schedules_suite ON suite_schedules (suite_id);

-- ─── INTEGRATIONS ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS test_cases (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID         REFERENCES projects(id) ON DELETE CASCADE,
    created_by    UUID         REFERENCES users(id),
    status        TEXT         NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','draft','archived')),
    version       INT          NOT NULL DEFAULT 1,
    name          VARCHAR(255) NOT NULL,
    suite         VARCHAR(128),
    priority      VARCHAR(4),
    tags          JSONB        DEFAULT '[]',
    spec          JSONB        NOT NULL,
    last_run_id   TEXT,
    last_run_status TEXT,
    last_run_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases (project_id, status);
CREATE INDEX IF NOT EXISTS idx_test_cases_suite ON test_cases (suite);

CREATE TABLE IF NOT EXISTS test_runs (
    id                   VARCHAR(64)    PRIMARY KEY,
    test_case_id         VARCHAR(64)    REFERENCES test_cases(id) ON DELETE SET NULL,
    status               VARCHAR(32)    NOT NULL DEFAULT 'running',
    browser              VARCHAR(32),
    model                VARCHAR(64),
    started_at           TIMESTAMPTZ    DEFAULT NOW(),
    finished_at          TIMESTAMPTZ,
    duration_ms          INTEGER,
    total_steps          INTEGER        DEFAULT 0,
    total_tokens         INTEGER        DEFAULT 0,
    total_llm_calls      INTEGER        DEFAULT 0,
    total_tool_calls     INTEGER        DEFAULT 0,
    estimated_cost_usd   DECIMAL(10,4)  DEFAULT 0,
    steps_completed      JSONB          DEFAULT '[]',
    novnc_url            VARCHAR(512),
    container_name       VARCHAR(128),
    termination_reason   TEXT
);
CREATE INDEX IF NOT EXISTS idx_test_runs_case ON test_runs (test_case_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_started ON test_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS test_results (
    id            VARCHAR(64)  PRIMARY KEY,
    run_id        VARCHAR(64)  REFERENCES test_runs(id) ON DELETE CASCADE,
    assertion_id  VARCHAR(32)  NOT NULL,
    assertion_type VARCHAR(32),
    description   TEXT,
    passed        BOOLEAN      NOT NULL,
    details       TEXT,
    evidence      JSONB        DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_test_results_run ON test_results (run_id);

CREATE TABLE IF NOT EXISTS agent_traces (
    id                       VARCHAR(64)     PRIMARY KEY,
    run_id                   VARCHAR(64)     REFERENCES test_runs(id) ON DELETE CASCADE,
    step_number              INTEGER         NOT NULL,
    checkpoint_id            VARCHAR(32),
    timestamp                TIMESTAMPTZ     NOT NULL,
    completed_at             TIMESTAMPTZ,
    model                    VARCHAR(64),
    input_tokens             INTEGER         DEFAULT 0,
    output_tokens            INTEGER         DEFAULT 0,
    total_tokens             INTEGER         DEFAULT 0,
    llm_latency_ms           INTEGER         DEFAULT 0,
    tool_execution_latency_ms INTEGER        DEFAULT 0,
    wait_for_stable_ms       INTEGER         DEFAULT 0,
    total_step_latency_ms    INTEGER         DEFAULT 0,
    tool_name                VARCHAR(128),
    tool_source              VARCHAR(16),
    tool_input               JSONB,
    tool_output              TEXT,
    tool_success             BOOLEAN         DEFAULT TRUE,
    tool_error               TEXT,
    page_url                 VARCHAR(2048),
    page_title               VARCHAR(512),
    estimated_cost_usd       DECIMAL(10,6)   DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_traces_run_step ON agent_traces (run_id, step_number);
CREATE INDEX IF NOT EXISTS idx_agent_traces_tool ON agent_traces (run_id, tool_name);

CREATE TABLE IF NOT EXISTS run_traces_summary (
    run_id                     VARCHAR(64)  PRIMARY KEY REFERENCES test_runs(id) ON DELETE CASCADE,
    total_input_tokens         INTEGER      DEFAULT 0,
    total_output_tokens        INTEGER      DEFAULT 0,
    total_tokens               INTEGER      DEFAULT 0,
    total_llm_calls            INTEGER      DEFAULT 0,
    total_tool_calls           INTEGER      DEFAULT 0,
    total_mcp_tool_calls       INTEGER      DEFAULT 0,
    total_custom_tool_calls    INTEGER      DEFAULT 0,
    failed_tool_calls          INTEGER      DEFAULT 0,
    total_run_duration_ms      INTEGER      DEFAULT 0,
    total_llm_latency_ms       INTEGER      DEFAULT 0,
    total_tool_latency_ms      INTEGER      DEFAULT 0,
    avg_step_latency_ms        INTEGER      DEFAULT 0,
    total_estimated_cost_usd   DECIMAL(10,4) DEFAULT 0,
    peak_context_tokens        INTEGER      DEFAULT 0
);
