/*
 * Single-database tenancy baseline. This migration is intentionally additive so
 * it can also be applied to a short-lived development database created by the
 * old bootstrap scripts. Production should run it with the migration owner,
 * then run the API with a non-owner role without BYPASSRLS.
 */
module.exports = {
  id: '000013_postgres_rls_groups',
  description: 'Consolida tenancy em tabelas únicas, grupos empresariais e RLS',
  async up(context) {
    const { run } = context;
    await run(`
      CREATE TABLE IF NOT EXISTS grupos_empresariais (
        id BIGSERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_grupos_empresariais_nome ON grupos_empresariais (lower(nome))`);
    await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grupo_id BIGINT REFERENCES grupos_empresariais(id)`);
    await run(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cnpj TEXT`);
    await run(`ALTER TABLE usuario_tenants ADD COLUMN IF NOT EXISTS tenant_padrao BOOLEAN NOT NULL DEFAULT FALSE`);

    // The data set is currently empty. The fallback only protects a developer
    // database that still has old tenant records.
    await run(`
      INSERT INTO grupos_empresariais (nome)
      SELECT 'Grupo legado ' || t.id
      FROM tenants t
      WHERE t.grupo_id IS NULL
    `);
    await run(`
      UPDATE tenants t SET grupo_id = g.id
      FROM grupos_empresariais g
      WHERE t.grupo_id IS NULL AND g.nome = 'Grupo legado ' || t.id
    `);
    await run(`ALTER TABLE tenants ALTER COLUMN grupo_id SET NOT NULL`);

    await run(`
      CREATE OR REPLACE FUNCTION app_context_bigint(setting_name TEXT)
      RETURNS BIGINT LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting(setting_name, true), '')::BIGINT
      $$
    `);
    await run(`
      CREATE OR REPLACE FUNCTION app_current_tenant_id()
      RETURNS BIGINT LANGUAGE sql STABLE AS $$ SELECT app_context_bigint('app.tenant_id') $$
    `);
    await run(`
      CREATE OR REPLACE FUNCTION app_current_group_id()
      RETURNS BIGINT LANGUAGE sql STABLE AS $$ SELECT app_context_bigint('app.group_id') $$
    `);
    await run(`
      CREATE OR REPLACE FUNCTION app_current_user_id()
      RETURNS BIGINT LANGUAGE sql STABLE AS $$ SELECT app_context_bigint('app.user_id') $$
    `);
    await run(`
      CREATE OR REPLACE FUNCTION app_has_tenant_access(required_tenant_id BIGINT)
      RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
        SELECT EXISTS (
          SELECT 1 FROM usuario_tenants ut
          WHERE ut.usuario_id = app_current_user_id()
            AND ut.tenant_id = required_tenant_id
            AND ut.ativo = 1
        )
      $$
    `);

    const tenantTables = [
      'projetos', 'projeto_usuarios', 'atividades_eap', 'atividades_dependencias',
      'historico_atividades', 'atividade_eap_eventos', 'rdo_alertas_atividade',
      'rdos', 'rdo_atividades', 'rdo_mao_obra', 'rdo_clima', 'rdo_materiais',
      'rdo_equipamentos', 'rdo_fotos', 'rdo_comentarios', 'rdo_ocorrencias',
      'rdo_assinaturas', 'rdo_logs', 'rdos_versions', 'anexos', 'rnc',
      'rnc_anexos', 'auditoria', 'notificacoes', 'mensagem_conversas',
      'mensagem_itens', 'mensagem_recibos', 'mensagem_anexos', 'mensagem_reunioes',
      'mensagem_reuniao_participantes', 'email_config', 'email_templates',
      'email_history', 'received_emails', 'mao_obra', 'mao_obra_direta',
      'almox_ferramentas', 'almox_alocacoes', 'almox_manutencoes', 'almox_perdas',
      'almox_movimentacoes', 'rdo_ferramentas', 'material_recebimentos',
      'material_inspecoes', 'material_caminhoes_concreto', 'material_corpos_prova',
      'material_aplicacoes', 'material_evidencias', 'material_rncs', 'material_historico'
    ];
    for (const table of tenantTables) {
      await run(`DO $$ DECLARE has_null BOOLEAN; BEGIN
        IF to_regclass('public.${table}') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS tenant_id BIGINT';
          EXECUTE 'ALTER TABLE public.${table} ALTER COLUMN tenant_id SET DEFAULT app_current_tenant_id()';
          EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE tenant_id IS NULL)', '${table}') INTO has_null;
          IF NOT has_null THEN
            EXECUTE 'ALTER TABLE public.${table} ALTER COLUMN tenant_id SET NOT NULL';
          END IF;
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON public.${table} (tenant_id)';
        END IF;
      END $$`);
    }
    const groupTables = ['fornecedores', 'requisicoes', 'requisicao_itens', 'requisicao_cotacoes', 'requisicao_historico', 'pedidos_compra', 'cotacoes', 'pedidos_compra_historico'];
    for (const table of groupTables) {
      await run(`DO $$ DECLARE has_null BOOLEAN; BEGIN
        IF to_regclass('public.${table}') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS grupo_id BIGINT REFERENCES grupos_empresariais(id)';
          EXECUTE 'ALTER TABLE public.${table} ALTER COLUMN grupo_id SET DEFAULT app_current_group_id()';
          EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE grupo_id IS NULL)', '${table}') INTO has_null;
          IF NOT has_null THEN
            EXECUTE 'ALTER TABLE public.${table} ALTER COLUMN grupo_id SET NOT NULL';
          END IF;
          EXECUTE 'CREATE INDEX IF NOT EXISTS idx_${table}_grupo ON public.${table} (grupo_id)';
        END IF;
      END $$`);
    }
    await run(`ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS tenant_destino_id BIGINT REFERENCES tenants(id)`);
    await run(`ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS projeto_destino_id BIGINT`);
    await run(`ALTER TABLE requisicoes ADD COLUMN IF NOT EXISTS insumo_id BIGINT`);
    await run(`ALTER TABLE requisicoes ALTER COLUMN tenant_destino_id SET DEFAULT app_current_tenant_id()`);
    await run(`ALTER TABLE material_recebimentos ADD COLUMN IF NOT EXISTS quantidade_reservada NUMERIC(18,4) NOT NULL DEFAULT 0`);
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_projetos_tenant_id ON projetos(tenant_id, id)`);
    await run(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_eap_projeto_tenant') THEN
        ALTER TABLE atividades_eap ADD CONSTRAINT fk_eap_projeto_tenant FOREIGN KEY (tenant_id, projeto_id) REFERENCES projetos(tenant_id, id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rdos_projeto_tenant') THEN
        ALTER TABLE rdos ADD CONSTRAINT fk_rdos_projeto_tenant FOREIGN KEY (tenant_id, projeto_id) REFERENCES projetos(tenant_id, id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_rnc_projeto_tenant') THEN
        ALTER TABLE rnc ADD CONSTRAINT fk_rnc_projeto_tenant FOREIGN KEY (tenant_id, projeto_id) REFERENCES projetos(tenant_id, id);
      END IF;
    END $$`);

    await run(`
      CREATE TABLE IF NOT EXISTS insumos_catalogo (
        id BIGSERIAL PRIMARY KEY,
        grupo_id BIGINT NOT NULL REFERENCES grupos_empresariais(id),
        codigo TEXT NOT NULL,
        descricao TEXT NOT NULL,
        unidade TEXT,
        especificacao_tecnica TEXT,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        criado_por BIGINT REFERENCES usuarios(id),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (grupo_id, codigo)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS transferencias_recursos (
        id BIGSERIAL PRIMARY KEY,
        grupo_id BIGINT NOT NULL REFERENCES grupos_empresariais(id),
        tenant_origem_id BIGINT NOT NULL REFERENCES tenants(id),
        tenant_destino_id BIGINT NOT NULL REFERENCES tenants(id),
        solicitada_por BIGINT NOT NULL REFERENCES usuarios(id),
        aprovada_origem_por BIGINT REFERENCES usuarios(id),
        aprovada_destino_por BIGINT REFERENCES usuarios(id),
        status TEXT NOT NULL DEFAULT 'PENDENTE_ORIGEM'
          CHECK (status IN ('PENDENTE_ORIGEM','PENDENTE_DESTINO','CONCLUIDA','REJEITADA','CANCELADA')),
        motivo TEXT,
        criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        aprovada_origem_em TIMESTAMPTZ,
        aprovada_destino_em TIMESTAMPTZ,
        concluida_em TIMESTAMPTZ,
        CHECK (tenant_origem_id <> tenant_destino_id)
      )
    `);
    await run(`
      CREATE TABLE IF NOT EXISTS transferencia_recurso_itens (
        id BIGSERIAL PRIMARY KEY,
        transferencia_id BIGINT NOT NULL REFERENCES transferencias_recursos(id) ON DELETE CASCADE,
        tipo_recurso TEXT NOT NULL CHECK (tipo_recurso IN ('MATERIAL','FERRAMENTA')),
        material_recebimento_origem_id BIGINT,
        ferramenta_origem_id BIGINT,
        projeto_destino_id BIGINT,
        quantidade NUMERIC(18,4),
        unidade TEXT,
        descricao_snapshot TEXT NOT NULL,
        CHECK (
          (tipo_recurso = 'MATERIAL' AND material_recebimento_origem_id IS NOT NULL AND quantidade > 0)
          OR (tipo_recurso = 'FERRAMENTA' AND ferramenta_origem_id IS NOT NULL)
        )
      )
    `);
    await run(`CREATE INDEX IF NOT EXISTS idx_transferencias_grupo_status ON transferencias_recursos(grupo_id, status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_transferencias_origem ON transferencias_recursos(tenant_origem_id, status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_transferencias_destino ON transferencias_recursos(tenant_destino_id, status)`);
    await run(`
      CREATE OR REPLACE FUNCTION app_concluir_transferencia(p_transferencia_id BIGINT, p_usuario_id BIGINT)
      RETURNS VOID LANGUAGE plpgsql AS $$
      DECLARE tr transferencias_recursos%ROWTYPE; item transferencia_recurso_itens%ROWTYPE; origem material_recebimentos%ROWTYPE;
      BEGIN
        SELECT * INTO tr FROM transferencias_recursos WHERE id = p_transferencia_id FOR UPDATE;
        IF NOT FOUND OR tr.status <> 'PENDENTE_DESTINO' THEN RAISE EXCEPTION 'Transferência não está pronta para conclusão'; END IF;
        IF tr.aprovada_destino_por IS DISTINCT FROM p_usuario_id THEN RAISE EXCEPTION 'Aprovação de destino inválida'; END IF;
        FOR item IN SELECT * FROM transferencia_recurso_itens WHERE transferencia_id = tr.id LOOP
          IF item.tipo_recurso = 'MATERIAL' THEN
            PERFORM set_config('app.tenant_id', tr.tenant_origem_id::TEXT, true);
            SELECT * INTO origem FROM material_recebimentos WHERE id = item.material_recebimento_origem_id FOR UPDATE;
            IF NOT FOUND OR origem.quantidade_reservada < item.quantidade THEN RAISE EXCEPTION 'Reserva de material indisponível'; END IF;
            UPDATE material_recebimentos SET quantidade_aprovada = quantidade_aprovada - item.quantidade,
              quantidade_reservada = quantidade_reservada - item.quantidade, atualizado_em = NOW() WHERE id = origem.id;
            PERFORM set_config('app.tenant_id', tr.tenant_destino_id::TEXT, true);
            INSERT INTO material_recebimentos (tenant_id, codigo, projeto_id, tipo_id, tipo_outro, codigo_material, nome_material,
              descricao, quantidade_recebida, unidade, recebido_em, recebido_por, fornecedor_id, fornecedor_nome, fabricante,
              nota_fiscal, lote, numero_serie, local_armazenamento, observacoes, dados_tecnicos, status, status_inspecao,
              quantidade_aprovada, criado_por, atualizado_por)
            VALUES (tr.tenant_destino_id, 'TRF-' || tr.id || '-' || item.id, item.projeto_destino_id, origem.tipo_id, origem.tipo_outro,
              origem.codigo_material, origem.nome_material, origem.descricao, item.quantidade, item.unidade, NOW(), p_usuario_id,
              origem.fornecedor_id, origem.fornecedor_nome, origem.fabricante, origem.nota_fiscal, origem.lote, origem.numero_serie,
              origem.local_armazenamento, 'Recebido pela transferência ' || tr.id, origem.dados_tecnicos, 'Aberto', origem.status_inspecao,
              item.quantidade, p_usuario_id, p_usuario_id);
          ELSE
            PERFORM set_config('app.tenant_id', tr.tenant_origem_id::TEXT, true);
            IF NOT EXISTS (SELECT 1 FROM almox_ferramentas WHERE id = item.ferramenta_origem_id FOR UPDATE) THEN
              RAISE EXCEPTION 'Ferramenta de origem indisponível';
            END IF;
            PERFORM set_config('app.tenant_id', tr.tenant_destino_id::TEXT, true);
            UPDATE almox_ferramentas SET tenant_id = tr.tenant_destino_id, projeto_id = item.projeto_destino_id, atualizado_em = NOW()
            WHERE id = item.ferramenta_origem_id;
          END IF;
        END LOOP;
        PERFORM set_config('app.tenant_id', tr.tenant_destino_id::TEXT, true);
        UPDATE transferencias_recursos SET status = 'CONCLUIDA', concluida_em = NOW() WHERE id = tr.id;
      END $$
    `);
    await run(`
      CREATE OR REPLACE FUNCTION app_rejeitar_transferencia(p_transferencia_id BIGINT, p_usuario_id BIGINT, p_motivo TEXT)
      RETURNS VOID LANGUAGE plpgsql AS $$
      DECLARE tr transferencias_recursos%ROWTYPE; item transferencia_recurso_itens%ROWTYPE; tenant_atual BIGINT;
      BEGIN
        tenant_atual := app_current_tenant_id();
        SELECT * INTO tr FROM transferencias_recursos WHERE id = p_transferencia_id FOR UPDATE;
        IF NOT FOUND OR tr.status NOT IN ('PENDENTE_ORIGEM','PENDENTE_DESTINO') THEN RAISE EXCEPTION 'Transferência não pode ser rejeitada'; END IF;
        IF tenant_atual <> tr.tenant_origem_id AND tenant_atual <> tr.tenant_destino_id THEN RAISE EXCEPTION 'Tenant sem acesso à transferência'; END IF;
        IF tr.status = 'PENDENTE_DESTINO' THEN
          PERFORM set_config('app.tenant_id', tr.tenant_origem_id::TEXT, true);
          FOR item IN SELECT * FROM transferencia_recurso_itens WHERE transferencia_id = tr.id AND tipo_recurso = 'MATERIAL' LOOP
            UPDATE material_recebimentos SET quantidade_reservada = GREATEST(0, quantidade_reservada - item.quantidade)
            WHERE id = item.material_recebimento_origem_id;
          END LOOP;
        END IF;
        PERFORM set_config('app.tenant_id', tenant_atual::TEXT, true);
        UPDATE transferencias_recursos SET status = 'REJEITADA', motivo = COALESCE(p_motivo, motivo) WHERE id = tr.id;
      END $$
    `);

    // RLS policies are created only on tables that exist in the deployed module.
    for (const table of tenantTables) {
      await run(`DO $$ BEGIN
        IF to_regclass('public.${table}') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY';
          EXECUTE 'ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY';
          EXECUTE 'DROP POLICY IF EXISTS ${table}_tenant_isolation ON public.${table}';
          EXECUTE 'CREATE POLICY ${table}_tenant_isolation ON public.${table} USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id)) WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))';
        END IF;
      END $$`);
    }
    for (const table of [...groupTables, 'insumos_catalogo']) {
      await run(`DO $$ BEGIN
        IF to_regclass('public.${table}') IS NOT NULL THEN
          EXECUTE 'ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY';
          EXECUTE 'ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY';
          EXECUTE 'DROP POLICY IF EXISTS ${table}_group_isolation ON public.${table}';
          EXECUTE 'CREATE POLICY ${table}_group_isolation ON public.${table} USING (grupo_id = app_current_group_id() AND app_has_tenant_access(app_current_tenant_id())) WITH CHECK (grupo_id = app_current_group_id() AND app_has_tenant_access(app_current_tenant_id()))';
        END IF;
      END $$`);
    }
    for (const table of ['transferencias_recursos', 'transferencia_recurso_itens']) {
      const expression = table === 'transferencias_recursos'
        ? '(grupo_id = app_current_group_id() AND (tenant_origem_id = app_current_tenant_id() OR tenant_destino_id = app_current_tenant_id()) AND app_has_tenant_access(app_current_tenant_id()))'
        : '(EXISTS (SELECT 1 FROM transferencias_recursos tr WHERE tr.id = transferencia_id))';
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_access ON ${table}`);
      await run(`CREATE POLICY ${table}_access ON ${table} USING ${expression} WITH CHECK ${expression}`);
    }
    // A tool changes tenant only inside app_concluir_transferencia. The normal
    // tenant policy validates the new row; this narrow policy makes the source
    // row addressable by the approved destination during that atomic move.
    await run(`DO $$ BEGIN
      IF to_regclass('public.almox_ferramentas') IS NOT NULL THEN
        DROP POLICY IF EXISTS almox_ferramentas_transfer_destination ON almox_ferramentas;
        CREATE POLICY almox_ferramentas_transfer_destination ON almox_ferramentas FOR UPDATE
          USING (EXISTS (
            SELECT 1 FROM transferencia_recurso_itens ti
            JOIN transferencias_recursos tr ON tr.id = ti.transferencia_id
            WHERE ti.ferramenta_origem_id = almox_ferramentas.id
              AND tr.status = 'PENDENTE_DESTINO'
              AND tr.tenant_destino_id = app_current_tenant_id()
              AND tr.grupo_id = app_current_group_id()
          ))
          WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id));
      END IF;
    END $$`);
  }
};
