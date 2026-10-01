#!/usr/bin/env node
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const semver = require('semver');

const REPO_ROOT = path.resolve(__dirname, '..');
const IMAGE_NAME = 'grafana-enterprise';
const IMAGE_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const VERSIONS_API = 'https://grafana.com/api/grafana-enterprise/versions';
const COMPOSE_FILES = ['docker-compose.yml', 'tests/e2e/compose.matrix.yml'];
const MATRIX_DIR = path.join(REPO_ROOT, 'e2e-results');
const DIST_DIR = path.join(REPO_ROOT, 'dist');
const PLAYWRIGHT_BIN = path.join(REPO_ROOT, 'node_modules', '.bin', 'playwright');
const STACK_MEMORY_BYTES = 2 * 1024 ** 3;
const GRAFANA_STARTUP_TIMEOUT_MS = 180_000;
// Set by the Cloud cron workflow and local reproductions of it; they point the suite at another Grafana.
const CLOUD_RUN_KEYS = new Set([
  'GRAFANA_URL',
  'DS_INSTANCE_PORT',
  'DS_INSTANCE_USERNAME',
  'DS_INSTANCE_PASSWORD',
  'DS_PDC_NETWORK_NAME',
  'DS_E2E_UID',
]);

const HELP = `Usage: npm run e2e:matrix -- [options] [-- playwright args]

Runs the Playwright suite against the Grafana versions that CI tests, one Docker Compose stack per version.

  --parallel <n>     stacks to run at once (default 2, about 2 GiB of Docker memory each)
  --versions <list>  comma-separated Grafana versions to run instead of resolving the CI matrix
  --skip-nightly     leave grafana-enterprise:nightly out of the resolved matrix
  --limit <n>        cap on resolved images, 0 for no cap (default 6, as in CI)
  --build            rebuild the frontend and backend into dist/ first
  --port-base <n>    first host port for Grafana (default 3100)

Example: npm run e2e:matrix -- --versions 13.2.3,nightly -- --grep "config editor"
`;

const wholeNumber = (name, value, min) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min) {
    throw new Error(`--${name} must be a whole number of at least ${min}`);
  }
  return number;
};

const parseVersions = (list) => {
  const versions = [
    ...new Set(
      list
        .split(',')
        .map((version) => version.trim())
        .filter(Boolean)
    ),
  ];
  if (versions.length === 0) {
    throw new Error('--versions needs at least one image tag');
  }
  const invalid = versions.find((version) => !IMAGE_TAG.test(version));
  if (invalid !== undefined) {
    throw new Error(`'${invalid}' is not a valid image tag`);
  }
  return versions;
};

const parseCliArgs = (argv) => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      parallel: { type: 'string', default: '2' },
      versions: { type: 'string' },
      'skip-nightly': { type: 'boolean', default: false },
      limit: { type: 'string', default: '6' },
      build: { type: 'boolean', default: false },
      'port-base': { type: 'string', default: '3100' },
    },
  });

  return {
    parallel: wholeNumber('parallel', values.parallel, 1),
    limit: wholeNumber('limit', values.limit, 0),
    skipNightly: values['skip-nightly'],
    build: values.build,
    portBase: wholeNumber('port-base', values['port-base'], 1),
    versions: values.versions === undefined ? undefined : parseVersions(values.versions),
    playwrightArgs: positionals,
  };
};

const latestStablePerMinor = (items) => {
  const latest = new Map();
  items
    .filter((item) => item.channels.stable === true)
    .map((item) => semver.parse(item.version))
    .filter((version) => version !== null)
    .forEach((version) => {
      const key = `${version.major}.${version.minor}`;
      const current = latest.get(key);
      if (!current || semver.gt(version, current)) {
        latest.set(key, version);
      }
    });

  return semver.rsort([...latest.values()]).map((version) => version.version);
};

// Same selection as grafana/plugin-actions e2e-version: the newest and oldest always stay in.
const pickEvenly = (versions, limit) => {
  if (limit >= versions.length) {
    return versions;
  }
  const ends = limit > 1 ? [versions[0], versions[versions.length - 1]] : [versions[0]];
  const middle = versions.slice(1, limit > 1 ? -1 : undefined);
  const slots = limit - ends.length;
  const interval = middle.length / slots;
  const picked = Array.from({ length: slots }, (_, i) => middle[Math.floor(i * interval + interval / 2)]);

  return semver.rsort([...ends, ...picked]);
};

const resolveMatrix = (items, { grafanaDependency, limit, skipNightly }) => {
  const matching = latestStablePerMinor(items).filter((version) => semver.satisfies(version, grafanaDependency));
  const stableLimit = Math.max(0, skipNightly ? limit : limit - 1);
  const stable = limit === 0 ? matching : pickEvenly(matching, stableLimit);
  const versions = skipNightly ? stable : ['nightly', ...stable];

  return versions.map((version) => ({ name: IMAGE_NAME, version }));
};

const mapWithConcurrency = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));

  return results;
};

const formatDuration = (ms) => {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return `${minutes}m${seconds}s`;
};

const formatStats = (stats, status) => {
  if (stats) {
    return `${stats.expected} passed, ${stats.unexpected} failed, ${stats.flaky} flaky, ${stats.skipped} skipped`;
  }
  return status === 'startup failed' ? 'no tests run' : 'no results.json';
};

const formatSummary = (results) => {
  const rows = results.map((result) => [
    result.version,
    result.status,
    formatStats(result.stats, result.status),
    formatDuration(result.durationMs),
    result.reportDir ?? '',
  ]);
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));

  return rows.map((row) =>
    row
      .map((cell, column) => cell.padEnd(widths[column]))
      .join('  ')
      .trimEnd()
  );
};

const log = (message) => console.log(`[e2e-matrix] ${message}`);

const localEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !CLOUD_RUN_KEYS.has(key)));
const children = new Set();
const activeStacks = new Set();

const run = (command, args, { cwd = REPO_ROOT, env = localEnv, output } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: output ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    if (output) {
      child.stdout.pipe(output, { end: false });
      child.stderr.pipe(output, { end: false });
    }
    children.add(child);
    child.once('error', (error) => {
      children.delete(child);
      reject(error);
    });
    child.once('close', (code) => {
      children.delete(child);
      resolve(code ?? 1);
    });
  });

const runOrThrow = async (command, args, options) => {
  const code = await run(command, args, options);
  if (code !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with code ${code}`);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForGrafana = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const healthy = await fetch(url).then(
      (response) => response.ok,
      () => false
    );
    if (healthy) {
      return;
    }
    await sleep(1000);
  }
  throw new Error(`Grafana at ${url} did not become healthy within ${timeoutMs / 1000}s`);
};

const readStats = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).stats : undefined);

const runVersion = async (image, port, options) => {
  const { version } = image;
  const project = `e2e-${version.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  const runDir = path.join(MATRIX_DIR, version);
  const reportDir = path.join(runDir, 'report');
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.mkdirSync(runDir, { recursive: true });
  const output = fs.createWriteStream(path.join(runDir, 'run.log'));
  const env = { ...localEnv, GRAFANA_IMAGE: image.name, GRAFANA_VERSION: version, E2E_GRAFANA_PORT: String(port) };
  const compose = ['compose', '-p', project, ...COMPOSE_FILES.flatMap((file) => ['-f', file])];
  const stack = { compose, env };
  const started = Date.now();

  activeStacks.add(stack);
  try {
    log(`${version}: starting stack ${project} on port ${port}`);
    await runOrThrow('docker', [...compose, 'up', '-d', '--build', '--force-recreate', '--renew-anon-volumes'], {
      env,
      output,
    });
    await waitForGrafana(`http://localhost:${port}/api/health`, GRAFANA_STARTUP_TIMEOUT_MS);
    log(`${version}: running Playwright`);
    const code = await run(
      PLAYWRIGHT_BIN,
      [
        'test',
        '--config',
        path.join(REPO_ROOT, 'playwright.config.ts'),
        '--workers',
        '3',
        '--retries',
        '1',
        '--reporter',
        'line,html,json',
        '--output',
        path.join(runDir, 'results'),
        ...options.playwrightArgs,
      ],
      {
        cwd: runDir,
        output,
        env: {
          ...env,
          PORT: String(port),
          DS_INSTANCE_HOST: 'clickhouse-server',
          PLAYWRIGHT_HTML_OUTPUT_DIR: reportDir,
          PLAYWRIGHT_HTML_OPEN: 'never',
          PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(runDir, 'results.json'),
        },
      }
    );
    const status = code === 0 ? 'passed' : 'failed';
    log(`${version}: ${status}`);
    return {
      version,
      status,
      stats: readStats(path.join(runDir, 'results.json')),
      durationMs: Date.now() - started,
      reportDir: path.relative(REPO_ROOT, reportDir),
    };
  } catch (error) {
    output.write(`${error.message}\n`);
    await run('docker', [...compose, 'logs', '--no-color', '--tail', '200'], { env, output });
    log(`${version}: startup failed, see ${path.relative(REPO_ROOT, path.join(runDir, 'run.log'))}`);
    return { version, status: 'startup failed', durationMs: Date.now() - started };
  } finally {
    await run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], { env, output });
    activeStacks.delete(stack);
    await new Promise((resolve) => output.end(resolve));
  }
};

const fetchGrafanaVersions = async () => {
  const response = await fetch(VERSIONS_API);
  if (!response.ok) {
    throw new Error(`${VERSIONS_API} responded with ${response.status}`);
  }
  const { items } = await response.json();

  return items;
};

const readGrafanaDependency = () =>
  JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'src', 'plugin.json'), 'utf8')).dependencies.grafanaDependency;

const dockerMemoryBytes = () => {
  const info = spawnSync('docker', ['info', '--format', '{{.MemTotal}}'], { encoding: 'utf8' });
  if (info.error || info.status !== 0) {
    throw new Error(`docker is not available: ${info.error?.message ?? info.stderr.trim()}`);
  }
  return Number(info.stdout.trim());
};

const distReady = () =>
  fs.existsSync(path.join(DIST_DIR, 'module.js')) && fs.readdirSync(DIST_DIR).some((file) => file.startsWith('gpx_'));

const shutdown = (signal) => {
  log(`received ${signal}, tearing down ${activeStacks.size} stack(s)`);
  children.forEach((child) => child.kill('SIGTERM'));
  activeStacks.forEach(({ compose, env }) =>
    spawnSync('docker', [...compose, 'down', '--volumes', '--remove-orphans'], {
      cwd: REPO_ROOT,
      env,
      stdio: 'inherit',
    })
  );
  process.exit(130);
};

const main = async (argv) => {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return 0;
  }
  const options = parseCliArgs(argv);
  if (!options.build && !distReady()) {
    throw new Error(
      'dist/ lacks the frontend bundle or the backend binary: pass --build, or run `npm run build` and `mage buildAll` first'
    );
  }
  const memory = dockerMemoryBytes();
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach((signal) => process.on(signal, shutdown));

  const images = options.versions
    ? options.versions.map((version) => ({ name: IMAGE_NAME, version }))
    : resolveMatrix(await fetchGrafanaVersions(), {
        grafanaDependency: readGrafanaDependency(),
        limit: options.limit,
        skipNightly: options.skipNightly,
      });
  if (images.length === 0) {
    throw new Error(`no stable Grafana version satisfies ${readGrafanaDependency()}`);
  }
  const parallel = Math.min(options.parallel, images.length);
  log(`matrix: ${images.map((image) => image.version).join(' ')}`);
  if (parallel * STACK_MEMORY_BYTES > memory) {
    log(
      `warning: ${parallel} stacks need about ${parallel * 2} GiB but the Docker VM has ${(memory / 1024 ** 3).toFixed(1)} GiB; raise the Docker Desktop memory limit or lower --parallel`
    );
  }

  if (options.build) {
    await Promise.all([runOrThrow('npm', ['run', 'build']), runOrThrow('mage', ['buildAll'])]);
  } else {
    log(`using dist/ built ${fs.statSync(path.join(DIST_DIR, 'module.js')).mtime.toISOString()}`);
  }

  await Promise.all(
    images.map((image) => runOrThrow('docker', ['pull', '--quiet', `grafana/${image.name}:${image.version}`]))
  );

  const results = await mapWithConcurrency(images, parallel, (image, index) =>
    runVersion(image, options.portBase + index, options)
  );
  console.log(['', ...formatSummary(results), ''].join('\n'));

  return results.every((result) => result.status === 'passed') ? 0 : 1;
};

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      children.forEach((child) => child.kill('SIGTERM'));
      console.error(error.message);
      process.exit(1);
    }
  );
}

module.exports = { formatSummary, mapWithConcurrency, parseCliArgs, resolveMatrix };
