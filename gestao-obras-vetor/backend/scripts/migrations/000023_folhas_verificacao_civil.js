const civilSections = [
  {
    title: 'Condições anteriores à execução',
    items: [
      'Projeto liberado e revisão correta disponível em campo',
      'Área liberada para execução',
      'Locação/topografia conferida',
      'Interferências identificadas',
      'Materiais conforme especificação',
      'Equipamentos e ferramentas adequados disponíveis',
      'Condições do terreno adequadas para execução'
    ]
  },
  {
    title: 'Escavação / valas',
    items: [
      'Localização conforme projeto', 'Fundo da vala regularizado', 'Presença de água',
      'Presença de rocha ou material inadequado', 'Interferências encontradas',
      'Escoramento ou talude, quando aplicável', 'Acondicionamento do material escavado'
    ]
  },
  {
    title: 'Fundações / bases / blocos',
    items: [
      'Locação conforme projeto', 'Cota de fundo', 'Lastro', 'Forma', 'Armadura',
      'Espaçamento da armadura', 'Cobrimento', 'Inserts', 'Chumbadores', 'Prumo',
      'Nivelamento', 'Dimensões', 'Limpeza antes da concretagem'
    ]
  },
  {
    title: 'Concretagem',
    items: [
      'Corpo de prova coletado', 'Adensamento realizado', 'Segregação aparente',
      'Acabamento superficial', 'Cura executada'
    ]
  },
  {
    title: 'Reaterro e compactação',
    items: [
      'Material aprovado', 'Vala limpa', 'Primeira camada executada corretamente',
      'Compactação realizada', 'Ensaio de compactação', 'Restauração do terreno'
    ]
  },
  {
    title: 'Drenagem',
    optional: true,
    items: [
      'Tubulação conforme projeto', 'Caixa de passagem', 'Canaleta', 'Elementos pré-moldados',
      'Integridade dos elementos', 'Desobstrução', 'Fluxo', 'Reaterro'
    ]
  }
];

const civilConfiguration = {
  version: 1,
  requiresNaJustification: true,
  sections: civilSections,
  measurementSections: [
    'ESCAVACAO', 'FUNDACOES', 'CONCRETAGEM', 'REATERRO_COMPACTACAO',
    'DRENAGEM', 'OBRAS_COMPLEMENTARES', 'INSPECAO_DIMENSIONAL'
  ],
  complementaryCategories: ['CERCAMENTO', 'PAVIMENTACAO', 'CANALETAS', 'BASES', 'CALCADAS', 'MEIO_FIO', 'OUTROS']
};

module.exports = {
  id: '000023_folhas_verificacao_civil',
  description: 'Adiciona FV-CIV com seções flexíveis, medições e tratamento de não conformidades',
  async up({ run }) {
    await run(`DO $$ DECLARE c text; BEGIN
      SELECT conname INTO c FROM pg_constraint WHERE conrelid='folhas_verificacao_modelos'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%ELETRICA%' LIMIT 1;
      IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE folhas_verificacao_modelos DROP CONSTRAINT %I', c); END IF;
    END $$`);
    await run(`ALTER TABLE folhas_verificacao_modelos ADD CONSTRAINT folhas_verificacao_modelos_tipo_folha_check CHECK (tipo_folha IN ('MONTAGEM','TORQUE','ELETRICA','CIVIL'))`);
    await run(`DO $$ DECLARE c text; BEGIN
      SELECT conname INTO c FROM pg_constraint WHERE conrelid='folhas_verificacao'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%ELETRICA%' LIMIT 1;
      IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE folhas_verificacao DROP CONSTRAINT %I', c); END IF;
    END $$`);
    await run(`ALTER TABLE folhas_verificacao ADD CONSTRAINT folhas_verificacao_tipo_folha_check CHECK (tipo_folha IN ('MONTAGEM','TORQUE','ELETRICA','CIVIL'))`);

    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_civil_registros (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      secao TEXT NOT NULL,
      categoria TEXT NOT NULL DEFAULT '',
      titulo TEXT,
      ordem INTEGER NOT NULL DEFAULT 0,
      dados JSONB NOT NULL DEFAULT '{}'::jsonb,
      criado_por BIGINT REFERENCES usuarios(id),
      atualizado_por BIGINT REFERENCES usuarios(id),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(folha_id, secao, categoria)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_nao_conformidades (
      id BIGSERIAL PRIMARY KEY,
      tenant_id BIGINT NOT NULL REFERENCES tenants(id),
      folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      resposta_id BIGINT REFERENCES folhas_verificacao_respostas(id) ON DELETE SET NULL,
      medicao_id BIGINT REFERENCES folhas_verificacao_medicoes(id) ON DELETE SET NULL,
      evidencia_id BIGINT REFERENCES folhas_verificacao_evidencias(id) ON DELETE SET NULL,
      descricao TEXT NOT NULL,
      localizacao TEXT,
      acao_imediata TEXT,
      responsavel_id BIGINT REFERENCES usuarios(id),
      prazo DATE,
      status TEXT NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO','EM_TRATAMENTO','RESOLVIDO')),
      observacao TEXT,
      dados JSONB NOT NULL DEFAULT '{}'::jsonb,
      criado_por BIGINT REFERENCES usuarios(id),
      atualizado_por BIGINT REFERENCES usuarios(id),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    for (const table of ['folhas_verificacao_civil_registros', 'folhas_verificacao_nao_conformidades']) {
      await run(`CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`);
      await run(`CREATE INDEX IF NOT EXISTS idx_${table}_folha ON ${table}(tenant_id, folha_id)`);
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await run(`CREATE POLICY ${table}_tenant_isolation ON ${table} USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id)) WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    }

    await run(`INSERT INTO folhas_verificacao_disciplinas (tenant_id,codigo,nome)
      SELECT id,'CIVIL','Civil' FROM tenants WHERE ativo=1 ON CONFLICT (tenant_id,codigo) DO NOTHING`);
    await run(`INSERT INTO folhas_verificacao_categorias (tenant_id,disciplina_id,codigo,nome)
      SELECT tenant_id,id,'EXECUCAO_CIVIL','Execução civil' FROM folhas_verificacao_disciplinas WHERE codigo='CIVIL'
      ON CONFLICT (tenant_id,disciplina_id,codigo) DO NOTHING`);
    await run(`INSERT INTO folhas_verificacao_modelos (tenant_id,categoria_id,codigo,nome,tipo_folha,descricao,configuracao,ativo)
      SELECT c.tenant_id,c.id,'FV-CIV-PADRAO','Verificação Civil','CIVIL',
        'Escavação, fundações, concretagem, compactação, drenagem e obras complementares',?::jsonb,TRUE
      FROM folhas_verificacao_categorias c
      JOIN folhas_verificacao_disciplinas d ON d.id=c.disciplina_id
      WHERE d.codigo='CIVIL' AND c.codigo='EXECUCAO_CIVIL'
      ON CONFLICT (tenant_id,codigo) DO UPDATE SET nome=EXCLUDED.nome,descricao=EXCLUDED.descricao,configuracao=EXCLUDED.configuracao,ativo=TRUE,atualizado_em=NOW()`, [JSON.stringify(civilConfiguration)]);
  }
};
