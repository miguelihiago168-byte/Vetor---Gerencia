const express = require('express');
const fs = require('fs');
const path = require('path');
const { auth } = require('../middleware/auth');

const router = express.Router();
const uploadsDir = path.join(__dirname, '..', 'uploads');

const normalizeStoredPath = (value) => {
  let cleaned = String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');

  const uploadsIndex = cleaned.toLowerCase().lastIndexOf('/uploads/');
  if (uploadsIndex >= 0) cleaned = cleaned.slice(uploadsIndex + '/uploads/'.length);

  cleaned = cleaned
    .replace(/^api\/uploads\//i, '')
    .replace(/^uploads\//i, '')
    .split('?')[0];

  const normalized = path.posix.normalize(cleaned);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    return null;
  }

  return normalized;
};

const assertTenantPathAllowed = (storedPath, tenantId) => {
  const firstSegment = storedPath.split('/')[0] || '';
  const tenantMatch = firstSegment.match(/^tenant_(\d+)$/i);
  if (tenantMatch && Number(tenantMatch[1]) !== Number(tenantId)) {
    const err = new Error('Arquivo pertence a outro tenant.');
    err.status = 403;
    throw err;
  }

  const emailTenantMatch = storedPath.match(/^email-(?:images|attachments)\/(\d+)\//i);
  if (emailTenantMatch && Number(emailTenantMatch[1]) !== Number(tenantId)) {
    const err = new Error('Arquivo de e-mail pertence a outro tenant.');
    err.status = 403;
    throw err;
  }
};

const resolveUploadPath = (storedPath) => {
  const fullPath = path.resolve(uploadsDir, storedPath);
  const root = path.resolve(uploadsDir);
  if (!fullPath.startsWith(root + path.sep)) {
    const err = new Error('Caminho de arquivo invalido.');
    err.status = 400;
    throw err;
  }

  return fullPath;
};

router.get('/*', auth, async (req, res) => {
  try {
    const storedPath = normalizeStoredPath(req.params[0]);
    if (!storedPath) {
      return res.status(400).json({ erro: 'Caminho de arquivo invalido.' });
    }

    assertTenantPathAllowed(storedPath, req.tenantId);

    const filePath = resolveUploadPath(storedPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo nao encontrado.' });
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(filePath);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('[uploads] erro ao servir arquivo:', error);
    return res.status(status).json({
      erro: status === 403 ? 'Acesso negado ao arquivo.' : 'Erro ao acessar arquivo.'
    });
  }
});

module.exports = router;
