import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:8000";
const productListPath = __ENV.PERF_PRODUCT_LIST_PATH || "/v1/products?size=20";
const livePath = __ENV.PERF_LIVE_PATH || "/live";
const loginEmail = __ENV.PERF_USER_EMAIL;
const loginPassword = __ENV.PERF_USER_PASSWORD;
const mediaUrl = __ENV.PERF_MEDIA_URL;

const scenarios = {
  live_probe: {
    executor: "constant-vus",
    exec: "liveProbe",
    vus: Number(__ENV.PERF_LIVE_VUS || 2),
    duration: __ENV.PERF_LIVE_DURATION || "30s",
  },
  product_list_read: {
    executor: "constant-vus",
    exec: "productListRead",
    vus: Number(__ENV.PERF_PRODUCT_LIST_VUS || 5),
    duration: __ENV.PERF_PRODUCT_LIST_DURATION || "30s",
  },
};

const thresholds = {
  "http_req_failed{scenario:live_probe}": ["rate<0.01"],
  "http_req_duration{scenario:live_probe}": ["p(95)<1200"],
  "http_req_failed{scenario:product_list_read}": ["rate<0.01"],
  "http_req_duration{scenario:product_list_read}": ["p(95)<1800"],
};

if (loginEmail && loginPassword) {
  scenarios.bearer_login = {
    executor: "constant-vus",
    exec: "bearerLogin",
    vus: Number(__ENV.PERF_LOGIN_VUS || 2),
    duration: __ENV.PERF_LOGIN_DURATION || "30s",
  };
  thresholds["http_req_failed{scenario:bearer_login}"] = ["rate<0.01"];
  thresholds["http_req_duration{scenario:bearer_login}"] = ["p(95)<1600"];
}

if (mediaUrl) {
  scenarios.media_url_read = {
    executor: "constant-vus",
    exec: "mediaUrlRead",
    vus: Number(__ENV.PERF_MEDIA_VUS || 2),
    duration: __ENV.PERF_MEDIA_DURATION || "30s",
  };
  thresholds["http_req_failed{scenario:media_url_read}"] = ["rate<0.01"];
  thresholds["http_req_duration{scenario:media_url_read}"] = ["p(95)<1400"];
}

export const options = {
  scenarios,
  thresholds,
};

export function liveProbe() {
  const response = http.get(`${baseUrl}${livePath}`, {
    tags: { scenario: "live_probe" },
  });

  check(response, {
    "live probe returned 200": (res) => res.status === 200,
    "live probe returned alive": (res) => res.json("status") === "alive",
  });

  sleep(1);
}

export function productListRead() {
  const response = http.get(`${baseUrl}${productListPath}`, {
    tags: { scenario: "product_list_read" },
  });

  check(response, {
    "product list returned 200": (res) => res.status === 200,
    "product list returned items": (res) => Array.isArray(res.json("items")),
  });

  sleep(1);
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

  sleep(1);
}

export function mediaUrlRead() {
  const response = http.get(mediaUrl, {
    tags: { scenario: "media_url_read" },
  });

  check(response, {
    "media URL returned 200": (res) => res.status === 200,
    "media URL has body": (res) => res.body && res.body.length > 0,
  });

  sleep(1);
}
