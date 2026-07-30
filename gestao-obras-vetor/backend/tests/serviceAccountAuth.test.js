const assert = require('assert');
const jwt = require('jsonwebtoken');
const {
  FailedAuthenticationLimiter,
  ServiceAuthConfigurationError,
  generateServiceAccountCredentials,
  getServiceTokenConfig,
  issueServiceAccessToken,
  parseClientCredentials,
  verifyServiceAccessToken
} = require('../services/serviceAccountAuth');

const env = {
  SERVICE_JWT_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  SERVICE_TOKEN_ISSUER: 'https://auth.example.test',
  SERVICE_TOKEN_AUDIENCE: 'gateway-test',
  SERVICE_TOKEN_EXPIRES_IN: '1h'
};

const config = getServiceTokenConfig(env);
const account = { client_id: 'sa_test', token_version: 3 };

const basicRequest = (clientId, clientSecret) => ({
  headers: {
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  },
  body: {}
});

const run = async () => {
  const generated = generateServiceAccountCredentials();
  assert.match(generated.clientId, /^sa_[A-Za-z0-9_-]+$/);
  assert.ok(generated.clientSecret.length >= 40);

  assert.deepStrictEqual(parseClientCredentials(basicRequest('sa_a', 'secret')), {
    clientId: 'sa_a', clientSecret: 'secret', source: 'basic'
  });
  assert.deepStrictEqual(parseClientCredentials({ body: { client_id: 'sa_a', client_secret: 'secret' } }), {
    clientId: 'sa_a', clientSecret: 'secret', source: 'body'
  });
  assert.strictEqual(parseClientCredentials({
    headers: { authorization: 'Basic c2FfYTpzZWNyZXQ=' },
    body: { client_id: 'sa_a', client_secret: 'secret' }
  }).error, 'conflicting_credentials');

  const issued = issueServiceAccessToken(account, config);
  assert.strictEqual(issued.expiresIn, 3600);
  const claims = verifyServiceAccessToken(issued.token, config);
  assert.strictEqual(claims.client_id, account.client_id);
  assert.strictEqual(Number(claims.token_version), account.token_version);

  assert.throws(() => verifyServiceAccessToken(issued.token, { ...config, secret: `${config.secret}other` }), jwt.JsonWebTokenError);
  assert.throws(() => verifyServiceAccessToken(issued.token, { ...config, audience: 'wrong-audience' }), jwt.JsonWebTokenError);
  assert.throws(() => verifyServiceAccessToken(issued.token, { ...config, issuer: 'wrong-issuer' }), jwt.JsonWebTokenError);
  const expired = jwt.sign({ ...account, client_id: account.client_id, token_version: account.token_version, typ: 'service_access' }, config.secret, {
    algorithm: 'HS256', audience: config.audience, issuer: config.issuer, expiresIn: -1
  });
  assert.throws(() => verifyServiceAccessToken(expired, config), jwt.TokenExpiredError);
  const wrongType = jwt.sign({ ...account, client_id: account.client_id, token_version: account.token_version, typ: 'user_access' }, config.secret, {
    algorithm: 'HS256', audience: config.audience, issuer: config.issuer, expiresIn: 60
  });
  assert.throws(() => verifyServiceAccessToken(wrongType, config), jwt.JsonWebTokenError);
  assert.throws(() => getServiceTokenConfig({ ...env, SERVICE_JWT_SECRET: 'short' }), ServiceAuthConfigurationError);

  let now = 0;
  const limiter = new FailedAuthenticationLimiter({ windowMs: 1000, maxFailures: 2, now: () => now });
  limiter.recordFailure('gateway');
  assert.strictEqual(limiter.getRetryAfterSeconds('gateway'), 0);
  limiter.recordFailure('gateway');
  assert.strictEqual(limiter.getRetryAfterSeconds('gateway'), 1);
  now = 1001;
  assert.strictEqual(limiter.getRetryAfterSeconds('gateway'), 0);

  console.log(JSON.stringify({ ok: true, suite: 'serviceAccountAuth' }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
