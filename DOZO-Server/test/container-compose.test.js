import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Sprint 2 container gate (Release Board R4): one image, two containers per
 * client, each owning its own SQLite file so the connector and dashboard never
 * share a database. The image consumes a CI-built SPA and never runs Vite.
 *
 * These are static assertions so they run under plain `npm test` with no Docker.
 * The live round-trip (compose up, `/r/:id`, dedupe, SPA) lives in
 * `scripts/container-smoke.sh` and is wired into `.github/workflows/container.yml`.
 */

const SERVER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_PATH = join(SERVER_DIR, 'docker-compose.yml');
const DOCKERFILE_PATH = join(SERVER_DIR, 'Dockerfile');

/** Non-blank, non-comment lines with their indentation and 1-based source line. */
function significantLines(file) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((raw, index) => ({ raw, line: index + 1 }))
    .filter(({ raw }) => {
      const trimmed = raw.trim();
      return trimmed !== '' && !trimmed.startsWith('#');
    })
    .map(({ raw, line }) => ({
      indent: raw.match(/^ */)[0].length,
      text: raw.trim(),
      line,
    }));
}

function unquote(value) {
  const trimmed = String(value).trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Minimal indentation-based reader for the two sections we care about:
 * `services.<name>.{environment,volumes,image}` and the top-level `volumes`
 * names. Enough for this repo's compose file without pulling in a YAML dep.
 */
function parseCompose(file) {
  const services = {};
  const topVolumes = [];
  let section = null;
  let service = null;
  let inServiceEnvironment = false;
  let inServiceVolumes = false;

  for (const { indent, text } of significantLines(file)) {
    if (indent === 0) {
      section = text.endsWith(':') ? text.slice(0, -1) : null;
      service = null;
      inServiceEnvironment = false;
      inServiceVolumes = false;
      continue;
    }

    if (section === 'services') {
      if (indent === 2 && text.endsWith(':')) {
        service = text.slice(0, -1);
        services[service] = { environment: {}, volumes: [], image: null };
        inServiceEnvironment = false;
        inServiceVolumes = false;
        continue;
      }
      if (!service) continue;

      if (indent === 4) {
        inServiceEnvironment = text === 'environment:';
        inServiceVolumes = text === 'volumes:';
        const kv = text.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (kv && kv[1] === 'image') services[service].image = unquote(kv[2]);
        continue;
      }
      if (indent >= 6 && inServiceEnvironment) {
        const kv = text.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (kv) services[service].environment[kv[1]] = unquote(kv[2]);
        continue;
      }
      if (indent >= 6 && inServiceVolumes) {
        const item = text.match(/^-\s*(.+)$/);
        if (item) services[service].volumes.push(unquote(item[1]));
      }
      continue;
    }

    if (section === 'volumes' && indent === 2 && text.endsWith(':')) {
      topVolumes.push(text.slice(0, -1));
    }
  }

  return { services, topVolumes };
}

function volumeSource(entry) {
  return entry.split(':')[0];
}

test('compose defines the connector + dashboard with distinct DB_PATH and volumes', () => {
  const { services, topVolumes } = parseCompose(COMPOSE_PATH);

  assert.deepEqual(
    Object.keys(services).sort(),
    ['connector', 'dashboard'],
    'exactly the two per-client services are defined',
  );

  const dbPaths = ['dashboard', 'connector'].map((name) => services[name].environment.DB_PATH);
  assert.ok(
    dbPaths.every((value) => typeof value === 'string' && value.length > 0),
    'each service sets an explicit DB_PATH',
  );
  assert.equal(new Set(dbPaths).size, 2, `DB_PATH must be distinct, got ${dbPaths.join(', ')}`);
  assert.ok(
    dbPaths.every((value) => value.startsWith('/data/')),
    `each DB_PATH lives on the container's own volume, got ${dbPaths.join(', ')}`,
  );

  const dashboardVolumes = services.dashboard.volumes.map(volumeSource);
  const connectorVolumes = services.connector.volumes.map(volumeSource);
  assert.ok(dashboardVolumes.length > 0 && connectorVolumes.length > 0, 'each service mounts a volume');
  assert.ok(
    dashboardVolumes.every((name) => !connectorVolumes.includes(name)),
    `no volume is mounted by both services (dashboard=${dashboardVolumes}, connector=${connectorVolumes})`,
  );

  assert.deepEqual(
    [...topVolumes].sort(),
    ['dozo-connector-data', 'dozo-dashboard-data'],
    'each service has its own named volume',
  );
  for (const name of [...dashboardVolumes, ...connectorVolumes]) {
    assert.ok(topVolumes.includes(name), `${name} is declared at the top level`);
  }

  assert.equal(
    services.dashboard.image,
    services.connector.image,
    'one image backs both containers',
  );
});

test('Dockerfile consumes the prebuilt SPA and never runs Vite', () => {
  const instructions = significantLines(DOCKERFILE_PATH).map(({ text }) => text);
  const joined = instructions.join('\n');

  assert.doesNotMatch(joined, /\bnpm\s+run\s+build\b/, 'the image must not build the SPA');
  assert.doesNotMatch(joined, /\bvite\b/i, 'the image must not invoke Vite');
  assert.match(
    joined,
    /COPY DOZO-Server\/public \.\/public/,
    'the CI-staged SPA is copied into the image',
  );
  assert.match(
    joined,
    /DASHBOARD_DIST_PATH=\/app\/public/,
    'Fastify is pointed at the in-image SPA',
  );
});

/**
 * Belt-and-braces: when a Docker CLI with the compose plugin is present, ask
 * Compose to actually render the file and assert the same invariants on the
 * merged result (env_file interpolation included). Skipped where Docker is not
 * installed, so `npm test` stays green on a bare checkout.
 */
test('rendered compose config keeps the per-client DB_PATH and volumes distinct', (t) => {
  const probe = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    t.skip('docker compose is not available');
    return;
  }

  const rendered = spawnSync(
    'docker',
    ['compose', '-f', COMPOSE_PATH, 'config', '--format', 'json'],
    { encoding: 'utf8' },
  );
  assert.equal(
    rendered.status,
    0,
    `docker compose config failed:\n${rendered.stderr || rendered.stdout}`,
  );

  const config = JSON.parse(rendered.stdout);
  const services = config.services ?? {};
  assert.deepEqual(Object.keys(services).sort(), ['connector', 'dashboard']);

  const environmentOf = (service) => {
    const env = service.environment ?? {};
    if (Array.isArray(env)) {
      return Object.fromEntries(
        env.map((entry) => {
          const index = entry.indexOf('=');
          return index < 0 ? [entry, ''] : [entry.slice(0, index), entry.slice(index + 1)];
        }),
      );
    }
    return env;
  };

  const dbPaths = ['dashboard', 'connector'].map((name) =>
    String(environmentOf(services[name]).DB_PATH),
  );
  assert.equal(new Set(dbPaths).size, 2, `rendered DB_PATH must be distinct: ${dbPaths.join(', ')}`);

  const volumeSourcesOf = (service) =>
    (service.volumes ?? []).map((volume) =>
      typeof volume === 'string' ? volumeSource(volume) : volume.source,
    );
  const dashboardVolumes = volumeSourcesOf(services.dashboard);
  const connectorVolumes = volumeSourcesOf(services.connector);
  assert.ok(
    dashboardVolumes.every((name) => !connectorVolumes.includes(name)),
    `rendered volumes must not be shared: dashboard=${dashboardVolumes}, connector=${connectorVolumes}`,
  );
});
