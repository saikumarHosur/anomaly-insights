// which metrics we support
export type MetricKind = "pageviews" | "useractions" | "performance";

// one hourly data point from the DB
export type TimeBucket = {
  bucket_start: string; // timestamp for the start of the hour
  value: number;
  referrer?: string | null;
  deviceType?: string | null;
  category?: string | null;
  page?: string | null;
};

// context around an anomaly (where it happened)
export type AnomalyContext = {
  referrer?: string | null;
  deviceType?: string | null;
  category?: string | null;
  page?: string | null;
};

// internal structure used while calculating anomalies
export type AnomalyCandidate = {
  metric: MetricKind;
  context: AnomalyContext;
  recentValue: number;   // sum of last 6 hours
  recentAvg: number;     // average of last 6 hours
  baselineMean: number;  // average of baseline hours
  baselineStd: number;   // stddev of baseline hours
  zScore: number;        // how far recentAvg is from baseline
  direction: "up" | "down";
};

// final shape returned by /api/insights/anomalies
export type Insight = {
  metric: string;             // nice label, e.g. "Page Views"
  page?: string;              // main page for quick use
  type: MetricKind | string;  // underlying metric key
  change: string;             // "+210%" or "-45%"
  possibleCause: string;      // plain-text explanation
  context: AnomalyContext;
  score: number;              // |z-score|
  window: {
    recentHours: number;
    baselineHours: number;
  };
};
