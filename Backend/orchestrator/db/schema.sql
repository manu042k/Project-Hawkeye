CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS test_cases (
    id            VARCHAR(64)  PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    suite         VARCHAR(128),
    priority      VARCHAR(4),
    tags          JSONB        DEFAULT '[]',
    spec          JSONB        NOT NULL,
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);
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
