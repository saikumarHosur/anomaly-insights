import { AnomalyCandidate, Insight, MetricKind } from "../types";

const METRIC_LABEL: Record<MetricKind, string> = {
  pageviews: "Page Views",
  useractions: "User Actions",
  performance: "Page Load Time (p95)",
};

export function toInsight(c: AnomalyCandidate): Insight {
  const baseline = c.baselineMean;

  // percent change between recent average and baseline
  const pct =
    baseline === 0 ? 0 : ((c.recentAvg - baseline) / baseline) * 100;

  const change =
    (pct >= 0 ? "+" : "") + Math.round(pct).toString() + "%";

  const ctx = c.context;
  const pieces: string[] = [];

  if (ctx.page) {
    pieces.push(`on page '${ctx.page}'`);
  }
  if (ctx.deviceType) {
    pieces.push(`for ${ctx.deviceType} users`);
  }
  if (ctx.referrer) {
    pieces.push(`from referrer '${ctx.referrer}'`);
  }
  if (ctx.category) {
    pieces.push(`in category '${ctx.category}'`);
  }

  const directionWord = c.direction === "up" ? "increase" : "drop";

  let possibleCause = `Detected a significant ${directionWord} in ${METRIC_LABEL[
    c.metric
  ].toLowerCase()}`;

  if (pieces.length) {
    possibleCause += " " + pieces.join(" ");
  }
  possibleCause += ".";

  if (c.metric === "performance") {
    if (c.direction === "up") {
      possibleCause +=
        " Higher p95 load time may be related to a recent deployment, backend slowdown, or third-party scripts.";
    } else {
      possibleCause +=
        " Lower p95 load time suggests a positive performance improvement.";
    }
  } else {
    if (c.direction === "up") {
      possibleCause +=
        " This could be driven by a campaign, traffic spike, or better UX for this segment.";
    } else {
      possibleCause +=
        " This may point to a broken flow, tracking issue, or loss of traffic for this segment.";
    }
  }

  return {
    metric: METRIC_LABEL[c.metric],
    page: ctx.page || undefined,
    type: c.metric,
    change,
    possibleCause,
    context: { ...ctx },
    score: Math.abs(c.zScore),
    window: {
      recentHours: 6,
      baselineHours: 24,
    },
  };
}
