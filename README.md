# Anomaly Insights Engine

TypeScript + Express + Postgres implementation for behavior-based anomaly detection and insight generation.

## What it does
- Scans last 30h of data from:
  - `pageviews_hourly`
  - `useractions_hourly`
  - `performance_hourly`
- Compares latest 6h **average** against prior 24h **average** and **stddev**.
- Flags anomalies when |z-score| ≥ 2.5.
- Generates human-readable, context-aware insights (page, deviceType, referrer, category).
- Exposes `GET /api/insights/anomalies` with optional 10–15 min cache.
- (Optional) Stores insights into `insight_reports`.

## Quick start
```bash
# 1) env
export DATABASE_URL=postgres://user:pass@host:5432/db
export PORT=8080
export CACHE_TTL_SECONDS=900            # optional, default 900 (15m)
export SAVE_INSIGHTS=false              # true to persist into insight_reports

# 2) install & run
npm i
npm run dev
# then hit: http://localhost:8080/api/insights/anomalies
```

## DB schema assumptions
Each *_hourly table should have hourly rows with these columns:
- `ts` (timestamp) — hour bucket start (e.g., 2025-11-10 09:00:00)
- `referrer` (text, nullable)
- `device_type` (text, nullable) — e.g., 'mobile', 'desktop'
- `category` (text, nullable)
- `page` (text, nullable)

Value columns:
- `pageviews_hourly.count` (int/bigint)
- `useractions_hourly.count` (int/bigint)
- `performance_hourly.p95_load_time_ms` (numeric/float)

The `sql/schema.sql` file creates the optional `insight_reports` table.

## Design notes
- Uses a 30h fetch window to cover 24h baseline + 6h recent.
- Groups by context signature: (page, device_type, referrer, category) **plus** an overall aggregate.
- Baseline stats are computed per-hour; recent uses last 6 buckets' average for the z-score.
- Insights are ranked by |z-score| and returned as JSON.

## Endpoint
```
GET /api/insights/anomalies
200 OK
[
  { "metric": "...", "type": "pageviews", "change": "+210%", "possibleCause": "...", "context": {...} }
]
```

## Bonus UI idea
Expose `/insights` in your frontend showing:
- Top 3 insights by score
- Sparkline of anomaly counts by day (last 14 days)