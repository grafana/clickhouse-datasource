const { formatSummary, mapWithConcurrency, parseCliArgs, resolveMatrix } = require('./e2e-matrix');

const item = (version, stable = true) => ({ version, channels: { stable, nightly: !stable } });

const ITEMS = [
  item('13.3.0-34793047961', false),
  item('13.2.3'),
  item('13.2.2'),
  item('13.1.7'),
  item('13.0.10'),
  item('12.4.12'),
  item('12.3.11'),
  item('12.2.10'),
  item('12.1.10'),
  item('12.0.10'),
  item('11.6.16'),
  item('11.6.15'),
  item('11.5.9'),
];

const images = (...versions) => versions.map((version) => ({ name: 'grafana-enterprise', version }));

describe('resolveMatrix', () => {
  it('produces the CI matrix: nightly plus five minors spread evenly across the grafanaDependency range', () => {
    const matrix = resolveMatrix(ITEMS, { grafanaDependency: '>=11.6.0-0', limit: 6, skipNightly: false });

    expect(matrix).toEqual(images('nightly', '13.2.3', '13.0.10', '12.3.11', '12.1.10', '11.6.16'));
  });

  it('keeps only the latest patch of each minor inside the range when the limit is zero', () => {
    const matrix = resolveMatrix(ITEMS, { grafanaDependency: '>=11.6.0-0', limit: 0, skipNightly: true });

    expect(matrix).toEqual(
      images('13.2.3', '13.1.7', '13.0.10', '12.4.12', '12.3.11', '12.2.10', '12.1.10', '12.0.10', '11.6.16')
    );
  });

  it('fills the whole limit with stable versions when the nightly image is skipped', () => {
    const matrix = resolveMatrix(ITEMS, { grafanaDependency: '>=11.6.0-0', limit: 6, skipNightly: true });

    expect(matrix).toEqual(images('13.2.3', '13.1.7', '12.4.12', '12.2.10', '12.0.10', '11.6.16'));
  });

  it('ignores versions that are not on the stable channel', () => {
    const matrix = resolveMatrix([item('13.3.0', false), item('13.2.3')], {
      grafanaDependency: '>=13.0.0',
      limit: 0,
      skipNightly: true,
    });

    expect(matrix).toEqual(images('13.2.3'));
  });
});

describe('parseCliArgs', () => {
  it('defaults to two parallel stacks, six images, the nightly image and ports from 3100', () => {
    expect(parseCliArgs([])).toEqual({
      parallel: 2,
      limit: 6,
      skipNightly: false,
      build: false,
      portBase: 3100,
      versions: undefined,
      playwrightArgs: [],
    });
  });

  it('splits --versions into an explicit list', () => {
    expect(parseCliArgs(['--versions', '13.2.3,nightly']).versions).toEqual(['13.2.3', 'nightly']);
  });

  it('rejects a version that is not a Docker image tag', () => {
    expect(() => parseCliArgs(['--versions', '../13.2.3'])).toThrow('not a valid image tag');
  });

  it('enforces the lower bounds of the numeric flags', () => {
    expect(() => parseCliArgs(['--parallel', '0'])).toThrow('--parallel');
    expect(() => parseCliArgs(['--port-base', '0'])).toThrow('--port-base');
    expect(parseCliArgs(['--limit', '0']).limit).toBe(0);
  });

  it('rejects a numeric flag that is not a whole number', () => {
    expect(() => parseCliArgs(['--parallel', 'two'])).toThrow('whole number');
  });

  it('rejects an empty --versions list', () => {
    expect(() => parseCliArgs(['--versions', ','])).toThrow('at least one');
  });

  it('drops duplicate versions', () => {
    expect(parseCliArgs(['--versions', '13.2.3,13.2.3,nightly']).versions).toEqual(['13.2.3', 'nightly']);
  });

  it('passes everything after -- through to Playwright', () => {
    const args = parseCliArgs(['--parallel', '3', '--', '--grep', 'smoke']);

    expect(args.parallel).toBe(3);
    expect(args.playwrightArgs).toEqual(['--grep', 'smoke']);
  });
});

describe('mapWithConcurrency', () => {
  it('runs at most the given number of tasks at once and keeps the input order', async () => {
    let active = 0;
    let peak = 0;
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const results = await mapWithConcurrency([30, 10, 20], 2, async (delay, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(delay);
      active -= 1;
      return `${index}:${delay}`;
    });

    expect(results).toEqual(['0:30', '1:10', '2:20']);
    expect(peak).toBe(2);
  });
});

describe('formatSummary', () => {
  it('prints one row per version with the outcome, test counts, duration and report path', () => {
    const lines = formatSummary([
      {
        version: '13.2.3',
        status: 'passed',
        stats: { expected: 110, unexpected: 0, flaky: 0, skipped: 4 },
        durationMs: 185_000,
        reportDir: 'e2e-results/13.2.3/report',
      },
      {
        version: 'nightly',
        status: 'failed',
        stats: { expected: 108, unexpected: 2, flaky: 1, skipped: 4 },
        durationMs: 190_000,
        reportDir: 'e2e-results/nightly/report',
      },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^13\.2\.3\s+passed\s+110 passed, 0 failed, 0 flaky, 4 skipped\s+3m05s\s+e2e-results\/13\.2\.3\/report$/
    );
    expect(lines[1]).toMatch(
      /^nightly\s+failed\s+108 passed, 2 failed, 1 flaky, 4 skipped\s+3m10s\s+e2e-results\/nightly\/report$/
    );
  });

  it('marks a finished run that produced no results file', () => {
    const [line] = formatSummary([
      { version: 'nightly', status: 'failed', durationMs: 60_000, reportDir: 'e2e-results/nightly/report' },
    ]);

    expect(line).toMatch(/^nightly\s+failed\s+no results\.json\s+1m00s\s+e2e-results\/nightly\/report$/);
  });

  it('reports a stack that never became healthy without test counts', () => {
    const [line] = formatSummary([{ version: 'nightly', status: 'startup failed', durationMs: 120_000 }]);

    expect(line).toMatch(/^nightly\s+startup failed\s+no tests run\s+2m00s$/);
  });
});
