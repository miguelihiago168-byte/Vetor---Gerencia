const express = require('express');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');

const DEFAULT_RECIPIENT = 'contatovetorgerenciamento@gmail.com';
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_REQUESTS = 5;

const htmlEscape = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const getContactConfig = (env = process.env) => ({
  host: String(env.CONTACT_SMTP_HOST || '').trim(),
  port: Number(env.CONTACT_SMTP_PORT),
  user: String(env.CONTACT_SMTP_USER || '').trim(),
  pass: String(env.CONTACT_SMTP_PASS || ''),
  fromEmail: String(env.CONTACT_FROM_EMAIL || '').trim(),
  fromName: String(env.CONTACT_FROM_NAME || 'Vetor Gerenciamento').trim(),
  toEmail: String(env.CONTACT_TO_EMAIL || DEFAULT_RECIPIENT).trim(),
  recaptchaSecret: String(env.RECAPTCHA_SECRET_KEY || '').trim(),
});

const isContactConfigValid = (config) => Boolean(
  config.host
  && Number.isInteger(config.port)
  && config.port >= 1
  && config.port <= 65535
  && config.user
  && config.pass
  && config.fromEmail
  && config.toEmail
  && config.recaptchaSecret
);

const createRateLimiter = ({ maxRequests = DEFAULT_MAX_REQUESTS, windowMs = DEFAULT_WINDOW_MS } = {}) => {
  const requests = new Map();

  return (ip) => {
    const now = Date.now();
    const recent = (requests.get(ip) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= maxRequests) {
      requests.set(ip, recent);
      return false;
    }
    recent.push(now);
    requests.set(ip, recent);
    return true;
  };
};

const getClientIp = (req) => String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 100);

const verifyRecaptcha = async (token, remoteIp, secret) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result?.success === true;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const sendContactEmail = async (contact, config) => {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: { user: config.user, pass: config.pass },
  });
  const fields = [
    ['Nome', contact.nome],
    ['E-mail', contact.email],
    ['Empresa', contact.empresa],
    ['Telefone / WhatsApp', contact.telefone],
  ];
  const rows = fields.map(([label, value]) => `<tr><th style="text-align:left;padding:8px 12px;background:#f3f7fb">${htmlEscape(label)}</th><td style="padding:8px 12px">${htmlEscape(value)}</td></tr>`).join('');
  const subject = `Novo contato pelo site — ${contact.nome}`;

  await transporter.sendMail({
    from: `${config.fromName.replace(/[\r\n]/g, '')} <${config.fromEmail}>`,
    to: config.toEmail,
    replyTo: `${contact.nome.replace(/[\r\n]/g, '')} <${contact.email}>`,
    subject,
    text: `Novo contato pelo site\n\nNome: ${contact.nome}\nE-mail: ${contact.email}\nEmpresa: ${contact.empresa}\nTelefone / WhatsApp: ${contact.telefone}\n\nMensagem:\n${contact.mensagem}`,
    html: `<main style="font-family:Arial,sans-serif;color:#17263a"><h2>Novo contato pelo site</h2><table style="border-collapse:collapse;border:1px solid #dce6f0">${rows}</table><h3 style="margin-top:24px">Mensagem</h3><p style="white-space:pre-wrap;line-height:1.5">${htmlEscape(contact.mensagem)}</p></main>`,
  });
};

const contactValidators = [
  body('nome').trim().isLength({ min: 2, max: 120 }).withMessage('Informe seu nome completo.'),
  body('email').trim().isEmail().withMessage('Informe um e-mail válido.').isLength({ max: 254 }).withMessage('Informe um e-mail válido.'),
  body('empresa').trim().isLength({ min: 2, max: 160 }).withMessage('Informe o nome da empresa.'),
  body('telefone').trim().custom((value) => {
    const digits = normalizePhone(value);
    if (digits.length !== 10 && digits.length !== 11) throw new Error('Informe um telefone válido com DDD.');
    return true;
  }),
  body('mensagem').trim().isLength({ min: 10, max: 4000 }).withMessage('Escreva uma mensagem de pelo menos 10 caracteres.'),
  body('recaptchaToken').trim().isLength({ min: 1, max: 4096 }).withMessage('Confirme que você não é um robô.'),
];

const createContatoRouter = ({
  getConfig = getContactConfig,
  verifyCaptcha = verifyRecaptcha,
  sendEmail = sendContactEmail,
  rateLimit,
} = {}) => {
  const router = express.Router();
  const allowRequest = rateLimit || createRateLimiter();

  router.post('/', contactValidators, async (req, res) => {
    const config = getConfig();
    if (!isContactConfigValid(config)) {
      return res.status(503).json({ erro: 'O formulário de contato está temporariamente indisponível. Tente novamente mais tarde.' });
    }

    const ip = getClientIp(req);
    if (!allowRequest(ip)) {
      return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos antes de enviar novamente.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: errors.array()[0].msg });
    }

    const captchaOk = await verifyCaptcha(req.body.recaptchaToken, ip, config.recaptchaSecret);
    if (!captchaOk) {
      return res.status(400).json({ erro: 'Não foi possível validar a verificação de segurança. Tente novamente.' });
    }

    const contact = {
      nome: String(req.body.nome).trim(),
      email: String(req.body.email).trim().toLowerCase(),
      empresa: String(req.body.empresa).trim(),
      telefone: String(req.body.telefone).trim(),
      mensagem: String(req.body.mensagem).trim(),
    };

    try {
      await sendEmail(contact, config);
      return res.status(201).json({ mensagem: 'Mensagem enviada com sucesso.' });
    } catch (error) {
      console.error('Falha ao enviar formulário de contato:', error.code || 'SMTP_ERROR');
      return res.status(502).json({ erro: 'Não foi possível enviar sua mensagem no momento. Tente novamente mais tarde.' });
    }
  });

  return router;
};

const router = createContatoRouter();
module.exports = router;
module.exports.createContatoRouter = createContatoRouter;
module.exports.createRateLimiter = createRateLimiter;
module.exports.getContactConfig = getContactConfig;
module.exports.isContactConfigValid = isContactConfigValid;
