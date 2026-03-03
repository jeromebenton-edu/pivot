-- Distributed rate limiting table for serverless deployments.
-- Used by lib/rate-limit.ts when Supabase is configured.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

-- Atomic rate-limit check: increments the counter in a single statement,
-- resetting the window if it has expired. Returns the new count so the
-- caller can decide whether to allow or reject the request.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_max INTEGER,
  p_window_ms INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Try to insert a new row; on conflict, atomically update
  INSERT INTO rate_limits (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN rate_limits.window_start < NOW() - (p_window_ms || ' milliseconds')::INTERVAL
      THEN 1
      ELSE rate_limits.count + 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start < NOW() - (p_window_ms || ' milliseconds')::INTERVAL
      THEN NOW()
      ELSE rate_limits.window_start
    END
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Cleanup function: delete rows older than 10 minutes.
-- Called probabilistically from the application layer.
CREATE OR REPLACE FUNCTION cleanup_rate_limits() RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '10 minutes';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;
