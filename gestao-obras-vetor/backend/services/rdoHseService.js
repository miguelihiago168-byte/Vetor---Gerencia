const { randomUUID } = require('node:crypto');

const normalize = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
const categories = new Map([['direta','Direta'],['indireta','Indireta'],['terceiros','Terceiros']]);

async function cadastrarPessoasDoRdo(client, { tenantId, usuarioId, pessoas }) {
  if (!Array.isArray(pessoas) || !pessoas.length) return;
  // Serializa registros automáticos do mesmo tenant durante a transação do RDO.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`hse-rdo:${tenantId}`]);
  const users = await client.query(`SELECT u.nome FROM usuarios u JOIN usuario_tenants ut ON ut.usuario_id=u.id
    WHERE ut.tenant_id=$1 AND ut.ativo=1`, [tenantId]);
  const workers = await client.query('SELECT nome FROM mao_obra_direta WHERE tenant_id=$1', [tenantId]);
  const known = new Set([...users.rows,...workers.rows].map(row => normalize(row.nome)).filter(Boolean));

  for (const person of pessoas) {
    const nome = String(person?.nome || '').trim().replace(/\s+/g, ' ');
    const funcao = String(person?.funcao || '').trim();
    const tipo = categories.get(normalize(person?.tipo || person?.classificacao));
    const nameKey = normalize(nome);
    if (!nameKey || !funcao || !tipo || known.has(nameKey)) continue;
    const inserted = await client.query(`INSERT INTO mao_obra_direta (tenant_id,identificador,projeto_id,nome,funcao,ativo,criado_por)
      VALUES ($1,$2,NULL,$3,$4,1,$5) RETURNING id`, [tenantId,`HSE-${randomUUID()}`,nome,funcao,usuarioId]);
    await client.query(`INSERT INTO hse_classificacoes (tenant_id,origem,pessoa_id,funcao,tipo,atualizado_por)
      VALUES ($1,'mao_obra',$2,$3,$4,$5)`, [tenantId,inserted.rows[0].id,funcao,tipo,usuarioId]);
    known.add(nameKey);
  }
}

module.exports = { cadastrarPessoasDoRdo };
