import process from 'node:process';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse/core/index.js';
import { chromium } from 'playwright';

const DEFAULT_BASE_URL = 'http://127.0.0.1:4300';
const EXIT_FAILURE = 1;
const HOME_PAGE_PATH = '/';
const GUIDE_PAGE_PATH = '/user-guides/getting-started/';
const pages = [
  { path: HOME_PAGE_PATH, label: 'home' },
  { path: GUIDE_PAGE_PATH, label: 'guide' },
];
const thresholds = {
  performance: 0.8,
  accessibility: 0.9,
  'best-practices': 0.9,
  seo: 0.9,
};

function writeStdout(message) {
  process.stdout.write(`${message}\n`);
}

function writeStderr(message) {
  process.stderr.write(`${message}\n`);
}

function getBaseUrl() {
  const [firstArg, secondArg] = process.argv.slice(2);
  if (firstArg === '--base-url' && secondArg) {
    return secondArg;
  }
  if (firstArg && firstArg !== '--base-url') {
    return firstArg;
  }
  return DEFAULT_BASE_URL;
}

async function checkPage(origin, chromePort, page) {
  const result = await lighthouse(`${origin}${page.path}`, {
    logLevel: 'error',
    output: 'json',
    port: chromePort,
  });

  if (!result) {
    throw new Error(`Lighthouse did not return a result for ${page.label}.`);
  }

  const categories = result.lhr.categories;
  for (const [key, threshold] of Object.entries(thresholds)) {
    const score = categories[key]?.score ?? 0;
    if (score < threshold) {
      throw new Error(
        `${page.label} failed Lighthouse ${key}: ${score.toFixed(2)} < ${threshold.toFixed(2)}`,
      );
    }
  }
}

async function main() {
  const origin = getBaseUrl();
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    await pages.reduce(async function runSequentially(previousAudit, page) {
      await previousAudit;
      await checkPage(origin, chrome.port, page);
    }, Promise.resolve());
  } catch (error) {
    writeStderr(error instanceof Error ? error.message : String(error));
    process.exit(EXIT_FAILURE);
  } finally {
    chrome.kill();
  }

  writeStdout('Lighthouse budgets passed.');
}

await main();
