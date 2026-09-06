const assert = require('node:assert/strict');
const {
  LEMBRETES_MINUTOS,
  lembreteValido,
  resolverLembrete,
  gerarLembretes,
  limparLembretesObsoletos
} = require('../services/reuniaoLembretes');

const dueMeeting = {
  id: 11,
  tenant_id: 7,
  assunto: 'Alinhamento de medição',
  inicio_em: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  lembrete_minutos: 15,
  lembrete_revisao: 2,
  status: 'ativa'
};

function createClient(meetings = [dueMeeting]) {
  const claimed = new Set();
  const notifications = [];
  const calls = [];
  return {
    calls,
    notifications,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('SELECT r.* FROM mensagem_reunioes')) {
        const [tenantId, usuarioId] = params;
        return { rows: meetings.filter((m) => Number(m.tenant_id) === Number(tenantId) && usuarioId === 42 && m.status === 'ativa') };
      }
      if (sql.includes('INSERT INTO mensagem_reuniao_lembretes')) {
        const key = params.join(':');
        if (claimed.has(key)) return { rowCount: 0, rows: [] };
        claimed.add(key);
        return { rowCount: 1, rows: [{ reuniao_id: params[1] }] };
      }
      if (sql.includes('INSERT INTO notificacoes')) {
        const id = notifications.length + 1;
        notifications.push({ id, tenantId: params[0], usuarioId: params[1], assunto: params[2], reuniaoId: params[3] });
        return { rowCount: 1, rows: [{ id }] };
      }
      if (sql.includes('UPDATE mensagem_reuniao_lembretes')) return { rowCount: 1, rows: [] };
      if (sql.includes('DELETE FROM notificacoes')) return { rowCount: 0, rows: [] };
      throw new Error(`Consulta de teste não esperada: ${sql.slice(0, 70)}`);
    }
  };
}

async function run() {
  assert.deepEqual(LEMBRETES_MINUTOS, [5, 15, 30, 60, 1440]);
  assert.equal(lembreteValido(15), true);
  assert.equal(lembreteValido(null), true);
  assert.equal(lembreteValido(10), false);
  assert.equal(resolverLembrete(undefined, 30), 30);
  assert.equal(resolverLembrete(undefined), 15);
  assert.equal(resolverLembrete(null), null);

  const client = createClient();
  await gerarLembretes(client, { tenantId: 7, usuarioId: 42, readColumn: 'lida' });
  await gerarLembretes(client, { tenantId: 7, usuarioId: 42, readColumn: 'lida' });
  assert.equal(client.notifications.length, 1, 'consultas repetidas não podem duplicar o lembrete');
  assert.deepEqual(client.notifications[0], { id: 1, tenantId: 7, usuarioId: 42, assunto: dueMeeting.assunto, reuniaoId: dueMeeting.id });

  const emptyClient = createClient([{ ...dueMeeting, tenant_id: 8 }]);
  await gerarLembretes(emptyClient, { tenantId: 7, usuarioId: 42, readColumn: 'lido' });
  assert.equal(emptyClient.notifications.length, 0, 'um tenant não recebe reunião de outro tenant');

  await limparLembretesObsoletos(client, 7, 'lida', dueMeeting.id, 42);
  const cleanup = client.calls.at(-1);
  assert.match(cleanup.sql, /r\.status <> 'ativa'/);
  assert.match(cleanup.sql, /l\.revisao <> r\.lembrete_revisao/);
  assert.deepEqual(cleanup.params, [7, dueMeeting.id, 42]);
  console.log('OK: lembretes são validados, isolados por tenant e enviados uma vez por revisão.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
