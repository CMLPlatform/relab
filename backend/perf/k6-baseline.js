import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:8000";
const productTreePath = __ENV.PERF_PRODUCT_TREE_PATH || "/products/tree?recursion_depth=2";
const loginEmail = __ENV.PERF_USER_EMAIL;
const loginPassword = __ENV.PERF_USER_PASSWORD;
const imageId = __ENV.PERF_IMAGE_ID;
const imageWidth = __ENV.PERF_IMAGE_WIDTH || "200";

const scenarios = {
  product_tree_read: {
    executor: "constant-vus",
    exec: "productTreeRead",
    vus: Number(__ENV.PERF_PRODUCT_TREE_VUS || 5),
    duration: __ENV.PERF_PRODUCT_TREE_DURATION || "30s",
  },
};

const thresholds = {
  "http_req_failed{scenario:product_tree_read}": ["rate<0.01"],
  "http_req_duration{scenario:product_tree_read}": ["p(95)<1800"],
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

if (imageId) {
  scenarios.resized_image = {
    executor: "constant-vus",
    exec: "resizedImage",
    vus: Number(__ENV.PERF_IMAGE_VUS || 2),
    duration: __ENV.PERF_IMAGE_DURATION || "30s",
  };
  thresholds["http_req_failed{scenario:resized_image}"] = ["rate<0.01"];
  thresholds["http_req_duration{scenario:resized_image}"] = ["p(95)<1400"];
}

export const options = {
  scenarios,
  thresholds,
};

export function productTreeRead() {
  const response = http.get(`${baseUrl}${productTreePath}`, {
    tags: { scenario: "product_tree_read" },
  });

  check(response, {
    "product tree returned 200": (res) => res.status === 200,
    "product tree returned array": (res) => Array.isArray(res.json()),
  });

  sleep(1);
}

export function bearerLogin() {
  const response = http.post(
    `${baseUrl}/auth/bearer/login`,
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

export function resizedImage() {
  const response = http.get(`${baseUrl}/images/${imageId}/resized?width=${imageWidth}`, {
    tags: { scenario: "resized_image" },
  });

  check(response, {
    "resized image returned 200": (res) => res.status === 200,
    "resized image has body": (res) => res.body && res.body.length > 0,
  });

  sleep(1);
}
