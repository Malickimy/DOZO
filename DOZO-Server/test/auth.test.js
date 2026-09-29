import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTestContext, authHeaders, TEST_TOKEN } from './helpers.js';

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

test('/api/* accepts the operator token as Authorization: Bearer (G06)', async (t) => {
  const { app, db } = makeTestContext();
  t.after(() => {
    app.close();
    db.close();
  });

  const bearer = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
  });
  assert.equal(bearer.statusCode, 200);

  // Scheme match is case-insensitive and the extracted token is trimmed.
  const mixedCase = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: { authorization: `bEaReR  ${TEST_TOKEN} ` },
  });
  assert.equal(mixedCase.statusCode, 200);

  // A wrong Bearer token is still rejected.
  const wrong = await app.inject({
    method: 'GET',
    url: '/api/merchants',
    headers: { authorization: 'Bearer nope' },
  });
  assert.equal(wrong.statusCode, 401);
});
