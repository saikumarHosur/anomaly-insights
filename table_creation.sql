# hourly page views
CREATE TABLE IF NOT EXISTS public.pageviews_hourly (
  ts           TIMESTAMPTZ NOT NULL,  -- hour bucket start
  referrer     TEXT,
  device_type  TEXT,
  category     TEXT,
  page         TEXT,
  count        BIGINT NOT NULL
);

# hourly user actions
CREATE TABLE IF NOT EXISTS public.useractions_hourly (
  ts           TIMESTAMPTZ NOT NULL,
  referrer     TEXT,
  device_type  TEXT,
  category     TEXT,
  page         TEXT,
  count        BIGINT NOT NULL
);

# hourly performance 
CREATE TABLE IF NOT EXISTS public.performance_hourly (
  ts                 TIMESTAMPTZ NOT NULL,
  referrer           TEXT,
  device_type        TEXT,
  category           TEXT,
  page               TEXT,
  p95_load_time_ms   NUMERIC
);
