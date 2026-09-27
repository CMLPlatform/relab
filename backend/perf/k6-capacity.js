// Capacity probe: steps the arrival rate up until the server stops keeping up, and
// prints one row per step so the knee is readable straight from the output.
// Not a regression gate: see "Capacity" in perf/README.md for why and for results.
//
// PERF_CAPACITY_MODE=mixed (default) runs a browse-heavy mix with some logins and
// writes; PERF_CAPACITY_MODE=login runs logins only, to find the password-hashing
// ceiling on its own.
import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import {
  imageUploadWrite,
  productComponentsRead,
  productCreateWrite,
  productDetailRead,
  productListRead,
  productSearchRead,
  referenceDataRead,
} from "./k6-baseline.js";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:8010";
const mode = __ENV.PERF_CAPACITY_MODE || "mixed";
const defaultRates = { mixed: "25,50,100,150,200,300,400", login: "10,20,40,80,120,160,240" };
const rates = (__ENV.PERF_CAPACITY_RATES || defaultRates[mode]).split(",").map(Number);
const rampSeconds = 5;
const holdSeconds = Number(__ENV.PERF_CAPACITY_HOLD_SECONDS || 30);

// Verified accounts the recipe creates before the run. Many accounts, not the one CI
// superuser: every login writes last_login_at and every upload updates the quota row
// of its owner, so a single account measures one row lock, not the server.
const userCount = Number(__ENV.PERF_CAPACITY_USERS || 50);
const password = __ENV.PERF_CAPACITY_PASSWORD;
const email = (i) => `capacity-${i}@example.com`;
const anyUser = () => 1 + Math.floor(Math.random() * userCount);

function login(i) {
  const response = http.post(
    `${baseUrl}/v1/auth/bearer/login`,
    { username: email(i), password },
    { tags: { scenario: "bearer_login" } },
  );
  check(response, { "bearer login returned 200": (res) => res.status === 200 });
  return response;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Percent of iterations per operation. Mostly reading, since that is what a room of
// people browsing and filling in products does; a login per session of ~50 requests;
// writes and photo uploads as the data-entry share.
const mix = {
  mixed: [
    [30, productListRead],
    [15, productSearchRead],
    [20, (data) => productDetailRead({ detailProductId: pick(data.productIds) })],
    [10, (data) => productComponentsRead({ detailProductId: pick(data.productIds) })],
    [10, referenceDataRead],
    [2, () => login(anyUser())],
    [9, (data) => productCreateWrite(pick(data.users))],
    [4, (data) => imageUploadWrite(pick(data.users))],
  ],
  login: [[100, () => login(anyUser())]],
}[mode];
const ops = mix.flatMap(([weight, fn]) => Array(weight).fill(fn));

// Each step ramps for rampSeconds, then holds its rate for holdSeconds. Only the hold
// is tagged with the step, so a row never mixes two rates.
const stages = rates.flatMap((target) => [
  { target, duration: `${rampSeconds}s` },
  { target, duration: `${holdSeconds}s` },
]);

// k6 only reports a tagged submetric that a threshold names. These conditions always
// hold: they register the per-step rows, they do not gate anything.
const thresholds = {};
rates.forEach((_, step) => {
  thresholds[`http_req_duration{step:${step}}`] = ["max>=0"];
  thresholds[`http_req_failed{step:${step}}`] = ["rate>=0"];
  thresholds[`iterations{step:${step}}`] = ["count>=0"];
});

export const options = {
  scenarios: {
    capacity: {
      executor: "ramping-arrival-rate",
      startRate: rates[0],
      timeUnit: "1s",
      stages,
      preAllocatedVUs: 100,
      maxVUs: Number(__ENV.PERF_CAPACITY_MAX_VUS || 1500),
    },
  },
  thresholds,
  summaryTrendStats: ["med", "p(95)", "p(99)", "max"],
  setupTimeout: "120s",
};

export function setup() {
  const productIds = (http.get(`${baseUrl}/v1/products?size=100`).json("items") || []).map((p) => p.id);
  const users = [];
  for (let i = 1; i <= userCount; i++) {
    const token = login(i).json("access_token");
    const product = http.post(`${baseUrl}/v1/products`, JSON.stringify({ name: `capacity upload target ${i}` }), {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    users.push({ token, uploadProductId: product.json("id") });
  }
  return { productIds, users };
}

export default function (data) {
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000;
  const step = Math.floor(elapsed / (rampSeconds + holdSeconds));
  const inHold = elapsed % (rampSeconds + holdSeconds) >= rampSeconds;
  exec.vu.metrics.tags.step = inHold ? String(step) : "ramp";
  pick(ops)(data);
}

export function handleSummary(data) {
  const value = (name, stat) => data.metrics[name]?.values[stat] ?? 0;
  const lines = [
    `mode=${mode} users=${userCount} hold=${holdSeconds}s dropped_iterations=${value("dropped_iterations", "count")}`,
    "target/s  achieved/s    p50ms    p95ms    p99ms   errors",
  ];
  rates.forEach((target, step) => {
    const achieved = value(`iterations{step:${step}}`, "count") / holdSeconds;
    const ms = (stat) => value(`http_req_duration{step:${step}}`, stat).toFixed(0).padStart(8);
    const errors = (100 * value(`http_req_failed{step:${step}}`, "rate")).toFixed(1);
    lines.push(
      `${String(target).padStart(8)}  ${achieved.toFixed(1).padStart(10)} ${ms("med")} ${ms("p(95)")} ${ms("p(99)")}  ${errors.padStart(6)}%`,
    );
  });
  return {
    stdout: `\n${lines.join("\n")}\n`,
    [__ENV.PERF_CAPACITY_SUMMARY || `capacity-${mode}.json`]: JSON.stringify(data, null, 2),
  };
}
