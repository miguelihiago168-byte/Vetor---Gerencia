const assert = require('assert');
const express = require('express');
const { createContatoRouter, createRateLimiter } = require('../routes/contato');

const validConfig = () => ({
  host: 'smtp.example.test',
  port: 587,
  user: 'contact@example.test',
  pass: 'secret',
  fromEmail: 'contact@example.test',
  fromName: 'Vetor Gerenciamento',
  toEmail: 'contatovetorgerenciamento@gmail.com',
  recaptchaSecret: 'captcha-secret',
});

const validPayload = () => ({
  nome: 'Maria da Silva',
  email: 'maria@example.com',
  empresa: 'Construtora Exemplo',
  telefone: '(11) 99999-9999',
  mensagem: 'Gostaria de conhecer melhor a plataforma Vetor.',
  recaptchaToken: 'valid-token',
});

const startServer = (router) => new Promise((resolve) => {
  const app = express();
  app.use(express.json());
  app.use('/api/contato', router);
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});

const postContact = async (baseUrl, payload) => {
  const response = await fetch(`${baseUrl}/api/contato`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { response, body: await response.json() };
};

const withServer = async (router, callback) => {
  const server = await startServer(router);
  const { port } = server.address();
  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

const run = async () => {
  let deliveredContact = null;
  await withServer(createContatoRouter({
    getConfig: validConfig,
    verifyCaptcha: async (token) => token === 'valid-token',
    sendEmail: async (contact) => { deliveredContact = contact; },
  }), async (baseUrl) => {
    const result = await postContact(baseUrl, validPayload());
    assert.strictEqual(result.response.status, 201);
    assert.strictEqual(result.body.mensagem, 'Mensagem enviada com sucesso.');
    assert.strictEqual(deliveredContact.email, 'maria@example.com');
  });

  await withServer(createContatoRouter({ getConfig: validConfig }), async (baseUrl) => {
    const missing = await postContact(baseUrl, {});
    assert.strictEqual(missing.response.status, 400);
    assert.match(missing.body.erro, /nome/i);

    const invalid = await postContact(baseUrl, { ...validPayload(), email: 'email-inválido', telefone: '1234' });
    assert.strictEqual(invalid.response.status, 400);
    assert.match(invalid.body.erro, /e-mail/i);
  });

  await withServer(createContatoRouter({
    getConfig: validConfig,
    verifyCaptcha: async () => false,
  }), async (baseUrl) => {
    const result = await postContact(baseUrl, validPayload());
    assert.strictEqual(result.response.status, 400);
    assert.match(result.body.erro, /verificação de segurança/i);
  });

  await withServer(createContatoRouter({
    getConfig: validConfig,
    verifyCaptcha: async () => true,
    sendEmail: async () => {},
    rateLimit: createRateLimiter({ maxRequests: 1, windowMs: 60000 }),
  }), async (baseUrl) => {
    assert.strictEqual((await postContact(baseUrl, validPayload())).response.status, 201);
    const limited = await postContact(baseUrl, validPayload());
    assert.strictEqual(limited.response.status, 429);
  });

  await withServer(createContatoRouter({
    getConfig: validConfig,
    verifyCaptcha: async () => true,
    sendEmail: async () => { throw new Error('SMTP password leaked'); },
  }), async (baseUrl) => {
    const result = await postContact(baseUrl, validPayload());
    assert.strictEqual(result.response.status, 502);
    assert.strictEqual(result.body.erro, 'Não foi possível enviar sua mensagem no momento. Tente novamente mais tarde.');
    assert.ok(!result.body.erro.includes('SMTP'));
  });

  console.log(JSON.stringify({ ok: true, suite: 'contactRoute' }));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
