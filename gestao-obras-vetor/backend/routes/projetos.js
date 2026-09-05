const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery, withClient, getWithClient, execWithClient } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');
const { PERFIS, inferirPerfil } = require('../constants/access');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');
const tenantUploadRelativeDir = (tenantId) => `tenant_${Number(tenantId)}`;

const ensureTenantUploadDir = (tenantId) => {
  const numericTenantId = Number(tenantId);
  if (!Number.isInteger(numericTenantId) || numericTenantId <= 0) {
    throw new Error('Tenant inválido para upload.');
  }
  const dir = path.join(uploadsDir, tenantUploadRelativeDir(numericTenantId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const projectLogoStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      cb(null, ensureTenantUploadDir(req.tenantId));
    } catch (error) {
      cb(error);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    cb(null, `logo-projeto-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const projectLogoUpload = multer({
  storage: projectLogoStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    const validExt = /\.(jpe?g|png|webp)$/.test(ext);
    const validMime = /^image\/(jpeg|png|webp)$/i.test(String(file.mimetype || ''));
    if (validExt && validMime) return cb(null, true);
    return cb(new Error('Envie uma imagem JPEG, PNG ou WebP.'));
  }
});

const uploadProjectLogos = (req, res, next) => {
  projectLogoUpload.fields([
    { name: 'logo_empresa_responsavel', maxCount: 1 },
    { name: 'logo_empresa_executante', maxCount: 1 }
  ])(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ erro: 'Cada logo pode ter no máximo 5 MB.' });
    }
    return res.status(400).json({ erro: error.message || 'Arquivo de logo inválido.' });
  });
};

const usuarioPodeVerTodosProjetos = (usuario) => {
  const perfil = inferirPerfil(usuario);
  return perfil === PERFIS.ADM || perfil === PERFIS.GESTOR_GERAL;
};

const tabelaExiste = async (client, tabela) => {
  const resultado = await getWithClient(client, 'SELECT to_regclass(?) AS tabela', [`public.${tabela}`]);
  return Boolean(resultado?.tabela);
};

const executarSeTabelaExiste = async (client, tabela, sql, params) => {
  if (!await tabelaExiste(client, tabela)) return;
  await execWithClient(client, sql, params);
};

// Parte do estoque e do almoxarifado preserva histórico fora da cascata padrão
// do PostgreSQL. Esses registros precisam ser removidos antes do projeto para
// evitar que uma chave estrangeira bloqueie a exclusão definitiva.
const removerDependenciasOperacionaisDoProjeto = async (client, projetoId) => {
  await executarSeTabelaExiste(client, 'estoque_aplicacoes', `
    DELETE FROM estoque_aplicacoes
    WHERE projeto_id = ?
       OR saldo_id IN (SELECT id FROM estoque_saldos WHERE projeto_id = ?)
  `, [projetoId, projetoId]);

  await executarSeTabelaExiste(client, 'estoque_movimentacoes', `
    DELETE FROM estoque_movimentacoes
    WHERE projeto_origem_id = ?
       OR projeto_destino_id = ?
       OR transferencia_id IN (
         SELECT id FROM estoque_transferencias
         WHERE origem_projeto_id = ? OR destino_projeto_id = ?
       )
  `, [projetoId, projetoId, projetoId, projetoId]);

  await executarSeTabelaExiste(client, 'estoque_transferencias', `
    DELETE FROM estoque_transferencias
    WHERE origem_projeto_id = ? OR destino_projeto_id = ?
  `, [projetoId, projetoId]);

  await executarSeTabelaExiste(client, 'estoque_saldos', `
    DELETE FROM estoque_saldos WHERE projeto_id = ?
  `, [projetoId]);

  // Lotes centralizados podem continuar atendendo outras obras; por isso o
  // vínculo com o projeto removido é desfeito, sem apagar o saldo central.
  await executarSeTabelaExiste(client, 'estoque_pendencias_recebimento', `
    UPDATE estoque_pendencias_recebimento
    SET projeto_solicitante_id = NULL
    WHERE projeto_solicitante_id = ?
  `, [projetoId]);

  await executarSeTabelaExiste(client, 'rdo_ferramentas', `
    DELETE FROM rdo_ferramentas
    WHERE rdo_id IN (SELECT id FROM rdos WHERE projeto_id = ?)
       OR alocacao_id IN (SELECT id FROM almox_alocacoes WHERE projeto_id = ?)
  `, [projetoId, projetoId]);

  await executarSeTabelaExiste(client, 'almox_movimentacoes', `
    DELETE FROM almox_movimentacoes
    WHERE projeto_origem_id = ?
       OR projeto_destino_id = ?
       OR alocacao_id IN (SELECT id FROM almox_alocacoes WHERE projeto_id = ?)
  `, [projetoId, projetoId, projetoId]);

  await executarSeTabelaExiste(client, 'almox_manutencoes', `
    DELETE FROM almox_manutencoes
    WHERE projeto_id = ?
       OR alocacao_id IN (SELECT id FROM almox_alocacoes WHERE projeto_id = ?)
  `, [projetoId, projetoId]);

  await executarSeTabelaExiste(client, 'almox_perdas', `
    DELETE FROM almox_perdas
    WHERE projeto_id = ?
       OR alocacao_id IN (SELECT id FROM almox_alocacoes WHERE projeto_id = ?)
  `, [projetoId, projetoId]);

  await executarSeTabelaExiste(client, 'almox_alocacoes', `
    DELETE FROM almox_alocacoes WHERE projeto_id = ?
  `, [projetoId]);
};

router.post('/:id/logos', [auth, isGestor, uploadProjectLogos], async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });

    const projetoAnterior = await getQuery('SELECT * FROM projetos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!projetoAnterior) return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });

    const responsavel = req.files?.logo_empresa_responsavel?.[0];
    const executante = req.files?.logo_empresa_executante?.[0];
    if (!responsavel && !executante) {
      return res.status(400).json({ erro: 'Envie ao menos uma logo para atualizar.' });
    }

    const logoResponsavel = responsavel
      ? `${tenantUploadRelativeDir(tenantId)}/${responsavel.filename}`
      : projetoAnterior.logo_empresa_responsavel;
    const logoExecutante = executante
      ? `${tenantUploadRelativeDir(tenantId)}/${executante.filename}`
      : projetoAnterior.logo_empresa_executante;

    await runQuery(
      'UPDATE projetos SET logo_empresa_responsavel = ?, logo_empresa_executante = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
      [logoResponsavel, logoExecutante, id, tenantId]
    );
    const projeto = await getQuery('SELECT * FROM projetos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    await registrarAuditoria('projetos', id, 'UPDATE_LOGOS', projetoAnterior, projeto, req.usuario.id);

    return res.json({
      mensagem: 'Logos do projeto atualizadas com sucesso.',
      logos: {
        logo_empresa_responsavel: projeto.logo_empresa_responsavel,
        logo_empresa_executante: projeto.logo_empresa_executante
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar logos do projeto:', error);
    return res.status(500).json({ erro: 'Erro ao atualizar logos do projeto.' });
  }
});

// Listar projetos do usuário (tenant-aware)
router.get('/', auth, async (req, res) => {
  try {
    let projetos;
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ erro: 'Tenant não definido.' });
    }
    if (usuarioPodeVerTodosProjetos(req.usuario)) {
      // ADM e Gestor Geral veem todos os projetos do tenant
      projetos = await allQuery(`
        SELECT p.*, u.nome as criador,
          (
            SELECT COUNT(*)
            FROM projeto_usuarios pu2
            INNER JOIN usuarios ux ON ux.id = pu2.usuario_id
            WHERE pu2.projeto_id = p.id
              AND ux.deletado_em IS NULL
              AND COALESCE(ux.ativo, 1) = 1
          ) AS total_usuarios
        FROM projetos p
        LEFT JOIN usuarios u ON p.criado_por = u.id
        WHERE p.ativo = 1 AND p.tenant_id = ?
        ORDER BY p.criado_em DESC
      `, [tenantId]);
    } else {
      // Demais perfis veem apenas projetos vinculados ao tenant
      projetos = await allQuery(`
        SELECT p.*, u.nome as criador,
          (
            SELECT COUNT(*)
            FROM projeto_usuarios pu2
            INNER JOIN usuarios ux ON ux.id = pu2.usuario_id
            WHERE pu2.projeto_id = p.id
              AND ux.deletado_em IS NULL
              AND COALESCE(ux.ativo, 1) = 1
          ) AS total_usuarios
        FROM projetos p
        INNER JOIN projeto_usuarios pu ON p.id = pu.projeto_id
        LEFT JOIN usuarios u ON p.criado_por = u.id
        WHERE pu.usuario_id = ? AND p.ativo = 1 AND p.tenant_id = ?
        ORDER BY p.criado_em DESC
      `, [req.usuario.id, tenantId]);
    }
    // Para cada projeto, agregar métricas da EAP (previsto/executado/percentual)
    for (const projeto of projetos) {
      try {
        const atividades = await allQuery(`
          SELECT * FROM atividades_eap WHERE projeto_id = ? ORDER BY ordem, codigo_eap
        `, [projeto.id]);

        const byId = {};
        atividades.forEach(a => { byId[a.id] = { ...a, previsto_agregado: a.quantidade_total || 0, executado_agregado: ((a.percentual_executado || 0) / 100) * (a.quantidade_total || 0) } });

        atividades.forEach(a => {
          if (a.pai_id) {
            const pai = byId[a.pai_id];
            if (pai) {
              pai.previsto_agregado = (pai.previsto_agregado || 0) + (a.quantidade_total || 0);
              const exec = (a.quantidade_total || 0) * ((a.percentual_executado || 0) / 100);
              pai.executado_agregado = (pai.executado_agregado || 0) + exec;
            }
          }
        });

        let previstoTotal = 0;
        let executadoTotal = 0;
        atividades.forEach(a => {
          if (!a.pai_id) {
            const agg = byId[a.id] || {};
            const previsto = agg.previsto_agregado || (a.quantidade_total || 0);
            const executado = agg.executado_agregado || ((a.percentual_executado || 0) / 100) * (a.quantidade_total || 0);
            previstoTotal += previsto || 0;
            executadoTotal += executado || 0;
          }
        });

        projeto.eap_previsto_total = Math.round((previstoTotal + 0.000001) * 100) / 100;
        projeto.eap_executado_total = Math.round((executadoTotal + 0.000001) * 100) / 100;
        projeto.eap_percentual = projeto.eap_previsto_total > 0 ? Math.min(Math.round((projeto.eap_executado_total / projeto.eap_previsto_total) * 10000) / 100, 100) : 0;
      } catch (err) {
        projeto.eap_previsto_total = 0;
        projeto.eap_executado_total = 0;
        projeto.eap_percentual = 0;
      }
    }

    res.json(projetos);
  } catch (error) {
    console.error('Erro ao listar projetos:', error);
    res.status(500).json({ erro: 'Erro ao listar projetos.' });
  }
});

// Obter detalhes de um projeto (tenant-aware)
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ erro: 'Tenant não definido.' });
    }
    // Busca projeto apenas se pertencer ao tenant
    const projeto = await getQuery(`
      SELECT p.*, u.nome as criador
      FROM projetos p
      LEFT JOIN usuarios u ON p.criado_por = u.id
      WHERE p.id = ? AND p.ativo = 1 AND p.tenant_id = ?
    `, [id, tenantId]);

    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }

    // Verificar se usuário tem acesso
    if (!usuarioPodeVerTodosProjetos(req.usuario)) {
      const acesso = await getQuery(
        'SELECT * FROM projeto_usuarios WHERE projeto_id = ? AND usuario_id = ?',
        [id, req.usuario.id]
      );
      if (!acesso) {
        return res.status(403).json({ erro: 'Acesso negado a este projeto.' });
      }
    }

    // Buscar usuários do projeto
    const usuarios = await allQuery(`
      SELECT u.id, u.login, u.nome, u.email, u.is_gestor, u.perfil
      FROM usuarios u
      INNER JOIN projeto_usuarios pu ON u.id = pu.usuario_id
      WHERE pu.projeto_id = ?
    `, [id]);

    projeto.usuarios = usuarios;

    // Agregar métricas da EAP para o projeto (previsto, executado, percentual)
    try {
      const atividades = await allQuery(`
        SELECT * FROM atividades_eap WHERE projeto_id = ? ORDER BY ordem, codigo_eap
      `, [id]);

      const byId = {};
      atividades.forEach(a => { byId[a.id] = { ...a, previsto_agregado: a.quantidade_total || 0, executado_agregado: ((a.percentual_executado || 0) / 100) * (a.quantidade_total || 0) } });

      atividades.forEach(a => {
        if (a.pai_id) {
          const pai = byId[a.pai_id];
          if (pai) {
            pai.previsto_agregado = (pai.previsto_agregado || 0) + (a.quantidade_total || 0);
            const exec = (a.quantidade_total || 0) * ((a.percentual_executado || 0) / 100);
            pai.executado_agregado = (pai.executado_agregado || 0) + exec;
          }
        }
      });

      // Somar apenas atividades de nível superior para obter total do projeto
      let previstoTotal = 0;
      let executadoTotal = 0;
      atividades.forEach(a => {
        if (!a.pai_id) {
          const agg = byId[a.id] || {};
          const previsto = agg.previsto_agregado || (a.quantidade_total || 0);
          const executado = agg.executado_agregado || ((a.percentual_executado || 0) / 100) * (a.quantidade_total || 0);
          previstoTotal += previsto || 0;
          executadoTotal += executado || 0;
        }
      });

      projeto.eap_previsto_total = Math.round((previstoTotal + 0.000001) * 100) / 100;
      projeto.eap_executado_total = Math.round((executadoTotal + 0.000001) * 100) / 100;
      projeto.eap_percentual = projeto.eap_previsto_total > 0 ? Math.min(Math.round((projeto.eap_executado_total / projeto.eap_previsto_total) * 10000) / 100, 100) : 0;
    } catch (err) {
      projeto.eap_previsto_total = 0;
      projeto.eap_executado_total = 0;
      projeto.eap_percentual = 0;
    }

    // Calcular prazos: prazo contratual (dias), prazo decorrido e prazo a vencer
    // Todas as datas normalizadas para 00:00:00 local (contagem por dia-calendário)
    try {
      const toMidnight = (val) => {
        const str = String(val).trim();
        const norm = /^\d{4}-\d{2}-\d{2}$/.test(str) ? str + 'T00:00:00' : str.replace(' ', 'T');
        const d = new Date(norm); d.setHours(0, 0, 0, 0); return d;
      };
      const dataInicio = projeto.data_inicio ? toMidnight(projeto.data_inicio) : (projeto.criado_em ? toMidnight(projeto.criado_em) : null);
      const prazoTermino = projeto.prazo_termino ? toMidnight(projeto.prazo_termino) : null;
      if (dataInicio && prazoTermino) {
        const msDia = 1000 * 60 * 60 * 24;
        const prazoContratual = Math.round((prazoTermino - dataInicio) / msDia);
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const prazoDecorrido = Math.max(0, Math.round((hoje - dataInicio) / msDia));
        const prazoAVencer = Math.max(0, prazoContratual - prazoDecorrido);
        projeto.prazo_contratual_dias = prazoContratual;
        projeto.prazo_decorrido = prazoDecorrido;
        projeto.prazo_a_vencer = prazoAVencer;
      } else {
        projeto.prazo_contratual_dias = null;
        projeto.prazo_decorrido = null;
        projeto.prazo_a_vencer = null;
      }
    } catch (err) {
      projeto.prazo_contratual_dias = null;
      projeto.prazo_decorrido = null;
      projeto.prazo_a_vencer = null;
    }

    res.json(projeto);
  } catch (error) {
    console.error('Erro ao obter projeto:', error);
    res.status(500).json({ erro: 'Erro ao obter projeto.' });
  }
});

// Criar projeto (tenant-aware)
router.post('/', [auth, isGestor], [
  body('nome').trim().notEmpty(),
  body('empresa_responsavel').trim().notEmpty(),
  body('empresa_executante').trim().notEmpty(),
  body('data_inicio').isDate(),
  body('prazo_termino').isDate(),
  body('prazo_termino').custom((prazoTermino, { req }) => {
    if (String(req.body.data_inicio) > String(prazoTermino)) {
      throw new Error('A data de inicio deve ser anterior ou igual ao prazo de termino.');
    }
    return true;
  }),
  body('cidade').trim().notEmpty(),
  body('usuarios').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });
    }

    const { nome, empresa_responsavel, empresa_executante, data_inicio, prazo_termino, cidade, usuarios } = req.body;
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ erro: 'Tenant não definido.' });
    }

    const result = await runQuery(`
      INSERT INTO projetos (nome, empresa_responsavel, empresa_executante, data_inicio, prazo_termino, cidade, criado_por, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [nome, empresa_responsavel, empresa_executante, data_inicio, prazo_termino, cidade, req.usuario.id, tenantId]);

    const projetoId = result.lastID;

    // Adicionar usuários ao projeto
    if (usuarios && usuarios.length > 0) {
      for (const usuarioId of usuarios) {
        await runQuery(
          'INSERT INTO projeto_usuarios (projeto_id, usuario_id) VALUES (?, ?)',
          [projetoId, usuarioId]
        );
      }
    }

    await registrarAuditoria('projetos', projetoId, 'CREATE', null, req.body, req.usuario.id);

    res.status(201).json({
      mensagem: 'Projeto criado com sucesso.',
      projeto: { id: projetoId, nome }
    });

  } catch (error) {
    console.error('Erro ao criar projeto:', error);
    res.status(500).json({ erro: 'Erro ao criar projeto.' });
  }
});

// Atualizar projeto
router.put('/:id', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, empresa_responsavel, empresa_executante, data_inicio, prazo_termino, cidade, usuarios } = req.body;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });

    if (!data_inicio || !prazo_termino || String(data_inicio) > String(prazo_termino)) {
      return res.status(400).json({ erro: 'Informe uma data de inicio anterior ou igual ao prazo de termino.' });
    }

    const projetoAnterior = await getQuery('SELECT * FROM projetos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!projetoAnterior) return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });

    await runQuery(`
      UPDATE projetos 
      SET nome = ?, empresa_responsavel = ?, empresa_executante = ?, data_inicio = ?, prazo_termino = ?, cidade = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND tenant_id = ?
    `, [nome, empresa_responsavel, empresa_executante, data_inicio, prazo_termino, cidade, id, tenantId]);

    // Atualizar usuários do projeto
    if (usuarios) {
      await runQuery('DELETE FROM projeto_usuarios WHERE projeto_id = ?', [id]);
      
      for (const usuarioId of usuarios) {
        await runQuery(
          'INSERT INTO projeto_usuarios (projeto_id, usuario_id) VALUES (?, ?)',
          [id, usuarioId]
        );
      }
    }

    await registrarAuditoria('projetos', id, 'UPDATE', projetoAnterior, req.body, req.usuario.id);

    res.json({ mensagem: 'Projeto atualizado com sucesso.' });

  } catch (error) {
    console.error('Erro ao atualizar projeto:', error);
    res.status(500).json({ erro: 'Erro ao atualizar projeto.' });
  }
});

// Exclusão definitiva de projeto: somente o Gestor Geral pode executá-la.
router.delete('/:id', auth, async (req, res) => {
  try {
    if (inferirPerfil(req.usuario) !== PERFIS.GESTOR_GERAL) {
      return res.status(403).json({ erro: 'Apenas o Gestor Geral pode excluir projetos permanentemente.' });
    }

    const id = Number(req.params.id);
    const tenantId = Number(req.tenantId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'Projeto inválido.' });
    }
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ erro: 'Tenant não definido.' });
    }

    const projetoExcluido = await withClient(async (client) => {
      const projetoAnterior = await getWithClient(
        client,
        'SELECT * FROM projetos WHERE id = ? AND tenant_id = ? FOR UPDATE',
        [id, tenantId]
      );
      if (!projetoAnterior) return null;

      await removerDependenciasOperacionaisDoProjeto(client, id);

      await execWithClient(client, `
        INSERT INTO auditoria (tabela, registro_id, acao, dados_anteriores, dados_novos, usuario_id, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        'projetos',
        id,
        'DELETE',
        JSON.stringify(projetoAnterior),
        null,
        req.usuario.id,
        tenantId
      ]);

      const result = await execWithClient(
        client,
        'DELETE FROM projetos WHERE id = ? AND tenant_id = ?',
        [id, tenantId]
      );
      if (result.changes !== 1) {
        throw new Error('Não foi possível excluir o projeto.');
      }
      return projetoAnterior;
    });

    if (!projetoExcluido) {
      return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });
    }

    return res.json({ mensagem: 'Projeto excluído permanentemente com sucesso.' });

  } catch (error) {
    console.error('Erro ao excluir projeto permanentemente:', error);
    if (error?.code === '23503') {
      const dependencia = error.constraint || error.table || 'não identificada';
      return res.status(409).json({
        erro: `Ainda existem dados vinculados que impedem a exclusão deste projeto (${dependencia}).`,
        codigo: 'PROJECT_DELETE_DEPENDENCY'
      });
    }
    res.status(500).json({ erro: 'Erro ao processar solicitação de exclusão.' });
  }
});

// Arquivar projeto
router.patch('/:id/arquivar', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });

    const projetoAnterior = await getQuery('SELECT * FROM projetos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!projetoAnterior) return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });

    await runQuery(
      'UPDATE projetos SET arquivado = 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    const projetoNovo = await getQuery('SELECT * FROM projetos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    await registrarAuditoria('projetos', id, 'ARCHIVE', projetoAnterior, projetoNovo, req.usuario.id);

    res.json({ mensagem: 'Projeto arquivado com sucesso.', projeto: projetoNovo });

  } catch (error) {
    console.error('Erro ao arquivar projeto:', error);
    res.status(500).json({ erro: 'Erro ao arquivar projeto.' });
  }
});

// Desarquivar projeto
router.patch('/:id/desarquivar', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });

    const projetoAnterior = await getQuery('SELECT * FROM projetos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (!projetoAnterior) return res.status(404).json({ erro: 'Projeto não encontrado ou não pertence ao seu tenant.' });

    await runQuery(
      'UPDATE projetos SET arquivado = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    const projetoNovo = await getQuery('SELECT * FROM projetos WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    await registrarAuditoria('projetos', id, 'UNARCHIVE', projetoAnterior, projetoNovo, req.usuario.id);

    res.json({ mensagem: 'Projeto desarchivado com sucesso.', projeto: projetoNovo });

  } catch (error) {
    console.error('Erro ao desarquivar projeto:', error);
    res.status(500).json({ erro: 'Erro ao desarquivar projeto.' });
  }
});

// Copiar EAP de um projeto para outro
router.post('/:destinoId/copiar-eap', [auth, isGestor], async (req, res) => {
  try {
    const destinoId = Number(req.params.destinoId);
    const origemId = Number(req.body.origem_projeto_id);
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ erro: 'Tenant não definido.' });

    if (!origemId || !destinoId || origemId === destinoId) {
      return res.status(400).json({ erro: 'IDs de origem e destino inválidos.' });
    }

    const destino = await getQuery('SELECT id FROM projetos WHERE id = ? AND ativo = 1 AND tenant_id = ?', [destinoId, tenantId]);
    if (!destino) return res.status(404).json({ erro: 'Projeto destino não encontrado ou não pertence ao seu tenant.' });

    const origem = await getQuery('SELECT id FROM projetos WHERE id = ? AND ativo = 1 AND tenant_id = ?', [origemId, tenantId]);
    if (!origem) return res.status(404).json({ erro: 'Projeto origem não encontrado ou não pertence ao seu tenant.' });

    // Verificar se destino já tem atividades
    const existentes = await getQuery('SELECT COUNT(*) as total FROM atividades_eap WHERE projeto_id = ? AND tenant_id = ?', [destinoId, tenantId]);
    if (existentes.total > 0) {
      return res.status(409).json({ erro: 'O projeto destino já possui EAP configurada.' });
    }

    // Buscar todas as atividades da origem ordenadas por hierarquia (pai antes de filho)
    const atividades = await allQuery(
      'SELECT * FROM atividades_eap WHERE projeto_id = ? AND tenant_id = ? ORDER BY CASE WHEN pai_id IS NULL THEN 0 ELSE 1 END ASC, ordem ASC, id ASC',
      [origemId, tenantId]
    );

    if (atividades.length === 0) {
      return res.status(404).json({ erro: 'O projeto origem não possui atividades EAP.' });
    }

    // Mapeia id original -> novo id inserido
    const mapaIds = {};

    for (const at of atividades) {
      const novoPaiId = at.pai_id ? (mapaIds[at.pai_id] ?? null) : null;
      const result = await runQuery(`
        INSERT INTO atividades_eap
          (tenant_id, projeto_id, id_atividade, codigo_eap, nome, descricao, percentual_previsto, peso_percentual_projeto,
           data_inicio_planejada, data_fim_planejada, status, pai_id, ordem, unidade_medida, quantidade_total, criado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Não iniciada', ?, ?, ?, ?, ?)
      `, [
        tenantId,
        destinoId,
        at.id_atividade,
        at.codigo_eap,
        at.nome,
        at.descricao,
        at.percentual_previsto,
        at.peso_percentual_projeto,
        at.data_inicio_planejada,
        at.data_fim_planejada,
        novoPaiId,
        at.ordem,
        at.unidade_medida,
        at.quantidade_total,
        req.usuario.id
      ]);
      mapaIds[at.id] = result.lastID;
    }

    res.status(201).json({ mensagem: `EAP copiada com sucesso. ${atividades.length} atividade(s) importada(s).`, total: atividades.length });

  } catch (error) {
    console.error('Erro ao copiar EAP:', error);
    res.status(500).json({ erro: 'Erro ao copiar EAP.' });
  }
});

module.exports = router;
