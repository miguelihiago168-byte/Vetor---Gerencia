const express = require('express');
const bcrypt = require('bcryptjs');
const { getQueryMain, runQueryMain } = require('../config/database');
const {
  FailedAuthenticationLimiter,
  ServiceAuthConfigurationError,
  getServiceTokenConfig,
  issueServiceAccessToken,
  parseClientCredentials
} = require('../services/serviceAccountAuth');

const defaultLimiter = new FailedAuthenticationLimiter();

// O limite e por origem, para que variar client_id nao permita contornar o bloqueio.
const requestKey = (req) => req.ip || req.socket?.remoteAddress || 'unknown';

const sendOAuthError = (res, status, error, extraHeaders = {}) => {
  Object.entries(extraHeaders).forEach(([name, value]) => res.set(name, String(value)));
  return res.status(status).json({ error });
};

const router = express.Router();

router.post('/token', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');

  const contentType = String(req.header('content-type') || '').toLowerCase();
  if (!contentType.startsWith('application/x-www-form-urlencoded')) {
    return sendOAuthError(res, 400, 'invalid_request');
  }

  if (req.body?.grant_type !== 'client_credentials') {
    return sendOAuthError(res, 400, 'unsupported_grant_type');
  }

  const credentials = parseClientCredentials(req);
  if (credentials.error === 'conflicting_credentials') {
    return sendOAuthError(res, 400, 'invalid_request');
  }

  const limiterKey = requestKey(req);
  const retryAfter = defaultLimiter.getRetryAfterSeconds(limiterKey);
  if (retryAfter > 0) {
    return sendOAuthError(res, 429, 'temporarily_unavailable', { 'Retry-After': retryAfter });
  }

  if (credentials.error) {
    defaultLimiter.recordFailure(limiterKey);
    return sendOAuthError(res, 401, 'invalid_client', { 'WWW-Authenticate': 'Basic realm="oauth-token"' });
  }

  try {
    const config = getServiceTokenConfig();
    const account = await getQueryMain(
      `SELECT id, client_id, client_secret_hash, name, active, token_version
       FROM service_accounts
       WHERE client_id = ?`,
      [credentials.clientId]
    );

    const secretMatches = !!account
      && !!account.active
      && await bcrypt.compare(credentials.clientSecret, account.client_secret_hash);

    if (!secretMatches) {
      defaultLimiter.recordFailure(limiterKey);
      return sendOAuthError(res, 401, 'invalid_client', { 'WWW-Authenticate': 'Basic realm="oauth-token"' });
    }

    const issued = issueServiceAccessToken(account, config);
    await runQueryMain(
      `UPDATE service_accounts
       SET last_token_issued_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [account.id]
    );

    return res.json({
      access_token: issued.token,
      token_type: 'Bearer',
      expires_in: issued.expiresIn
    });
  } catch (error) {
    if (error instanceof ServiceAuthConfigurationError) {
      console.error('[oauth] Configuracao de service account invalida:', error.message);
      return sendOAuthError(res, 503, 'temporarily_unavailable');
    }

    if (error?.code === '42P01') {
      console.error('[oauth] Tabela service_accounts ausente. Execute as migrations pendentes.');
      return sendOAuthError(res, 503, 'temporarily_unavailable');
    }

    console.error('[oauth] Falha ao emitir token de service account:', error?.message || error);
    return sendOAuthError(res, 503, 'temporarily_unavailable');
  }
});

module.exports = router;
