import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders } from './helpers.js';

test('/api/* rejects a missing or wrong token', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const noToken = await app.inject({ method: 'GET', url: '/api/merchants' });
  assert.equal(noToken.statusCode, 401);

  const wrongToken = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: authHeaders('wrong'),
  });
  assert.equal(wrongToken.statusCode, 401);
});
