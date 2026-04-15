import { chromium } from 'playwright';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const origin = process.env.BASE_URL ?? 'http://127.0.0.1:8000';
const pages = [
  { path: '/', label: 'home' },
  { path: '/user-guides/getting-started/', label: 'guide' },
];

const thresholds = {
  performance: 0.8,
  accessibility: 0.9,
  'best-practices': 0.9,
  seo: 0.9,
};

const chrome = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  for (const page of pages) {
    const result = await lighthouse(`${origin}${page.path}`, {
      logLevel: 'error',
      output: 'json',
      port: chrome.port,
    });
    if (!result) {
      console.error(`Lighthouse did not return a result for ${page.label}.`);
      process.exit(1);
    }

    const categories = result.lhr.categories;
    for (const [key, threshold] of Object.entries(thresholds)) {
      const score = categories[key]?.score ?? 0;
      if (score < threshold) {
        console.error(
          `${page.label} failed Lighthouse ${key}: ${score.toFixed(2)} < ${threshold.toFixed(2)}`,
        );
        process.exit(1);
      }
    }
  }
} finally {
  chrome.kill();
}

console.log('Lighthouse budgets passed.');
