import { pool } from "./db";
import { MetricKind, TimeBucket, Insight } from "./types";

type TableConfig = {
  table: string;
  valueColumn: string;
};

// which table and column to use for each metric
const METRIC_TABLES: Record<MetricKind, TableConfig> = {
  pageviews: {
    table: "pageviews_hourly",
    valueColumn: "count",
  },
  useractions: {
    table: "useractions_hourly",
    valueColumn: "count",
  },
  performance: {
    table: "performance_hourly",
    valueColumn: "p95_load_time_ms",
  },
};

const WINDOW_HOURS = 30;

// only write to insight_reports if this flag is true
const SAVE_INSIGHTS =
  (process.env.SAVE_INSIGHTS || "false").toLowerCase() === "true";

// get last 30h of buckets for one metric
export async function fetchBuckets(kind: MetricKind): Promise<TimeBucket[]> {
  const cfg = METRIC_TABLES[kind];
  const client = await pool.connect();

  try {
    const sql = `
      SELECT
        ts AS "bucket_start",
        ${cfg.valueColumn} AS value,
        referrer,
        device_type AS "deviceType",
        category,
        page
      FROM ${cfg.table}
      WHERE ts >= NOW() - INTERVAL '${WINDOW_HOURS} hours'
      ORDER BY ts ASC
    `;

    const { rows } = await client.query(sql);

    return rows.map((row: any) => ({
      bucket_start:
        row.bucket_start instanceof Date
          ? row.bucket_start.toISOString()
          : String(row.bucket_start),
      value: Number(row.value ?? 0),
      referrer: row.referrer ?? null,
      deviceType: row.deviceType ?? null,
      category: row.category ?? null,
      page: row.page ?? null,
    }));
  } finally {
    client.release();
  }
}

// store insights in insight_reports (optional)
export async function saveInsights(insights: Insight[]): Promise<void> {
  if (!SAVE_INSIGHTS || insights.length === 0) {
    return;
  }

  const client = await pool.connect();

  try {
    const sql = `
      INSERT INTO insight_reports
        (metric, type, page, change, possible_cause, context, score, recent_hours, baseline_hours, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, NOW())
    `;

    for (const i of insights) {
      await client.query(sql, [
        i.metric,
        i.type,
        i.page ?? null,
        i.change,
        i.possibleCause,
        JSON.stringify(i.context),
        i.score,
        i.window.recentHours,
        i.window.baselineHours,
      ]);
    }
  } finally {
    client.release();
  }
}
