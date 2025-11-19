import "dotenv/config";
import express from "express";
import { runAnalyzer } from "./anomaly/analyzer";
import { saveInsights } from "./repo";
import { TTLCache } from "./cache";

const app = express();

// basic config from env
const port = Number(process.env.PORT || 8080);
const ttlSeconds = Number(process.env.CACHE_TTL_SECONDS || 900); // 15 minutes default

// simple in-memory cache for insights
const cache = new TTLCache<any[]>(ttlSeconds * 1000);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/insights/anomalies", async (_req, res) => {
  try {
    const cacheKey = "anomalies:v1";

    // try cache first
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // run analyzer if no cache
    const insights = await runAnalyzer();

    // put into cache
    cache.set(cacheKey, insights);

    // optional: write to insight_reports (only if SAVE_INSIGHTS=true)
    await saveInsights(insights);

    return res.json(insights);
  } catch (err: any) {
    console.error("Analyzer failed", err);
    return res.status(500).json({
      error: "Analyzer failed",
      detail: err?.message || String(err),
    });
  }
});


app.get("/insights", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Anomaly insights</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 16px;
      padding: 0;
      background: #ffffff;
      color: #111111;
      font-size: 16px;
      line-height: 1.4;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 8px;
    }
    h2 {
      font-size: 18px;
      margin: 20px 0 8px;
    }
    .note {
      font-size: 14px;
      color: #555555;
      margin-bottom: 16px;
    }
    .insight {
      border: 1px solid #cccccc;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 8px;
      background: #fafafa;
    }
    .insight-title {
      font-weight: bold;
      margin-bottom: 4px;
    }
    .insight-line {
      font-size: 14px;
      margin-bottom: 2px;
    }
    .change {
      font-weight: bold;
      margin-left: 6px;
    }
    .change.up {
      color: #137333;
    }
    .change.down {
      color: #c5221f;
    }
    .small {
      font-size: 14px;
      color: #555555;
    }
    #sparkline {
      width: 100%;
      height: 120px;
      border: 1px solid #cccccc;
      border-radius: 2px;
      background: #ffffff;
      display: block;
    }
  </style>
</head>
<body>
  <h1>Anomaly insights</h1>
  <p class="note">This page shows the strongest anomalies found in the last 30 hours.</p>

  <h2>Top insights</h2>
  <div id="insights-list">
    <p class="small">Loading...</p>
  </div>

  <h2>Scores</h2>
  <canvas id="sparkline" width="400" height="120"></canvas>
  <p class="small">Each point is an anomaly. Higher point means stronger change compared to baseline.</p>

  <script>
    async function loadInsights() {
      var listEl = document.getElementById("insights-list");
      var canvas = document.getElementById("sparkline");
      var ctx = canvas.getContext("2d");

      try {
        var res = await fetch("/api/insights/anomalies");
        var data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
          listEl.innerHTML = "<p class='small'>No anomalies found for this time window.</p>";
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          return;
        }

        // sort by score (strongest first)
        var sorted = data.slice().sort(function (a, b) {
          return (b.score || 0) - (a.score || 0);
        });

        var top = sorted.slice(0, 3); // show only a few
        listEl.innerHTML = "";

        top.forEach(function (insight) {
          var div = document.createElement("div");
          div.className = "insight";

          var dir = "up";
          if ((insight.change || "").trim().startsWith("-")) {
            dir = "down";
          }

          var ctxParts = [];
          if (insight.context && insight.context.page) {
            ctxParts.push("Page: " + insight.context.page);
          }
          if (insight.context && insight.context.deviceType) {
            ctxParts.push("Device: " + insight.context.deviceType);
          }
          if (insight.context && insight.context.referrer) {
            ctxParts.push("Referrer: " + insight.context.referrer);
          }
          if (insight.context && insight.context.category) {
            ctxParts.push("Category: " + insight.context.category);
          }

          var ctxText = ctxParts.join(" | ");

          div.innerHTML =
            "<div class='insight-title'>" + (insight.metric || "Metric") + "</div>" +
            "<div class='insight-line'>" +
              "Type: " + (insight.type || "") +
              "<span class='change " + dir + "'>" + (insight.change || "") + "</span>" +
            "</div>" +
            (ctxText
              ? "<div class='insight-line'>" + ctxText + "</div>"
              : "") +
            "<div class='insight-line'>" + (insight.possibleCause || "") + "</div>";

          listEl.appendChild(div);
        });

        // build simple sparkline from scores
        var scores = sorted
          .map(function (i) { return Math.abs(i.score || 0); })
          .filter(function (v) { return v > 0; });

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (scores.length === 0) {
          return;
        }

        var maxPoints = 14;
        if (scores.length > maxPoints) {
          scores = scores.slice(0, maxPoints);
        }

        var maxScore = Math.max.apply(null, scores);
        var minScore = Math.min.apply(null, scores);

        var paddingX = 10;
        var paddingY = 10;
        var w = canvas.width - paddingX * 2;
        var h = canvas.height - paddingY * 2;

        function xForIndex(i) {
          if (scores.length === 1) return paddingX + w / 2;
          return paddingX + (w * i) / (scores.length - 1);
        }

        function yForScore(s) {
          if (maxScore === minScore) return paddingY + h / 2;
          var t = (s - minScore) / (maxScore - minScore);
          return paddingY + (1 - t) * h;
        }

        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#000000";
        scores.forEach(function (s, idx) {
          var x = xForIndex(idx);
          var y = yForScore(s);
          if (idx === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.fillStyle = "#000000";
        scores.forEach(function (s, idx) {
          var x = xForIndex(idx);
          var y = yForScore(s);
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      } catch (err) {
        console.error(err);
        listEl.innerHTML = "<p class='small'>Could not load insights.</p>";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    loadInsights();
  </script>
</body>
</html>`);
});










app.listen(port, () => {
  console.log(`Anomaly Insights Engine listening on port ${port}`);
});
