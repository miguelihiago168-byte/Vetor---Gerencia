const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { db } = require('../config/database');

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'default-unsafe-key-change-in-production';
const ALGORITHM = 'aes-256-cbc';

/**
 * Criptografa uma string usando crypto
 */
const encrypt = (text) => {
  try {
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('Erro ao criptografar email password:', err);
    throw new Error('Erro na criptografia');
  }
};

/**
 * Descriptografa uma string usando crypto
 */
const decrypt = (encryptedText) => {
  try {
    const [ivHex, encrypted] = encryptedText.split(':');
    const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch (err) {
    console.error('Erro ao descriptografar email password:', err);
    throw new Error('Erro na descriptografia');
  }
};

/**
 * Obtém a configuração SMTP do tenant
 */
const getConfigForTenant = (tenantId) => {
  return new Promise((resolve, reject) => {
    const sql = tenantId
      ? 'SELECT * FROM email_config WHERE tenant_id = ? AND is_active = 1'
      : 'SELECT * FROM email_config WHERE is_active = 1 LIMIT 1';

    const params = tenantId ? [tenantId] : [];

    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else if (!row) {
        resolve(null);
      } else {
        try {
          const config = { ...row };
          config.smtp_pass = decrypt(config.smtp_pass_encrypted);
          delete config.smtp_pass_encrypted;
          resolve(config);
        } catch (decryptErr) {
          reject(decryptErr);
        }
      }
    });
  });
};

/**
 * Cria um transporter Nodemailer baseado na config
 */
const createTransporter = (config) => {
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port,
    secure: config.smtp_port === 465,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass
    }
  });
};

/**
 * Testa a conexão SMTP e retorna mensagem descritiva de erro
 */
const validateSmtpConfig = async (config) => {
  try {
    const transporter = createTransporter(config);
    const result = await transporter.verify();
    return { success: result, message: result ? 'Conexão SMTP validada com sucesso!' : 'Falha na validação de SMTP' };
  } catch (error) {
    const code = error.code || '';
    const errno = String(error.errno || '');
    let mensagem = `Erro: ${error.message}`;

    if (code === 'EAUTH' || error.responseCode === 535 || error.responseCode === 534) {
      mensagem = 'Autenticação rejeitada. Para Gmail: use uma Senha de App (não sua senha normal). Acesse myaccount.google.com → Segurança → Senhas de app. Para Outlook: verifique usuário e senha.';
    } else if (code === 'ECONNREFUSED' || errno === 'ECONNREFUSED') {
      mensagem = `Conexão recusada na porta ${config.smtp_port}. Verifique se o host (${config.smtp_host}) e a porta estão corretos. Gmail: porta 465 (SSL) ou 587 (TLS). Outlook: porta 587 (TLS).`;
    } else if (code === 'ETIMEDOUT' || code === 'ECONNRESET') {
      mensagem = `Timeout ao conectar em ${config.smtp_host}:${config.smtp_port}. O servidor pode estar bloqueando a conexão ou a porta está errada.`;
    } else if (code === 'ESOCKET' || code === 'ENOTFOUND') {
      mensagem = `Host "${config.smtp_host}" não encontrado. Verifique o endereço do servidor SMTP.`;
    } else if (error.message && error.message.toLowerCase().includes('certificate')) {
      mensagem = `Erro de certificado SSL/TLS. Tente trocar a porta: use 465 para SSL direto ou 587 para STARTTLS.`;
    } else if (error.responseCode === 550 || error.responseCode === 553) {
      mensagem = `E-mail remetente (${config.smtp_user}) rejeitado pelo servidor. Verifique se o endereço está correto.`;
    }

    return { success: false, message: mensagem, detalhe_tecnico: error.message };
  }
};

/**
 * Registra envio de email no histórico
 */
const logEmailHistory = (tenantId, senderUserId, recipientEmail, subject, bodyHtml, templateUsed, status, errorMessage = null) => {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO email_history (tenant_id, sender_user_id, recipient_email, subject, body_html, template_used, status, error_message, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    db.run(sql, [tenantId, senderUserId, recipientEmail, subject, bodyHtml, templateUsed, status, errorMessage], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID });
      }
    });
  });
};

const getUserSignature = (senderUserId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT email_signature_html, email_signature_auto FROM usuarios WHERE id = ?',
      [senderUserId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          html: row?.email_signature_html || '',
          auto: row?.email_signature_auto === 0 ? 0 : 1
        });
      }
    );
  });
};

/**
 * Envia um email
 */
const sendEmail = async (tenantId, senderUserId, toEmail, subject, htmlBody, templateName = null, options = {}) => {
  try {
    const includeSignature = options.includeSignature !== false;
    const attachments = Array.isArray(options.attachments) ? options.attachments : [];

    // Obter configuração SMTP
    const config = await getConfigForTenant(tenantId);
    if (!config) {
      throw new Error('Configuração SMTP não encontrada para este tenant');
    }

    let fullHtmlBody = htmlBody;
    if (includeSignature && senderUserId) {
      try {
        const signature = await getUserSignature(senderUserId);
        if (signature.auto && signature.html.trim()) {
          fullHtmlBody = `${htmlBody}<br/><br/>${signature.html}`;
        }
      } catch (signatureError) {
        // Continua envio sem assinatura caso exista erro de leitura.
        console.warn('Falha ao obter assinatura de email:', signatureError.message);
      }
    }

    // Criar transporter
    const transporter = createTransporter(config);

    // Opções do email
    const mailOptions = {
      from: `${config.from_name} <${config.from_email}>`,
      to: toEmail,
      subject: subject,
      html: fullHtmlBody,
      attachments
    };

    // Enviar email
    const info = await transporter.sendMail(mailOptions);

    // Registrar no histórico com sucesso
    await logEmailHistory(tenantId, senderUserId, toEmail, subject, fullHtmlBody, templateName, 'ENVIADO');

    return {
      success: true,
      messageId: info.messageId,
      message: 'Email enviado com sucesso'
    };
  } catch (error) {
    console.error('Erro ao enviar email:', error);

    // Registrar no histórico com erro
    try {
      await logEmailHistory(tenantId, senderUserId, toEmail, subject, htmlBody, templateName, 'ERRO', error.message);
    } catch (logErr) {
      console.error('Erro ao registrar falha de email no histórico:', logErr);
    }

    return {
      success: false,
      message: `Erro ao enviar email: ${error.message}`
    };
  }
};

/**
 * Obtém template de email por nome
 */
const getTemplate = (tenantId, templateName) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM email_templates WHERE tenant_id = ? AND name = ?';
    db.get(sql, [tenantId, templateName], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

/**
 * Cria/salva uma template
 */
const saveTemplate = (tenantId, name, subject, bodyHtml, description, createdByUserId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO email_templates (tenant_id, name, subject, body_html, description, created_by_user_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(tenant_id, name) DO UPDATE SET
        subject = excluded.subject,
        body_html = excluded.body_html,
        description = excluded.description,
        updated_at = datetime('now')
    `;

    db.run(sql, [tenantId, name, subject, bodyHtml, description, createdByUserId], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID });
      }
    });
  });
};

/**
 * Lista histórico de emails filtrado por tenant/usuario
 */
const getEmailHistory = (tenantId, senderUserId = null, limit = 50, offset = 0) => {
  return new Promise((resolve, reject) => {
    let sql = 'SELECT * FROM email_history WHERE tenant_id = ?';
    const params = [tenantId];

    if (senderUserId) {
      sql += ' AND sender_user_id = ?';
      params.push(senderUserId);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
};

module.exports = {
  encrypt,
  decrypt,
  getConfigForTenant,
  createTransporter,
  validateSmtpConfig,
  sendEmail,
  logEmailHistory,
  getTemplate,
  saveTemplate,
  getEmailHistory
};
