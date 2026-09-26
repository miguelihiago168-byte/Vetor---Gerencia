const electricalSections = [
  { title: 'Documentação, materiais e segurança', items: ['Projeto disponível', 'Diagrama disponível', 'Lista de cabos disponível', 'Revisão correta', 'Procedimento disponível', 'APR verificada', 'Bloqueio e etiquetagem', 'Ausência de tensão confirmada', 'Área sinalizada', 'Materiais correspondentes ao projeto', 'Cabos com tipo, classe de tensão, seção e isolação corretos', 'Componentes certificados', 'Lote do material registrado', 'Instrumentos aptos e com calibração válida', 'Condições ambientais adequadas'] },
  { title: 'Lançamento de cabos', items: ['Rota conforme projeto', 'Origem e destino corretos', 'Separação entre potência, controle e telecomunicações', 'Distância entre circuitos', 'Raio de curvatura e esforço de tração atendidos', 'Cabo sem esmagamento, cortes ou abrasão', 'Isolação preservada', 'Suportação, fixação e ocupação adequadas', 'Proteções contra água, umidade, UV e impacto', 'Identificação nas extremidades e intermediária', 'Reserva técnica, vedação e selagem corta-fogo', 'Limpeza do trecho'] },
  { title: 'Conexões, terminações e emendas', items: ['Condutor preparado sem danos', 'Decapagem e crimpagem corretas', 'Terminal, conector, matriz e ferramenta compatíveis', 'Fases, polaridade, sequência, cores e TAGs conferidos', 'Isolação, termorretrátil, prensa-cabo e alívio de tensão aplicados', 'Grau IP e afastamentos elétricos preservados', 'Emenda autorizada pelo projeto', 'Acabamento satisfatório'] },
  { title: 'Quadros, painéis e equipamentos', items: ['Equipamento correspondente ao projeto', 'Fabricante, modelo e série registrados', 'Posição, fixação, nível, prumo, acessibilidade e afastamentos', 'Portas, IP, vedações, entradas e prensa-cabos', 'Disjuntores, fusíveis, DR/RCD, DPS/SPD, relés, contatores e barramentos', 'Aterramentos, cablagem, canaletas, bornes e circuitos identificados', 'Placas, avisos, diagrama, limpeza e intertravamentos verificados'] },
  { title: 'Aterramento e equipotencialização', items: ['Condutor de proteção instalado e dimensionado', 'Cor, identificação e continuidade do PE', 'Estruturas, carcaças, portas e painéis conectados', 'Conexão à malha e terminais adequados', 'Proteção contra corrosão e pontos acessíveis', 'DPS/SPD e SPDA conectados quando aplicáveis', 'Resistência de aterramento medida conforme critério do projeto ou procedimento'] }
];

const specificSections = {
  FOTOVOLTAICA: ['Polaridade e identificação das strings', 'Cabos CC e conectores compatíveis', 'Crimpagem e acoplamento completos', 'Sem conectores de fabricantes incompatíveis', 'Proteção UV e cabos sem contato indevido com estruturas', 'Entradas de inversores e combiner boxes', 'Isolação e tensão das strings', 'Aterramento de módulos, estruturas e inversores'],
  SUBESTACAO: ['Separação entre potência, controle e proteção', 'Circuitos e polaridade de TC/TP', 'Secundários de TC protegidos contra abertura', 'Terminações de média e alta tensão', 'Transformadores, comando, trip, relés e intertravamentos', 'Canaletas, valas, selagens corta-fogo e malha de aterramento', 'Cabos de controle identificados'],
  LINHA_TRANSMISSAO: ['Aterramento e continuidade da torre', 'Cabos de descida, fixação, jumpers e conexões flexíveis', 'Distâncias de segurança e proteção das travessias', 'Caixas, circuitos auxiliares, sinalização e identificação da torre', 'Conexão ao sistema de aterramento'],
  PREDIAL_INDUSTRIAL: ['Cores e seção dos condutores', 'Eletrodutos, eletrocalhas e taxa de ocupação', 'Quadros, disjuntores, DR/RCD e DPS/SPD', 'Tomadas, interruptores, iluminação e emergência', 'Separação de neutro e PE', 'Identificação dos circuitos e testes funcionais']
};

module.exports = {
  id: '000021_folhas_verificacao_eletrica',
  description: 'Adiciona FV-ELE, disciplinas internas e rastreabilidade elétrica',
  async up({ run, get }) {
    // As constraints were created without stable names in 000018; locate them
    // by definition so this migration is safe for every PostgreSQL installation.
    await run(`DO $$ DECLARE c text; BEGIN
      SELECT conname INTO c FROM pg_constraint WHERE conrelid='folhas_verificacao_modelos'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%MONTAGEM%' AND pg_get_constraintdef(oid) LIKE '%TORQUE%' LIMIT 1;
      IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE folhas_verificacao_modelos DROP CONSTRAINT %I', c); END IF;
    END $$`);
    await run(`ALTER TABLE folhas_verificacao_modelos ADD CONSTRAINT folhas_verificacao_modelos_tipo_folha_check CHECK (tipo_folha IN ('MONTAGEM','TORQUE','ELETRICA'))`);
    await run(`DO $$ DECLARE c text; BEGIN
      SELECT conname INTO c FROM pg_constraint WHERE conrelid='folhas_verificacao'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%MONTAGEM%' AND pg_get_constraintdef(oid) LIKE '%TORQUE%' LIMIT 1;
      IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE folhas_verificacao DROP CONSTRAINT %I', c); END IF;
    END $$`);
    await run(`ALTER TABLE folhas_verificacao ADD CONSTRAINT folhas_verificacao_tipo_folha_check CHECK (tipo_folha IN ('MONTAGEM','TORQUE','ELETRICA'))`);

    await run('ALTER TABLE almox_ferramentas ADD COLUMN IF NOT EXISTS numero_serie TEXT');
    await run('ALTER TABLE almox_ferramentas ADD COLUMN IF NOT EXISTS faixa_minima NUMERIC(18,6)');
    await run('ALTER TABLE almox_ferramentas ADD COLUMN IF NOT EXISTS faixa_maxima NUMERIC(18,6)');
    await run('ALTER TABLE almox_ferramentas ADD COLUMN IF NOT EXISTS certificado_calibracao TEXT');
    await run('ALTER TABLE almox_ferramentas ADD COLUMN IF NOT EXISTS calibracao_valida_ate DATE');

    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_eletrica_circuitos (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      ponto_id BIGINT REFERENCES folhas_verificacao_pontos(id) ON DELETE SET NULL, tag TEXT NOT NULL, origem TEXT, destino TEXT, sistema_eletrico TEXT,
      classe_tensao TEXT, tensao_nominal NUMERIC(18,6), corrente_nominal NUMERIC(18,6), rota TEXT, trecho TEXT, dados JSONB NOT NULL DEFAULT '{}'::jsonb,
      resultado TEXT NOT NULL DEFAULT 'PENDENTE', bloqueado BOOLEAN NOT NULL DEFAULT FALSE, criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(folha_id, tag)
    )`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_eletrica_cabos (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      circuito_id BIGINT NOT NULL REFERENCES folhas_verificacao_eletrica_circuitos(id) ON DELETE CASCADE, tipo_cabo TEXT, fabricante TEXT, lote TEXT, material_condutor TEXT,
      numero_condutores INTEGER, secao NUMERIC(18,6), classe_tensao TEXT, comprimento_previsto NUMERIC(18,6), comprimento_lancado NUMERIC(18,6), metodo_instalacao TEXT, dados JSONB NOT NULL DEFAULT '{}'::jsonb,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_eletrica_equipamentos (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      circuito_id BIGINT REFERENCES folhas_verificacao_eletrica_circuitos(id) ON DELETE SET NULL, tag TEXT, nome TEXT NOT NULL, fabricante TEXT, modelo TEXT, numero_serie TEXT, localizacao TEXT,
      dados JSONB NOT NULL DEFAULT '{}'::jsonb, resultado TEXT NOT NULL DEFAULT 'PENDENTE', bloqueado BOOLEAN NOT NULL DEFAULT FALSE, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_eletrica_conexoes (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      circuito_id BIGINT REFERENCES folhas_verificacao_eletrica_circuitos(id) ON DELETE SET NULL, equipamento_id BIGINT REFERENCES folhas_verificacao_eletrica_equipamentos(id) ON DELETE SET NULL,
      ponto_conexao TEXT NOT NULL, componente TEXT, fixador TEXT, dados JSONB NOT NULL DEFAULT '{}'::jsonb, resultado TEXT NOT NULL DEFAULT 'PENDENTE', criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_eletrica_torques (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      conexao_id BIGINT REFERENCES folhas_verificacao_eletrica_conexoes(id) ON DELETE SET NULL, ponto_conexao TEXT NOT NULL, componente TEXT, fixador TEXT,
      torque_especificado NUMERIC(18,6) NOT NULL, unidade TEXT NOT NULL, tolerancia NUMERIC(18,6), limite_inferior NUMERIC(18,6) NOT NULL, limite_superior NUMERIC(18,6) NOT NULL,
      torque_aplicado NUMERIC(18,6), instrumento_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, selo TEXT, resultado TEXT NOT NULL DEFAULT 'PENDENTE', observacao TEXT, criado_por BIGINT REFERENCES usuarios(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await run(`CREATE TABLE IF NOT EXISTS folhas_verificacao_eletrica_ensaios (
      id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), folha_id BIGINT NOT NULL REFERENCES folhas_verificacao(id) ON DELETE CASCADE,
      circuito_id BIGINT REFERENCES folhas_verificacao_eletrica_circuitos(id) ON DELETE SET NULL, equipamento_id BIGINT REFERENCES folhas_verificacao_eletrica_equipamentos(id) ON DELETE SET NULL,
      tipo TEXT NOT NULL, procedimento TEXT, instrumento_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb, realizado_em TIMESTAMPTZ, tensao_ensaio NUMERIC(18,6), duracao TEXT,
      criterio TEXT, limite_inferior NUMERIC(18,6), limite_superior NUMERIC(18,6), valor_medido NUMERIC(18,6), unidade TEXT, resultado TEXT NOT NULL DEFAULT 'PENDENTE', responsavel_id BIGINT REFERENCES usuarios(id), observacao TEXT, dados JSONB NOT NULL DEFAULT '{}'::jsonb, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    const electricalTables = ['folhas_verificacao_eletrica_circuitos','folhas_verificacao_eletrica_cabos','folhas_verificacao_eletrica_equipamentos','folhas_verificacao_eletrica_conexoes','folhas_verificacao_eletrica_torques','folhas_verificacao_eletrica_ensaios'];
    for (const table of electricalTables) {
      await run(`CREATE INDEX IF NOT EXISTS idx_${table}_folha ON ${table}(tenant_id, folha_id)`);
      await run(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await run(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await run(`DROP POLICY IF EXISTS ${table}_tenant_isolation ON ${table}`);
      await run(`CREATE POLICY ${table}_tenant_isolation ON ${table} USING (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id)) WITH CHECK (tenant_id = app_current_tenant_id() AND app_has_tenant_access(tenant_id))`);
    }

    await run(`INSERT INTO folhas_verificacao_disciplinas (tenant_id,codigo,nome) SELECT id,'ELETRICA','Elétrica' FROM tenants WHERE ativo=1 ON CONFLICT (tenant_id,codigo) DO NOTHING`);
    await run(`INSERT INTO folhas_verificacao_disciplinas (tenant_id,codigo,nome) SELECT id,'CIVIL','Civil' FROM tenants WHERE ativo=1 ON CONFLICT (tenant_id,codigo) DO NOTHING`);
    await run(`INSERT INTO folhas_verificacao_categorias (tenant_id,disciplina_id,codigo,nome) SELECT tenant_id,id,'GERAL','Elétrica geral' FROM folhas_verificacao_disciplinas WHERE codigo='ELETRICA' ON CONFLICT (tenant_id,disciplina_id,codigo) DO NOTHING`);
    await run(`INSERT INTO folhas_verificacao_categorias (tenant_id,disciplina_id,codigo,nome) SELECT tenant_id,id,'FUTUROS_MODELOS','Modelos futuros' FROM folhas_verificacao_disciplinas WHERE codigo='CIVIL' ON CONFLICT (tenant_id,disciplina_id,codigo) DO NOTHING`);
    const configuration = { version: 1, empreendimentoTipos: ['USINA_GERACAO','FOTOVOLTAICA','SUBESTACAO','LINHA_TRANSMISSAO','INDUSTRIAL','PREDIAL'], sections: electricalSections, requisitosEspecificos: specificSections };
    await run(`INSERT INTO folhas_verificacao_modelos (tenant_id,categoria_id,codigo,nome,tipo_folha,descricao,configuracao,ativo)
      SELECT c.tenant_id,c.id,'FV-ELE-PADRAO','FV-ELE — Folha de Verificação Elétrica Geral','ELETRICA','Modelo elétrico geral com requisitos adaptáveis ao tipo de empreendimento',?::jsonb,TRUE FROM folhas_verificacao_categorias c JOIN folhas_verificacao_disciplinas d ON d.id=c.disciplina_id WHERE d.codigo='ELETRICA' AND c.codigo='GERAL' ON CONFLICT (tenant_id,codigo) DO UPDATE SET configuracao=EXCLUDED.configuracao, descricao=EXCLUDED.descricao, ativo=TRUE`, [JSON.stringify(configuration)]);
    await run(`UPDATE folhas_verificacao_modelos SET ativo=FALSE WHERE tipo_folha='TORQUE' AND codigo='FV-TOR-PADRAO'`);
    await run(`UPDATE folhas_verificacao_modelos SET configuracao=configuracao || ?::jsonb, atualizado_em=NOW() WHERE tipo_folha='MONTAGEM' AND codigo='FV-MON-PADRAO'`, [JSON.stringify({ torqueIntegrado: true, instrucoesTorque: 'O torque estrutural deve ser registrado nesta FV-MON quando aplicável; não crie uma folha de torque separada.' })]);

    // Mirror the versioned FV-ELE configuration in the generic model hierarchy.
    const models = await get(`SELECT id,tenant_id FROM folhas_verificacao_modelos WHERE codigo='FV-ELE-PADRAO' LIMIT 1`);
    if (models) for (let sectionIndex = 0; sectionIndex < electricalSections.length; sectionIndex += 1) {
      const section = electricalSections[sectionIndex];
      await run(`INSERT INTO folhas_verificacao_modelo_secoes (tenant_id,modelo_id,titulo,ordem,configuracao) VALUES (?,?,?,?,?::jsonb) ON CONFLICT DO NOTHING`, [models.tenant_id, models.id, section.title, sectionIndex, '{}']);
      const saved = await get(`SELECT id FROM folhas_verificacao_modelo_secoes WHERE modelo_id=? AND titulo=?`, [models.id, section.title]);
      for (let itemIndex = 0; itemIndex < section.items.length; itemIndex += 1) await run(`INSERT INTO folhas_verificacao_modelo_itens (tenant_id,secao_id,chave,rotulo,tipo_resposta,obrigatorio,escopo,ordem,configuracao) VALUES (?,?,?,?,?,?,?,?,?::jsonb) ON CONFLICT DO NOTHING`, [models.tenant_id, saved.id, `ele-${sectionIndex}-${itemIndex}`, section.items[itemIndex], 'CHECKLIST', true, 'FOLHA', itemIndex, '{}']);
    }
  }
};
