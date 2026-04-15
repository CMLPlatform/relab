import { spawn } from 'node:child_process';

const command = process.argv[2];
const port = Number(process.env.DOCS_PREVIEW_PORT ?? 4300 + Math.floor(Math.random() * 400));

if (!command) {
  console.error('Usage: node ./scripts/run-with-preview.mjs "<command>"');
  process.exit(1);
}

const preview = spawn('pnpm', ['exec', 'astro', 'preview', '--port', String(port), '--host'], {
  stdio: 'inherit',
});

const origin = `http://127.0.0.1:${port}`;
const timeoutMs = 30_000;
const startedAt = Date.now();

const waitForServer = async () => {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Preview server did not become ready within ${timeoutMs}ms`);
};

const stopPreview = () =>
  new Promise((resolve) => {
    preview.once('exit', () => resolve());
    preview.kill('SIGTERM');
    setTimeout(() => {
      if (!preview.killed) {
        preview.kill('SIGKILL');
      }
    }, 5_000);
  });

const run = async () => {
  try {
    await waitForServer();

    const child = spawn(command, {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        BASE_URL: origin,
      },
    });

    const exitCode = await new Promise((resolve) => {
      child.once('exit', (code) => resolve(code ?? 1));
    });

    await stopPreview();
    process.exit(exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await stopPreview();
    process.exit(1);
  }
};

await run();
