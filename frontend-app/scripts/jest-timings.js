#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function getDurationMs(testResult) {
  if (
    testResult?.perfStats &&
    typeof testResult.perfStats.start === 'number' &&
    typeof testResult.perfStats.end === 'number'
  ) {
    return testResult.perfStats.end - testResult.perfStats.start;
  }

  if (typeof testResult?.startTime === 'number' && typeof testResult?.endTime === 'number') {
    return testResult.endTime - testResult.startTime;
  }

  return null;
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

function main() {
  const [, , inputPath = '.jest-unit-timings.json', limitArg = '25'] = process.argv;
  const limit = Number(limitArg);
  const resolvedPath = path.resolve(process.cwd(), inputPath);

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const report = JSON.parse(raw);
  const rows = (report.testResults ?? [])
    .map((testResult) => {
      const durationMs = getDurationMs(testResult);
      return {
        seconds: durationMs === null ? 'n/a' : formatSeconds(durationMs),
        status: testResult.status ?? 'unknown',
        file: path.relative(process.cwd(), testResult.name ?? resolvedPath),
        durationMs,
      };
    })
    .filter((row) => row.durationMs !== null)
    .sort((left, right) => right.durationMs - left.durationMs);

  const topRows = rows.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 25);
  const totalSeconds = rows.reduce((sum, row) => sum + row.durationMs, 0) / 1000;

  console.log(`Jest timing report: ${path.basename(resolvedPath)}`);
  console.log(`Suites measured: ${rows.length}`);
  console.log(`Summed suite time: ${totalSeconds.toFixed(2)}s`);
  console.table(topRows.map(({ durationMs: _durationMs, ...row }) => row));
}

main();
