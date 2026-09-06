const LEMBRETES_MINUTOS = [5, 15, 30, 60, 1440];
const lembreteValido = (value) => value === null || LEMBRETES_MINUTOS.includes(value);
const resolverLembrete = (value, anterior = 15) => value === undefined ? anterior : value;

// Chamado na mesma transação de edição/cancelamento, após bloquear a reunião.
async function limparLembretesObsoletos(client, tenantId, readColumn, reuniaoId = null, usuarioId = null) {
  if (!['lido', 'lida'].includes(readColumn)) throw new Error('Coluna de leitura inválida');
  await client.query(`DELETE FROM notificacoes n
    USING mensagem_reuniao_lembretes l, mensagem_reunioes r
    WHERE n.id = l.notificacao_id AND l.tenant_id = $1
      AND n.tenant_id = l.tenant_id AND r.tenant_id = l.tenant_id AND r.id = l.reuniao_id
      AND ($2::bigint IS NULL OR r.id = $2) AND ($3::bigint IS NULL OR n.usuario_id = $3)
      AND COALESCE(n.${readColumn}, 0) = 0
      AND (r.status <> 'ativa' OR r.lembrete_minutos IS NULL OR l.revisao <> r.lembrete_revisao
        OR r.inicio_em <= NOW()
        OR NOT EXISTS (SELECT 1 FROM mensagem_reuniao_participantes p
          WHERE p.tenant_id = r.tenant_id AND p.reuniao_id = r.id AND p.usuario_id = n.usuario_id)
        OR NOT EXISTS (SELECT 1 FROM projeto_usuarios pu JOIN projetos pr ON pr.id = pu.projeto_id AND pr.tenant_id = pu.tenant_id
          WHERE pu.tenant_id = r.tenant_id AND pu.projeto_id = r.projeto_id AND pu.usuario_id = n.usuario_id AND pr.ativo = 1))`,
  [tenantId, reuniaoId, usuarioId]);
}

async function gerarLembretes(client, { tenantId, usuarioId, readColumn }) {
  // O mesmo bloqueio usado pelas alterações impede envio concorrente com cancelamento.
  const { rows } = await client.query(`SELECT r.* FROM mensagem_reunioes r
    JOIN projetos pr ON pr.id = r.projeto_id AND pr.tenant_id = r.tenant_id AND pr.ativo = 1
    JOIN usuarios u ON u.id = $2 AND COALESCE(u.ativo, 1) = 1 AND u.deletado_em IS NULL
    WHERE r.tenant_id = $1 AND r.status = 'ativa' AND r.lembrete_minutos IS NOT NULL
      AND r.inicio_em > NOW() AND r.inicio_em - r.lembrete_minutos * INTERVAL '1 minute' <= NOW()
      AND EXISTS (SELECT 1 FROM mensagem_reuniao_participantes p
        WHERE p.tenant_id = r.tenant_id AND p.reuniao_id = r.id AND p.usuario_id = $2)
      AND EXISTS (SELECT 1 FROM projeto_usuarios pu
        WHERE pu.tenant_id = r.tenant_id AND pu.projeto_id = r.projeto_id AND pu.usuario_id = $2)
    ORDER BY r.id FOR UPDATE OF r`, [tenantId, usuarioId]);
  for (const reuniao of rows) {
    const claimed = await client.query(`INSERT INTO mensagem_reuniao_lembretes (tenant_id, reuniao_id, usuario_id, revisao)
      VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING reuniao_id`,
    [tenantId, reuniao.id, usuarioId, reuniao.lembrete_revisao]);
    if (!claimed.rowCount) continue;
    const notification = await client.query(`INSERT INTO notificacoes
      (tenant_id, usuario_id, tipo, titulo, mensagem, referencia_tipo, referencia_id)
      VALUES ($1, $2, 'reuniao_lembrete', 'Sua reunião está chegando', $3, 'reuniao', $4) RETURNING id`,
    [tenantId, usuarioId, reuniao.assunto, reuniao.id]);
    await client.query(`UPDATE mensagem_reuniao_lembretes SET notificacao_id = $5
      WHERE tenant_id = $1 AND reuniao_id = $2 AND usuario_id = $3 AND revisao = $4`,
    [tenantId, reuniao.id, usuarioId, reuniao.lembrete_revisao, notification.rows[0].id]);
  }
  await limparLembretesObsoletos(client, tenantId, readColumn, null, usuarioId);
}

async function getReadColumn(client) {
  const { rows } = await client.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notificacoes' AND column_name IN ('lido', 'lida')`);
  return rows.some((row) => row.column_name === 'lido') ? 'lido' : 'lida';
}

module.exports = { LEMBRETES_MINUTOS, lembreteValido, resolverLembrete, gerarLembretes, limparLembretesObsoletos, getReadColumn };
