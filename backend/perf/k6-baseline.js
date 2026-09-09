import http from "k6/http";
import { check } from "k6";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:8010";
const productListPath = __ENV.PERF_PRODUCT_LIST_PATH || "/v1/products?size=20";
const livePath = __ENV.PERF_LIVE_PATH || "/live";
const loginEmail = __ENV.PERF_USER_EMAIL;
const loginPassword = __ENV.PERF_USER_PASSWORD;
const mediaUrl = __ENV.PERF_MEDIA_URL;

// Scenarios run one after another rather than together. Overlapping them makes
// every number a measure of contention instead of endpoint cost: bearer_login
// spends ~50-100ms per request inside Argon2, which stalls the single API
// worker CI runs and inflates the tail of whatever else is in flight. Isolated
// stages vary far less, which is what lets the thresholds below sit close to
// observed latency and still not flake.
const stageSeconds = Number(__ENV.PERF_STAGE_SECONDS || 20);
const gapSeconds = Number(__ENV.PERF_STAGE_GAP_SECONDS || 5);
let nextStartSeconds = 0;

function stage(rate, preAllocatedVUs) {
  const scenario = {
    // Open model: k6 holds the request rate steady whatever the server does. A
    // closed model (constant-vus plus sleep) quietly sends less load as latency
    // grows, which hides the regressions this suite exists to catch.
    executor: "constant-arrival-rate",
    rate,
    timeUnit: "1s",
    duration: `${stageSeconds}s`,
    preAllocatedVUs,
    startTime: `${nextStartSeconds}s`,
  };
  nextStartSeconds += stageSeconds + gapSeconds;
  return scenario;
}

const scenarios = {
  live_probe: { ...stage(Number(__ENV.PERF_LIVE_RATE || 20), 10), exec: "liveProbe" },
  product_list_read: { ...stage(Number(__ENV.PERF_PRODUCT_LIST_RATE || 10), 20), exec: "productListRead" },
};

const thresholds = {
  "http_req_failed{scenario:live_probe}": ["rate<0.01"],
  "http_req_duration{scenario:live_probe}": ["p(95)<100"],
  "http_req_failed{scenario:product_list_read}": ["rate<0.01"],
  "http_req_duration{scenario:product_list_read}": ["p(95)<200"],
  // An open-model run that cannot start its iterations on time is a saturated
  // server, not a fast one; without this the suite would report the shortfall
  // as healthy latency.
  dropped_iterations: ["count<1"],
  checks: ["rate==1.00"],
};

if (loginEmail && loginPassword) {
  scenarios.bearer_login = { ...stage(Number(__ENV.PERF_LOGIN_RATE || 2), 10), exec: "bearerLogin" };
  thresholds["http_req_failed{scenario:bearer_login}"] = ["rate<0.01"];
  thresholds["http_req_duration{scenario:bearer_login}"] = ["p(95)<600"];
}

if (mediaUrl) {
  scenarios.media_url_read = { ...stage(Number(__ENV.PERF_MEDIA_RATE || 10), 10), exec: "mediaUrlRead" };
  thresholds["http_req_failed{scenario:media_url_read}"] = ["rate<0.01"];
  thresholds["http_req_duration{scenario:media_url_read}"] = ["p(95)<100"];
}

export const options = {
  scenarios,
  thresholds,
  // p99 alongside p95: a regression that only moves the far tail is still a
  // regression, and the default stats hide it.
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
};

export function liveProbe() {
  const response = http.get(`${baseUrl}${livePath}`, {
    tags: { scenario: "live_probe" },
  });

  check(response, {
    "live probe returned 200": (res) => res.status === 200,
    "live probe returned alive": (res) => res.json("status") === "alive",
  });
}

export function productListRead() {
  const response = http.get(`${baseUrl}${productListPath}`, {
    tags: { scenario: "product_list_read" },
  });

  check(response, {
    "product list returned 200": (res) => res.status === 200,
    "product list returned items": (res) => Array.isArray(res.json("items")),
  });
}

export function bearerLogin() {
  const response = http.post(
    `${baseUrl}/v1/auth/bearer/login`,
    {
      username: loginEmail,
      password: loginPassword,
    },
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      tags: { scenario: "bearer_login" },
    },
  );

  check(response, {
    "bearer login returned 200": (res) => res.status === 200,
    "bearer login returned token": (res) => Boolean(res.json("access_token")),
  });
}

export function mediaUrlRead() {
  const response = http.get(mediaUrl, {
    tags: { scenario: "media_url_read" },
  });

  check(response, {
    "media URL returned 200": (res) => res.status === 200,
    "media URL has body": (res) => res.body && res.body.length > 0,
  });
}
