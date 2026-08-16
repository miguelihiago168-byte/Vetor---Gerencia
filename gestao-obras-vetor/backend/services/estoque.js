const { runQuery } = require('../config/database');
const { normalizarNomeInsumo } = require('../utils/estoque');

const criarPendenciaRecebimento = async ({ tenantId, tipo, referenciaId, projetoId, descricao, quantidade, unidade, fornecedorNome, dadosCompra, usuarioId }) => {
  const nome = String(descricao || '').trim();
  const unidadeNormalizada = String(unidade || 'UN').trim().toUpperCase();
  const quantidadeNumero = Number(quantidade);
  if (!tenantId || !referenciaId || !nome || !(quantidadeNumero > 0)) return null;

  await runQuery(`
    INSERT INTO estoque_pendencias_recebimento
      (tenant_id, referencia_tipo, referencia_id, projeto_solicitante_id, descricao, nome_normalizado, unidade, quantidade_comprada, fornecedor_nome, dados_compra, criado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (tenant_id, referencia_tipo, referencia_id) DO NOTHING
  `, [tenantId, tipo, referenciaId, projetoId || null, nome, normalizarNomeInsumo(nome), unidadeNormalizada, quantidadeNumero, fornecedorNome || null, JSON.stringify(dadosCompra || {}), usuarioId || null]);
};

module.exports = { normalizarNomeInsumo, criarPendenciaRecebimento };
