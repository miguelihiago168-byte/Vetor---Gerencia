const { allQuery, runQuery, getQuery } = require('../config/database');

const registrarAuditoria = async (tabela, registroId, acao, dadosAnteriores, dadosNovos, usuarioId, options = {}) => {
  const { strict = false, tenantId = null } = options;
  try {
    await runQuery(`
      INSERT INTO auditoria (tabela, registro_id, acao, dados_anteriores, dados_novos, usuario_id, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      tabela,
      registroId,
      acao,
      dadosAnteriores ? JSON.stringify(dadosAnteriores) : null,
      dadosNovos ? JSON.stringify(dadosNovos) : null,
      usuarioId,
      tenantId
    ]);
    return true;
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error);
    if (strict) throw error;
    return false;
  }
};

module.exports = { registrarAuditoria };
