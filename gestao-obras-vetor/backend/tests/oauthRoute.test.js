const assert = require('assert');
const bcrypt = require('bcryptjs');
const express = require('express');

process.env.DB_NAME = 'service_auth_route_test';
process.env.SERVICE_JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.SERVICE_TOKEN_ISSUER = 'https://auth.example.test';
process.env.SERVICE_TOKEN_AUDIENCE = 'gateway-test';
process.env.SERVICE_TOKEN_EXPIRES_IN = '1h';

const databasePath = require.resolve('../config/database');
const originalDatabase = require(databasePath);
const account = {
  id: 1,
  client_id: 'sa_route_test',
  client_secret_hash: null,
  name: 'Gateway test',
  active: true,
  token_version: 1
};
let updates = 0;

require.cache[databasePath].exports = {
  getQueryMain: async (_sql, params) => params[0] === account.client_id ? account : null,
  runQueryMain: async () => {
    updates += 1;
    return { changes: 1 };
  }
};

const oauthRouter = require('../routes/oauth');

const startServer = () => new Promise((resolve) => {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use('/api/oauth', oauthRouter);
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const requestToken = async (baseUrl, options = {}) => {
  const headers = { 'content-type': 'application/x-www-form-urlencoded', ...(options.headers || {}) };
  const response = await fetch(`${baseUrl}/api/oauth/token`, {
    method: 'POST',
    headers,
    body: options.body || 'grant_type=client_credentials'
  });
  return { response, body: await response.json() };
};

const run = async () => {
  account.client_secret_hash = await bcrypt.hash('route-secret', 10);
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const basic = await requestToken(baseUrl, {
      headers: {
        authorization: `Basic ${Buffer.from('sa_route_test:route-secret').toString('base64')}`
      }
    });
    assert.strictEqual(basic.response.status, 200);
    assert.strictEqual(basic.body.token_type, 'Bearer');
    assert.strictEqual(basic.body.expires_in, 3600);
    assert.ok(basic.body.access_token);

    const form = await requestToken(baseUrl, {
      body: 'grant_type=client_credentials&client_id=sa_route_test&client_secret=route-secret'
    });
    assert.strictEqual(form.response.status, 200);
    assert.strictEqual(updates, 2);

    const conflict = await requestToken(baseUrl, {
      headers: {
        authorization: `Basic ${Buffer.from('sa_route_test:route-secret').toString('base64')}`
      },
      body: 'grant_type=client_credentials&client_id=sa_route_test&client_secret=route-secret'
    });
    assert.strictEqual(conflict.response.status, 400);
    assert.strictEqual(conflict.body.error, 'invalid_request');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await requestToken(baseUrl, {
        body: 'grant_type=client_credentials&client_id=sa_route_test&client_secret=wrong-secret'
      });
      assert.strictEqual(invalid.response.status, 401);
      assert.strictEqual(invalid.body.error, 'invalid_client');
    }

    const blocked = await requestToken(baseUrl, {
      body: 'grant_type=client_credentials&client_id=sa_route_test&client_secret=wrong-secret'
    });
    assert.strictEqual(blocked.response.status, 429);
    assert.strictEqual(blocked.body.error, 'temporarily_unavailable');
    assert.ok(blocked.response.headers.get('retry-after'));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await originalDatabase.pool.end();
  }

  console.log(JSON.stringify({ ok: true, suite: 'oauthRoute' }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
