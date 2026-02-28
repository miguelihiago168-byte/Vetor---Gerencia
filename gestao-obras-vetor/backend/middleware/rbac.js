const { getQuery, allQuery, runQuery } = require('../config/database');
const { PERFIS, inferirPerfil } = require('../constants/access');

let schemaReadyPromise = null;

const PERMISSIONS = {
  USERS_MANAGE: 'users.manage',
  USERS_VIEW: 'users.view',
  PROJECT_VIEW: 'project.view',
  RDO_VIEW: 'rdo.view',
  RDO_APPROVE: 'rdo.approve',
  RNC_VIEW: 'rnc.view',
  CURVE_S_VIEW: 'curve_s.view',
  EAP_VIEW: 'eap.view',
  PURCHASE_VIEW: 'purchase.view',
  PURCHASE_CREATE: 'purchase.create',
  PURCHASE_APPROVE: 'purchase.approve',
  PURCHASE_FINANCE: 'purchase.finance',
  ASSETS_MANAGE: 'assets.manage',
  ASSETS_VIEW: 'assets.view',
  // Módulo de Requisições (compras multi-itens)
  REQUISICAO_VIEW:            'requisicao.view',
  REQUISICAO_CREATE:          'requisicao.create',
  REQUISICAO_ANALYZE_ITEM:    'requisicao.analyze_item',
  REQUISICAO_ADD_COTACAO:     'requisicao.add_cotacao',
  REQUISICAO_SELECT_SUPPLIER: 'requisicao.select_supplier',
  REQUISICAO_MARK_BOUGHT:     'requisicao.mark_bought',
  FORNECEDOR_MANAGE:          'fornecedor.manage'
};

const permissionMatrix = {
  [PERMISSIONS.USERS_MANAGE]: [PERFIS.GESTOR_GERAL, PERFIS.ADM],
  [PERMISSIONS.USERS_VIEW]: [PERFIS.GESTOR_GERAL, PERFIS.ADM],
  [PERMISSIONS.PROJECT_VIEW]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.GESTOR_QUALIDADE, PERFIS.ADM, PERFIS.ALMOXARIFE, PERFIS.FISCAL],
  [PERMISSIONS.RDO_VIEW]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.GESTOR_QUALIDADE, PERFIS.FISCAL],
  [PERMISSIONS.RDO_APPROVE]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA],
  [PERMISSIONS.RNC_VIEW]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.GESTOR_QUALIDADE, PERFIS.FISCAL],
  [PERMISSIONS.CURVE_S_VIEW]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.GESTOR_QUALIDADE, PERFIS.FISCAL],
  [PERMISSIONS.EAP_VIEW]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.GESTOR_QUALIDADE],
  [PERMISSIONS.PURCHASE_VIEW]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.ADM, PERFIS.ALMOXARIFE],
  [PERMISSIONS.PURCHASE_CREATE]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.ALMOXARIFE],
  [PERMISSIONS.PURCHASE_APPROVE]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.ADM],
  [PERMISSIONS.PURCHASE_FINANCE]: [PERFIS.GESTOR_GERAL, PERFIS.ADM],
  [PERMISSIONS.ASSETS_MANAGE]: [PERFIS.GESTOR_GERAL, PERFIS.ALMOXARIFE],
  [PERMISSIONS.ASSETS_VIEW]: [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.GESTOR_QUALIDADE, PERFIS.ADM, PERFIS.ALMOXARIFE],
  // Requisições
  [PERMISSIONS.REQUISICAO_VIEW]:            [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.ADM, PERFIS.ALMOXARIFE],
  [PERMISSIONS.REQUISICAO_CREATE]:          [PERFIS.GESTOR_GERAL, PERFIS.GESTOR_OBRA, PERFIS.ADM, PERFIS.ALMOXARIFE],
  [PERMISSIONS.REQUISICAO_ANALYZE_ITEM]:    [PERFIS.GESTOR_OBRA, PERFIS.GESTOR_GERAL, PERFIS.ADM],
  [PERMISSIONS.REQUISICAO_ADD_COTACAO]:     [PERFIS.ADM, PERFIS.GESTOR_GERAL],
  [PERMISSIONS.REQUISICAO_SELECT_SUPPLIER]: [PERFIS.GESTOR_GERAL, PERFIS.ADM],
  [PERMISSIONS.REQUISICAO_MARK_BOUGHT]:     [PERFIS.ADM, PERFIS.GESTOR_GERAL],
  [PERMISSIONS.FORNECEDOR_MANAGE]:          [PERFIS.GESTOR_GERAL, PERFIS.ADM]
};

const perfisAcessoGlobalProjeto = new Set([
  PERFIS.GESTOR_GERAL,
  PERFIS.ADM
]);

const ensureAccessSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      try { await runQuery('ALTER TABLE usuarios ADD COLUMN perfil TEXT'); } catch (_) {}
      try { await runQuery('ALTER TABLE usuarios ADD COLUMN setor TEXT'); } catch (_) {}
      try { await runQuery('ALTER TABLE usuarios ADD COLUMN setor_outro TEXT'); } catch (_) {}
      try { await runQuery('ALTER TABLE usuarios ADD COLUMN funcao TEXT'); } catch (_) {}

      await runQuery(`
        UPDATE usuarios
        SET perfil = CASE
          WHEN perfil IS NOT NULL AND TRIM(perfil) <> '' THEN perfil
          WHEN UPPER(COALESCE(perfil_almoxarifado, '')) = 'ALMOXARIFE' THEN ?
          WHEN COALESCE(is_adm, 0) = 1 THEN ?
          WHEN COALESCE(is_gestor, 0) = 1 THEN ?
          ELSE ?
        END
      `, [PERFIS.ALMOXARIFE, PERFIS.ADM, PERFIS.GESTOR_GERAL, PERFIS.ADM]);

      await runQuery(`
        UPDATE usuarios
        SET setor = COALESCE(NULLIF(TRIM(setor), ''), 'Administrativo')
      `);

      await runQuery(`
        UPDATE usuarios
        SET funcao = COALESCE(NULLIF(TRIM(funcao), ''), perfil)
      `);
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
};

const carregarPerfilUsuario = async (usuarioId) => {
  await ensureAccessSchema();

  const usuario = await getQuery(`
    SELECT id, login, nome, email, funcao, is_gestor, COALESCE(is_adm, 0) AS is_adm, perfil_almoxarifado, perfil, setor, setor_outro, ativo, deletado_em
    FROM usuarios
    WHERE id = ?
  `, [usuarioId]);

  if (!usuario || Number(usuario.ativo) !== 1 || usuario.deletado_em) return null;

  usuario.perfil = inferirPerfil(usuario);
  return usuario;
};

const hasPermission = (usuario, permission) => {
  const perfil = inferirPerfil(usuario);
  const permitidos = permissionMatrix[permission] || [];
  return permitidos.includes(perfil);
};

const hasProjectAccess = async (usuario, projetoId) => {
  if (!projetoId) return false;

  const perfil = inferirPerfil(usuario);
  if (perfisAcessoGlobalProjeto.has(perfil)) return true;

  const vinculo = await getQuery(
    'SELECT id FROM projeto_usuarios WHERE projeto_id = ? AND usuario_id = ? LIMIT 1',
    [Number(projetoId), usuario.id]
  );

  return !!vinculo;
};

const extractProjectId = (req, projectFrom) => {
  if (typeof projectFrom === 'function') return projectFrom(req);
  if (!projectFrom) return null;

  const [origem, campo] = String(projectFrom).split('.');
  const fonte = req[origem];
  if (!fonte || !campo) return null;

  const value = fonte[campo];
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
};

const requirePermission = (permission, options = {}) => {
  const { projectFrom } = options;

  return async (req, res, next) => {
    try {
      const perfil = inferirPerfil(req.usuario);
      req.usuario.perfil = perfil;

      if (!hasPermission(req.usuario, permission)) {
        return res.status(403).json({ erro: 'Acesso negado para esta ação.' });
      }

      if (projectFrom) {
        const projetoId = extractProjectId(req, projectFrom);
        if (!projetoId) {
          return res.status(400).json({ erro: 'Projeto obrigatório para esta operação.' });
        }

        const allowed = await hasProjectAccess(req.usuario, projetoId);
        if (!allowed) {
          return res.status(403).json({ erro: 'Sem permissão para esta obra.' });
        }
        req.projetoIdEscopo = projetoId;
      }

      next();
    } catch (error) {
      console.error('Erro na validação de permissão:', error);
      return res.status(500).json({ erro: 'Erro ao validar permissão.' });
    }
  };
};

const assertProjectAccess = async (req, res, projetoId) => {
  if (!projetoId) {
    res.status(400).json({ erro: 'Projeto obrigatório.' });
    return false;
  }

  const allowed = await hasProjectAccess(req.usuario, projetoId);
  if (!allowed) {
    res.status(403).json({ erro: 'Sem permissão para esta obra.' });
    return false;
  }

  return true;
};

const listarIdsProjetosUsuario = async (usuarioId) => {
  const rows = await allQuery('SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ?', [usuarioId]);
  return rows.map((r) => Number(r.projeto_id));
};

module.exports = {
  PERMISSIONS,
  ensureAccessSchema,
  carregarPerfilUsuario,
  hasPermission,
  hasProjectAccess,
  requirePermission,
  assertProjectAccess,
  listarIdsProjetosUsuario,
  extractProjectId
};
