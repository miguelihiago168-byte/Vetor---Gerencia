module.exports = {
  id: '000007_estoque_central_obras',
  description: 'Adiciona estoque central, recebimentos parciais e transferencias internas entre obras',
  async up({ run }) {
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_insumos (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        nome TEXT NOT NULL,
        nome_normalizado TEXT NOT NULL,
        unidade TEXT NOT NULL,
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, nome_normalizado, unidade)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_pendencias_recebimento (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        referencia_tipo TEXT NOT NULL CHECK (referencia_tipo IN ('REQUISICAO_ITEM','PEDIDO_COMPRA')),
        referencia_id BIGINT NOT NULL,
        projeto_solicitante_id BIGINT REFERENCES projetos(id),
        descricao TEXT NOT NULL,
        nome_normalizado TEXT NOT NULL,
        unidade TEXT NOT NULL,
        quantidade_comprada NUMERIC(18,4) NOT NULL CHECK (quantidade_comprada > 0),
        quantidade_recebida NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantidade_recebida >= 0),
        status TEXT NOT NULL DEFAULT 'AGUARDANDO_RECEBIMENTO' CHECK (status IN ('AGUARDANDO_RECEBIMENTO','RECEBIMENTO_PARCIAL','RECEBIDO_TOTAL','CANCELADO')),
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, referencia_tipo, referencia_id)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_lotes (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        insumo_id BIGINT NOT NULL REFERENCES estoque_insumos(id),
        pendencia_recebimento_id BIGINT REFERENCES estoque_pendencias_recebimento(id),
        material_recebimento_id BIGINT UNIQUE REFERENCES material_recebimentos(id),
        fornecedor_nome TEXT,
        nota_fiscal TEXT,
        lote TEXT,
        local_armazenamento TEXT,
        observacoes TEXT,
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        recebido_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_lote_anexos (
        id BIGSERIAL PRIMARY KEY,
        lote_id BIGINT NOT NULL REFERENCES estoque_lotes(id) ON DELETE CASCADE,
        caminho_arquivo TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        tipo_arquivo TEXT,
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_saldos (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        lote_id BIGINT NOT NULL REFERENCES estoque_lotes(id),
        local_chave TEXT NOT NULL,
        tipo_local TEXT NOT NULL CHECK (tipo_local IN ('CENTRAL','OBRA')),
        projeto_id BIGINT REFERENCES projetos(id),
        quantidade NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
        quantidade_reservada NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantidade_reservada >= 0 AND quantidade_reservada <= quantidade),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, lote_id, local_chave)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_transferencias (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        origem_chave TEXT NOT NULL,
        origem_projeto_id BIGINT REFERENCES projetos(id),
        destino_chave TEXT NOT NULL,
        destino_projeto_id BIGINT REFERENCES projetos(id),
        status TEXT NOT NULL DEFAULT 'PENDENTE_ORIGEM' CHECK (status IN ('PENDENTE_ORIGEM','PENDENTE_DESTINO','CONCLUIDA','REJEITADA','CANCELADA')),
        justificativa TEXT,
        solicitada_por BIGINT NOT NULL REFERENCES usuarios(id),
        aprovada_origem_por BIGINT REFERENCES usuarios(id),
        recebida_destino_por BIGINT REFERENCES usuarios(id),
        criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        aprovada_origem_em TIMESTAMPTZ,
        recebida_destino_em TIMESTAMPTZ,
        concluida_em TIMESTAMPTZ,
        CHECK (origem_chave <> destino_chave)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_transferencia_itens (
        id BIGSERIAL PRIMARY KEY,
        transferencia_id BIGINT NOT NULL REFERENCES estoque_transferencias(id) ON DELETE CASCADE,
        lote_id BIGINT NOT NULL REFERENCES estoque_lotes(id),
        quantidade NUMERIC(18,4) NOT NULL CHECK (quantidade > 0),
        descricao_snapshot TEXT NOT NULL,
        unidade_snapshot TEXT NOT NULL
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
        id BIGSERIAL PRIMARY KEY,
        tenant_id BIGINT NOT NULL REFERENCES tenants(id),
        lote_id BIGINT NOT NULL REFERENCES estoque_lotes(id),
        insumo_id BIGINT NOT NULL REFERENCES estoque_insumos(id),
        transferencia_id BIGINT REFERENCES estoque_transferencias(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA_COMPRA','MIGRACAO_HISTORICO','RESERVA_TRANSFERENCIA','TRANSFERENCIA_SAIDA','TRANSFERENCIA_ENTRADA','CANCELAMENTO_TRANSFERENCIA','AJUSTE')),
        quantidade NUMERIC(18,4) NOT NULL,
        origem_chave TEXT,
        destino_chave TEXT,
        projeto_origem_id BIGINT REFERENCES projetos(id),
        projeto_destino_id BIGINT REFERENCES projetos(id),
        observacoes TEXT,
        usuario_id BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run('CREATE INDEX IF NOT EXISTS idx_estoque_pendencias_tenant_status ON estoque_pendencias_recebimento(tenant_id, status)');
    await run('CREATE INDEX IF NOT EXISTS idx_estoque_saldos_tenant_local ON estoque_saldos(tenant_id, local_chave)');
    await run('CREATE INDEX IF NOT EXISTS idx_estoque_movimentacoes_lote ON estoque_movimentacoes(lote_id, criado_em DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_estoque_transferencias_tenant_status ON estoque_transferencias(tenant_id, status)');

    // Compras que ja haviam sido marcadas como realizadas antes da ativacao do
    // modulo passam a aparecer como aguardando recebimento, sem criar saldo.
    await run(`
      INSERT INTO estoque_pendencias_recebimento
        (tenant_id,referencia_tipo,referencia_id,projeto_solicitante_id,descricao,nome_normalizado,unidade,quantidade_comprada)
      SELECT p.tenant_id, 'REQUISICAO_ITEM', ri.id, r.projeto_id, ri.descricao,
        translate(lower(trim(regexp_replace(ri.descricao, '\\s+', ' ', 'g'))), 'áàãâäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        COALESCE(NULLIF(trim(ri.unidade), ''), 'UN'), ri.quantidade
      FROM requisicao_itens ri
      JOIN requisicoes r ON r.id=ri.requisicao_id
      JOIN projetos p ON p.id=r.projeto_id
      WHERE ri.status_item='Comprado'
      ON CONFLICT (tenant_id,referencia_tipo,referencia_id) DO NOTHING
    `);
    await run(`
      INSERT INTO estoque_pendencias_recebimento
        (tenant_id,referencia_tipo,referencia_id,projeto_solicitante_id,descricao,nome_normalizado,unidade,quantidade_comprada)
      SELECT p.tenant_id, 'PEDIDO_COMPRA', pc.id, pc.projeto_id, pc.descricao,
        translate(lower(trim(regexp_replace(pc.descricao, '\\s+', ' ', 'g'))), 'áàãâäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        COALESCE(NULLIF(trim(pc.unidade), ''), 'UN'), pc.quantidade
      FROM pedidos_compra pc
      JOIN projetos p ON p.id=pc.projeto_id
      WHERE pc.status='COMPRADO'
      ON CONFLICT (tenant_id,referencia_tipo,referencia_id) DO NOTHING
    `);

    // Traz os recebimentos de rastreabilidade para a nova visao de estoque sem
    // alterar o historico original. Saldos ja aplicados nao sao recriados.
    await run(`
      INSERT INTO estoque_insumos (tenant_id, nome, nome_normalizado, unidade)
      SELECT DISTINCT m.tenant_id, m.nome_material,
        translate(lower(trim(regexp_replace(m.nome_material, '\\s+', ' ', 'g'))), 'áàãâäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
        m.unidade
      FROM material_recebimentos m
      WHERE m.nome_material IS NOT NULL AND m.unidade IS NOT NULL
      ON CONFLICT (tenant_id, nome_normalizado, unidade) DO NOTHING
    `);
    await run(`
      INSERT INTO estoque_lotes (tenant_id, insumo_id, material_recebimento_id, fornecedor_nome, nota_fiscal, lote, local_armazenamento, observacoes, recebido_em, recebido_por)
      SELECT m.tenant_id, i.id, m.id, m.fornecedor_nome, m.nota_fiscal, m.lote, m.local_armazenamento,
        'Importado da rastreabilidade de materiais', m.recebido_em, m.recebido_por
      FROM material_recebimentos m
      JOIN estoque_insumos i ON i.tenant_id = m.tenant_id
        AND i.nome_normalizado = translate(lower(trim(regexp_replace(m.nome_material, '\\s+', ' ', 'g'))), 'áàãâäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
        AND i.unidade = m.unidade
      ON CONFLICT (material_recebimento_id) DO NOTHING
    `);
    await run(`
      INSERT INTO estoque_saldos (tenant_id, lote_id, local_chave, tipo_local, projeto_id, quantidade)
      SELECT m.tenant_id, l.id, 'OBRA:' || m.projeto_id, 'OBRA', m.projeto_id,
        GREATEST(0, COALESCE(m.quantidade_aprovada, 0) - COALESCE((
          SELECT SUM(a.quantidade) FROM material_aplicacoes a
          WHERE a.recebimento_id = m.id AND a.tipo_movimento IN ('Aplicação','Saída','Devolução','Descarte')
        ), 0))
      FROM material_recebimentos m
      JOIN estoque_lotes l ON l.material_recebimento_id = m.id
      ON CONFLICT (tenant_id, lote_id, local_chave) DO NOTHING
    `);
    await run(`
      INSERT INTO estoque_movimentacoes (tenant_id,lote_id,insumo_id,tipo,quantidade,destino_chave,projeto_destino_id,observacoes)
      SELECT s.tenant_id, s.lote_id, l.insumo_id, 'MIGRACAO_HISTORICO', s.quantidade,
        s.local_chave, s.projeto_id, 'Saldo importado da rastreabilidade de materiais'
      FROM estoque_saldos s
      JOIN estoque_lotes l ON l.id=s.lote_id
      WHERE s.quantidade > 0 AND l.material_recebimento_id IS NOT NULL
    `);
  }
};
