const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SERVICE_TOKEN_TYPE = 'service_access';
const DEFAULT_AUDIENCE = 'vetor-gateway';
const DEFAULT_ISSUER = 'vetor-service-auth';
const DEFAULT_TTL_SECONDS = 60 * 60;

class ServiceAuthConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ServiceAuthConfigurationError';
  }
}

const parseTtlSeconds = (value) => {
  const text = String(value || '1h').trim().toLowerCase();
  const match = text.match(/^(\d+)\s*([smhd]?)$/);
  if (!match) throw new ServiceAuthConfigurationError('SERVICE_TOKEN_EXPIRES_IN invalido.');

  const quantity = Number(match[1]);
  const unit = match[2] || 's';
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = quantity * multipliers[unit];

  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 86400) {
    throw new ServiceAuthConfigurationError('SERVICE_TOKEN_EXPIRES_IN deve estar entre 60 segundos e 24 horas.');
  }

  return seconds;
};

const getServiceTokenConfig = (env = process.env) => {
  const secret = String(env.SERVICE_JWT_SECRET || '');
  if (secret.length < 32) {
    throw new ServiceAuthConfigurationError('SERVICE_JWT_SECRET ausente ou muito curto.');
  }

  return {
    secret,
    issuer: String(env.SERVICE_TOKEN_ISSUER || DEFAULT_ISSUER),
    audience: String(env.SERVICE_TOKEN_AUDIENCE || DEFAULT_AUDIENCE),
    ttlSeconds: parseTtlSeconds(env.SERVICE_TOKEN_EXPIRES_IN || DEFAULT_TTL_SECONDS)
  };
};

const generateServiceAccountCredentials = () => ({
  clientId: `sa_${crypto.randomBytes(18).toString('base64url')}`,
  clientSecret: crypto.randomBytes(32).toString('base64url')
});

const getHeader = (req, name) => {
  if (typeof req.get === 'function') return req.get(name);
  return req.headers?.[String(name).toLowerCase()];
};

const parseBasicCredentials = (authorization) => {
  const match = String(authorization || '').match(/^Basic\s+([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separator = decoded.indexOf(':');
  if (separator <= 0 || separator === decoded.length - 1) return null;

  return {
    clientId: decoded.slice(0, separator),
    clientSecret: decoded.slice(separator + 1)
  };
};

const parseClientCredentials = (req) => {
  const authorization = getHeader(req, 'authorization');
  const body = req.body || {};
  const hasBodyCredentials = body.client_id !== undefined || body.client_secret !== undefined;

  if (authorization && hasBodyCredentials) {
    return { error: 'conflicting_credentials' };
  }

  if (authorization) {
    const basic = parseBasicCredentials(authorization);
    return basic ? { ...basic, source: 'basic' } : { error: 'invalid_credentials' };
  }

  if (typeof body.client_id !== 'string' || typeof body.client_secret !== 'string'
    || !body.client_id || !body.client_secret) {
    return { error: 'invalid_credentials' };
  }

  return {
    clientId: body.client_id,
    clientSecret: body.client_secret,
    source: 'body'
  };
};

const issueServiceAccessToken = (serviceAccount, config = getServiceTokenConfig()) => {
  const token = jwt.sign({
    sub: serviceAccount.client_id,
    client_id: serviceAccount.client_id,
    token_version: Number(serviceAccount.token_version),
    typ: SERVICE_TOKEN_TYPE
  }, config.secret, {
    algorithm: 'HS256',
    audience: config.audience,
    issuer: config.issuer,
    expiresIn: config.ttlSeconds
  });

  return { token, expiresIn: config.ttlSeconds };
};

const verifyServiceAccessToken = (token, config = getServiceTokenConfig()) => {
  const claims = jwt.verify(token, config.secret, {
    algorithms: ['HS256'],
    audience: config.audience,
    issuer: config.issuer
  });

  if (claims.typ !== SERVICE_TOKEN_TYPE || !claims.client_id || !Number.isInteger(Number(claims.token_version))
    || Number(claims.token_version) < 1) {
    throw new jwt.JsonWebTokenError('Token de service account invalido.');
  }

  return claims;
};

class FailedAuthenticationLimiter {
  constructor({ windowMs = 15 * 60 * 1000, maxFailures = 5, now = () => Date.now() } = {}) {
    this.windowMs = windowMs;
    this.maxFailures = maxFailures;
    this.now = now;
    this.attempts = new Map();
  }

  getRetryAfterSeconds(key) {
    const current = this.attempts.get(key);
    if (!current) return 0;
    const elapsed = this.now() - current.startedAt;
    if (elapsed >= this.windowMs) {
      this.attempts.delete(key);
      return 0;
    }
    if (current.failures < this.maxFailures) return 0;
    return Math.max(1, Math.ceil((this.windowMs - elapsed) / 1000));
  }

  recordFailure(key) {
    const now = this.now();
    const current = this.attempts.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.attempts.set(key, { startedAt: now, failures: 1 });
      return;
    }
    current.failures += 1;
  }
}

module.exports = {
  SERVICE_TOKEN_TYPE,
  ServiceAuthConfigurationError,
  FailedAuthenticationLimiter,
  getServiceTokenConfig,
  generateServiceAccountCredentials,
  parseClientCredentials,
  issueServiceAccessToken,
  verifyServiceAccessToken
};
