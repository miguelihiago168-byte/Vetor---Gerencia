module.exports = {
  id: '000008_estoque_fornecedor_pendencia',
  description: 'Mantem fornecedor e dados da compra nas pendencias de estoque',
  async up({ run }) {
    await run('ALTER TABLE estoque_pendencias_recebimento ADD COLUMN IF NOT EXISTS fornecedor_nome TEXT');
    await run("ALTER TABLE estoque_pendencias_recebimento ADD COLUMN IF NOT EXISTS dados_compra JSONB NOT NULL DEFAULT '{}'::jsonb");
    // Bancos criados antes do fluxo de cotação detalhada não possuem todos os
    // campos abaixo. Garantimos o esquema antes de reaproveitar os registros.
    await run('ALTER TABLE requisicao_cotacoes ADD COLUMN IF NOT EXISTS cnpj TEXT');
    await run('ALTER TABLE requisicao_cotacoes ADD COLUMN IF NOT EXISTS telefone TEXT');
    await run('ALTER TABLE requisicao_cotacoes ADD COLUMN IF NOT EXISTS email TEXT');
    await run('ALTER TABLE requisicao_cotacoes ADD COLUMN IF NOT EXISTS frete NUMERIC(18,4)');
    await run('ALTER TABLE requisicao_cotacoes ADD COLUMN IF NOT EXISTS prazo_entrega TEXT');
    await run('ALTER TABLE requisicao_cotacoes ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT');
    await run('ALTER TABLE requisicao_cotacoes ADD COLUMN IF NOT EXISTS observacao TEXT');
    await run('ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS condicoes_pagamento TEXT');
    await run('ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS garantia TEXT');
    await run('ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS frete TEXT');
    await run('ALTER TABLE cotacoes ADD COLUMN IF NOT EXISTS observacoes TEXT');
    await run(`
      UPDATE estoque_pendencias_recebimento pe
      SET fornecedor_nome = COALESCE(rc.fornecedor_nome, f.nome_fantasia, f.razao_social)
      FROM requisicao_cotacoes rc
      LEFT JOIN fornecedores f ON f.id=rc.fornecedor_id
      WHERE pe.referencia_tipo='REQUISICAO_ITEM'
        AND pe.referencia_id=rc.item_id
        AND rc.selecionada=1
        AND pe.fornecedor_nome IS NULL
    `);
    await run(`
      UPDATE estoque_pendencias_recebimento pe
      SET fornecedor_nome = c.fornecedor
      FROM pedidos_compra pc
      JOIN cotacoes c ON c.id=pc.cotacao_vencedora_id
      WHERE pe.referencia_tipo='PEDIDO_COMPRA'
        AND pe.referencia_id=pc.id
        AND pe.fornecedor_nome IS NULL
    `);
    await run(`
      UPDATE estoque_pendencias_recebimento pe
      SET dados_compra = jsonb_strip_nulls(jsonb_build_object(
        'especificacao_tecnica', ri.especificacao_tecnica,
        'fornecedor_cnpj', rc.cnpj,
        'fornecedor_telefone', rc.telefone,
        'fornecedor_email', rc.email,
        'valor_unitario', rc.valor_unitario,
        'frete', rc.frete,
        'prazo_entrega', rc.prazo_entrega,
        'condicao_pagamento', rc.condicao_pagamento,
        'observacao_cotacao', rc.observacao
      ))
      FROM requisicao_itens ri
      LEFT JOIN requisicao_cotacoes rc ON rc.item_id=ri.id AND rc.selecionada=1
      WHERE pe.referencia_tipo='REQUISICAO_ITEM'
        AND pe.referencia_id=ri.id
        AND pe.dados_compra = '{}'::jsonb
    `);
    await run(`
      UPDATE estoque_pendencias_recebimento pe
      SET dados_compra = jsonb_strip_nulls(jsonb_build_object(
        'especificacao_tecnica', pc.aplicacao_local,
        'marca', c.marca,
        'modelo', c.modelo,
        'valor_unitario', c.valor_unitario,
        'frete', c.frete,
        'prazo_entrega', c.prazo_entrega,
        'condicao_pagamento', c.condicoes_pagamento,
        'garantia', c.garantia,
        'observacao_cotacao', c.observacoes,
        'cotacao_pdf', c.pdf_path
      ))
      FROM pedidos_compra pc
      LEFT JOIN cotacoes c ON c.id=pc.cotacao_vencedora_id
      WHERE pe.referencia_tipo='PEDIDO_COMPRA'
        AND pe.referencia_id=pc.id
        AND pe.dados_compra = '{}'::jsonb
    `);
  }
};
