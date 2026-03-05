const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runQuery, allQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');

const router = express.Router();

// Uploads config (reusing backend/uploads)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const garantirTabelaMaoObraDireta = async () => {
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

  const colunas = await allQuery('PRAGMA table_info(mao_obra_direta)');
  const temProjetoId = (colunas || []).some((col) => String(col.name) === 'projeto_id');
  if (!temProjetoId) {
    await runQuery('ALTER TABLE mao_obra_direta ADD COLUMN projeto_id INTEGER');
  }
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

// Execução acumulada por atividade (somatório de quantidade_executada em RDOs aprovados)
router.get('/projeto/:projetoId/execucao-atividades', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    const rows = await allQuery(`
      SELECT ra.atividade_eap_id AS atividade_eap_id,
             COALESCE(SUM(COALESCE(ra.quantidade_executada, 0)), 0) AS total_executado
      FROM rdo_atividades ra
      INNER JOIN rdos r ON ra.rdo_id = r.id
      WHERE r.projeto_id = ? AND r.status = 'Aprovado'
      GROUP BY ra.atividade_eap_id
    `, [projetoId]);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao calcular execução acumulada de atividades', err);
    res.status(500).json({ erro: 'Erro ao calcular execução acumulada.' });
  }
});

// Lista combinada de colaboradores para preenchimento de mão de obra no RDO
router.get('/projeto/:projetoId/colaboradores', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    await garantirTabelaMaoObraDireta();

    const usuariosSistema = await allQuery(`
      SELECT DISTINCT TRIM(u.nome) AS nome, TRIM(COALESCE(u.funcao, '')) AS funcao, 'usuario_sistema' AS origem
      FROM usuarios u
      INNER JOIN projeto_usuarios pu ON pu.usuario_id = u.id
      WHERE pu.projeto_id = ?
        AND u.deletado_em IS NULL
        AND COALESCE(u.ativo, 1) = 1
        AND TRIM(COALESCE(u.nome, '')) <> ''
    `, [projetoId]);

    let maoObraDireta = [];
    try {
      maoObraDireta = await allQuery(`
        SELECT TRIM(nome) AS nome, TRIM(COALESCE(funcao, '')) AS funcao, 'mao_obra_direta' AS origem
        FROM mao_obra_direta
        WHERE COALESCE(ativo, 1) = 1
          AND projeto_id = ?
          AND TRIM(COALESCE(nome, '')) <> ''
      `, [projetoId]);
    } catch (erroTabela) {
      maoObraDireta = [];
    }

    const mapaUnico = new Map();
    [...usuariosSistema, ...maoObraDireta].forEach((item) => {
      const nome = String(item.nome || '').trim();
      const funcao = String(item.funcao || '').trim();
      if (!nome) return;
      const chave = `${nome.toLowerCase()}|${funcao.toLowerCase()}`;
      if (!mapaUnico.has(chave)) {
        mapaUnico.set(chave, { nome, funcao, origem: item.origem });
      }
    });

    const lista = Array.from(mapaUnico.values()).sort((a, b) => {
      const cmpNome = a.nome.localeCompare(b.nome, 'pt-BR');
      if (cmpNome !== 0) return cmpNome;
      return a.funcao.localeCompare(b.funcao, 'pt-BR');
    });

    res.json(lista);
  } catch (err) {
    console.error('Erro ao listar colaboradores para RDO', err);
    res.status(500).json({ erro: 'Erro ao listar colaboradores.' });
  }
});

router.post('/projeto/:projetoId/colaboradores', auth, async (req, res) => {
  try {
    const { projetoId } = req.params;
    await garantirTabelaMaoObraDireta();
    const nome = String(req.body?.nome || '').trim();
    const funcao = String(req.body?.funcao || '').trim();

    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
    if (!funcao) return res.status(400).json({ erro: 'Função é obrigatória.' });

    const existente = await getQuery(`
      SELECT id, identificador, projeto_id, nome, funcao, ativo, 'mao_obra_direta' AS origem
      FROM mao_obra_direta
      WHERE projeto_id = ?
        AND LOWER(TRIM(nome)) = LOWER(TRIM(?))
        AND LOWER(TRIM(funcao)) = LOWER(TRIM(?))
      LIMIT 1
    `, [Number(projetoId), nome, funcao]);

    if (existente) {
      return res.status(200).json({ item: existente, criado: false });
    }

    const identificador = await gerarIdentificadorMaoObraDireta();
    const result = await runQuery(`
      INSERT INTO mao_obra_direta (identificador, projeto_id, nome, funcao, ativo, criado_por)
      VALUES (?, ?, ?, ?, 1, ?)
    `, [identificador, Number(projetoId), nome, funcao, req.usuario.id]);

    const item = await getQuery(`
      SELECT id, identificador, projeto_id, nome, funcao, ativo, 'mao_obra_direta' AS origem
      FROM mao_obra_direta
      WHERE id = ?
    `, [result.lastID]);

    return res.status(201).json({ item, criado: true });
  } catch (err) {
    console.error('Erro ao cadastrar colaborador para RDO', err);
    return res.status(500).json({ erro: 'Erro ao cadastrar colaborador.' });
  }
});

// Adicionar mão de obra a um RDO (registro de horário)
router.post('/:rdoId/mao_obra', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { mao_obra_id, horario_entrada, horario_saida_almoco, horario_retorno_almoco, horario_saida_final } = req.body;

    const toMinutes = (t) => {
      if (!t) return null;
      const m = t.match(/(\d{1,2}):(\d{2})/);
      if (!m) return null;
      return parseInt(m[1],10) * 60 + parseInt(m[2],10);
    };

    const inicio = toMinutes(horario_entrada);
    const fim = toMinutes(horario_saida_final);
    const intInicio = toMinutes(horario_saida_almoco);
    const intFim = toMinutes(horario_retorno_almoco);

    let total = 0;
    if (inicio != null && fim != null && fim > inicio) {
      total = Math.max(0, fim - inicio);
      if (intInicio != null && intFim != null && intFim > intInicio) total = Math.max(0, total - (intFim - intInicio));
    }
    const horas = Math.round((total / 60) * 100) / 100;

    const result = await runQuery(`
      INSERT INTO rdo_mao_obra (rdo_id, mao_obra_id, horario_entrada, horario_saida_almoco, horario_retorno_almoco, horario_saida_final, horas_trabalhadas)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [rdoId, mao_obra_id, horario_entrada, horario_saida_almoco, horario_retorno_almoco, horario_saida_final, horas]);

    res.status(201).json({ mensagem: 'Mão de obra vinculada ao RDO', id: result.lastID, horas_trabalhadas: horas });
  } catch (err) {
    console.error('Erro ao vincular mão de obra', err);
    res.status(500).json({ erro: 'Erro ao vincular mão de obra.' });
  }
});

// Listar mao_obra vinculada a um RDO
router.get('/:rdoId/mao_obra', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const rows = await allQuery('SELECT rmo.*, mo.nome, mo.funcao FROM rdo_mao_obra rmo LEFT JOIN mao_obra mo ON rmo.mao_obra_id = mo.id WHERE rmo.rdo_id = ? ORDER BY rmo.id', [rdoId]);
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar mão de obra do RDO', err);
    res.status(500).json({ erro: 'Erro ao listar.' });
  }
});

// Clima: criar/atualizar
router.post('/:rdoId/clima', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { periodo, condicao_tempo, condicao_trabalho, pluviometria_mm } = req.body;
    if (!periodo) return res.status(400).json({ erro: 'Período requerido.' });

    // Upsert: se já existir registro para periodo neste rdo, atualizar
    const existe = await getQuery('SELECT id FROM rdo_clima WHERE rdo_id = ? AND periodo = ?', [rdoId, periodo]);
    if (existe) {
      await runQuery('UPDATE rdo_clima SET condicao_tempo = ?, condicao_trabalho = ?, pluviometria_mm = ?, criado_em = CURRENT_TIMESTAMP WHERE id = ?', [condicao_tempo, condicao_trabalho, pluviometria_mm || 0, existe.id]);
      return res.json({ mensagem: 'Clima atualizado.' });
    }

    const result = await runQuery('INSERT INTO rdo_clima (rdo_id, periodo, condicao_tempo, condicao_trabalho, pluviometria_mm) VALUES (?, ?, ?, ?, ?)', [rdoId, periodo, condicao_tempo || null, condicao_trabalho || null, pluviometria_mm || 0]);
    res.status(201).json({ mensagem: 'Clima registrado.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao registrar clima', err);
    res.status(500).json({ erro: 'Erro ao registrar clima.' });
  }
});

// Comentários
router.post('/:rdoId/comentario', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { comentario } = req.body;
    if (!comentario) return res.status(400).json({ erro: 'Comentario vazio.' });
    const result = await runQuery('INSERT INTO rdo_comentarios (rdo_id, usuario_id, comentario) VALUES (?, ?, ?)', [rdoId, req.usuario.id, comentario]);

    // Notificar o criador do RDO (sem duplicar e sem notificar o próprio autor)
    try {
      const rdo = await getQuery('SELECT criado_por, numero_rdo FROM rdos WHERE id = ?', [rdoId]);
      if (rdo && rdo.criado_por && rdo.criado_por !== req.usuario.id) {
        const numero = rdo.numero_rdo ? String(rdo.numero_rdo) : `RDO-${String(rdoId).padStart(3,'0')}`;
        await runQuery(
          'INSERT OR IGNORE INTO notificacoes (usuario_id, tipo, mensagem, referencia_tipo, referencia_id) VALUES (?, ?, ?, ?, ?)',
          [rdo.criado_por, 'rdo_comentario', `Novo comentário no ${numero}.`, 'rdo', Number(rdoId)]
        );
      }
    } catch (e) {
      console.warn('Falha ao notificar comentário de RDO:', e?.message || e);
    }

    res.status(201).json({ mensagem: 'Comentário adicionado.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao adicionar comentario', err);
    res.status(500).json({ erro: 'Erro ao adicionar comentário.' });
  }
});

// Materiais
router.post('/:rdoId/material', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { nome_material, quantidade, unidade } = req.body;
    if (!nome_material) return res.status(400).json({ erro: 'Nome do material requerido.' });
    const result = await runQuery('INSERT INTO rdo_materiais (rdo_id, nome_material, quantidade, unidade) VALUES (?, ?, ?, ?)', [rdoId, nome_material, quantidade || 0, unidade || null]);
    res.status(201).json({ mensagem: 'Material registrado.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao registrar material', err);
    res.status(500).json({ erro: 'Erro ao registrar material.' });
  }
});

// Ocorrências
router.post('/:rdoId/ocorrencia', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { titulo, descricao, gravidade } = req.body;
    if (!descricao) return res.status(400).json({ erro: 'Descrição requerida.' });
    const result = await runQuery('INSERT INTO rdo_ocorrencias (rdo_id, titulo, descricao, gravidade, criado_por) VALUES (?, ?, ?, ?, ?)', [rdoId, titulo || null, descricao, gravidade || null, req.usuario.id]);
    res.status(201).json({ mensagem: 'Ocorrência registrada.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao registrar ocorrencia', err);
    res.status(500).json({ erro: 'Erro ao registrar ocorrencia.' });
  }
});

// Assinaturas (registro simples)
router.post('/:rdoId/assinatura', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { tipo, arquivo_assinatura } = req.body;
    if (!tipo) return res.status(400).json({ erro: 'Tipo requerido.' });
    const result = await runQuery('INSERT INTO rdo_assinaturas (rdo_id, usuario_id, tipo, arquivo_assinatura) VALUES (?, ?, ?, ?)', [rdoId, req.usuario.id, tipo, arquivo_assinatura || null]);
    res.status(201).json({ mensagem: 'Assinatura registrada.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao registrar assinatura', err);
    res.status(500).json({ erro: 'Erro ao registrar assinatura.' });
  }
});

// ──────────────────────────────────────────────────────────────
// EQUIPAMENTOS
// ──────────────────────────────────────────────────────────────

// Garantir tabela rdo_equipamentos
const garantirTabelaEquipamentos = async () => {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS rdo_equipamentos (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      rdo_id    INTEGER NOT NULL,
      nome      TEXT    NOT NULL,
      quantidade REAL   NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE
    )
  `);
};

// Listar equipamentos de um RDO
router.get('/:rdoId/equipamentos', auth, async (req, res) => {
  try {
    await garantirTabelaEquipamentos();
    const { rdoId } = req.params;
    const rows = await allQuery(
      'SELECT * FROM rdo_equipamentos WHERE rdo_id = ? ORDER BY id',
      [rdoId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Erro ao listar equipamentos do RDO', err);
    res.status(500).json({ erro: 'Erro ao listar equipamentos.' });
  }
});

// Adicionar equipamento a um RDO
router.post('/:rdoId/equipamentos', auth, async (req, res) => {
  try {
    await garantirTabelaEquipamentos();
    const { rdoId } = req.params;
    const nome = String(req.body?.nome || '').trim();
    const quantidade = Number(req.body?.quantidade ?? 1);
    if (!nome) return res.status(400).json({ erro: 'Nome do equipamento é obrigatório.' });
    const result = await runQuery(
      'INSERT INTO rdo_equipamentos (rdo_id, nome, quantidade) VALUES (?, ?, ?)',
      [rdoId, nome, isFinite(quantidade) ? quantidade : 1]
    );
    res.status(201).json({ mensagem: 'Equipamento adicionado.', id: result.lastID });
  } catch (err) {
    console.error('Erro ao adicionar equipamento', err);
    res.status(500).json({ erro: 'Erro ao adicionar equipamento.' });
  }
});

// Remover equipamento de um RDO
router.delete('/:rdoId/equipamentos/:equipId', auth, async (req, res) => {
  try {
    const { rdoId, equipId } = req.params;
    await runQuery(
      'DELETE FROM rdo_equipamentos WHERE id = ? AND rdo_id = ?',
      [equipId, rdoId]
    );
    res.json({ mensagem: 'Equipamento removido.' });
  } catch (err) {
    console.error('Erro ao remover equipamento', err);
    res.status(500).json({ erro: 'Erro ao remover equipamento.' });
  }
});

// Upload de fotos vinculadas a atividade do RDO
router.post('/:rdoId/foto', auth, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    const { rdoId } = req.params;
    const { rdo_atividade_id, descricao } = req.body;
    const { originalname, filename, mimetype, size } = req.file;

    // Salvar no table rdo_fotos
    const result = await runQuery('INSERT INTO rdo_fotos (rdo_id, rdo_atividade_id, nome_arquivo, caminho_arquivo, descricao, criado_por) VALUES (?, ?, ?, ?, ?, ?)', [rdoId, rdo_atividade_id || null, originalname, filename, descricao || null, req.usuario.id]);

    // Também manter em anexos para download se necessário
    await runQuery('INSERT INTO anexos (rdo_id, tipo, nome_arquivo, caminho_arquivo, tamanho) VALUES (?, ?, ?, ?, ?)', [rdoId, mimetype, originalname, filename, size]);

    // Retornar informação do arquivo para o frontend
    res.status(201).json({ mensagem: 'Foto enviada.', id: result.lastID, arquivo: { nome_arquivo: originalname, caminho_arquivo: filename } });
  } catch (err) {
    console.error('Erro ao enviar foto', err);
    res.status(500).json({ erro: 'Erro ao enviar foto.' });
  }
});

module.exports = router;
