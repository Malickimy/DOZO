import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * One-service container gate (Release Board R4 / issue #90): one image, one
 * service named `server`, one named datastore volume mounted at `/data`, and one
 * SQLite file. The single origin serves the public redirect surface, every
 * `/api/*` route and the built SPA, so there is no connector service, no spool
 * and no service-to-service forwarding. The image consumes a CI-built SPA and
 * never runs Vite.
 *
 * These are static assertions so they run under plain `npm test` with no Docker.
 * The live one-origin round-trip (compose up, `/r/:id`, dedupe, SPA, no spool)
 * lives in `scripts/container-smoke.sh` and is wired into
 * `.github/workflows/container.yml`.
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
 * Minimal indentation-based reader for the compose sections we care about:
 * `services.<name>.{environment,volumes,ports,command,image}` and the top-level
 * `volumes` names. Enough for this repo's compose file without pulling in a YAML
 * dependency.
 */
function parseCompose(file) {
  const services = {};
  const topVolumes = [];
  let section = null;
  let service = null;
  let block = null;

  for (const { indent, text } of significantLines(file)) {
    if (indent === 0) {
      section = text.endsWith(':') ? text.slice(0, -1) : null;
      service = null;
      block = null;
      continue;
    }

    if (section === 'services') {
      if (indent === 2 && text.endsWith(':')) {
        service = text.slice(0, -1);
        services[service] = {
          environment: {},
          volumes: [],
          ports: [],
          command: null,
          image: null,
          dependsOn: null,
          keys: new Set(),
        };
        block = null;
        continue;
      }
      if (!service) continue;

      if (indent === 4) {
        block = text.endsWith(':') ? text.slice(0, -1) : null;
        if (block) services[service].keys.add(block);
        const kv = text.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (kv) {
          const [, key, value] = kv;
          if (key === 'image') services[service].image = unquote(value);
          if (key === 'command') services[service].command = value;
          if (key === 'depends_on') services[service].dependsOn = value || block;
        }
        continue;
      }
      if (indent >= 6) {
        const item = text.match(/^-\s*(.+)$/);
        if (block === 'environment') {
          const kv = text.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
          if (kv) services[service].environment[kv[1]] = unquote(kv[2]);
        } else if (block === 'volumes' && item) {
          services[service].volumes.push(unquote(item[1]));
        } else if (block === 'ports' && item) {
          services[service].ports.push(unquote(item[1]));
        } else if (block === 'depends_on' && item) {
          const existing = services[service].dependsOn;
          services[service].dependsOn = Array.isArray(existing)
            ? [...existing, unquote(item[1])]
            : [unquote(item[1])];
        }
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

function volumeTarget(entry) {
  const parts = entry.split(':');
  return parts.length > 1 ? parts[1] : '';
}

test('compose defines one unified server service on one datastore volume', () => {
  const { services, topVolumes } = parseCompose(COMPOSE_PATH);

  assert.deepEqual(
    Object.keys(services).sort(),
    ['server'],
    'exactly one service named `server` is defined',
  );
  const server = services.server;

  // One origin: a single published 3000:3000 mapping and no connector :3001.
  assert.deepEqual(server.ports, ['3000:3000'], 'the service publishes one origin on 3000');
  assert.ok(
    server.ports.every((mapping) => mapping.split(':')[0] !== '3001'),
    `no connector port 3001 is published, got ${server.ports.join(', ')}`,
  );

  // One image backs the service.
  const images = [...new Set(Object.values(services).map((s) => s.image).filter(Boolean))];
  assert.equal(images.length, 1, `one image backs the service, got ${images.join(', ') || '(none)'}`);
  assert.ok(server.image, 'the service names an image');

  // The service command runs the unified entrypoint.
  assert.match(
    server.command ?? '',
    /src\/server\.js/,
    `the service command runs src/server.js, got ${server.command}`,
  );

  // One SQLite datastore under /data, on the one named volume.
  assert.ok(
    typeof server.environment.DB_PATH === 'string' &&
      server.environment.DB_PATH.startsWith('/data/'),
    `DB_PATH lives on the datastore volume under /data/, got ${server.environment.DB_PATH}`,
  );
  assert.deepEqual(
    server.volumes.map(volumeSource),
    ['dozo-server-data'],
    'the service mounts exactly the one datastore volume',
  );
  assert.deepEqual(server.volumes.map(volumeTarget), ['/data'], 'the datastore volume mounts at /data');
  assert.deepEqual(
    [...topVolumes].sort(),
    ['dozo-server-data'],
    'exactly one top-level named volume is declared',
  );
  for (const name of server.volumes.map(volumeSource)) {
    assert.ok(topVolumes.includes(name), `${name} is declared at the top level`);
  }

  // The connector surface is gone: no spool, no ingest URL, no ordering edge.
  assert.ok(
    !('CONNECTOR_SPOOL_PATH' in server.environment),
    'no CONNECTOR_SPOOL_PATH on the unified service',
  );
  assert.ok(
    !('DASHBOARD_INGEST_URL' in server.environment),
    'no DASHBOARD_INGEST_URL on the unified service',
  );
  assert.ok(!server.keys.has('depends_on'), 'the single service has no depends_on');
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

  // The image runs the unified entrypoint, not a split connector/dashboard one.
  assert.match(
    joined,
    /CMD \["node", "src\/server\.js"\]/,
    'the image CMD runs the unified server.js entrypoint',
  );
  assert.doesNotMatch(
    joined,
    /CMD \["node", "src\/(?:connector|dashboard)\.js"\]/,
    'the image no longer runs a split connector/dashboard entrypoint',
  );
});

test('container-smoke.sh stays bash -n clean', () => {
  const script = join(SERVER_DIR, 'scripts', 'container-smoke.sh');
  const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, `bash -n failed:\n${result.stderr || result.stdout}`);
});

/**
 * Belt-and-braces: when a Docker CLI with the compose plugin is present, ask
 * Compose to actually render the file and assert the same invariants on the
 * merged result (env_file interpolation included). Skipped where Docker is not
 * installed, so `npm test` stays green on a bare checkout.
 */
test('rendered compose config keeps one service and one datastore volume', (t) => {
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
  assert.deepEqual(Object.keys(services).sort(), ['server'], 'rendered config has one service');

  const server = services.server;
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

  const env = environmentOf(server);
  assert.match(
    String(env.DB_PATH ?? ''),
    /^\/data\//,
    `rendered DB_PATH lives on the datastore volume, got ${env.DB_PATH}`,
  );
  assert.ok(!('CONNECTOR_SPOOL_PATH' in env), 'rendered config has no connector spool path');
  assert.ok(!('DASHBOARD_INGEST_URL' in env), 'rendered config has no dashboard ingest URL');

  const volumeSourcesOf = (service) =>
    (service.volumes ?? []).map((volume) =>
      typeof volume === 'string' ? volumeSource(volume) : volume.source,
    );
  const volumeTargetsOf = (service) =>
    (service.volumes ?? []).map((volume) =>
      typeof volume === 'string' ? volumeTarget(volume) : volume.target,
    );
  assert.deepEqual(
    volumeSourcesOf(server),
    ['dozo-server-data'],
    'rendered service mounts the one datastore volume',
  );
  assert.deepEqual(volumeTargetsOf(server), ['/data'], 'rendered volume mounts at /data');
  assert.deepEqual(
    Object.keys(config.volumes ?? {}).sort(),
    ['dozo-server-data'],
    'rendered config declares one top-level volume',
  );

  const command = Array.isArray(server.command)
    ? server.command.join(' ')
    : String(server.command ?? '');
  assert.match(command, /src\/server\.js/, `rendered command runs src/server.js, got ${command}`);
  assert.ok(!server.depends_on || Object.keys(server.depends_on).length === 0, 'no depends_on');
});
