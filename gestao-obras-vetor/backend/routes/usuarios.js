const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');
const { PERMISSIONS, requirePermission, ensureAccessSchema } = require('../middleware/rbac');
const { PERFIS, PERFIS_LISTA, SETORES, SETORES_LISTA, normalizarPerfil, mapPerfilParaLegado } = require('../constants/access');

const router = express.Router();

const gerarLogin = async (preferencia) => {
  if (preferencia) {
    const existente = await getQuery('SELECT id FROM usuarios WHERE login = ?', [preferencia]);
    if (!existente) return preferencia;
  }

  const ultimoUsuario = await getQuery(
    'SELECT login FROM usuarios ORDER BY CAST(login AS INTEGER) DESC LIMIT 1'
  );

  if (!ultimoUsuario) return '000001';

  const proximoNumero = parseInt(ultimoUsuario.login, 10) + 1;
  return String(proximoNumero).padStart(6, '0');
};

const gerarIdentificadorMaoObraDireta = async () => {
  for (let tentativa = 0; tentativa < 20; tentativa += 1) {
    const candidato = `MOD-${Math.floor(100000 + Math.random() * 900000)}`;
    const existente = await getQuery(
      'SELECT id FROM mao_obra_direta WHERE identificador = ? LIMIT 1',
      [candidato]
    );
    if (!existente) return candidato;
  }

  return `MOD-${String(Date.now()).slice(-6)}`;
};

const normalizarProjetos = (projetoIds, projetoIdLegado) => {
  if (Array.isArray(projetoIds)) {
    return [...new Set(projetoIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  }

  if (projetoIdLegado !== undefined && projetoIdLegado !== null && projetoIdLegado !== '') {
    const convertido = Number(projetoIdLegado);
    return Number.isInteger(convertido) && convertido > 0 ? [convertido] : [];
  }

  return [];
};

const listarTodosProjetosIds = async () => {
  const rows = await allQuery('SELECT id FROM projetos ORDER BY id');
  return rows.map((item) => Number(item.id));
};

const validarSetor = (setor, setorOutro) => {
  if (!setor || !SETORES_LISTA.includes(setor)) {
    return 'Setor inválido. Selecione uma opção válida.';
  }

  if (setor === SETORES.OUTRO && !String(setorOutro || '').trim()) {
    return 'Informe o setor quando selecionar "Outro".';
  }

  return null;
};

const validarPerfilEObras = (perfil, projetosIds) => {
  const perfilCanonico = normalizarPerfil(perfil);
  if (!perfilCanonico || !PERFIS_LISTA.includes(perfilCanonico)) {
    return 'Perfil de acesso inválido.';
  }

  if (perfilCanonico === PERFIS.GESTOR_OBRA && projetosIds.length === 0) {
    return 'Para Gestor da Obra, vincule pelo menos uma obra.';
  }

  return null;
};

const sincronizarVinculosProjeto = async (usuarioId, projetoIds) => {
  await runQuery('DELETE FROM projeto_usuarios WHERE usuario_id = ?', [usuarioId]);
  for (const projetoId of projetoIds) {
    await runQuery('INSERT OR IGNORE INTO projeto_usuarios (projeto_id, usuario_id) VALUES (?, ?)', [projetoId, usuarioId]);
  }
};

const carregarUsuarioComProjetos = async (id) => {
  const usuario = await getQuery(`
    SELECT id, login, nome, email, pin, perfil, funcao, setor, setor_outro, is_gestor, is_adm, perfil_almoxarifado, ativo, criado_em, atualizado_em
    FROM usuarios
    WHERE id = ?
  `, [id]);

  if (!usuario) return null;

  const projetos = await allQuery('SELECT projeto_id FROM projeto_usuarios WHERE usuario_id = ? ORDER BY projeto_id', [id]);
  usuario.projeto_ids = projetos.map((item) => Number(item.projeto_id));
  usuario.projeto_id = usuario.projeto_ids[0] || null;

  return usuario;
};

router.use(async (req, res, next) => {
  try {
    await ensureAccessSchema();
    await runQuery(`
      CREATE TABLE IF NOT EXISTS mao_obra_direta (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identificador TEXT,
        projeto_id INTEGER,
        nome TEXT NOT NULL,
        funcao TEXT NOT NULL,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        criado_por INTEGER,
        baixado_em DATETIME,
        baixado_por INTEGER,
        FOREIGN KEY (projeto_id) REFERENCES projetos(id),
        FOREIGN KEY (criado_por) REFERENCES usuarios(id),
        FOREIGN KEY (baixado_por) REFERENCES usuarios(id)
      )
    `);

    const colunasMaoObraDireta = await allQuery('PRAGMA table_info(mao_obra_direta)');
    const temProjetoId = (colunasMaoObraDireta || []).some((col) => String(col.name) === 'projeto_id');
    if (!temProjetoId) {
      await runQuery('ALTER TABLE mao_obra_direta ADD COLUMN projeto_id INTEGER');
    }

    next();
  } catch (error) {
    console.error('Erro ao preparar schema de usuários:', error);
    res.status(500).json({ erro: 'Erro interno ao preparar dados de usuários.' });
  }
});

router.get('/', [auth, requirePermission(PERMISSIONS.USERS_VIEW)], async (req, res) => {
  try {
    const { setor, projeto_id } = req.query;
    const filtros = ['deletado_em IS NULL'];
    const params = [];

    if (setor) {
      filtros.push('setor = ?');
      params.push(setor);
    }

    if (projeto_id) {
      filtros.push('EXISTS (SELECT 1 FROM projeto_usuarios pu WHERE pu.usuario_id = usuarios.id AND pu.projeto_id = ?)');
      params.push(Number(projeto_id));
    }

    const usuarios = await allQuery(`
      SELECT id, login, nome, email, pin, perfil, funcao, setor, setor_outro, is_gestor, is_adm, perfil_almoxarifado, ativo, criado_em
      FROM usuarios
      WHERE ${filtros.join(' AND ')}
      ORDER BY nome
    `, params);

    const vinculos = await allQuery('SELECT usuario_id, projeto_id FROM projeto_usuarios');
    const mapa = new Map();
    for (const row of vinculos) {
      if (!mapa.has(row.usuario_id)) mapa.set(row.usuario_id, []);
      mapa.get(row.usuario_id).push(Number(row.projeto_id));
    }

    const lista = usuarios.map((usuario) => ({
      ...usuario,
      projeto_ids: mapa.get(usuario.id) || [],
      projeto_id: (mapa.get(usuario.id) || [])[0] || null
    }));

    res.json(lista);
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ erro: 'Erro ao listar usuários.' });
  }
});

router.get('/deletados/lista', [auth, requirePermission(PERMISSIONS.USERS_VIEW)], async (req, res) => {
  try {
    const usuariosDeleted = await allQuery(`
      SELECT id, login, nome, email, perfil, funcao, setor, setor_outro, deletado_em, deletado_por
      FROM usuarios
      WHERE deletado_em IS NOT NULL
      ORDER BY deletado_em DESC
    `);

    res.json(usuariosDeleted);
  } catch (error) {
    console.error('Erro ao listar usuários deletados:', error);
    res.status(500).json({ erro: 'Erro ao listar usuários deletados.' });
  }
});

router.get('/novo-login', [auth, requirePermission(PERMISSIONS.USERS_MANAGE)], async (req, res) => {
  try {
    const login = await gerarLogin();
    res.json({ login });
  } catch (error) {
    console.error('Erro ao gerar login:', error);
    res.status(500).json({ erro: 'Erro ao gerar login.' });
  }
});

router.get('/mao-obra-direta', [auth, requirePermission(PERMISSIONS.USERS_MANAGE)], async (req, res) => {
  try {
    const projetoId = req.query.projeto_id ? Number(req.query.projeto_id) : null;
    const somenteAtivos = String(req.query.ativos || '1') !== '0';
    const filtros = [];
    const params = [];

    if (somenteAtivos) filtros.push('ativo = 1');
    if (projetoId) {
      filtros.push('projeto_id = ?');
      params.push(projetoId);
    }

    const rows = await allQuery(`
      SELECT id, identificador, projeto_id, nome, funcao, ativo, criado_em, atualizado_em, baixado_em, baixado_por
      FROM mao_obra_direta
      ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
      ORDER BY nome
    `, params);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar mão de obra direta:', error);
    res.status(500).json({ erro: 'Erro ao listar mão de obra direta.' });
  }
});

router.post('/mao-obra-direta', [
  auth,
  requirePermission(PERMISSIONS.USERS_MANAGE),
  body('nome').trim().notEmpty(),
  body('funcao').trim().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos para mão de obra direta.' });
    }

    const nome = String(req.body.nome || '').trim();
    const funcao = String(req.body.funcao || '').trim();
    const projetoId = req.body.projeto_id ? Number(req.body.projeto_id) : null;
    const identificador = await gerarIdentificadorMaoObraDireta();

    const result = await runQuery(`
      INSERT INTO mao_obra_direta (identificador, projeto_id, nome, funcao, ativo, criado_por)
      VALUES (?, ?, ?, ?, 1, ?)
    `, [identificador, projetoId, nome, funcao, req.usuario.id]);

    const item = await getQuery('SELECT * FROM mao_obra_direta WHERE id = ?', [result.lastID]);
    await registrarAuditoria('mao_obra_direta', result.lastID, 'CREATE', null, item, req.usuario.id);
    res.status(201).json({ item });
  } catch (error) {
    console.error('Erro ao criar mão de obra direta:', error);
    res.status(500).json({ erro: 'Erro ao criar mão de obra direta.' });
  }
});

router.put('/mao-obra-direta/:id', [
  auth,
  requirePermission(PERMISSIONS.USERS_MANAGE),
  body('nome').optional().isString(),
  body('funcao').optional().isString()
], async (req, res) => {
  try {
    const { id } = req.params;
    const anterior = await getQuery('SELECT * FROM mao_obra_direta WHERE id = ?', [id]);
    if (!anterior) return res.status(404).json({ erro: 'Registro não encontrado.' });

    const updates = [];
    const params = [];

    if (req.body.nome !== undefined) {
      updates.push('nome = ?');
      params.push(String(req.body.nome || '').trim());
    }
    if (req.body.funcao !== undefined) {
      updates.push('funcao = ?');
      params.push(String(req.body.funcao || '').trim());
    }
    if (req.body.ativo !== undefined) {
      updates.push('ativo = ?');
      params.push(req.body.ativo ? 1 : 0);
    }
    if (req.body.projeto_id !== undefined) {
      updates.push('projeto_id = ?');
      params.push(req.body.projeto_id ? Number(req.body.projeto_id) : null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo para atualização.' });
    }

    params.push(id);
    await runQuery(`UPDATE mao_obra_direta SET ${updates.join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, params);
    const item = await getQuery('SELECT * FROM mao_obra_direta WHERE id = ?', [id]);
    await registrarAuditoria('mao_obra_direta', id, 'UPDATE', anterior, item, req.usuario.id);
    res.json({ item });
  } catch (error) {
    console.error('Erro ao atualizar mão de obra direta:', error);
    res.status(500).json({ erro: 'Erro ao atualizar mão de obra direta.' });
  }
});

router.patch('/mao-obra-direta/:id/baixa', [auth, requirePermission(PERMISSIONS.USERS_MANAGE)], async (req, res) => {
  try {
    const { id } = req.params;
    const anterior = await getQuery('SELECT * FROM mao_obra_direta WHERE id = ?', [id]);
    if (!anterior) return res.status(404).json({ erro: 'Registro não encontrado.' });

    await runQuery(`
      UPDATE mao_obra_direta
      SET ativo = 0, baixado_em = CURRENT_TIMESTAMP, baixado_por = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [req.usuario.id, id]);

    const item = await getQuery('SELECT * FROM mao_obra_direta WHERE id = ?', [id]);
    await registrarAuditoria('mao_obra_direta', id, 'DELETE', anterior, item, req.usuario.id);
    res.json({ item });
  } catch (error) {
    console.error('Erro ao dar baixa na mão de obra direta:', error);
    res.status(500).json({ erro: 'Erro ao dar baixa na mão de obra direta.' });
  }
});

router.get('/:id', [auth, requirePermission(PERMISSIONS.USERS_VIEW)], async (req, res) => {
  try {
    const { id } = req.params;
    const usuario = await carregarUsuarioComProjetos(id);
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    res.json(usuario);
  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    res.status(500).json({ erro: 'Erro ao obter usuário.' });
  }
});

router.post('/', [
  auth,
  requirePermission(PERMISSIONS.USERS_MANAGE),
  body('nome').trim().notEmpty(),
  body('email').optional({ checkFalsy: true, nullable: true }).trim().isEmail(),
  body('senha').isLength({ min: 6, max: 6 }).isNumeric(),
  body('pin').optional().isLength({ min: 6, max: 6 }).isNumeric(),
  body('perfil').isString(),
  body('funcao').optional({ nullable: true }).isString(),
  body('setor').isString(),
  body('setor_outro').optional({ nullable: true }).isString(),
  body('projeto_ids').optional().isArray(),
  body('projeto_id').optional().isInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos. Verifique os campos obrigatórios.' });
    }

    const { nome, senha, pin, setor } = req.body;
    const perfil = normalizarPerfil(req.body.perfil);
    const funcao = req.body.funcao ? String(req.body.funcao).trim() : perfil;
    const email = req.body.email ? String(req.body.email).trim() : null;
    const setorOutro = req.body.setor_outro ? String(req.body.setor_outro).trim() : null;
    const projetoIdsEntrada = normalizarProjetos(req.body.projeto_ids, req.body.projeto_id);

    const erroSetor = validarSetor(setor, setorOutro);
    if (erroSetor) return res.status(400).json({ erro: erroSetor });

    const projetoIds = perfil === PERFIS.GESTOR_GERAL ? await listarTodosProjetosIds() : projetoIdsEntrada;
    const erroPerfil = validarPerfilEObras(perfil, projetoIds);
    if (erroPerfil) return res.status(400).json({ erro: erroPerfil });

    const login = await gerarLogin(req.body.login);
    const senhaHash = await bcrypt.hash(senha, 10);
    const pinFinal = pin || Math.floor(Math.random() * 900000 + 100000).toString();

    const legado = mapPerfilParaLegado(perfil);

    const result = await runQuery(`
      INSERT INTO usuarios (login, senha, pin, nome, email, perfil, funcao, setor, setor_outro, is_gestor, is_adm, perfil_almoxarifado, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      login,
      senhaHash,
      pinFinal,
      nome,
      email,
      perfil,
      funcao || perfil,
      setor,
      setor === SETORES.OUTRO ? setorOutro : null,
      legado.is_gestor,
      legado.is_adm,
      legado.perfil_almoxarifado,
      req.usuario.id
    ]);

    await sincronizarVinculosProjeto(result.lastID, projetoIds);

    const usuarioCriado = await carregarUsuarioComProjetos(result.lastID);
    await registrarAuditoria('usuarios', result.lastID, 'CREATE', null, usuarioCriado, req.usuario.id);

    res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      usuario: usuarioCriado
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ erro: 'Erro ao criar usuário.' });
  }
});

router.put('/:id', [
  auth,
  requirePermission(PERMISSIONS.USERS_MANAGE),
  body('email').optional({ checkFalsy: true, nullable: true }).isEmail(),
  body('perfil').optional().isString(),
  body('funcao').optional({ nullable: true }).isString(),
  body('setor').optional().isString(),
  body('setor_outro').optional({ nullable: true }).isString(),
  body('projeto_ids').optional().isArray(),
  body('projeto_id').optional().isInt()
], async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioAnterior = await carregarUsuarioComProjetos(id);
    if (!usuarioAnterior) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos para atualização.' });
    }

    const updates = [];
    const params = [];

    if (req.body.nome !== undefined) {
      updates.push('nome = ?');
      params.push(req.body.nome);
    }

    if (req.body.email !== undefined) {
      updates.push('email = ?');
      params.push(req.body.email ? String(req.body.email).trim() : null);
    }

    if (req.body.pin !== undefined) {
      if (req.body.pin && (!/^\d{6}$/.test(String(req.body.pin)))) {
        return res.status(400).json({ erro: 'PIN deve conter 6 dígitos numéricos.' });
      }
      updates.push('pin = ?');
      params.push(req.body.pin || null);
    }

    if (req.body.ativo !== undefined) {
      updates.push('ativo = ?');
      params.push(req.body.ativo ? 1 : 0);
    }

    if (req.body.senha !== undefined && req.body.senha !== '') {
      if (!/^\d{6}$/.test(String(req.body.senha))) {
        return res.status(400).json({ erro: 'Senha deve conter 6 dígitos numéricos.' });
      }
      const senhaHash = await bcrypt.hash(req.body.senha, 10);
      updates.push('senha = ?');
      params.push(senhaHash);
    }

    const perfilEntrada = req.body.perfil !== undefined ? req.body.perfil : usuarioAnterior.perfil;
    const perfil = normalizarPerfil(perfilEntrada);
    const funcao = req.body.funcao !== undefined
      ? String(req.body.funcao || '').trim()
      : (usuarioAnterior.funcao || perfil);
    const setor = req.body.setor !== undefined ? req.body.setor : usuarioAnterior.setor;
    const setorOutro = req.body.setor_outro !== undefined ? String(req.body.setor_outro || '').trim() : (usuarioAnterior.setor_outro || '');

    const projetoIdsEntrada = (req.body.projeto_ids !== undefined || req.body.projeto_id !== undefined)
      ? normalizarProjetos(req.body.projeto_ids, req.body.projeto_id)
      : usuarioAnterior.projeto_ids;
    const projetoIds = perfil === PERFIS.GESTOR_GERAL ? await listarTodosProjetosIds() : projetoIdsEntrada;

    const erroSetor = validarSetor(setor, setorOutro);
    if (erroSetor) return res.status(400).json({ erro: erroSetor });

    const erroPerfil = validarPerfilEObras(perfil, projetoIds);
    if (erroPerfil) return res.status(400).json({ erro: erroPerfil });

    const legado = mapPerfilParaLegado(perfil);
    updates.push('perfil = ?');
    params.push(perfil);
    updates.push('funcao = ?');
    params.push(funcao || perfil);
    updates.push('setor = ?');
    params.push(setor);
    updates.push('setor_outro = ?');
    params.push(setor === SETORES.OUTRO ? setorOutro : null);
    updates.push('is_gestor = ?');
    params.push(legado.is_gestor);
    updates.push('is_adm = ?');
    params.push(legado.is_adm);
    updates.push('perfil_almoxarifado = ?');
    params.push(legado.perfil_almoxarifado);

    if (updates.length > 0) {
      params.push(id);
      await runQuery(`UPDATE usuarios SET ${updates.join(', ')}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`, params);
    }

    if (req.body.projeto_ids !== undefined || req.body.projeto_id !== undefined || perfil === PERFIS.GESTOR_OBRA || perfil === PERFIS.GESTOR_GERAL) {
      await sincronizarVinculosProjeto(id, projetoIds);
    }

    const usuarioNovo = await carregarUsuarioComProjetos(id);
    await registrarAuditoria('usuarios', id, 'UPDATE', usuarioAnterior, usuarioNovo, req.usuario.id);

    res.json({ mensagem: 'Usuário atualizado com sucesso.', usuario: usuarioNovo });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ erro: 'Erro ao atualizar usuário.' });
  }
});

router.patch('/:id/gestor', [auth, requirePermission(PERMISSIONS.USERS_MANAGE)], async (req, res) => {
  try {
    const { id } = req.params;
    const { is_gestor } = req.body;
    const perfil = Number(is_gestor) === 1 ? PERFIS.GESTOR_GERAL : PERFIS.ADM;

    const legado = mapPerfilParaLegado(perfil);
    await runQuery(
      'UPDATE usuarios SET perfil = ?, is_gestor = ?, is_adm = ?, perfil_almoxarifado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [perfil, legado.is_gestor, legado.is_adm, legado.perfil_almoxarifado, id]
    );

    res.json({ mensagem: 'Permissões atualizadas com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar permissões:', error);
    res.status(500).json({ erro: 'Erro ao atualizar permissões.' });
  }
});

router.patch('/:id/adm', [auth, requirePermission(PERMISSIONS.USERS_MANAGE)], async (req, res) => {
  try {
    const { id } = req.params;
    const { is_adm } = req.body;
    const perfil = Number(is_adm) === 1 ? PERFIS.ADM : PERFIS.GESTOR_OBRA;

    const legado = mapPerfilParaLegado(perfil);
    await runQuery(
      'UPDATE usuarios SET perfil = ?, is_gestor = ?, is_adm = ?, perfil_almoxarifado = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [perfil, legado.is_gestor, legado.is_adm, legado.perfil_almoxarifado, id]
    );

    res.json({ mensagem: 'Permissões ADM atualizadas com sucesso.' });
  } catch (error) {
    console.error('Erro ao atualizar ADM:', error);
    res.status(500).json({ erro: 'Erro ao atualizar ADM.' });
  }
});

router.delete('/:id', [auth, requirePermission(PERMISSIONS.USERS_MANAGE)], async (req, res) => {
  try {
    const { id } = req.params;

    await runQuery(
      'UPDATE usuarios SET ativo = 0, deletado_em = CURRENT_TIMESTAMP, deletado_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [req.usuario.id, id]
    );

    await registrarAuditoria('usuarios', id, 'DELETE', null, { deletado_por: req.usuario.id }, req.usuario.id);

    res.json({ mensagem: 'Usuário movido para lista de excluídos com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    res.status(500).json({ erro: 'Erro ao excluir usuário.' });
  }
});

module.exports = router;
