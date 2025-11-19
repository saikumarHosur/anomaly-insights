import { fetchBuckets } from "../repo";
import { mean, stddev, sum } from "./stats";
import {
  AnomalyCandidate,
  MetricKind,
  TimeBucket,
  Insight,
} from "../types";
import { toInsight } from "./insight";

const METRICS: MetricKind[] = ["pageviews", "useractions", "performance"];

// z-score threshold
const THRESHOLD = 2.5;

// last 6 hours = "recent"
const RECENT_HOURS = 6;

// older hours in the 30h window = baseline (roughly 24h)
const BASELINE_HOURS = 24;

type Key = string;
type GroupMap = Map<Key, TimeBucket[]>;

// build a key based on context values
function keyOf(b: TimeBucket): Key {
  return `${b.page || "*"}|${b.deviceType || "*"}|${b.referrer || "*"}|${
    b.category || "*"
  }|ctx`;
}

// key for the global group (all data combined)
function globalKey(): Key {
  return "*|*|*|*|global";
}

// make sure buckets are in time order
function sortBuckets(buckets: TimeBucket[]): TimeBucket[] {
  // bucket_start is an ISO string, so string compare works for time
  return buckets.sort((a, b) =>
    a.bucket_start.localeCompare(b.bucket_start)
  );
}

export async function runAnalyzer(): Promise<Insight[]> {
  const allInsights: Insight[] = [];

  for (const metric of METRICS) {
    const rawBuckets = await fetchBuckets(metric);
    if (!rawBuckets.length) {
      continue;
    }

    const groups: GroupMap = new Map();

    for (const bucket of rawBuckets) {
      // group per context
      const ctxKey = keyOf(bucket);
      if (!groups.has(ctxKey)) {
        groups.set(ctxKey, []);
      }
      groups.get(ctxKey)!.push(bucket);

      // also add to one global group
      const gKey = globalKey();
      if (!groups.has(gKey)) {
        groups.set(gKey, []);
      }
      const globalBucket: TimeBucket = {
        bucket_start: bucket.bucket_start,
        value: bucket.value,
      };
      groups.get(gKey)!.push(globalBucket);
    }

    // now look at each group and see if it is anomalous
    for (const [, buckets] of groups) {
      const sorted = sortBuckets(buckets);

      // we need enough data for baseline + recent
            
      if (sorted.length <= RECENT_HOURS) {
        continue;
      }


      const values = sorted.map((b) => b.value);
      const baselineValues = values.slice(
        0,
        values.length - RECENT_HOURS
      );
      const recentValues = values.slice(
        values.length - RECENT_HOURS
      );

      const baselineMean = mean(baselineValues);
      const baselineStd = stddev(baselineValues);
      if (baselineStd === 0) {
        // no variation, nothing to detect
        continue;
      }

      const recentAvg = mean(recentValues);
      const recentSum = sum(recentValues);

      const z = (recentAvg - baselineMean) / baselineStd;
      if (Math.abs(z) < THRESHOLD) {
        // not strong enough to call it an anomaly
        continue;
      }

      const direction: "up" | "down" = z >= 0 ? "up" : "down";

      // take the latest bucket as a sample for context
      const sampleCtx = sorted[sorted.length - 1];

      const candidate: AnomalyCandidate = {
        metric,
        context: {
          referrer: sampleCtx.referrer ?? null,
          deviceType: sampleCtx.deviceType ?? null,
          category: sampleCtx.category ?? null,
          page: sampleCtx.page ?? null,
        },
        recentValue: recentSum,
        recentAvg,
        baselineMean,
        baselineStd,
        zScore: z,
        direction,
      };

      allInsights.push(toInsight(candidate));
    }
  }

  // sort by strength of anomaly (highest |z-score| first)
  allInsights.sort((a, b) => b.score - a.score);
  return allInsights;
}
