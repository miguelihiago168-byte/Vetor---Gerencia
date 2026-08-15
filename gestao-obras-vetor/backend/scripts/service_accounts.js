require('dotenv').config();

const bcrypt = require('bcryptjs');
const { generateServiceAccountCredentials } = require('../services/serviceAccountAuth');

const BCRYPT_ROUNDS = 12;
let database = null;

const getDatabase = () => {
  if (!database) database = require('../config/database');
  return database;
};

const usage = () => {
  console.log(`Uso:
  node scripts/service_accounts.js create --name "Nome da integracao"
  node scripts/service_accounts.js list
  node scripts/service_accounts.js rotate --client-id sa_xxx
  node scripts/service_accounts.js deactivate --client-id sa_xxx

O segredo nunca e aceito por argumento. Nos comandos create e rotate ele e exibido uma unica vez.`);
};

const readOption = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1 || !args[index + 1] || args[index + 1].startsWith('--')) return null;
  return args[index + 1];
};

const printCredential = ({ clientId, clientSecret, name }) => {
  console.log(JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    name,
    aviso: 'Guarde client_secret agora em um gerenciador de segredos. Ele nao podera ser exibido novamente.'
  }, null, 2));
};

const ensureClientExists = async (clientId) => {
  const { getQueryMain } = getDatabase();
  const account = await getQueryMain(
    'SELECT id, client_id, name, active, token_version FROM service_accounts WHERE client_id = ?',
    [clientId]
  );
  if (!account) throw new Error('Service account nao encontrada.');
  return account;
};

const main = async () => {
  const [command, ...args] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    usage();
    return;
  }

  const { allQueryMain, runQueryMain } = getDatabase();

  if (command === 'create') {
    const name = String(readOption(args, '--name') || '').trim();
    if (!name || name.length > 120) throw new Error('Informe --name com ate 120 caracteres.');

    const credentials = generateServiceAccountCredentials();
    const secretHash = await bcrypt.hash(credentials.clientSecret, BCRYPT_ROUNDS);
    await runQueryMain(
      `INSERT INTO service_accounts (client_id, client_secret_hash, name)
       VALUES (?, ?, ?)`,
      [credentials.clientId, secretHash, name]
    );
    printCredential({ ...credentials, name });
    return;
  }

  if (command === 'list') {
    const accounts = await allQueryMain(
      `SELECT client_id, name, active, token_version, created_at, updated_at,
              last_token_issued_at, disabled_at
       FROM service_accounts
       ORDER BY created_at ASC`
    );
    console.log(JSON.stringify(accounts, null, 2));
    return;
  }

  const clientId = String(readOption(args, '--client-id') || '').trim();
  if (!clientId) throw new Error('Informe --client-id.');

  if (command === 'rotate') {
    const account = await ensureClientExists(clientId);
    const credentials = generateServiceAccountCredentials();
    const secretHash = await bcrypt.hash(credentials.clientSecret, BCRYPT_ROUNDS);
    await runQueryMain(
      `UPDATE service_accounts
       SET client_secret_hash = ?, token_version = token_version + 1,
           active = TRUE, disabled_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [secretHash, account.id]
    );
    printCredential({
      clientId: account.client_id,
      clientSecret: credentials.clientSecret,
      name: account.name
    });
    return;
  }

  if (command === 'deactivate') {
    const account = await ensureClientExists(clientId);
    await runQueryMain(
      `UPDATE service_accounts
       SET active = FALSE, token_version = token_version + 1,
           disabled_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [account.id]
    );
    console.log(JSON.stringify({ client_id: account.client_id, active: false, mensagem: 'Service account desativada.' }));
    return;
  }

  usage();
  throw new Error(`Comando invalido: ${command}`);
};

main()
  .catch((error) => {
    // Nunca inclua argumentos ou segredos nesta mensagem.
    console.error(`Erro: ${error.message || 'Falha ao administrar service account.'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database?.pool?.end().catch(() => {});
  });
