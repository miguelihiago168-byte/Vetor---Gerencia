// Tenant provisioning for the single PostgreSQL database. A tenant is a legal
// entity (CNPJ), never a schema or a copied database.
const { pool, getQueryMain } = require('../config/database');

const createTenantError = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details });

const assertTenantReady = async (tenantId) => {
  const tenant = await getQueryMain(
    'SELECT id, grupo_id, ativo FROM tenants WHERE id = ? AND ativo = 1',
    [Number(tenantId)]
  );
  if (!tenant) throw createTenantError('TENANT_INACTIVE', 'Tenant inativo ou inexistente.');
  if (!tenant.grupo_id) throw createTenantError('TENANT_GROUP_MISSING', 'Tenant sem grupo empresarial.');
  return tenant;
};

const provisionTrialTenant = async ({ tenantName, tenantSlug, trialExpiresAt, login, passwordHash, name, email }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const groupResult = await client.query(
      'INSERT INTO grupos_empresariais (nome, ativo) VALUES ($1, true) RETURNING id',
      [tenantName]
    );
    const grupoId = Number(groupResult.rows[0].id);
    const tenantResult = await client.query(
      `INSERT INTO tenants (grupo_id, nome, slug, ativo, trial_expires_at, trial_ativo)
       VALUES ($1, $2, $3, 0, $4, $5) RETURNING id`,
      [grupoId, tenantName, tenantSlug, trialExpiresAt || null, trialExpiresAt ? 1 : 0]
    );
    const tenantId = Number(tenantResult.rows[0].id);
    const userResult = await client.query(
      `INSERT INTO usuarios (login, senha, nome, email, perfil, funcao, setor, is_gestor, is_adm, ativo, primeiro_acesso_pendente)
       VALUES ($1, $2, $3, $4, 'Gestor Geral', 'Gestor Geral', 'Administrativo', 1, 0, 1, 1)
       RETURNING id`,
      [login, passwordHash, name, email]
    );
    const userId = Number(userResult.rows[0].id);
    await client.query(
      'INSERT INTO usuario_tenants (usuario_id, tenant_id, ativo, tenant_padrao) VALUES ($1, $2, 1, true)',
      [userId, tenantId]
    );
    await client.query('UPDATE tenants SET ativo = 1 WHERE id = $1', [tenantId]);
    // Standard verification models are tenant-owned snapshots. Provisioning is
    // idempotent and remains compatible with installations before migration 18.
    const folhasSchema = await client.query("SELECT to_regclass('public.folhas_verificacao_disciplinas') AS table_name");
    if (folhasSchema.rows[0]?.table_name) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
      await client.query("SELECT set_config('app.group_id', $1, true)", [String(grupoId)]);
      await client.query("SELECT set_config('app.role', 'Gestor Geral', true)");
      const discipline = await client.query(`INSERT INTO folhas_verificacao_disciplinas (tenant_id,codigo,nome) VALUES ($1,'MONTAGEM','Montagem') ON CONFLICT (tenant_id,codigo) DO UPDATE SET nome=EXCLUDED.nome RETURNING id`, [tenantId]);
      const disciplineId = Number(discipline.rows[0].id);
      const category = await client.query(`INSERT INTO folhas_verificacao_categorias (tenant_id,disciplina_id,codigo,nome) VALUES ($1,$2,'ESTRUTURAS','Estruturas') ON CONFLICT (tenant_id,disciplina_id,codigo) DO UPDATE SET nome=EXCLUDED.nome RETURNING id`, [tenantId, disciplineId]);
      const categoryId = Number(category.rows[0].id);
      await client.query(`INSERT INTO folhas_verificacao_modelos (tenant_id,categoria_id,codigo,nome,tipo_folha,configuracao,criado_por) VALUES
        ($1,$2,'FV-MON-PADRAO','Montagem de Estruturas','MONTAGEM','{"requiresNaJustification":true,"sections":[{"title":"Recebimento e materiais","items":["Material conforme projeto","Fixadores corretos","Certificados disponíveis"]},{"title":"Base, montagem e condição final","items":["Locação, nível e alinhamento verificados","Componentes e travamentos completos","Estrutura liberada para próxima atividade"]}]}'::jsonb,$3),
        ($1,$2,'FV-TOR-PADRAO','Controle de Torque','TORQUE','{"requiresInstrument":true,"requiresCalibration":true,"sections":[{"title":"Verificações preliminares","items":["Projeto ou procedimento disponível","Calibração válida","Faixa do instrumento adequada"]}]}'::jsonb,$3)
        ON CONFLICT (tenant_id,codigo) DO NOTHING`, [tenantId, categoryId, userId]);
      await client.query(`UPDATE folhas_verificacao_modelos SET descricao = CASE WHEN tipo_folha='TORQUE' THEN 'Modelo padrao para controle de torque e rastreabilidade do instrumento.' ELSE 'Modelo padrao para inspecao da montagem de estruturas.' END,
        configuracao = configuracao || CASE WHEN tipo_folha='TORQUE' THEN '{"exemplo":"Parafuso M12 | nominal 75 N.m | limites 71,25 a 78,75 N.m | medicao 75 N.m = Conforme.","instrucoes":["Informe fixador, torque nominal, tolerancia, documento e revisao.","Selecione o torquimetro e confira faixa e validade da calibracao.","Registre cada ponto e o valor medido.","Compare a medicao com os limites.","Anexe certificado, fotos e evidencias antes da aprovacao."]}'::jsonb ELSE '{"exemplo":"String 01_02_03 | Inversor 01 | montagem conforme projeto, alinhamento e fixadores verificados.","instrucoes":["Identifique obra, lote, EAP e area.","Informe populacao e amostra prevista.","Marque Conforme, Nao conforme ou Nao aplicavel com justificativa.","Anexe fotos e documentos quando necessarios.","Assine e envie para aprovacao."]}'::jsonb END,
        atualizado_em=NOW() WHERE tenant_id=$1 AND codigo IN ('FV-MON-PADRAO','FV-TOR-PADRAO')`, [tenantId]);
    }
    await client.query('COMMIT');
    return { tenantId, userId, grupoId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

// Compatibility aliases for callers from the former schema-per-tenant code.
const createTenantSchema = async () => 'public';
const createTenantDatabaseFromCleanSchema = createTenantSchema;

module.exports = {
  createTenantError,
  assertTenantReady,
  provisionTrialTenant,
  createTenantSchema,
  createTenantDatabaseFromCleanSchema,
};
