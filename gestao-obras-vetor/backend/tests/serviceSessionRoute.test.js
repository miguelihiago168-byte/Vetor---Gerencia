const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.DB_NAME = 'service_session_route_test';
process.env.SERVICE_JWT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.SERVICE_TOKEN_ISSUER = 'https://auth.example.test';
process.env.SERVICE_TOKEN_AUDIENCE = 'gateway-test';
process.env.SERVICE_TOKEN_EXPIRES_IN = '1h';

const databasePath = require.resolve('../config/database');
const originalDatabase = require(databasePath);
const account = {
  id: 1,
  client_id: 'sa_session_test',
  name: 'Gateway session test',
  active: true,
  token_version: 1
};

require.cache[databasePath].exports = {
  getQueryMain: async (_sql, params) => params[0] === account.client_id ? account : null
};

const sessionRouter = require('../routes/service_auth');
const { getServiceTokenConfig, issueServiceAccessToken } = require('../services/serviceAccountAuth');

const startServer = () => new Promise((resolve) => {
  const app = express();
  app.use('/api/auth/service', sessionRouter);
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const getSession = async (baseUrl, token) => {
  const response = await fetch(`${baseUrl}/api/auth/service/session`, {
    headers: { authorization: `Bearer ${token}` }
  });
  return { response, body: await response.json() };
};

const run = async () => {
  const config = getServiceTokenConfig();
  const issued = issueServiceAccessToken(account, config);
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const valid = await getSession(baseUrl, issued.token);
    assert.strictEqual(valid.response.status, 200);
    assert.strictEqual(valid.body.service_account.client_id, account.client_id);

    const humanToken = jwt.sign({ id: 1, typ: 'user_access' }, 'separate-human-secret', { expiresIn: 60 });
    const human = await getSession(baseUrl, humanToken);
    assert.strictEqual(human.response.status, 401);

    account.token_version = 2;
    const rotated = await getSession(baseUrl, issued.token);
    assert.strictEqual(rotated.response.status, 401);

    account.token_version = 1;
    account.active = false;
    const disabled = await getSession(baseUrl, issued.token);
    assert.strictEqual(disabled.response.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await originalDatabase.pool.end();
  }

  console.log(JSON.stringify({ ok: true, suite: 'serviceSessionRoute' }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
