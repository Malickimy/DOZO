import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders } from './helpers.js';

test('heartbeat updates last_seen and offline list reports stale terminals', async (t) => {
  const { app, db, clock } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const beat = await app.inject({
    method: 'POST',
    url: '/api/heartbeat',
    headers: authHeaders(),
    payload: { terminal_id: 'TERM0001' },
  });
  assert.equal(beat.statusCode, 200);
  assert.equal(beat.json().ok, true);

  const lastSeen = db
    .prepare('SELECT last_seen FROM terminals WHERE terminal_id = ?')
    .get('TERM0001');
  assert.equal(lastSeen.last_seen, '2026-01-01T00:00:00.000Z');

  clock.advanceMs(24 * 60 * 60 * 1000 + 1);
  const offline = await app.inject({
    method: 'GET',
    url: '/api/terminals/offline',
    headers: authHeaders(),
  });
  assert.equal(offline.statusCode, 200);
  assert.equal(offline.json().terminals.length, 1);
  assert.equal(offline.json().terminals[0].terminal_id, 'TERM0001');
});
