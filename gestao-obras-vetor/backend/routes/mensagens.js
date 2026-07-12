const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const { allQuery, getQuery, runQuery } = require('../config/database');
const { auth } = require('../middleware/auth');
const { hasProjectAccess } = require('../middleware/rbac');
const { emitMensageriaEvent } = require('../services/mensageriaRealtime');
const emailService = require('../services/emailService');
const { ensureSchemaReady, sendSchemaOutdated } = require('../utils/schemaGuard');

const router = express.Router();

const uploadsRoot = path.join(__dirname, '..', 'uploads', 'mensagens');
if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsRoot);
  },
  filename: (req, file, cb) => {
    const sanitized = String(file.originalname || 'anexo')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}_${sanitized}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

const JANELA_EDICAO_EXCLUSAO_MINUTOS = 10;
const JANELA_EDICAO_EXCLUSAO_SQL = `+${JANELA_EDICAO_EXCLUSAO_MINUTOS} minutes`;
const DURACAO_REUNIAO_MIN = 15;
const DURACAO_REUNIAO_MAX = 12 * 60;

const initializedTenants = new Set();

const ensureMensageriaSchema = async (tenantId) => {
  const tenantKey = Number(tenantId);
  if (!tenantKey || initializedTenants.has(tenantKey)) return;

  await ensureSchemaReady({ getQuery, allQuery }, {
    tables: ['mensagem_conversas', 'mensagem_itens', 'mensagem_recibos', 'mensagem_anexos'],
    columns: {
      mensagem_conversas: ['tenant_id', 'tipo', 'chave_unica', 'projeto_a_id', 'projeto_b_id', 'usuario_a_id', 'usuario_b_id', 'criada_por', 'criado_em', 'atualizado_em'],
      mensagem_itens: ['tenant_id', 'conversa_id', 'remetente_usuario_id', 'conteudo', 'resposta_para_id', 'enviado_em', 'editado_em', 'deletado_em', 'deletado_por_usuario_id', 'respondido_em'],
      mensagem_recibos: ['tenant_id', 'mensagem_id', 'usuario_id', 'entregue_em', 'lido_em', 'respondido_em', 'criado_em'],
      mensagem_anexos: ['tenant_id', 'mensagem_id', 'nome_original', 'caminho', 'mime_type', 'tamanho', 'criado_em'],
      usuarios: ['avatar', 'presenca_status', 'presenca_atualizado_em']
    }
  });

  initializedTenants.add(tenantKey);
};

const ensureReunioesSchema = async (tenantId) => {
  const tenantKey = Number(tenantId);
  if (!tenantKey) return;

  await ensureSchemaReady({ getQuery, allQuery }, {
    tables: ['mensagem_reunioes', 'mensagem_reuniao_participantes'],
    columns: {
      mensagem_reunioes: ['tenant_id', 'projeto_id', 'criada_por', 'assunto', 'descricao', 'inicio_em', 'fim_em', 'status', 'criado_em', 'atualizado_em', 'cancelado_em', 'cancelado_por'],
      mensagem_reuniao_participantes: ['tenant_id', 'reuniao_id', 'usuario_id', 'criado_em']
    }
  });
};

const buildConversaKey = (projetoAId, projetoBId, usuarioAId, usuarioBId) => {
  const p = [Number(projetoAId), Number(projetoBId)].sort((a, b) => a - b);
  const u = [Number(usuarioAId), Number(usuarioBId)].sort((a, b) => a - b);
  return `dir:${p[0]}:${p[1]}:${u[0]}:${u[1]}`;
};

const getOutroUsuarioId = (conversa, usuarioId) => {
  return Number(conversa.usuario_a_id) === Number(usuarioId)
    ? Number(conversa.usuario_b_id)
    : Number(conversa.usuario_a_id);
};

const requireMensagemSchema = async (req, res, next) => {
  try {
    await ensureMensageriaSchema(req.tenantId);
    await ensureReunioesSchema(req.tenantId);
    next();
  } catch (error) {
    console.error('Erro ao garantir schema de mensageria:', error);
    if (sendSchemaOutdated(res, error, 'Schema de mensageria desatualizado. Execute as migrations pendentes.')) return;
    res.status(500).json({ erro: 'Erro ao preparar mensageria.' });
  }
};

const parseDateTimeValue = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text.length === 16 ? `${text}:00` : text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toSqlDateTime = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const toDateOnly = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDateOnly = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
};

const getReuniaoComParticipantes = async (reuniaoId, tenantId) => {
  const reuniao = await getQuery(
    `SELECT mr.*, p.nome AS projeto_nome, u.nome AS criador_nome
     FROM mensagem_reunioes mr
     INNER JOIN projetos p ON p.id = mr.projeto_id
     INNER JOIN usuarios u ON u.id = mr.criada_por
     WHERE mr.id = ? AND mr.tenant_id = ?
     LIMIT 1`,
    [reuniaoId, tenantId]
  );
  if (!reuniao) return null;

  const participantes = await allQuery(
    `SELECT mrp.usuario_id AS id, u.nome, u.avatar, COALESCE(u.presenca_status, 'disponivel') AS presenca_status
     FROM mensagem_reuniao_participantes mrp
     INNER JOIN usuarios u ON u.id = mrp.usuario_id
     WHERE mrp.reuniao_id = ? AND mrp.tenant_id = ?
     ORDER BY u.nome COLLATE NOCASE ASC`,
    [reuniaoId, tenantId]
  );

  return { ...reuniao, participantes: participantes || [] };
};

const assertReuniaoVisible = (reuniao, usuarioId) => {
  if (!reuniao) return false;
  if (Number(reuniao.criada_por) === Number(usuarioId)) return true;
  return (reuniao.participantes || []).some((p) => Number(p.id) === Number(usuarioId));
};

const validateProjetoForReuniao = async (req, projetoId) => {
  const acesso = await hasProjectAccess(req.usuario, projetoId);
  if (!acesso) return { ok: false, status: 403, erro: 'Sem acesso ao projeto da reunião.' };

  const projeto = await getQuery(
    'SELECT id, nome, tenant_id FROM projetos WHERE id = ? AND ativo = 1 LIMIT 1',
    [projetoId]
  );
  if (!projeto) return { ok: false, status: 400, erro: 'Projeto inválido.' };
  if (projeto.tenant_id !== null && projeto.tenant_id !== undefined && Number(projeto.tenant_id) !== Number(req.tenantId)) {
    return { ok: false, status: 400, erro: 'Projeto não pertence ao tenant ativo.' };
  }

  return { ok: true, projeto };
};

const getParticipantesValidos = async (usuarioIds, projetoId) => {
  const ids = Array.from(new Set((usuarioIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0)));
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(', ');
  return allQuery(
    `SELECT DISTINCT u.id, u.nome, u.email
     FROM usuarios u
     INNER JOIN projeto_usuarios pu ON pu.usuario_id = u.id
     WHERE u.id IN (${placeholders})
       AND pu.projeto_id = ?
       AND COALESCE(u.ativo, 1) = 1
       AND u.deletado_em IS NULL`,
    [...ids, projetoId]
  );
};

const notificarParticipantesReuniao = async ({ participantes, tipo, mensagem, reuniaoId, ignorarUsuarioId }) => {
  for (const participante of participantes || []) {
    if (ignorarUsuarioId && Number(participante.id) === Number(ignorarUsuarioId)) continue;
    await runQuery(
      `INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, titulo, mensagem, referencia_tipo, referencia_id)
       VALUES (?, ?, ?, ?, 'reuniao', ?)`,
      [participante.id, tipo, 'Reunião', mensagem, reuniaoId]
    );
  }
};

router.use(auth, requireMensagemSchema);

router.get('/nao-lidas/count', async (req, res) => {
  try {
    const row = await getQuery(
      `SELECT COUNT(*) AS total
       FROM mensagem_recibos mr
       INNER JOIN mensagem_itens mi ON mi.id = mr.mensagem_id
       WHERE mr.usuario_id = ?
         AND mr.tenant_id = ?
         AND mr.lido_em IS NULL
         AND mi.deletado_em IS NULL
         AND mi.remetente_usuario_id != ?`,
      [req.usuario.id, req.tenantId, req.usuario.id]
    );

    res.json({ total: Number(row?.total || 0) });
  } catch (error) {
    console.error('Erro ao contar mensagens não lidas:', error);
    res.status(500).json({ erro: 'Erro ao contar mensagens não lidas.' });
  }
});

router.post(
  '/conversas/direta',
  [
    body('projeto_origem_id').isInt({ min: 1 }),
    body('projeto_destino_id').isInt({ min: 1 }),
    body('destinatario_usuario_id').isInt({ min: 1 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });
      }

      const projetoOrigemId = Number(req.body.projeto_origem_id);
      const projetoDestinoId = Number(req.body.projeto_destino_id);
      const destinatarioId = Number(req.body.destinatario_usuario_id);

      if (destinatarioId === Number(req.usuario.id)) {
        return res.status(400).json({ erro: 'Selecione um destinatário diferente de você.' });
      }

      const acessoOrigem = await hasProjectAccess(req.usuario, projetoOrigemId);
      if (!acessoOrigem) {
        return res.status(403).json({ erro: 'Sem acesso à obra de origem.' });
      }

      const projetos = await allQuery(
        'SELECT id, tenant_id FROM projetos WHERE id IN (?, ?) AND ativo = 1',
        [projetoOrigemId, projetoDestinoId]
      );

      const idsEsperados = Array.from(new Set([projetoOrigemId, projetoDestinoId]));
      const idsRetornados = new Set((projetos || []).map((p) => Number(p.id)));
      const faltandoProjeto = idsEsperados.some((id) => !idsRetornados.has(id));
      const projetoForaDoTenant = (projetos || []).some((p) => {
        const tenantProjeto = p.tenant_id;
        if (tenantProjeto === null || tenantProjeto === undefined || tenantProjeto === '') return false;
        return Number(tenantProjeto) !== Number(req.tenantId);
      });

      if (faltandoProjeto || projetoForaDoTenant) {
        return res.status(400).json({ erro: 'Obras inválidas para o tenant ativo.' });
      }

      const destinatario = await getQuery(
        `SELECT u.id, u.nome
         FROM usuarios u
         INNER JOIN projeto_usuarios pu ON pu.usuario_id = u.id
         WHERE u.id = ?
           AND pu.projeto_id = ?
           AND COALESCE(u.ativo, 1) = 1
           AND u.deletado_em IS NULL
         LIMIT 1`,
        [destinatarioId, projetoDestinoId]
      );

      if (!destinatario) {
        return res.status(400).json({ erro: 'Destinatário não está vinculado à obra de destino.' });
      }

      const chaveUnica = buildConversaKey(projetoOrigemId, projetoDestinoId, req.usuario.id, destinatarioId);
      let conversa = await getQuery(
        'SELECT * FROM mensagem_conversas WHERE tenant_id = ? AND chave_unica = ? LIMIT 1',
        [req.tenantId, chaveUnica]
      );

      if (!conversa) {
        const insert = await runQuery(
          `INSERT INTO mensagem_conversas
           (tenant_id, tipo, chave_unica, projeto_a_id, projeto_b_id, usuario_a_id, usuario_b_id, criada_por)
           VALUES (?, 'direta', ?, ?, ?, ?, ?, ?)`,
          [
            req.tenantId,
            chaveUnica,
            projetoOrigemId,
            projetoDestinoId,
            req.usuario.id,
            destinatarioId,
            req.usuario.id
          ]
        );

        conversa = await getQuery('SELECT * FROM mensagem_conversas WHERE id = ?', [insert.lastID]);
      }

      res.status(201).json({ conversa });
    } catch (error) {
      console.error('Erro ao criar conversa direta:', error);
      res.status(500).json({ erro: 'Erro ao criar conversa.' });
    }
  }
);

router.get('/conversas', async (req, res) => {
  try {
    const projetoId = req.query.projeto_id ? Number(req.query.projeto_id) : null;
    let filtroProjeto = '';
    const queryParams = [
      req.usuario.id,
      req.usuario.id,
      req.usuario.id,
      req.usuario.id,
      req.usuario.id,
      req.usuario.id,
      req.tenantId,
      req.usuario.id,
      req.usuario.id
    ];

    if (projetoId) {
      filtroProjeto = 'AND (mc.projeto_a_id = ? OR mc.projeto_b_id = ?)';
      queryParams.push(projetoId, projetoId);
    }

    const rows = await allQuery(
      `SELECT
         mc.*,
         CASE
           WHEN mc.usuario_a_id = ? THEN ub.nome
           ELSE ua.nome
         END AS outro_usuario_nome,
         CASE
           WHEN mc.usuario_a_id = ? THEN ub.id
           ELSE ua.id
         END AS outro_usuario_id,
         CASE
           WHEN mc.usuario_a_id = ? THEN ub.avatar
           ELSE ua.avatar
         END AS outro_usuario_avatar,
         CASE
           WHEN mc.usuario_a_id = ? THEN COALESCE(ub.presenca_status, 'disponivel')
           ELSE COALESCE(ua.presenca_status, 'disponivel')
         END AS outro_usuario_presenca_status,
         (
           SELECT mi.conteudo
           FROM mensagem_itens mi
           WHERE mi.conversa_id = mc.id
             AND mi.deletado_em IS NULL
           ORDER BY mi.id DESC
           LIMIT 1
         ) AS ultima_mensagem,
         (
           SELECT mi.enviado_em
           FROM mensagem_itens mi
           WHERE mi.conversa_id = mc.id
           ORDER BY mi.id DESC
           LIMIT 1
         ) AS ultima_mensagem_em,
         (
           SELECT COUNT(*)
           FROM mensagem_recibos mr
           INNER JOIN mensagem_itens mi ON mi.id = mr.mensagem_id
           WHERE mi.conversa_id = mc.id
             AND mr.usuario_id = ?
             AND mr.lido_em IS NULL
             AND mi.deletado_em IS NULL
             AND mi.remetente_usuario_id != ?
         ) AS nao_lidas
       FROM mensagem_conversas mc
       INNER JOIN usuarios ua ON ua.id = mc.usuario_a_id
       INNER JOIN usuarios ub ON ub.id = mc.usuario_b_id
       WHERE mc.tenant_id = ?
         AND (mc.usuario_a_id = ? OR mc.usuario_b_id = ?)
         ${filtroProjeto}
       ORDER BY COALESCE(ultima_mensagem_em, mc.criado_em) DESC`,
      queryParams
    );

    res.json(rows.map((row) => ({ ...row, nao_lidas: Number(row.nao_lidas || 0) })));
  } catch (error) {
    console.error('Erro ao listar conversas:', error);
    res.status(500).json({ erro: 'Erro ao listar conversas.' });
  }
});

router.get('/conversas/:conversaId/mensagens', async (req, res) => {
  try {
    const conversaId = Number(req.params.conversaId);
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const beforeId = req.query.before_id ? Number(req.query.before_id) : null;

    const conversa = await getQuery(
      `SELECT * FROM mensagem_conversas
       WHERE id = ? AND tenant_id = ? AND (usuario_a_id = ? OR usuario_b_id = ?)
       LIMIT 1`,
      [conversaId, req.tenantId, req.usuario.id, req.usuario.id]
    );

    if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada.' });

    const params = [conversaId];
    let whereBefore = '';
    if (beforeId) {
      whereBefore = 'AND mi.id < ?';
      params.push(beforeId);
    }
    params.push(limit);

    const mensagens = await allQuery(
      `SELECT
         mi.*,
         u.nome AS remetente_nome,
         u.avatar AS remetente_avatar,
         COALESCE(u.presenca_status, 'disponivel') AS remetente_presenca_status,
         CASE
           WHEN datetime(mi.enviado_em, '${JANELA_EDICAO_EXCLUSAO_SQL}') >= CURRENT_TIMESTAMP THEN 1
           ELSE 0
         END AS dentro_prazo_edicao,
         CASE
           WHEN mi.remetente_usuario_id = ? THEN mr_other.entregue_em
           ELSE mr_self.entregue_em
         END AS entregue_em,
         CASE
           WHEN mi.remetente_usuario_id = ? THEN mr_other.lido_em
           ELSE mr_self.lido_em
         END AS lido_em,
         CASE
           WHEN mi.remetente_usuario_id = ? THEN mr_other.respondido_em
           ELSE mr_self.respondido_em
         END AS respondido_em,
         (
           SELECT json_group_array(json_object(
             'id', ma.id,
             'nome_original', ma.nome_original,
             'caminho', ma.caminho,
             'mime_type', ma.mime_type,
             'tamanho', ma.tamanho
           ))
           FROM mensagem_anexos ma
           WHERE ma.mensagem_id = mi.id
         ) AS anexos_json
       FROM mensagem_itens mi
       INNER JOIN usuarios u ON u.id = mi.remetente_usuario_id
         LEFT JOIN mensagem_recibos mr_self
           ON mr_self.mensagem_id = mi.id
          AND mr_self.usuario_id = ?
         LEFT JOIN mensagem_recibos mr_other
           ON mr_other.mensagem_id = mi.id
          AND mr_other.usuario_id = CASE
            WHEN mi.remetente_usuario_id = ? THEN ?
            ELSE mi.remetente_usuario_id
          END
       WHERE mi.conversa_id = ?
         ${whereBefore}
       ORDER BY mi.id DESC
       LIMIT ?`,
        [
          req.usuario.id,
          req.usuario.id,
          req.usuario.id,
          req.usuario.id,
          req.usuario.id,
          getOutroUsuarioId(conversa, req.usuario.id),
          ...params
        ]
    );

    await runQuery(
      `UPDATE mensagem_recibos
       SET entregue_em = COALESCE(entregue_em, CURRENT_TIMESTAMP)
       WHERE tenant_id = ?
         AND usuario_id = ?
         AND entregue_em IS NULL
         AND mensagem_id IN (
           SELECT id FROM mensagem_itens
           WHERE conversa_id = ? AND remetente_usuario_id != ?
         )`,
      [req.tenantId, req.usuario.id, conversaId, req.usuario.id]
    );

    const payload = mensagens
      .slice()
      .reverse()
      .map((item) => ({
        ...item,
        anexos: item.anexos_json ? JSON.parse(item.anexos_json) : []
      }));

    res.json(payload);
  } catch (error) {
    console.error('Erro ao listar mensagens da conversa:', error);
    res.status(500).json({ erro: 'Erro ao listar mensagens.' });
  }
});

router.post(
  '/conversas/:conversaId/mensagens',
  [
    body('conteudo').isString().trim().isLength({ min: 1, max: 4000 }),
    body('resposta_para_id').optional({ nullable: true }).isInt({ min: 1 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });
      }

      const conversaId = Number(req.params.conversaId);
      const conversa = await getQuery(
        `SELECT * FROM mensagem_conversas
         WHERE id = ? AND tenant_id = ? AND (usuario_a_id = ? OR usuario_b_id = ?)
         LIMIT 1`,
        [conversaId, req.tenantId, req.usuario.id, req.usuario.id]
      );
      if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada.' });

      const insert = await runQuery(
        `INSERT INTO mensagem_itens
         (tenant_id, conversa_id, remetente_usuario_id, conteudo, resposta_para_id)
         VALUES (?, ?, ?, ?, ?)`,
        [req.tenantId, conversaId, req.usuario.id, req.body.conteudo.trim(), req.body.resposta_para_id || null]
      );

      const mensagemId = insert.lastID;
      const destinatarioId = getOutroUsuarioId(conversa, req.usuario.id);

      await runQuery(
        `INSERT OR IGNORE INTO mensagem_recibos (tenant_id, mensagem_id, usuario_id)
         VALUES (?, ?, ?)`,
        [req.tenantId, mensagemId, destinatarioId]
      );

      if (req.body.resposta_para_id) {
        await runQuery(
          'UPDATE mensagem_itens SET respondido_em = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
          [Number(req.body.resposta_para_id), req.tenantId]
        );
      }

      await runQuery(
        `INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id)
         VALUES (?, 'mensagem_nova', ?, 'mensagem', ?)`,
        [
          destinatarioId,
          `Nova mensagem de ${req.usuario.nome || req.usuario.login}`,
          mensagemId
        ]
      );

      try {
        const destinatarioContato = await getQuery(
          'SELECT nome, email FROM usuarios WHERE id = ? LIMIT 1',
          [destinatarioId]
        );

        if (destinatarioContato?.email) {
          const assunto = `Nova mensagem de ${req.usuario.nome || req.usuario.login}`;
          const corpoHtml = `
            <p>Você recebeu uma nova mensagem no Gestão de Obras Vetor.</p>
            <p><strong>Remetente:</strong> ${req.usuario.nome || req.usuario.login}</p>
            <p><strong>Mensagem:</strong> ${req.body.conteudo.trim()}</p>
            <p>Acesse o sistema para responder e acompanhar status de leitura.</p>
          `;

          const emailResult = await emailService.sendEmail(
            req.tenantId,
            req.usuario.id,
            destinatarioContato.email,
            assunto,
            corpoHtml,
            'mensageria_alerta',
            { includeSignature: false }
          );

          if (!emailResult?.success) {
            console.warn('Falha no envio de alerta por email de mensageria:', emailResult?.message || 'sem detalhe');
          }
        }
      } catch (emailErr) {
        console.warn('Erro ao tentar enviar alerta por email de mensageria:', emailErr?.message || emailErr);
      }

      await runQuery('UPDATE mensagem_conversas SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [conversaId]);

      const mensagem = await getQuery(
        `SELECT mi.*, u.nome AS remetente_nome, u.avatar AS remetente_avatar,
                COALESCE(u.presenca_status, 'disponivel') AS remetente_presenca_status
         FROM mensagem_itens mi
         INNER JOIN usuarios u ON u.id = mi.remetente_usuario_id
         WHERE mi.id = ?`,
        [mensagemId]
      );

      emitMensageriaEvent('message.created', {
        tenantId: req.tenantId,
        conversaId,
        targetUserIds: [req.usuario.id, destinatarioId],
        payload: mensagem
      });

      res.status(201).json(mensagem);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      res.status(500).json({ erro: 'Erro ao enviar mensagem.' });
    }
  }
);

router.patch('/conversas/:conversaId/marcar-lidas', async (req, res) => {
  try {
    const conversaId = Number(req.params.conversaId);

    const conversa = await getQuery(
      `SELECT * FROM mensagem_conversas
       WHERE id = ? AND tenant_id = ? AND (usuario_a_id = ? OR usuario_b_id = ?)
       LIMIT 1`,
      [conversaId, req.tenantId, req.usuario.id, req.usuario.id]
    );
    if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada.' });

    await runQuery(
      `UPDATE mensagem_recibos
       SET entregue_em = COALESCE(entregue_em, CURRENT_TIMESTAMP),
           lido_em = COALESCE(lido_em, CURRENT_TIMESTAMP)
       WHERE tenant_id = ?
         AND usuario_id = ?
         AND lido_em IS NULL
         AND mensagem_id IN (
           SELECT id FROM mensagem_itens
           WHERE conversa_id = ? AND remetente_usuario_id != ?
         )`,
      [req.tenantId, req.usuario.id, conversaId, req.usuario.id]
    );

    const outroUsuarioId = getOutroUsuarioId(conversa, req.usuario.id);

    emitMensageriaEvent('message.read', {
      tenantId: req.tenantId,
      conversaId,
      targetUserIds: [outroUsuarioId],
      payload: { conversa_id: conversaId, usuario_id: req.usuario.id, lido_em: new Date().toISOString() }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao marcar conversa como lida:', error);
    res.status(500).json({ erro: 'Erro ao marcar mensagens como lidas.' });
  }
});

router.patch(
  '/mensagens/:mensagemId',
  [body('conteudo').isString().trim().isLength({ min: 1, max: 4000 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });
      }

      const mensagemId = Number(req.params.mensagemId);
      const mensagem = await getQuery(
        `SELECT mi.*, mc.id AS conversa_id, mc.usuario_a_id, mc.usuario_b_id
         FROM mensagem_itens mi
         INNER JOIN mensagem_conversas mc ON mc.id = mi.conversa_id
         WHERE mi.id = ?
           AND mi.tenant_id = ?
           AND mi.remetente_usuario_id = ?
           AND mi.deletado_em IS NULL
           AND datetime(mi.enviado_em, '${JANELA_EDICAO_EXCLUSAO_SQL}') >= CURRENT_TIMESTAMP
         LIMIT 1`,
        [mensagemId, req.tenantId, req.usuario.id]
      );

      if (!mensagem) {
        const mensagemForaPrazo = await getQuery(
          `SELECT id
           FROM mensagem_itens
           WHERE id = ?
             AND tenant_id = ?
             AND remetente_usuario_id = ?
             AND deletado_em IS NULL
           LIMIT 1`,
          [mensagemId, req.tenantId, req.usuario.id]
        );

        if (mensagemForaPrazo) {
          return res.status(403).json({
            erro: `A mensagem só pode ser editada até ${JANELA_EDICAO_EXCLUSAO_MINUTOS} minutos após o envio.`
          });
        }

        return res.status(404).json({ erro: 'Mensagem não encontrada.' });
      }

      await runQuery(
        'UPDATE mensagem_itens SET conteudo = ?, editado_em = CURRENT_TIMESTAMP WHERE id = ?',
        [req.body.conteudo.trim(), mensagemId]
      );

      emitMensageriaEvent('message.updated', {
        tenantId: req.tenantId,
        conversaId: mensagem.conversa_id,
        targetUserIds: [mensagem.usuario_a_id, mensagem.usuario_b_id],
        payload: {
          id: mensagemId,
          conversa_id: mensagem.conversa_id,
          conteudo: req.body.conteudo.trim(),
          editado_em: new Date().toISOString()
        }
      });

      res.json({ ok: true });
    } catch (error) {
      console.error('Erro ao editar mensagem:', error);
      res.status(500).json({ erro: 'Erro ao editar mensagem.' });
    }
  }
);

router.delete('/mensagens/:mensagemId', async (req, res) => {
  try {
    const mensagemId = Number(req.params.mensagemId);
    const mensagem = await getQuery(
      `SELECT mi.*, mc.id AS conversa_id, mc.usuario_a_id, mc.usuario_b_id
       FROM mensagem_itens mi
       INNER JOIN mensagem_conversas mc ON mc.id = mi.conversa_id
       WHERE mi.id = ?
         AND mi.tenant_id = ?
         AND mi.remetente_usuario_id = ?
         AND mi.deletado_em IS NULL
         AND datetime(mi.enviado_em, '${JANELA_EDICAO_EXCLUSAO_SQL}') >= CURRENT_TIMESTAMP
       LIMIT 1`,
      [mensagemId, req.tenantId, req.usuario.id]
    );

    if (!mensagem) {
      const mensagemForaPrazo = await getQuery(
        `SELECT id
         FROM mensagem_itens
         WHERE id = ?
           AND tenant_id = ?
           AND remetente_usuario_id = ?
           AND deletado_em IS NULL
         LIMIT 1`,
        [mensagemId, req.tenantId, req.usuario.id]
      );

      if (mensagemForaPrazo) {
        return res.status(403).json({
          erro: `A mensagem só pode ser apagada até ${JANELA_EDICAO_EXCLUSAO_MINUTOS} minutos após o envio.`
        });
      }

      return res.status(404).json({ erro: 'Mensagem não encontrada.' });
    }

    await runQuery(
      'UPDATE mensagem_itens SET deletado_em = CURRENT_TIMESTAMP, deletado_por_usuario_id = ?, conteudo = ? WHERE id = ?',
      [req.usuario.id, 'Mensagem apagada', mensagemId]
    );

    emitMensageriaEvent('message.deleted', {
      tenantId: req.tenantId,
      conversaId: mensagem.conversa_id,
      targetUserIds: [mensagem.usuario_a_id, mensagem.usuario_b_id],
      payload: {
        id: mensagemId,
        conversa_id: mensagem.conversa_id,
        deletado_em: new Date().toISOString(),
        deletado_por_usuario_id: req.usuario.id,
        conteudo: 'Mensagem apagada'
      }
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Erro ao remover mensagem:', error);
    res.status(500).json({ erro: 'Erro ao remover mensagem.' });
  }
});

router.delete('/conversas/:conversaId/mensagens-apagadas', async (req, res) => {
  try {
    const conversaId = Number(req.params.conversaId);

    const conversa = await getQuery(
      `SELECT * FROM mensagem_conversas
       WHERE id = ? AND tenant_id = ? AND (usuario_a_id = ? OR usuario_b_id = ?)
       LIMIT 1`,
      [conversaId, req.tenantId, req.usuario.id, req.usuario.id]
    );
    if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada.' });

    const mensagensApagadas = await allQuery(
      `SELECT id
       FROM mensagem_itens
       WHERE tenant_id = ?
         AND conversa_id = ?
         AND deletado_em IS NOT NULL`,
      [req.tenantId, conversaId]
    );

    if (!mensagensApagadas.length) {
      return res.json({ ok: true, removidas: 0 });
    }

    const idsMensagens = mensagensApagadas.map((m) => Number(m.id)).filter((id) => Number.isInteger(id));
    const placeholders = idsMensagens.map(() => '?').join(', ');

    const anexos = await allQuery(
      `SELECT id, caminho
       FROM mensagem_anexos
       WHERE tenant_id = ? AND mensagem_id IN (${placeholders})`,
      [req.tenantId, ...idsMensagens]
    );

    for (const anexo of anexos) {
      const nomeArquivo = path.basename(String(anexo.caminho || ''));
      if (!nomeArquivo) continue;
      const arquivoPath = path.join(uploadsRoot, nomeArquivo);
      if (fs.existsSync(arquivoPath)) {
        try {
          fs.unlinkSync(arquivoPath);
        } catch (_) {
          // ignora falha de IO para não bloquear limpeza no banco
        }
      }
    }

    await runQuery(
      `DELETE FROM mensagem_anexos
       WHERE tenant_id = ? AND mensagem_id IN (${placeholders})`,
      [req.tenantId, ...idsMensagens]
    );

    await runQuery(
      `DELETE FROM mensagem_recibos
       WHERE tenant_id = ? AND mensagem_id IN (${placeholders})`,
      [req.tenantId, ...idsMensagens]
    );

    await runQuery(
      `DELETE FROM mensagem_itens
       WHERE tenant_id = ? AND id IN (${placeholders})`,
      [req.tenantId, ...idsMensagens]
    );

    emitMensageriaEvent('message.deleted', {
      tenantId: req.tenantId,
      conversaId,
      targetUserIds: [conversa.usuario_a_id, conversa.usuario_b_id],
      payload: {
        conversa_id: conversaId,
        bulk: true,
        removidas: idsMensagens.length
      }
    });

    res.json({ ok: true, removidas: idsMensagens.length });
  } catch (error) {
    console.error('Erro ao limpar mensagens apagadas em lote:', error);
    res.status(500).json({ erro: 'Erro ao limpar mensagens apagadas.' });
  }
});

router.post('/mensagens/:mensagemId/anexos', upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Arquivo é obrigatório.' });

    const mensagemId = Number(req.params.mensagemId);
    const mensagem = await getQuery(
      `SELECT mi.*, mc.usuario_a_id, mc.usuario_b_id, mc.id AS conversa_id
       FROM mensagem_itens mi
       INNER JOIN mensagem_conversas mc ON mc.id = mi.conversa_id
       WHERE mi.id = ?
         AND mi.tenant_id = ?
         AND mi.remetente_usuario_id = ?
         AND mi.deletado_em IS NULL
       LIMIT 1`,
      [mensagemId, req.tenantId, req.usuario.id]
    );

    if (!mensagem) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ erro: 'Mensagem não encontrada.' });
    }

    const caminhoPublico = `mensagens/${path.basename(req.file.path)}`;

    const insert = await runQuery(
      `INSERT INTO mensagem_anexos
       (tenant_id, mensagem_id, nome_original, caminho, mime_type, tamanho)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.tenantId,
        mensagemId,
        req.file.originalname,
        caminhoPublico,
        req.file.mimetype,
        req.file.size
      ]
    );

    const anexo = await getQuery('SELECT * FROM mensagem_anexos WHERE id = ?', [insert.lastID]);

    emitMensageriaEvent('message.attachment', {
      tenantId: req.tenantId,
      conversaId: mensagem.conversa_id,
      targetUserIds: [mensagem.usuario_a_id, mensagem.usuario_b_id],
      payload: { mensagem_id: mensagemId, anexo }
    });

    res.status(201).json(anexo);
  } catch (error) {
    console.error('Erro ao anexar arquivo na mensagem:', error);
    res.status(500).json({ erro: 'Erro ao anexar arquivo.' });
  }
});

router.get('/reunioes/hoje', async (req, res) => {
  try {
    const projetoId = Number(req.query.projeto_id || 0);
    if (!projetoId) return res.status(400).json({ erro: 'Projeto é obrigatório.' });

    const projetoCheck = await validateProjetoForReuniao(req, projetoId);
    if (!projetoCheck.ok) return res.status(projetoCheck.status).json({ erro: projetoCheck.erro });

    const hoje = new Date();
    const data = toDateOnly(hoje);
    const rows = await allQuery(
      `SELECT DISTINCT mr.*, p.nome AS projeto_nome, u.nome AS criador_nome
       FROM mensagem_reunioes mr
       INNER JOIN projetos p ON p.id = mr.projeto_id
       INNER JOIN usuarios u ON u.id = mr.criada_por
       LEFT JOIN mensagem_reuniao_participantes mrp ON mrp.reuniao_id = mr.id AND mrp.tenant_id = mr.tenant_id
       WHERE mr.tenant_id = ?
         AND mr.projeto_id = ?
         AND mr.status = 'ativa'
         AND date(mr.inicio_em) = date(?)
         AND (mr.criada_por = ? OR mrp.usuario_id = ?)
       ORDER BY mr.inicio_em ASC`,
      [req.tenantId, projetoId, data, req.usuario.id, req.usuario.id]
    );

    const reunioes = [];
    for (const row of rows || []) {
      const detalhada = await getReuniaoComParticipantes(row.id, req.tenantId);
      if (detalhada && assertReuniaoVisible(detalhada, req.usuario.id)) reunioes.push(detalhada);
    }

    res.json(reunioes);
  } catch (error) {
    console.error('Erro ao listar reuniões de hoje:', error);
    res.status(500).json({ erro: 'Erro ao listar reuniões de hoje.' });
  }
});

router.get('/reunioes', async (req, res) => {
  try {
    const projetoId = Number(req.query.projeto_id || 0);
    const dataInicio = parseDateOnly(req.query.data_inicio);
    const dataFim = parseDateOnly(req.query.data_fim);

    if (!projetoId) return res.status(400).json({ erro: 'Projeto é obrigatório.' });
    const projetoCheck = await validateProjetoForReuniao(req, projetoId);
    if (!projetoCheck.ok) return res.status(projetoCheck.status).json({ erro: projetoCheck.erro });

    const filtros = [
      req.tenantId,
      projetoId,
      req.usuario.id,
      req.usuario.id
    ];
    let filtroDatas = '';
    if (dataInicio) {
      filtroDatas += ' AND date(mr.inicio_em) >= date(?)';
      filtros.push(dataInicio);
    }
    if (dataFim) {
      filtroDatas += ' AND date(mr.inicio_em) <= date(?)';
      filtros.push(dataFim);
    }

    const rows = await allQuery(
      `SELECT DISTINCT mr.*, p.nome AS projeto_nome, u.nome AS criador_nome
       FROM mensagem_reunioes mr
       INNER JOIN projetos p ON p.id = mr.projeto_id
       INNER JOIN usuarios u ON u.id = mr.criada_por
       LEFT JOIN mensagem_reuniao_participantes mrp ON mrp.reuniao_id = mr.id AND mrp.tenant_id = mr.tenant_id
       WHERE mr.tenant_id = ?
         AND mr.projeto_id = ?
         AND (mr.criada_por = ? OR mrp.usuario_id = ?)
         ${filtroDatas}
       ORDER BY mr.inicio_em ASC`,
      filtros
    );

    const reunioes = [];
    for (const row of rows || []) {
      const detalhada = await getReuniaoComParticipantes(row.id, req.tenantId);
      if (detalhada && assertReuniaoVisible(detalhada, req.usuario.id)) reunioes.push(detalhada);
    }

    res.json(reunioes);
  } catch (error) {
    console.error('Erro ao listar reuniões:', error);
    res.status(500).json({ erro: 'Erro ao listar reuniões.' });
  }
});

router.post(
  '/reunioes',
  [
    body('projeto_id').isInt({ min: 1 }),
    body('assunto').isString().trim().isLength({ min: 3, max: 160 }),
    body('descricao').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('inicio_em').isString().trim().isLength({ min: 10, max: 40 }),
    body('duracao_minutos').isInt({ min: DURACAO_REUNIAO_MIN, max: DURACAO_REUNIAO_MAX }),
    body('participantes_ids').isArray({ min: 1 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });

      const projetoId = Number(req.body.projeto_id);
      const projetoCheck = await validateProjetoForReuniao(req, projetoId);
      if (!projetoCheck.ok) return res.status(projetoCheck.status).json({ erro: projetoCheck.erro });

      const inicio = parseDateTimeValue(req.body.inicio_em);
      if (!inicio) return res.status(400).json({ erro: 'Data e hora da reunião são inválidas.' });

      const duracao = Number(req.body.duracao_minutos);
      const fim = new Date(inicio.getTime() + duracao * 60 * 1000);
      const participantesSolicitados = Array.from(new Set([...(req.body.participantes_ids || []), req.usuario.id].map(Number)));
      const participantes = await getParticipantesValidos(participantesSolicitados, projetoId);
      const idsValidos = new Set((participantes || []).map((p) => Number(p.id)));
      const faltando = participantesSolicitados.some((id) => !idsValidos.has(Number(id)));
      if (faltando) return res.status(400).json({ erro: 'Todos os participantes devem estar ativos e vinculados ao projeto.' });

      const insert = await runQuery(
        `INSERT INTO mensagem_reunioes
         (tenant_id, projeto_id, criada_por, assunto, descricao, inicio_em, fim_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.tenantId,
          projetoId,
          req.usuario.id,
          req.body.assunto.trim(),
          String(req.body.descricao || '').trim() || null,
          toSqlDateTime(inicio),
          toSqlDateTime(fim)
        ]
      );

      for (const participante of participantes) {
        await runQuery(
          `INSERT OR IGNORE INTO mensagem_reuniao_participantes (tenant_id, reuniao_id, usuario_id)
           VALUES (?, ?, ?)`,
          [req.tenantId, insert.lastID, participante.id]
        );
      }

      const reuniao = await getReuniaoComParticipantes(insert.lastID, req.tenantId);
      const horario = inicio.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      await notificarParticipantesReuniao({
        participantes,
        tipo: 'reuniao_marcada',
        mensagem: `Reunião marcada: ${req.body.assunto.trim()} em ${horario}`,
        reuniaoId: insert.lastID,
        ignorarUsuarioId: req.usuario.id
      });

      res.status(201).json(reuniao);
    } catch (error) {
      console.error('Erro ao criar reunião:', error);
      res.status(500).json({ erro: 'Erro ao criar reunião.' });
    }
  }
);

router.patch(
  '/reunioes/:id',
  [
    body('assunto').isString().trim().isLength({ min: 3, max: 160 }),
    body('descricao').optional({ nullable: true }).isString().trim().isLength({ max: 1000 }),
    body('inicio_em').isString().trim().isLength({ min: 10, max: 40 }),
    body('duracao_minutos').isInt({ min: DURACAO_REUNIAO_MIN, max: DURACAO_REUNIAO_MAX }),
    body('participantes_ids').isArray({ min: 1 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: errors.array() });

      const reuniaoId = Number(req.params.id);
      const reuniaoAtual = await getReuniaoComParticipantes(reuniaoId, req.tenantId);
      if (!reuniaoAtual || !assertReuniaoVisible(reuniaoAtual, req.usuario.id)) {
        return res.status(404).json({ erro: 'Reunião não encontrada.' });
      }
      if (Number(reuniaoAtual.criada_por) !== Number(req.usuario.id)) {
        return res.status(403).json({ erro: 'Apenas o criador pode editar a reunião.' });
      }
      if (reuniaoAtual.status === 'cancelada') {
        return res.status(400).json({ erro: 'Reunião cancelada não pode ser editada.' });
      }

      const inicio = parseDateTimeValue(req.body.inicio_em);
      if (!inicio) return res.status(400).json({ erro: 'Data e hora da reunião são inválidas.' });
      const duracao = Number(req.body.duracao_minutos);
      const fim = new Date(inicio.getTime() + duracao * 60 * 1000);
      const participantesSolicitados = Array.from(new Set([...(req.body.participantes_ids || []), req.usuario.id].map(Number)));
      const participantes = await getParticipantesValidos(participantesSolicitados, Number(reuniaoAtual.projeto_id));
      const idsValidos = new Set((participantes || []).map((p) => Number(p.id)));
      const faltando = participantesSolicitados.some((id) => !idsValidos.has(Number(id)));
      if (faltando) return res.status(400).json({ erro: 'Todos os participantes devem estar ativos e vinculados ao projeto.' });

      await runQuery(
        `UPDATE mensagem_reunioes
         SET assunto = ?, descricao = ?, inicio_em = ?, fim_em = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ? AND tenant_id = ?`,
        [
          req.body.assunto.trim(),
          String(req.body.descricao || '').trim() || null,
          toSqlDateTime(inicio),
          toSqlDateTime(fim),
          reuniaoId,
          req.tenantId
        ]
      );
      await runQuery('DELETE FROM mensagem_reuniao_participantes WHERE reuniao_id = ? AND tenant_id = ?', [reuniaoId, req.tenantId]);
      for (const participante of participantes) {
        await runQuery(
          `INSERT OR IGNORE INTO mensagem_reuniao_participantes (tenant_id, reuniao_id, usuario_id)
           VALUES (?, ?, ?)`,
          [req.tenantId, reuniaoId, participante.id]
        );
      }

      const horario = inicio.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      await notificarParticipantesReuniao({
        participantes,
        tipo: 'reuniao_atualizada',
        mensagem: `Reunião atualizada: ${req.body.assunto.trim()} em ${horario}`,
        reuniaoId,
        ignorarUsuarioId: req.usuario.id
      });

      const reuniao = await getReuniaoComParticipantes(reuniaoId, req.tenantId);
      res.json(reuniao);
    } catch (error) {
      console.error('Erro ao editar reunião:', error);
      res.status(500).json({ erro: 'Erro ao editar reunião.' });
    }
  }
);

router.patch('/reunioes/:id/cancelar', async (req, res) => {
  try {
    const reuniaoId = Number(req.params.id);
    const reuniaoAtual = await getReuniaoComParticipantes(reuniaoId, req.tenantId);
    if (!reuniaoAtual || !assertReuniaoVisible(reuniaoAtual, req.usuario.id)) {
      return res.status(404).json({ erro: 'Reunião não encontrada.' });
    }
    if (Number(reuniaoAtual.criada_por) !== Number(req.usuario.id)) {
      return res.status(403).json({ erro: 'Apenas o criador pode cancelar a reunião.' });
    }
    if (reuniaoAtual.status === 'cancelada') {
      return res.json(reuniaoAtual);
    }

    await runQuery(
      `UPDATE mensagem_reunioes
       SET status = 'cancelada', cancelado_em = CURRENT_TIMESTAMP, cancelado_por = ?, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ? AND tenant_id = ?`,
      [req.usuario.id, reuniaoId, req.tenantId]
    );

    await notificarParticipantesReuniao({
      participantes: reuniaoAtual.participantes || [],
      tipo: 'reuniao_cancelada',
      mensagem: `Reunião cancelada: ${reuniaoAtual.assunto}`,
      reuniaoId,
      ignorarUsuarioId: req.usuario.id
    });

    const reuniao = await getReuniaoComParticipantes(reuniaoId, req.tenantId);
    res.json(reuniao);
  } catch (error) {
    console.error('Erro ao cancelar reunião:', error);
    res.status(500).json({ erro: 'Erro ao cancelar reunião.' });
  }
});

module.exports = router;
