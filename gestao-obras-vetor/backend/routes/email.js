const express = require('express');
const { body, validationResult, query } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { auth } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');
const { db } = require('../config/database');
const emailService = require('../services/emailService');

const router = express.Router();

const EMAIL_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const EMAIL_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const EMAIL_ATTACHMENT_MAX_COUNT = 5;
const EMAIL_ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg'
]);

const getAuthUser = (req) => req.usuario || req.user || null;
const getTenantId = (req) => req.tenantId || getAuthUser(req)?.tenant_id || null;

const uploadsRoot = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const logsRoot = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsRoot)) {
  fs.mkdirSync(logsRoot, { recursive: true });
}

const smtpLogPath = path.join(logsRoot, 'smtp.log');

const sanitizeSmtpPayload = (payload = {}) => {
  const safe = { ...payload };
  if (Object.prototype.hasOwnProperty.call(safe, 'smtp_pass')) safe.smtp_pass = '[REDACTED]';
  if (Object.prototype.hasOwnProperty.call(safe, 'smtp_pass_encrypted')) safe.smtp_pass_encrypted = '[REDACTED]';
  return safe;
};

const appendSmtpLog = (event, req, payload = {}, error = null) => {
  try {
    const user = getAuthUser(req);
    const tenantId = getTenantId(req);
    const line = {
      timestamp: new Date().toISOString(),
      event,
      tenant_id: tenantId,
      user_id: user?.id || null,
      method: req.method,
      path: req.originalUrl,
      payload: sanitizeSmtpPayload(payload),
      error: error
        ? {
            message: error.message,
            stack: error.stack
          }
        : null
    };
    fs.appendFileSync(smtpLogPath, `${JSON.stringify(line)}\n`, 'utf-8');
  } catch (logError) {
    console.error('Falha ao escrever log SMTP:', logError);
  }
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const safeName = (input) => String(input || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_.-]/g, '_');

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = getTenantId(req);
    const targetDir = path.join(uploadsRoot, 'email-images', String(tenantId || 'global'));
    ensureDir(targetDir);
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = getTenantId(req);
    const targetDir = path.join(uploadsRoot, 'email-attachments', String(tenantId || 'global'));
    ensureDir(targetDir);
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const basename = path.basename(file.originalname || 'arquivo', ext);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName(basename)}${ext}`);
  }
});

const uploadInlineImage = multer({
  storage: imageStorage,
  limits: { fileSize: EMAIL_IMAGE_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Apenas imagens sao permitidas.'));
  }
});

const uploadAttachments = multer({
  storage: attachmentStorage,
  limits: { fileSize: EMAIL_ATTACHMENT_MAX_BYTES, files: EMAIL_ATTACHMENT_MAX_COUNT },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!EMAIL_ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
      cb(new Error('Tipo de anexo nao permitido.'));
      return;
    }
    cb(null, true);
  }
});

const runMulter = (middleware) => (req, res, next) => {
  middleware(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Arquivo excede o limite permitido.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Quantidade de arquivos excede o limite permitido.' });
      }
    }

    return res.status(400).json({ error: err.message || 'Falha no upload de arquivo.' });
  });
};

const ensureSignatureColumn = async () => {
  const columns = await new Promise((resolve, reject) => {
    db.all('PRAGMA table_info(usuarios)', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

  const hasSignature = columns.some((col) => String(col.name) === 'email_signature_html');
  if (!hasSignature) {
    await new Promise((resolve, reject) => {
      db.run('ALTER TABLE usuarios ADD COLUMN email_signature_html TEXT', [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  const hasAutoAppend = columns.some((col) => String(col.name) === 'email_signature_auto');
  if (!hasAutoAppend) {
    await new Promise((resolve, reject) => {
      db.run('ALTER TABLE usuarios ADD COLUMN email_signature_auto INTEGER DEFAULT 1', [], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

/**
 * GET /api/email/config
 * Obter configuração SMTP do tenant (sem senha)
 */
router.get('/config', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const config = await emailService.getConfigForTenant(tenantId);
    if (!config) {
      return res.status(200).json({ message: 'Nenhuma configuração encontrada', data: null });
    }

    // Não retornar senha
    const safeConfig = { ...config };
    delete safeConfig.smtp_pass;
    delete safeConfig.smtp_pass_encrypted;

    res.json({ data: safeConfig });
  } catch (error) {
    console.error('Erro ao obter config email:', error);
    res.status(500).json({ error: 'Erro ao obter configuração' });
  }
});

/**
 * POST /api/email/config
 * Salvar/atualizar configuração SMTP
 */
router.post('/config',
  auth,
  body('provider').trim().notEmpty().withMessage('Provider é obrigatório'),
  body('smtp_host').trim().notEmpty().withMessage('SMTP host é obrigatório'),
  body('smtp_port').isInt({ min: 1, max: 65535 }).withMessage('SMTP port deve ser um número válido'),
  body('smtp_user').trim().notEmpty().withMessage('SMTP user é obrigatório'),
  body('smtp_pass').trim().notEmpty().withMessage('SMTP password é obrigatório'),
  body('from_name').trim().notEmpty().withMessage('From name é obrigatório'),
  body('from_email').isEmail().withMessage('From email deve ser válido'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        appendSmtpLog('smtp_config_validation_error', req, req.body, new Error('Falha de validacao em /config'));
        return res.status(400).json({ errors: errors.array() });
      }

      const tenantId = getTenantId(req);
      const user = getAuthUser(req);
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant não identificado' });
      }

      const { provider, smtp_host, smtp_port, smtp_user, smtp_pass, from_name, from_email } = req.body;

      const encryptedPass = emailService.encrypt(smtp_pass);

      // Verificar se já existe config, se sim UPDATE, se não INSERT
      const existingConfig = await emailService.getConfigForTenant(tenantId);

      const sql = existingConfig
        ? `UPDATE email_config 
           SET provider = ?, smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass_encrypted = ?, 
               from_name = ?, from_email = ?, updated_at = datetime('now')
           WHERE tenant_id = ?`
        : `INSERT INTO email_config (tenant_id, provider, smtp_host, smtp_port, smtp_user, smtp_pass_encrypted, from_name, from_email, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const params = existingConfig
        ? [provider, smtp_host, smtp_port, smtp_user, encryptedPass, from_name, from_email, tenantId]
        : [tenantId, provider, smtp_host, smtp_port, smtp_user, encryptedPass, from_name, from_email, user?.id];

      await new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve();
        });
      });

      await registrarAuditoria(user?.id, 'EMAIL_CONFIG_ATUALIZADA', 'email_config', tenantId, {
        provider,
        smtp_host,
        smtp_user,
        from_email
      });

      appendSmtpLog('smtp_config_saved', req, {
        provider,
        smtp_host,
        smtp_port,
        smtp_user,
        from_name,
        from_email
      });

      res.json({ message: 'Configuração salva com sucesso' });
    } catch (error) {
      appendSmtpLog('smtp_config_exception', req, req.body, error);
      console.error('Erro ao salvar config email:', error);
      res.status(500).json({ error: 'Erro ao salvar configuração' });
    }
  }
);

/**
 * POST /api/email/config/test
 * Testar conexão SMTP
 */
router.post('/config/test',
  auth,
  body('smtp_host').trim().notEmpty().withMessage('SMTP host é obrigatório'),
  body('smtp_port').isInt({ min: 1, max: 65535 }).withMessage('SMTP port deve ser um número válido'),
  body('smtp_user').trim().notEmpty().withMessage('SMTP user é obrigatório'),
  body('smtp_pass').trim().notEmpty().withMessage('SMTP password é obrigatório'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        appendSmtpLog('smtp_test_validation_error', req, req.body, new Error('Falha de validacao em /config/test'));
        return res.status(400).json({ errors: errors.array() });
      }

      const { smtp_host, smtp_port, smtp_user, smtp_pass } = req.body;

      const testConfig = {
        smtp_host,
        smtp_port: Number(smtp_port),
        smtp_user,
        smtp_pass
      };

      const result = await emailService.validateSmtpConfig(testConfig);
      appendSmtpLog('smtp_test_result', req, {
        smtp_host,
        smtp_port: Number(smtp_port),
        smtp_user,
        success: result.success,
        message: result.message
      });
      res.json(result);
    } catch (error) {
      appendSmtpLog('smtp_test_exception', req, req.body, error);
      console.error('Erro ao testar config SMTP:', error);
      res.status(500).json({ error: 'Erro ao testar configuração', message: error.message });
    }
  }
);

/**
 * POST /api/email/send
 * Enviar email
 */
router.post('/send',
  auth,
  runMulter(uploadAttachments.array('attachments', EMAIL_ATTACHMENT_MAX_COUNT)),
  body('to_email').isEmail().withMessage('Email destinatário inválido'),
  body('subject').trim().notEmpty().withMessage('Assunto é obrigatório'),
  body('html_body').trim().notEmpty().withMessage('Corpo do email é obrigatório'),
  body('template_name').optional().trim(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        appendSmtpLog('smtp_send_validation_error', req, req.body, new Error('Falha de validacao em /send'));
        return res.status(400).json({ errors: errors.array() });
      }

      const tenantId = getTenantId(req);
      const user = getAuthUser(req);
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant não identificado' });
      }

      await ensureSignatureColumn();

      const { to_email, subject, html_body, template_name } = req.body;
      const includeSignature = String(req.body.include_signature || '1') !== '0';

      const attachments = (req.files || []).map((file) => ({
        filename: file.originalname,
        path: file.path,
        contentType: file.mimetype
      }));

      const result = await emailService.sendEmail(
        tenantId,
        user?.id,
        to_email,
        subject,
        html_body,
        template_name,
        {
          attachments,
          includeSignature
        }
      );

      appendSmtpLog('smtp_send_result', req, {
        to_email,
        subject,
        template_name,
        includeSignature,
        attachments_count: attachments.length,
        success: result.success,
        message: result.message
      });

      await registrarAuditoria(user?.id, 'EMAIL_ENVIADO', 'email_history', tenantId, {
        to_email,
        subject,
        template_name,
        success: result.success
      });

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error) {
      appendSmtpLog('smtp_send_exception', req, req.body, error);
      console.error('Erro ao enviar email:', error);
      res.status(500).json({ error: 'Erro ao enviar email', message: error.message });
    }
  }
);

router.post('/upload-image', auth, runMulter(uploadInlineImage.single('image')), async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }

    const imageUrl = `/uploads/email-images/${tenantId}/${req.file.filename}`;
    return res.status(201).json({
      message: 'Imagem enviada com sucesso',
      data: {
        url: imageUrl,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Erro ao fazer upload de imagem do email:', error);
    return res.status(500).json({ error: 'Erro ao fazer upload de imagem.' });
  }
});

router.get('/signature', auth, async (req, res) => {
  try {
    await ensureSignatureColumn();
    const user = getAuthUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Usuário não identificado.' });
    }

    const row = await new Promise((resolve, reject) => {
      db.get(
        'SELECT email_signature_html, email_signature_auto FROM usuarios WHERE id = ?',
        [user.id],
        (err, data) => {
          if (err) reject(err);
          else resolve(data || null);
        }
      );
    });

    return res.json({
      data: {
        email_signature_html: row?.email_signature_html || '',
        email_signature_auto: row?.email_signature_auto === 0 ? 0 : 1
      }
    });
  } catch (error) {
    console.error('Erro ao obter assinatura de email:', error);
    return res.status(500).json({ error: 'Erro ao obter assinatura de email.' });
  }
});

router.put('/signature',
  auth,
  body('email_signature_html').optional().isString(),
  body('email_signature_auto').optional().isInt({ min: 0, max: 1 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      await ensureSignatureColumn();

      const user = getAuthUser(req);
      if (!user?.id) {
        return res.status(401).json({ error: 'Usuário não identificado.' });
      }

      const emailSignatureHtml = String(req.body.email_signature_html || '');
      const emailSignatureAuto = Number(req.body.email_signature_auto) === 0 ? 0 : 1;

      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE usuarios SET email_signature_html = ?, email_signature_auto = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
          [emailSignatureHtml, emailSignatureAuto, user.id],
          function(err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      return res.json({
        message: 'Assinatura de email atualizada com sucesso.',
        data: {
          email_signature_html: emailSignatureHtml,
          email_signature_auto: emailSignatureAuto
        }
      });
    } catch (error) {
      console.error('Erro ao atualizar assinatura de email:', error);
      return res.status(500).json({ error: 'Erro ao atualizar assinatura de email.' });
    }
  }
);

/**
 * GET /api/email/history
 * Listar histórico de emails
 */
router.get('/history', auth,
  query('limit').optional().isInt({ min: 1, max: 500 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('status').optional().trim(),
  async (req, res) => {
    try {
      const tenantId = getTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant não identificado' });
      }

      const limit = req.query.limit || 50;
      const offset = req.query.offset || 0;
      const status = req.query.status;

      let sql = 'SELECT * FROM email_history WHERE tenant_id = ?';
      const params = [tenantId];

      // Filtrar por status se fornecido
      if (status) {
        sql += ' AND status = ?';
        params.push(status.toUpperCase());
      }

      sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const history = await new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      // Obter total de registros
      let countSql = 'SELECT COUNT(*) as total FROM email_history WHERE tenant_id = ?';
      const countParams = [tenantId];

      if (status) {
        countSql += ' AND status = ?';
        countParams.push(status.toUpperCase());
      }

      const countResult = await new Promise((resolve, reject) => {
        db.get(countSql, countParams, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      res.json({
        data: history,
        total: countResult?.total || 0,
        limit,
        offset
      });
    } catch (error) {
      console.error('Erro ao obter histórico de emails:', error);
      res.status(500).json({ error: 'Erro ao obter histórico' });
    }
  }
);

/**
 * GET /api/email/history/:id
 * Obter detalhes de um email específico
 */
router.get('/history/:id', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const emailId = req.params.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const email = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM email_history WHERE id = ? AND tenant_id = ?', [emailId, tenantId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!email) {
      return res.status(404).json({ error: 'Email não encontrado' });
    }

    res.json({ data: email });
  } catch (error) {
    console.error('Erro ao obter email:', error);
    res.status(500).json({ error: 'Erro ao obter email' });
  }
});

/**
 * GET /api/email/templates
 * Listar templates de email
 */
router.get('/templates', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const templates = await new Promise((resolve, reject) => {
      db.all(
        'SELECT id, name, subject, description, created_at, updated_at FROM email_templates WHERE tenant_id = ? ORDER BY name',
        [tenantId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    res.json({ data: templates });
  } catch (error) {
    console.error('Erro ao listar templates:', error);
    res.status(500).json({ error: 'Erro ao listar templates' });
  }
});

/**
 * POST /api/email/templates
 * Criar/atualizar template
 */
router.post('/templates',
  auth,
  body('name').trim().notEmpty().withMessage('Nome da template é obrigatório'),
  body('subject').trim().notEmpty().withMessage('Assunto da template é obrigatório'),
  body('body_html').trim().notEmpty().withMessage('Corpo HTML da template é obrigatório'),
  body('description').optional().trim(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const tenantId = getTenantId(req);
      const user = getAuthUser(req);
      if (!tenantId) {
        return res.status(400).json({ error: 'Tenant não identificado' });
      }

      const { name, subject, body_html, description } = req.body;

      const result = await emailService.saveTemplate(
        tenantId,
        name,
        subject,
        body_html,
        description,
        user?.id
      );

      await registrarAuditoria(user?.id, 'EMAIL_TEMPLATE_CRIADA', 'email_templates', tenantId, {
        name,
        subject
      });

      res.json({ message: 'Template salva com sucesso', data: result });
    } catch (error) {
      console.error('Erro ao salvar template:', error);
      res.status(500).json({ error: 'Erro ao salvar template', message: error.message });
    }
  }
);

/**
 * GET /api/email/templates/:id
 * Obter template específica
 */
router.get('/templates/:id', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const templateId = req.params.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    const template = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM email_templates WHERE id = ? AND tenant_id = ?', [templateId, tenantId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!template) {
      return res.status(404).json({ error: 'Template não encontrada' });
    }

    res.json({ data: template });
  } catch (error) {
    console.error('Erro ao obter template:', error);
    res.status(500).json({ error: 'Erro ao obter template' });
  }
});

/**
 * DELETE /api/email/templates/:id
 * Deletar template
 */
router.delete('/templates/:id', auth, async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const user = getAuthUser(req);
    const templateId = req.params.id;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant não identificado' });
    }

    // Verificar se existe
    const template = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM email_templates WHERE id = ? AND tenant_id = ?', [templateId, tenantId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!template) {
      return res.status(404).json({ error: 'Template não encontrada' });
    }

    // Deletar
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM email_templates WHERE id = ?', [templateId], function(err) {
        if (err) reject(err);
        else resolve();
      });
    });

    await registrarAuditoria(user?.id, 'EMAIL_TEMPLATE_DELETADA', 'email_templates', tenantId, {
      name: template.name
    });

    res.json({ message: 'Template deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar template:', error);
    res.status(500).json({ error: 'Erro ao deletar template' });
  }
});

module.exports = router;
