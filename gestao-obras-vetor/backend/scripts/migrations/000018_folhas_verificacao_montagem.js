module.exports = {
  id: '000018_folhas_verificacao_montagem',
  description: 'Cria o módulo genérico de folhas de verificação para montagem e torque',
  async up({ run }) {
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_disciplinas (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), codigo TEXT NOT NULL, nome TEXT NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id, codigo))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_categorias (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), disciplina_id BIGINT NOT NULL REFERENCES folhas_verificacao_disciplinas(id), codigo TEXT NOT NULL, nome TEXT NOT NULL, ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id, disciplina_id, codigo))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_modelos (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), categoria_id BIGINT NOT NULL REFERENCES folhas_verificacao_categorias(id), codigo TEXT NOT NULL, nome TEXT NOT NULL,
      tipo_folha TEXT NOT NULL CHECK (tipo_folha IN ('MONTAGEM','TORQUE')), descricao TEXT, configuracao JSONB NOT NULL DEFAULT '{}'::jsonb, ativo BOOLEAN NOT NULL DEFAULT TRUE,
      criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(tenant_id, codigo))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_modelo_secoes (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), modelo_id BIGINT NOT NULL REFERENCES folhas_verificacao_modelos(id) ON DELETE CASCADE, titulo TEXT NOT NULL, ordem INTEGER NOT NULL DEFAULT 0, configuracao JSONB NOT NULL DEFAULT '{}'::jsonb)`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_modelo_itens (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), secao_id BIGINT NOT NULL REFERENCES folhas_verificacao_modelo_secoes(id) ON DELETE CASCADE, chave TEXT NOT NULL, rotulo TEXT NOT NULL,
      tipo_resposta TEXT NOT NULL, obrigatorio BOOLEAN NOT NULL DEFAULT FALSE, escopo TEXT NOT NULL DEFAULT 'PONTO' CHECK (escopo IN ('FOLHA','PONTO')), ordem INTEGER NOT NULL DEFAULT 0, configuracao JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE(secao_id, chave))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_sequencias (
      tenant_id BIGINT NOT NULL REFERENCES tenants(id), projeto_id BIGINT NOT NULL, tipo_folha TEXT NOT NULL, ultimo_numero BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY(tenant_id, projeto_id, tipo_folha))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), projeto_id BIGINT NOT NULL, modelo_id BIGINT REFERENCES folhas_verificacao_modelos(id), tipo_folha TEXT NOT NULL CHECK (tipo_folha IN ('MONTAGEM','TORQUE')),
      numero TEXT NOT NULL, revisao INTEGER NOT NULL DEFAULT 1, versao INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'RASCUNHO', resultado_lote TEXT NOT NULL DEFAULT 'PENDENTE',
      empresa_responsavel_snapshot JSONB, empresa_executante_snapshot JSONB, equipe_snapshot JSONB, identificacao JSONB NOT NULL DEFAULT '{}'::jsonb, modelo_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      populacao_total INTEGER, unidade_populacao TEXT, amostra_prevista INTEGER, criterio_aceitacao TEXT, maximo_nc INTEGER NOT NULL DEFAULT 0, resumo JSONB NOT NULL DEFAULT '{}'::jsonb,
      rdo_id BIGINT, atividade_eap_id BIGINT, folha_origem_id BIGINT REFERENCES folhas_verificacao(id), criado_por BIGINT NOT NULL REFERENCES usuarios(id), atualizado_por BIGINT REFERENCES usuarios(id),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), enviado_em TIMESTAMPTZ, aprovado_em TIMESTAMPTZ, aprovado_por BIGINT REFERENCES usuarios(id),
      UNIQUE(tenant_id, projeto_id, tipo_folha, numero, revisao))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_pontos (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE, identificacao TEXT NOT NULL, localizacao TEXT,
      responsavel_id BIGINT REFERENCES usuarios(id), status_montagem TEXT NOT NULL DEFAULT 'PENDENTE', status_torque TEXT NOT NULL DEFAULT 'NAO_APLICAVEL', resultado TEXT NOT NULL DEFAULT 'PENDENTE', liberado BOOLEAN NOT NULL DEFAULT FALSE,
      dados JSONB NOT NULL DEFAULT '{}'::jsonb, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(folha_id, identificacao))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_respostas (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE, ponto_id BIGINT REFERENCES folhas_verificacao_pontos(id) ON DELETE CASCADE,
      modelo_item_id BIGINT REFERENCES folhas_verificacao_modelo_itens(id), item_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, resultado TEXT NOT NULL DEFAULT 'PENDENTE', valor_texto TEXT, valor_numero NUMERIC(18,6),
      justificativa TEXT, observacao TEXT, responsavel_id BIGINT REFERENCES usuarios(id), prazo_correcao DATE, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_medicoes (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE, ponto_id BIGINT REFERENCES folhas_verificacao_pontos(id) ON DELETE SET NULL,
      resposta_id BIGINT REFERENCES folhas_verificacao_respostas(id) ON DELETE SET NULL, numero_ponto INTEGER, localizacao TEXT, elemento TEXT, identificacao_fixador TEXT,
      requisito_nominal NUMERIC(18,6), limite_inferior NUMERIC(18,6), limite_superior NUMERIC(18,6), valor_medido NUMERIC(18,6), unidade TEXT, resultado TEXT NOT NULL DEFAULT 'PENDENTE', selo_torque TEXT,
      observacao TEXT, dados_extras JSONB NOT NULL DEFAULT '{}'::jsonb, medido_em TIMESTAMPTZ, responsavel_id BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_torque_config (
      folha_id BIGINT PRIMARY KEY REFERENCES folhas_verificacao(id) ON DELETE CASCADE, tenant_id BIGINT NOT NULL REFERENCES tenants(id), tipo_ligacao TEXT, componente TEXT, fixador TEXT, classe_material TEXT,
      condicao_montagem TEXT, torque_esperado NUMERIC(18,6) NOT NULL, unidade TEXT NOT NULL, tipo_tolerancia TEXT NOT NULL, tolerancia NUMERIC(18,6), limite_inferior NUMERIC(18,6) NOT NULL,
      limite_superior NUMERIC(18,6) NOT NULL, metodo_verificacao TEXT, fonte_requisito TEXT, documento_referencia TEXT, revisao_documento TEXT,
      instrumento_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, liberacao_excepcional JSONB)`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_evidencias (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), projeto_id BIGINT NOT NULL, folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      medicao_id BIGINT REFERENCES folhas_verificacao_medicoes(id) ON DELETE CASCADE, resposta_id BIGINT REFERENCES folhas_verificacao_respostas(id) ON DELETE CASCADE, categoria TEXT NOT NULL, nome_arquivo TEXT NOT NULL,
      caminho_arquivo TEXT NOT NULL, tipo TEXT, tamanho BIGINT, descricao TEXT, localizacao JSONB, criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_reinspecoes (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id), medicao_original_id BIGINT REFERENCES folhas_verificacao_medicoes(id), resposta_original_id BIGINT REFERENCES folhas_verificacao_respostas(id),
      acao_executada TEXT NOT NULL, valor_corrigido NUMERIC(18,6), instrumento_snapshot JSONB, executado_por BIGINT NOT NULL REFERENCES usuarios(id), executado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), dados JSONB NOT NULL DEFAULT '{}'::jsonb)`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_vinculos (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_origem_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE, folha_destino_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      tipo_vinculo TEXT NOT NULL, obrigatorio BOOLEAN NOT NULL DEFAULT FALSE, bloqueia_liberacao BOOLEAN NOT NULL DEFAULT FALSE, criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(folha_origem_id, folha_destino_id, tipo_vinculo), CHECK(folha_origem_id <> folha_destino_id))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_rncs (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE, rnc_id BIGINT NOT NULL REFERENCES rnc(id), dados_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(folha_id), UNIQUE(rnc_id))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_assinaturas (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE, tipo TEXT NOT NULL CHECK(tipo IN ('EXECUTANTE','INSPETOR','APROVADOR')),
      usuario_id BIGINT NOT NULL REFERENCES usuarios(id), nome_snapshot TEXT NOT NULL, perfil_snapshot TEXT, assinatura_snapshot TEXT, versao_folha INTEGER NOT NULL, ip TEXT, assinado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(folha_id, tipo, versao_folha))`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_historico (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE, acao TEXT NOT NULL, status_anterior TEXT, status_novo TEXT,
      dados JSONB NOT NULL DEFAULT '{}'::jsonb, usuario_id BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const tables = ['folhas_verificacao_disciplinas','folhas_verificacao_categorias','folhas_verificacao_modelos','folhas_verificacao_modelo_secoes','folhas_verificacao_modelo_itens','folhas_verificacao_sequencias','folhas_verificacao','folhas_verificacao_pontos','folhas_verificacao_respostas','folhas_verificacao_medicoes','folhas_verificacao_torque_config','folhas_verificacao_evidencias','folhas_verificacao_reinspecoes','folhas_verificacao_vinculos','folhas_verificacao_rncs','folhas_verificacao_assinaturas','folhas_verificacao_historico'];
    for (const table of tables) {
      await run(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await run(`CREATE POLICY ${table}_tenant_isolation ON ${table} USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id)) WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    }
    await run('CREATE INDEX IF NOT EXISTS idx_folhas_projeto_status ON folhas_verificacao(tenant_id, projeto_id, status, criado_em DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_folhas_medicoes_folha ON folhas_verificacao_medicoes(tenant_id, folha_id, resultado)');
    await run('CREATE INDEX IF NOT EXISTS idx_folhas_evidencias_folha ON folhas_verificacao_evidencias(tenant_id, folha_id)');
    await run(`INSERT INTO folhas_verificacao_disciplinas (tenant_id, codigo, nome)
      SELECT id, 'MONTAGEM', 'Montagem' FROM tenants WHERE ativo = 1 ON CONFLICT (tenant_id, codigo) DO NOTHING`);
    await run(`INSERT INTO folhas_verificacao_categorias (tenant_id, disciplina_id, codigo, nome)
      SELECT d.tenant_id, d.id, 'ESTRUTURAS', 'Estruturas' FROM folhas_verificacao_disciplinas d WHERE d.codigo = 'MONTAGEM' ON CONFLICT (tenant_id, disciplina_id, codigo) DO NOTHING`);
    await run(`INSERT INTO folhas_verificacao_modelos (tenant_id, categoria_id, codigo, nome, tipo_folha, configuracao)
      SELECT c.tenant_id, c.id, 'FV-MON-PADRAO', 'Montagem de Estruturas', 'MONTAGEM', '{"requireTorqueLink":false,"requiresNaJustification":true,"sections":[{"title":"Recebimento e materiais","items":["Material conforme projeto","Fabricante e modelo corretos","Perfis sem deformações, trincas ou corrosão","Fixadores, porcas e arruelas corretos","Certificados e documentos disponíveis"]},{"title":"Base e posicionamento","items":["Locação, orientação e espaçamento conforme projeto","Nível, alinhamento, prumo e cotas verificados","Base ou fundação liberada","Chumbadores corretamente posicionados","Interferências e condições do terreno avaliadas"]},{"title":"Montagem dos componentes","items":["Sequência de montagem respeitada","Componentes e perfis na posição correta","Travamentos, emendas e suportes completos","Fixadores completamente instalados","Sem adaptações não autorizadas ou peças forçadas"]},{"title":"Fixações e condição final","items":["Classe e diâmetro dos fixadores corretos","Selo de torque aplicado quando exigido","Estrutura estável e área limpa","Acesso seguro e resíduos removidos","Estrutura liberada para próxima atividade"]}]}'::jsonb
      FROM folhas_verificacao_categorias c WHERE c.codigo='ESTRUTURAS' ON CONFLICT (tenant_id, codigo) DO NOTHING`);
    await run(`INSERT INTO folhas_verificacao_modelos (tenant_id, categoria_id, codigo, nome, tipo_folha, configuracao)
      SELECT c.tenant_id, c.id, 'FV-TOR-PADRAO', 'Controle de Torque', 'TORQUE', '{"requiresInstrument":true,"requiresCalibration":true,"sections":[{"title":"Verificações preliminares","items":["Projeto ou procedimento disponível","Revisão do documento conferida","APR verificada e equipe orientada","Torquímetro apto e calibração válida","Faixa do instrumento adequada","Fixadores sem corrosão, danos ou roscas sujas","Condição de montagem confirmada"]}]}'::jsonb
      FROM folhas_verificacao_categorias c WHERE c.codigo='ESTRUTURAS' ON CONFLICT (tenant_id, codigo) DO NOTHING`);
  }
};
