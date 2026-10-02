import http from "k6/http";
import { check } from "k6";
import encoding from "k6/encoding";
import exec from "k6/execution";
import { WebSocket } from "k6/websockets";

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
// How long the fake camera holds its relay socket open; set where its stages are.
let rpiCamDeviceSeconds = 0;

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

// The thresholds a run must meet. `gate` registers a scenario's two: under 1% failed
// requests, and a p95 latency ceiling in ms when given one. `just _perf-thresholds-apply`
// rewrites those ceilings in place, so keep each a literal number.
const thresholds = {
  // An open-model run that cannot start its iterations on time is a saturated
  // server, not a fast one; without this the suite would report the shortfall
  // as healthy latency.
  dropped_iterations: ["count<1"],
  checks: ["rate==1.00"],
};

function gate(scenario, p95) {
  thresholds[`http_req_failed{scenario:${scenario}}`] = ["rate<0.01"];
  if (p95 !== undefined) {
    thresholds[`http_req_duration{scenario:${scenario}}`] = [`p(95)<${p95}`];
  }
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
// Paths are relative to this script, so they resolve both on the host
// (`just perf-baseline`) and under the CI container's `/perf` mount.
const uploadImages = [
  { size: "small", body: open("./fixtures/upload-sample.jpg", "b") },
  { size: "medium", body: open("./fixtures/generated/upload-medium.jpg", "b") },
  { size: "large", body: open("./fixtures/generated/upload-large.jpg", "b") },
];

// Per size, because a percentile mixed across all three hides which one moved.
//
// Measured p95: 31 / 33 / 59 ms on a GitHub runner, 79 / 92 / 154 ms on a busy dev
// box, back when only the 200px width was generated in the request. Every width is
// now generated inline, which adds ~110-130 ms of derivative work from `medium` up,
// so those two ceilings carry that on top. These are a coarse guard, not a tight one:
// two runs of the same commit put small at 69 ms and 31 ms, so run-to-run variance
// here is over 2x, and a threshold tight enough to catch a ~40-50ms regression would
// flap on it. A flapping threshold gets ignored, which is worse than a loose one.
// What these catch is a gross regression; the pipeline's own cost is better guarded
// by measuring the resize path directly, where there is no network or runner noise.
const UPLOAD_THRESHOLDS_MS = { small: 200, medium: 320, large: 400 };

gate("live_probe", 100);
gate("product_list_read", 300);
gate("product_search_read", 400);
gate("product_detail_read", 200);
gate("product_components_read", 200);
gate("reference_data_read", 100);

if (loginEmail && loginPassword) {
  scenarios.bearer_login = { ...stage(Number(__ENV.PERF_LOGIN_RATE || 2), 10), exec: "perfUserLogin" };
  gate("bearer_login", 500);
}

if (mediaUrl) {
  scenarios.media_url_read = { ...stage(Number(__ENV.PERF_MEDIA_RATE || 10), 10), exec: "mediaUrlRead" };
  gate("media_url_read", 100);
}

// Registered after every read stage on purpose: this one inserts rows, and the
// read baselines above are only comparable against a table that is not growing
// underneath them.
if (loginEmail && loginPassword) {
  scenarios.product_create_write = { ...stage(Number(__ENV.PERF_CREATE_RATE || 5), 10), exec: "productCreateWrite" };
  gate("product_create_write", 300);

  // Last of all: an upload decodes the image and writes derivatives, so it is
  // both the slowest write and the one that leaves the most behind. Iterations
  // rotate through `uploadImages`, and each size carries its own threshold;
  // a mixed percentile over three sizes hides which one moved.
  //
  // The previous 1400 was set before anything had measured this, against a
  // fixture that skipped the widest derivative. The figures below come from the
  // CI stack with per-size headroom over the measured p95.
  scenarios.image_upload_write = { ...stage(Number(__ENV.PERF_UPLOAD_RATE || 3), 10), exec: "imageUploadWrite" };
  gate("image_upload_write");
  for (const { size } of uploadImages) {
    thresholds[`http_req_duration{upload_size:${size}}`] = [`p(95)<${UPLOAD_THRESHOLDS_MS[size]}`];
  }

  // The rpi_cam relay. A camera is a long-lived WebSocket the device opens, and
  // user requests reach it as JSON frames over that socket, so an HTTP latency
  // number alone cannot see it. These stages measure the relay three ways:
  // connection setup (`ws_connecting`), round-trip latency through the socket
  // (`http_req_duration` of a relayed request), and relay failures
  // (`http_req_failed`, which a dropped frame or dead socket shows up as a 503).
  // The camera is simulated in k6 itself: it signs the same ES256 device assertion
  // a paired Pi does, so the auth path measured is the real one.
  scenarios.rpi_cam_ws_connect = { ...stage(Number(__ENV.PERF_RPI_CAM_CONNECT_RATE || 5), 10), exec: "rpiCamWsConnect" };
  // Measured p95 19 ms in two isolated CI-stack runs; roughly 5x, rounded up to 100.
  thresholds["ws_connecting{scenario:rpi_cam_ws_connect}"] = ["p(95)<100"];

  // One fake camera stays connected across the relayed stages, from halfway through
  // the gap before them to halfway through the gap after. Connecting any earlier
  // lets a straggling connect-stage socket replace it (the backend keeps one socket
  // per camera); closing any earlier fails the last capture still in flight.
  const relayStartSeconds = nextStartSeconds;
  scenarios.rpi_cam_telemetry_relay = {
    ...stage(Number(__ENV.PERF_RPI_CAM_TELEMETRY_RATE || 10), 10),
    exec: "rpiCamTelemetryRelay",
  };
  scenarios.rpi_cam_hls_relay = { ...stage(Number(__ENV.PERF_RPI_CAM_HLS_RATE || 10), 10), exec: "rpiCamHlsRelay" };
  scenarios.rpi_cam_capture = { ...stage(Number(__ENV.PERF_RPI_CAM_CAPTURE_RATE || 2), 10), exec: "rpiCamCapture" };
  const deviceStartSeconds = relayStartSeconds - gapSeconds / 2;
  rpiCamDeviceSeconds = nextStartSeconds - gapSeconds / 2 - deviceStartSeconds;
  scenarios.rpi_cam_device = {
    executor: "per-vu-iterations",
    vus: 1,
    iterations: 1,
    startTime: `${deviceStartSeconds}s`,
    maxDuration: `${rpiCamDeviceSeconds + gapSeconds}s`,
    exec: "rpiCamDevice",
  };
  // Roughly 5x the worse of two isolated CI-stack runs (p95 22 / 23 / 125 ms),
  // rounded up to 100.
  gate("rpi_cam_telemetry_relay", 200);
  gate("rpi_cam_hls_relay", 200);
  gate("rpi_cam_capture", 700);

  // Device-side HTTP, no socket: the Pi's thumbnail worker posting a preview frame.
  scenarios.rpi_cam_preview_upload = {
    ...stage(Number(__ENV.PERF_RPI_CAM_PREVIEW_RATE || 3), 10),
    exec: "rpiCamPreviewUpload",
  };
  // Measured p95 20-25 ms in two isolated CI-stack runs; roughly 5x, rounded up to 100.
  gate("rpi_cam_preview_upload", 200);
}

export const options = {
  scenarios,
  thresholds,
  // p99 alongside p95: a regression that only moves the far tail is still a
  // regression, and the default stats hide it.
  summaryTrendStats: ["avg", "min", "med", "p(95)", "p(99)", "max"],
};

export async function setup() {
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

  // A camera owned by the same user, registered with a fresh P-256 key the way
  // pairing registers a Pi's. The private half goes to the VUs that play the device.
  const cameraKeys = await crypto.subtle.generateKey(EC_P256, true, ["sign", "verify"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", cameraKeys.publicKey);
  const cameraKeyId = `perf-${Date.now()}`;
  const camera = http.post(
    `${baseUrl}/v1/plugins/rpi-cam/cameras`,
    JSON.stringify({
      name: "perf baseline camera",
      relay_public_key_jwk: { kty, crv, x, y },
      relay_key_id: cameraKeyId,
    }),
    { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } },
  );

  return {
    token,
    detailProductId,
    uploadProductId: created.json("id"),
    camera: {
      id: camera.json("id"),
      keyId: cameraKeyId,
      privateJwk: await crypto.subtle.exportKey("jwk", cameraKeys.privateKey),
    },
  };
}

// --- rpi_cam fake device ------------------------------------------------------

const EC_P256 = { name: "ECDSA", namedCurve: "P-256" };
const wsBaseUrl = baseUrl.replace(/^http/, "ws");

// The ES256 device assertion a paired Pi signs for the relay socket and for its
// own uploads. The backend accepts each `jti` once, so every use needs a new one.
async function deviceAssertion(camera) {
  const key = await crypto.subtle.importKey("jwk", camera.privateJwk, EC_P256, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const issuer = `camera:${camera.id}`;
  const b64 = (value) => encoding.b64encode(JSON.stringify(value), "rawurl");
  const signingInput = `${b64({ alg: "ES256", typ: "JWT", kid: camera.keyId })}.${b64({
    iss: issuer,
    sub: issuer,
    aud: "relab-rpi-cam-relay",
    iat: now,
    nbf: now,
    exp: now + 120,
    jti: `${exec.vu.idInTest}-${exec.scenario.iterationInTest}-${Math.random().toString(36).slice(2)}`,
  })}`;
  // WebCrypto's ECDSA signature is raw r||s, which is exactly the JWS ES256 form.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${encoding.b64encode(signature, "rawurl")}`;
}

async function openCameraSocket(camera) {
  const ws = new WebSocket(`${wsBaseUrl}/v1/plugins/rpi-cam/ws/connect?camera_id=${camera.id}`, null, {
    headers: { Authorization: `Bearer ${await deviceAssertion(camera)}` },
  });
  const opened = await new Promise((resolve) => {
    ws.onopen = () => resolve(true);
    ws.onerror = () => resolve(false);
  });
  check(opened, { "camera relay socket opened": (ok) => ok });
  return opened ? ws : null;
}

// A small fixed playlist and one fMP4-sized binary body for segment requests. The
// segment bytes do not need to be video: the relay forwards them opaquely.
const HLS_PLAYLIST = "#EXTM3U\n#EXT-X-VERSION:9\n#EXT-X-TARGETDURATION:1\n#EXTINF:1.0,\nseg0.mp4\n";
const hlsSegment = uploadImages[0].body;

function respond(ws, id, status, data, extra = {}) {
  ws.send(JSON.stringify({ id, type: "response", status, data, ...extra }));
}

// Answers the relay commands the stages below send, as the Pi's local API would.
async function handleRelayCommand(ws, camera, msg) {
  if (msg.method === "GET" && msg.path === "/system/telemetry") {
    respond(ws, msg.id, 200, {
      timestamp: new Date().toISOString(),
      cpu_percent: 12.5,
      mem_percent: 40.0,
      disk_percent: 20.0,
      thermal_state: "normal",
    });
  } else if (msg.method === "GET" && msg.path.startsWith("/preview/hls/")) {
    if (msg.path.endsWith(".m3u8")) {
      respond(ws, msg.id, 200, HLS_PLAYLIST, { content_type: "application/vnd.apple.mpegurl" });
    } else {
      // Binary bodies travel as a JSON header then one binary frame.
      respond(ws, msg.id, 200, null, { content_type: "video/mp4", has_binary: true });
      ws.send(hlsSegment);
    }
  } else if (msg.method === "POST" && msg.path === "/captures") {
    // A real capture: the Pi pushes the image to the backend over HTTPS, then
    // answers the relayed command with the stored image's id.
    const upload = http.post(
      `${baseUrl}/v1/plugins/rpi-cam/device/cameras/${camera.id}/image-upload`,
      {
        file: http.file(uploadImages[0].body, "capture.jpg", "image/jpeg"),
        capture_metadata: "{}",
        upload_metadata: JSON.stringify(msg.body),
      },
      { headers: { Authorization: `Bearer ${await deviceAssertion(camera)}` } },
    );
    respond(ws, msg.id, upload.status === 201 ? 200 : 502, {
      status: "uploaded",
      image_id: upload.json("image_id"),
      image_url: upload.json("image_url"),
    });
  } else {
    respond(ws, msg.id, 404, { detail: `Unknown: ${msg.method} ${msg.path}` });
  }
}

// Holds one relay socket open for the relayed stages and serves their commands.
export async function rpiCamDevice(data) {
  const ws = await openCameraSocket(data.camera);
  if (!ws) {
    return;
  }
  ws.binaryType = "arraybuffer";
  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    } else if (msg.type === "request") {
      await handleRelayCommand(ws, data.camera, msg);
    }
  };
  setTimeout(() => ws.close(), rpiCamDeviceSeconds * 1000);
}

export async function rpiCamWsConnect(data) {
  const ws = await openCameraSocket(data.camera);
  if (ws) {
    ws.close();
  }
}

export function rpiCamTelemetryRelay(data) {
  // force_refresh skips the telemetry cache, so every request crosses the relay.
  const response = http.get(`${baseUrl}/v1/plugins/rpi-cam/cameras/${data.camera.id}/telemetry?force_refresh=true`, {
    headers: { Authorization: `Bearer ${data.token}` },
    tags: { scenario: "rpi_cam_telemetry_relay" },
  });

  check(response, {
    "relayed telemetry returned 200": (res) => res.status === 200,
    "relayed telemetry returned a snapshot": (res) => res.json("thermal_state") === "normal",
  });
}

export function rpiCamHlsRelay(data) {
  const response = http.get(`${baseUrl}/v1/plugins/rpi-cam/cameras/${data.camera.id}/hls/cam-preview/seg0.mp4`, {
    headers: { Authorization: `Bearer ${data.token}` },
    responseType: "binary",
    tags: { scenario: "rpi_cam_hls_relay" },
  });

  check(response, {
    "relayed HLS segment returned 200": (res) => res.status === 200,
    "relayed HLS segment is intact": (res) => res.body && res.body.byteLength === hlsSegment.byteLength,
  });
}

export function rpiCamCapture(data) {
  const response = http.post(
    `${baseUrl}/v1/plugins/rpi-cam/cameras/${data.camera.id}/captures`,
    JSON.stringify({ product_id: data.uploadProductId }),
    {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.token}` },
      tags: { scenario: "rpi_cam_capture" },
    },
  );

  check(response, {
    "camera capture returned 201": (res) => res.status === 201,
  });
}

export async function rpiCamPreviewUpload(data) {
  const assertion = await deviceAssertion(data.camera);
  const response = http.post(
    `${baseUrl}/v1/plugins/rpi-cam/device/cameras/${data.camera.id}/preview-thumbnail-upload`,
    { file: http.file(uploadImages[0].body, "preview.jpg", "image/jpeg") },
    {
      headers: { Authorization: `Bearer ${assertion}` },
      tags: { scenario: "rpi_cam_preview_upload" },
    },
  );

  check(response, {
    "preview thumbnail upload returned 201": (res) => res.status === 201,
  });
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

// Shared with the capacity probe, which logs in as many accounts.
export function bearerLogin(email, password) {
  const response = http.post(
    `${baseUrl}/v1/auth/bearer/login`,
    { username: email, password },
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      tags: { scenario: "bearer_login" },
    },
  );

  check(response, {
    "bearer login returned 200": (res) => res.status === 200,
    "bearer login returned token": (res) => Boolean(res.json("access_token")),
  });
  return response;
}

export function perfUserLogin() {
  bearerLogin(loginEmail, loginPassword);
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
  // Scenario-wide counter, not __ITER: every pre-allocated VU restarts __ITER at 0,
  // so a VU-derived index oversamples the first size and skews the per-size p95s.
  const image = uploadImages[exec.scenario.iterationInTest % uploadImages.length];
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
