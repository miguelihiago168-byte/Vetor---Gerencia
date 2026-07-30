const { getQueryMain } = require('../config/database');
const {
  ServiceAuthConfigurationError,
  getServiceTokenConfig,
  verifyServiceAccessToken
} = require('../services/serviceAccountAuth');

const extractBearerToken = (req) => {
  const value = req.header('Authorization') || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
};

const serviceAccountAuth = async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      codigo: 'SERVICE_TOKEN_REQUIRED',
      erro: 'Token de service account nao fornecido.'
    });
  }

  try {
    const claims = verifyServiceAccessToken(token, getServiceTokenConfig());
    const account = await getQueryMain(
      `SELECT id, client_id, name, active, token_version
       FROM service_accounts
       WHERE client_id = ?`,
      [claims.client_id]
    );

    if (!account || !account.active || Number(account.token_version) !== Number(claims.token_version)) {
      return res.status(401).json({
        codigo: 'SERVICE_TOKEN_INVALID',
        erro: 'Token de service account invalido.'
      });
    }

    req.serviceAccount = {
      id: Number(account.id),
      clientId: account.client_id,
      name: account.name,
      tokenVersion: Number(account.token_version),
      issuedAt: Number(claims.iat),
      expiresAt: Number(claims.exp)
    };

    return next();
  } catch (error) {
    if (error instanceof ServiceAuthConfigurationError) {
      console.error('[service-auth] Configuracao de token de servico invalida:', error.message);
      return res.status(503).json({
        codigo: 'SERVICE_AUTH_CONFIGURATION_ERROR',
        erro: 'Servico de autenticacao temporariamente indisponivel.'
      });
    }

    if (error?.code === '42P01') {
      console.error('[service-auth] Tabela service_accounts ausente. Execute as migrations pendentes.');
      return res.status(503).json({
        codigo: 'SERVICE_AUTH_SCHEMA_OUTDATED',
        erro: 'Servico de autenticacao temporariamente indisponivel.'
      });
    }

    if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError' || error?.name === 'NotBeforeError') {
      return res.status(401).json({
        codigo: 'SERVICE_TOKEN_INVALID',
        erro: 'Token de service account invalido.'
      });
    }

    console.error('[service-auth] Falha ao validar token de service account:', error?.message || error);
    return res.status(503).json({
      codigo: 'SERVICE_AUTH_UNAVAILABLE',
      erro: 'Servico de autenticacao temporariamente indisponivel.'
    });
  }
};

module.exports = { serviceAccountAuth };
