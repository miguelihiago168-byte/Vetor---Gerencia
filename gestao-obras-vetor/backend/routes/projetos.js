const express = require('express');
const { body, validationResult } = require('express-validator');
const { allQuery, runQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

// Listar projetos do usuário
router.get('/', auth, async (req, res) => {
  try {
    let projetos;
    
    if (req.usuario.is_gestor) {
      // Gestor vê todos os projetos
      projetos = await allQuery(`
        SELECT p.*, u.nome as criador
        FROM projetos p
        LEFT JOIN usuarios u ON p.criado_por = u.id
        WHERE p.ativo = 1
        ORDER BY p.criado_em DESC
      `);
    } else {
      // Usuário comum vê apenas projetos vinculados
      projetos = await allQuery(`
        SELECT p.*, u.nome as criador
        FROM projetos p
        INNER JOIN projeto_usuarios pu ON p.id = pu.projeto_id
        LEFT JOIN usuarios u ON p.criado_por = u.id
        WHERE pu.usuario_id = ? AND p.ativo = 1
        ORDER BY p.criado_em DESC
      `, [req.usuario.id]);
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

// Obter detalhes de um projeto
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const projeto = await getQuery(`
      SELECT p.*, u.nome as criador
      FROM projetos p
      LEFT JOIN usuarios u ON p.criado_por = u.id
      WHERE p.id = ? AND p.ativo = 1
    `, [id]);

    if (!projeto) {
      return res.status(404).json({ erro: 'Projeto não encontrado.' });
    }

    // Verificar se usuário tem acesso
    if (!req.usuario.is_gestor) {
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
      SELECT u.id, u.login, u.nome, u.email, u.is_gestor
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
    try {
      const criadoEm = projeto.criado_em ? new Date(projeto.criado_em) : null;
      const prazoTermino = projeto.prazo_termino ? new Date(projeto.prazo_termino) : null;
      if (criadoEm && prazoTermino) {
        const msDia = 1000 * 60 * 60 * 24;
        const prazoContratual = Math.round((prazoTermino - criadoEm) / msDia);
        const hoje = new Date();
        const prazoDecorrido = Math.max(0, Math.round((hoje - criadoEm) / msDia));
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

// Criar projeto
router.post('/', [auth, isGestor], [
  body('nome').trim().notEmpty(),
  body('empresa_responsavel').trim().notEmpty(),
  body('empresa_executante').trim().notEmpty(),
  body('prazo_termino').isDate(),
  body('cidade').trim().notEmpty(),
  body('usuarios').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });
    }

    const { nome, empresa_responsavel, empresa_executante, prazo_termino, cidade, usuarios } = req.body;

    const result = await runQuery(`
      INSERT INTO projetos (nome, empresa_responsavel, empresa_executante, prazo_termino, cidade, criado_por)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [nome, empresa_responsavel, empresa_executante, prazo_termino, cidade, req.usuario.id]);

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
    const { nome, empresa_responsavel, empresa_executante, prazo_termino, cidade, usuarios } = req.body;

    const projetoAnterior = await getQuery('SELECT * FROM projetos WHERE id = ?', [id]);

    await runQuery(`
      UPDATE projetos 
      SET nome = ?, empresa_responsavel = ?, empresa_executante = ?, prazo_termino = ?, cidade = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [nome, empresa_responsavel, empresa_executante, prazo_termino, cidade, id]);

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

// Desativar projeto
router.delete('/:id', [auth, isGestor], async (req, res) => {
  try {
    const { id } = req.params;

    await runQuery(
      'UPDATE projetos SET ativo = 0, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    await registrarAuditoria('projetos', id, 'DELETE', null, { ativo: 0 }, req.usuario.id);

    res.json({ mensagem: 'Projeto desativado com sucesso.' });

  } catch (error) {
    console.error('Erro ao desativar projeto:', error);
    res.status(500).json({ erro: 'Erro ao desativar projeto.' });
  }
});

module.exports = router;
