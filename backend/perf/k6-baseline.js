import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

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
  product_search_read: { ...stage(Number(__ENV.PERF_SEARCH_RATE || 10), 20), exec: "productSearchRead" },
  product_detail_read: { ...stage(Number(__ENV.PERF_DETAIL_RATE || 10), 20), exec: "productDetailRead" },
  product_components_read: { ...stage(Number(__ENV.PERF_COMPONENTS_RATE || 10), 20), exec: "productComponentsRead" },
  reference_data_read: { ...stage(Number(__ENV.PERF_REFERENCE_RATE || 10), 20), exec: "referenceDataRead" },
};

// Rotated per iteration so the run does not measure one repeatedly cached query.
// The terms match what scripts/seed/perf_seed.py generates, and deliberately mix
// single-term lookups with a multi-term query, which is the slower path.
const searchTerms = (__ENV.PERF_SEARCH_TERMS || "steel,laptop,novatech,compact steel drill,recycled monitor").split(",");

// Loaded once at init. The upload scenario needs real bytes: a decode and a
// thumbnail write are most of what the endpoint costs. A spread of sizes, not one:
// the committed 1200x900 sample skips the 1600px derivative altogether, so on its
// own the scenario cannot see a regression in the part of the pipeline that costs
// anything. The larger two are tiled from that same sample by
// `scripts.perf.make_upload_fixtures`, which the perf recipes run first.
const uploadImages = [
  { size: "small", body: open("/perf/fixtures/upload-sample.jpg", "b") },
  { size: "medium", body: open("/perf/fixtures/generated/upload-medium.jpg", "b") },
  { size: "large", body: open("/perf/fixtures/generated/upload-large.jpg", "b") },
];

// Per size, because a percentile mixed across all three hides which one moved.
//
// Set against the regression they exist to catch, not merely above the measured
// p95. Deferring the wide derivatives took ~110ms off a medium upload and ~130ms
// off a large one, so a ceiling generous enough to absorb that is a ceiling that
// would sit through the exact change it is guarding. Measured p95 on the CI stack
// is 79 / 92 / 154 ms; re-blocking would put medium near 200 and large near 285.
const UPLOAD_THRESHOLDS_MS = { small: 200, medium: 190, large: 250 };

const thresholds = {
  "http_req_failed{scenario:live_probe}": ["rate<0.01"],
  "http_req_duration{scenario:live_probe}": ["p(95)<100"],
  "http_req_failed{scenario:product_list_read}": ["rate<0.01"],
  "http_req_duration{scenario:product_list_read}": ["p(95)<300"],
  "http_req_failed{scenario:product_search_read}": ["rate<0.01"],
  "http_req_duration{scenario:product_search_read}": ["p(95)<400"],
  "http_req_failed{scenario:product_detail_read}": ["rate<0.01"],
  "http_req_duration{scenario:product_detail_read}": ["p(95)<200"],
  "http_req_failed{scenario:product_components_read}": ["rate<0.01"],
  "http_req_duration{scenario:product_components_read}": ["p(95)<200"],
  "http_req_failed{scenario:reference_data_read}": ["rate<0.01"],
  "http_req_duration{scenario:reference_data_read}": ["p(95)<100"],
  // An open-model run that cannot start its iterations on time is a saturated
  // server, not a fast one; without this the suite would report the shortfall
  // as healthy latency.
  dropped_iterations: ["count<1"],
  checks: ["rate==1.00"],
};

if (loginEmail && loginPassword) {
  scenarios.bearer_login = { ...stage(Number(__ENV.PERF_LOGIN_RATE || 2), 10), exec: "bearerLogin" };
  thresholds["http_req_failed{scenario:bearer_login}"] = ["rate<0.01"];
  thresholds["http_req_duration{scenario:bearer_login}"] = ["p(95)<500"];
}

if (mediaUrl) {
  scenarios.media_url_read = { ...stage(Number(__ENV.PERF_MEDIA_RATE || 10), 10), exec: "mediaUrlRead" };
  thresholds["http_req_failed{scenario:media_url_read}"] = ["rate<0.01"];
  thresholds["http_req_duration{scenario:media_url_read}"] = ["p(95)<100"];
}

// Registered after every read stage on purpose: this one inserts rows, and the
// read baselines above are only comparable against a table that is not growing
// underneath them.
if (loginEmail && loginPassword) {
  scenarios.product_create_write = { ...stage(Number(__ENV.PERF_CREATE_RATE || 5), 10), exec: "productCreateWrite" };
  thresholds["http_req_failed{scenario:product_create_write}"] = ["rate<0.01"];
  thresholds["http_req_duration{scenario:product_create_write}"] = ["p(95)<300"];

  // Last of all: an upload decodes the image and writes derivatives, so it is
  // both the slowest write and the one that leaves the most behind. Iterations
  // rotate through `uploadImages`, and each size carries its own threshold —
  // a mixed percentile over three sizes hides which one moved.
  //
  // The previous 1400 was set before anything had measured this, against a
  // fixture that skipped the widest derivative. The figures below come from the
  // CI stack with per-size headroom over the measured p95.
  scenarios.image_upload_write = { ...stage(Number(__ENV.PERF_UPLOAD_RATE || 3), 10), exec: "imageUploadWrite" };
  thresholds["http_req_failed{scenario:image_upload_write}"] = ["rate<0.01"];
  for (const { size } of uploadImages) {
    thresholds[`http_req_duration{upload_size:${size}}`] = [`p(95)<${UPLOAD_THRESHOLDS_MS[size]}`];
  }
}

export const options = {
  scenarios,
  thresholds,
  // p99 alongside p95: a regression that only moves the far tail is still a
  // regression, and the default stats hide it.
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
};

export function setup() {
  // Ids are resolved once here rather than per iteration, so the scenarios
  // measure the endpoint under test and not the lookup that found their input.
  const listing = http.get(`${baseUrl}/v1/products?size=100`);
  const items = listing.json("items") || [];
  const detailProductId = items.length > 0 ? items[0].id : null;

  if (!loginEmail || !loginPassword) {
    return { detailProductId };
  }
  const login = http.post(`${baseUrl}/v1/auth/bearer/login`, {
    username: loginEmail,
    password: loginPassword,
  });
  const token = login.json("access_token");

  // A product owned by the authenticated user, to upload into.
  const created = http.post(
    `${baseUrl}/v1/products`,
    JSON.stringify({ name: "perf baseline upload target" }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );

  return { token, detailProductId, uploadProductId: created.json("id") };
}

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

export function productSearchRead() {
  // Keyed on the scenario-wide iteration counter, not __VU/__ITER: VU assignment
  // shifts between runs, so a VU-derived index makes each run measure a different
  // mix of cheap and expensive queries. That alone moved p95 by ~2x run to run.
  const term = searchTerms[exec.scenario.iterationInTest % searchTerms.length];
  const response = http.get(`${baseUrl}/v1/products?size=20&search=${encodeURIComponent(term.trim())}`, {
    tags: { scenario: "product_search_read" },
  });

  check(response, {
    "product search returned 200": (res) => res.status === 200,
    "product search returned items": (res) => Array.isArray(res.json("items")),
  });
}

export function productCreateWrite(data) {
  const response = http.post(
    `${baseUrl}/v1/products`,
    JSON.stringify({ name: `perf baseline product ${__VU}-${__ITER}` }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.token}`,
      },
      tags: { scenario: "product_create_write" },
    },
  );

  check(response, {
    "product create returned 201": (res) => res.status === 201,
    "product create returned an id": (res) => Boolean(res.json("id")),
  });
}


export function productDetailRead(data) {
  const response = http.get(`${baseUrl}/v1/products/${data.detailProductId}`, {
    tags: { scenario: "product_detail_read" },
  });

  check(response, {
    "product detail returned 200": (res) => res.status === 200,
    "product detail returned the product": (res) => Boolean(res.json("id")),
  });
}

export function productComponentsRead(data) {
  const response = http.get(`${baseUrl}/v1/products/${data.detailProductId}/components`, {
    tags: { scenario: "product_components_read" },
  });

  check(response, {
    "components returned 200": (res) => res.status === 200,
  });
}

export function referenceDataRead() {
  const response = http.get(`${baseUrl}/v1/materials?size=20`, {
    tags: { scenario: "reference_data_read" },
  });

  check(response, {
    "materials returned 200": (res) => res.status === 200,
    "materials returned items": (res) => Array.isArray(res.json("items")),
  });
}

export function imageUploadWrite(data) {
  const image = uploadImages[__ITER % uploadImages.length];
  const response = http.post(
    `${baseUrl}/v1/products/${data.uploadProductId}/images`,
    { file: http.file(image.body, `perf-${__VU}-${__ITER}.jpg`, "image/jpeg") },
    {
      headers: { Authorization: `Bearer ${data.token}` },
      tags: { scenario: "image_upload_write", upload_size: image.size },
    },
  );

  check(response, {
    "image upload returned 201": (res) => res.status === 201,
  });
}
