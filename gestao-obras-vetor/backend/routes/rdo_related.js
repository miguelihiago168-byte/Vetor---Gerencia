const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runQuery, allQuery, getQuery } = require('../config/database');
const { auth, isGestor } = require('../middleware/auth');
const { ensureSchemaReady } = require('../utils/schemaGuard');

const router = express.Router();

// Uploads config (reusing backend/uploads)
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const tenantUploadRelativeDir = (tenantId) => `tenant_${Number(tenantId)}`;

const ensureTenantUploadDir = (tenantId) => {
  const numericTenantId = Number(tenantId);
  if (!Number.isInteger(numericTenantId) || numericTenantId <= 0) {
    throw new Error('Tenant invalido para upload.');
  }
  const dir = path.join(uploadsDir, tenantUploadRelativeDir(numericTenantId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const resolveUploadPath = (storedPath) => {
  const normalized = path.normalize(String(storedPath || '')).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.resolve(uploadsDir, normalized);
  const root = path.resolve(uploadsDir);
  if (!fullPath.startsWith(root + path.sep)) {
    throw new Error('Caminho de arquivo invalido.');
  }
  return fullPath;
};

const sanitizeFilename = (name) => {
  const ext = path.extname(String(name || '')).toLowerCase();
  const base = path.basename(String(name || 'arquivo'), ext)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'arquivo';
  return `${base}${ext}`;
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      cb(null, ensureTenantUploadDir(req.tenantId));
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${sanitizeFilename(file.originalname)}`);
  }
});

const uploadFoto = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExt = /\.(jpe?g|jfif|png|webp|gif|heic|heif|bmp|tiff?)$/i;
    const allowedMime = /^image\//i;
    const extOk = allowedExt.test(String(file.originalname || '').toLowerCase());
    const mime = String(file.mimetype || '').toLowerCase();
    const mimeOk = allowedMime.test(mime) || !mime || mime === 'application/octet-stream';
    if (extOk && mimeOk) return cb(null, true);
    return cb(new Error('Apenas imagens são permitidas na galeria de fotos do RDO.'));
  }
});

const uploadFotoSingle = (req, res, next) => {
  uploadFoto.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ erro: 'A foto excede o limite permitido de 10 MB.' });
    }
    return res.status(400).json({ erro: err.message || 'Arquivo de foto inválido.' });
  });
};

const ensureRdoFotosSchema = async () => {
  await ensureSchemaReady({ getQuery, allQuery }, {
    tables: ['rdo_fotos'],
    columns: {
      rdo_fotos: ['rdo_id', 'rdo_atividade_id', 'nome_arquivo', 'caminho_arquivo', 'descricao', 'criado_por', 'criado_em', 'tenant_id', 'atividade_avulsa_descricao', 'ordem', 'tipo', 'tamanho', 'largura', 'altura']
    }
  });
};

const garantirTabelaMaoObraDireta = async () => {
  await ensureSchemaReady({ getQuery, allQuery }, {
    tables: ['mao_obra_direta'],
    columns: {
      mao_obra_direta: ['identificador', 'projeto_id', 'nome', 'funcao', 'ativo', 'criado_em', 'atualizado_em', 'criado_por', 'baixado_em', 'baixado_por']
    }
  });
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
        const numero = `RDO-${String(rdo.numero_rdo || rdoId).padStart(3, '0')}`;
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
    const { nome_material, quantidade, unidade, numero_nf } = req.body;
    const tipoMovimento = req.body?.tipo_movimento === 'utilizado' ? 'utilizado' : 'recebido';
    if (!nome_material) return res.status(400).json({ erro: 'Nome do material requerido.' });
    const nf = String(numero_nf || '').trim();
    const result = await runQuery(
      'INSERT INTO rdo_materiais (rdo_id, nome_material, quantidade, unidade, numero_nf, tipo_movimento) VALUES (?, ?, ?, ?, ?, ?)',
      [rdoId, nome_material, quantidade || 0, unidade || null, nf || null, tipoMovimento]
    );
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
  await ensureSchemaReady({ getQuery, allQuery }, {
    tables: ['rdo_equipamentos'],
    columns: {
      rdo_equipamentos: ['rdo_id', 'nome', 'quantidade', 'horario_utilizacao', 'horas_utilizadas', 'observacao']
    }
  });
};

// Catálogo de equipamentos já usados na obra
router.get('/projeto/:projetoId/equipamentos-catalogo', auth, async (req, res) => {
  try {
    await garantirTabelaEquipamentos();
    const { projetoId } = req.params;

    const projeto = await getQuery(
      'SELECT id, tenant_id FROM projetos WHERE id = ? LIMIT 1',
      [projetoId]
    );
    if (!projeto || Number(projeto.tenant_id) !== Number(req.tenantId)) {
      return res.status(403).json({ erro: 'Projeto fora do tenant ativo.' });
    }

    const rows = await allQuery(`
      SELECT MIN(TRIM(e.nome)) AS nome, COUNT(*) AS usos, MAX(r.data_relatorio) AS ultimo_uso
      FROM rdo_equipamentos e
      INNER JOIN rdos r ON r.id = e.rdo_id
      WHERE r.projeto_id = ?
        AND r.tenant_id = ?
        AND TRIM(COALESCE(e.nome, '')) <> ''
      GROUP BY LOWER(TRIM(e.nome))
      ORDER BY LOWER(TRIM(e.nome))
    `, [projetoId, req.tenantId]);

    res.json(rows || []);
  } catch (err) {
    console.error('Erro ao listar catálogo de equipamentos do RDO', err);
    res.status(500).json({ erro: 'Erro ao listar equipamentos salvos.' });
  }
});

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
    const horarioUtilizacao = String(req.body?.horario_utilizacao || '').trim() || null;
    const horasUtilizadas = req.body?.horas_utilizadas === '' || req.body?.horas_utilizadas == null ? null : Number(req.body.horas_utilizadas);
    const observacao = String(req.body?.observacao || '').trim() || null;
    if (!nome) return res.status(400).json({ erro: 'Nome do equipamento é obrigatório.' });
    const result = await runQuery(
      'INSERT INTO rdo_equipamentos (rdo_id, nome, quantidade, horario_utilizacao, horas_utilizadas, observacao) VALUES (?, ?, ?, ?, ?, ?)',
      [rdoId, nome, isFinite(quantidade) ? quantidade : 1, horarioUtilizacao, Number.isFinite(horasUtilizadas) ? horasUtilizadas : null, observacao]
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
router.post('/:rdoId/foto', auth, uploadFotoSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    await ensureRdoFotosSchema();
    const { rdoId } = req.params;
    const { rdo_atividade_id, atividade_eap_id, descricao, atividade_avulsa_descricao } = req.body;
    const { originalname, filename, mimetype, size } = req.file;
    const caminhoArquivo = path.posix.join(tenantUploadRelativeDir(req.tenantId), filename);
    const atividadeAvulsaDescricao = String(atividade_avulsa_descricao || '').trim();
    let rdoAtividadeId = rdo_atividade_id || null;
    if (rdoAtividadeId) {
      const atividade = await getQuery(
        'SELECT id FROM rdo_atividades WHERE id = ? AND rdo_id = ? LIMIT 1',
        [rdoAtividadeId, rdoId]
      );
      if (!atividade) rdoAtividadeId = null;
    }
    if (!rdoAtividadeId && atividade_eap_id) {
      const atividade = await getQuery(
        'SELECT id FROM rdo_atividades WHERE rdo_id = ? AND atividade_eap_id = ? LIMIT 1',
        [rdoId, atividade_eap_id]
      );
      if (atividade?.id) rdoAtividadeId = atividade.id;
    }
    if (!rdoAtividadeId && !atividadeAvulsaDescricao) {
      try {
        const savedPath = req.file.path;
        if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
      } catch (_) {}
      return res.status(400).json({ erro: 'Vincule a foto a uma atividade antes de enviar.' });
    }

    const ordemRow = await getQuery('SELECT COALESCE(MAX(ordem), 0) AS max_ordem FROM rdo_fotos WHERE rdo_id = ?', [rdoId]);
    const ordem = Number(ordemRow?.max_ordem || 0) + 1;

    // Salvar no table rdo_fotos
    const result = await runQuery(
      'INSERT INTO rdo_fotos (rdo_id, rdo_atividade_id, nome_arquivo, caminho_arquivo, descricao, atividade_avulsa_descricao, ordem, criado_por, tenant_id, tipo, tamanho) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [rdoId, rdoAtividadeId, originalname, caminhoArquivo, descricao || null, atividadeAvulsaDescricao || null, ordem, req.usuario.id, req.tenantId, mimetype || null, size || null]
    );

    // Retornar os metadados já persistidos. Assim o cliente não precisa
    // inferir data ou descrição a partir do relógio local após o upload.
    const foto = await getQuery(
      'SELECT id, rdo_id, rdo_atividade_id, nome_arquivo, caminho_arquivo, descricao, atividade_avulsa_descricao, ordem, criado_em, tipo, tamanho FROM rdo_fotos WHERE id = ? AND rdo_id = ?',
      [result.lastID, rdoId]
    );

    // Retornar informação do arquivo para o frontend
    res.status(201).json({
      mensagem: 'Foto enviada.',
      id: result.lastID,
      arquivo: { nome_arquivo: foto?.nome_arquivo || originalname, caminho_arquivo: foto?.caminho_arquivo || caminhoArquivo },
      foto,
      ordem: foto?.ordem ?? ordem,
      tipo: foto?.tipo ?? mimetype ?? null,
      tamanho: foto?.tamanho ?? size ?? null,
      url: `/api/rdo/${rdoId}/foto/${result.lastID}/download`
    });
  } catch (err) {
    if (req.file?.filename) {
      try {
        const savedPath = req.file.path;
        if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
      } catch (_) {}
    }
    console.error('Erro ao enviar foto', err);
    const message = String(err?.message || '');
    if (/relation .* does not exist|column .* does not exist/i.test(message)) {
      return res.status(500).json({
        erro: 'Erro ao enviar foto. O banco de dados precisa ser atualizado para suportar fotos do RDO.'
      });
    }
    res.status(500).json({ erro: 'Erro ao enviar foto.' });
  }
});

// Atualizar descrição da foto
router.get('/:rdoId/foto/:fotoId/download', auth, async (req, res) => {
  try {
    const { rdoId, fotoId } = req.params;
    const foto = await getQuery('SELECT * FROM rdo_fotos WHERE id = ? AND rdo_id = ?', [fotoId, rdoId]);
    if (!foto) return res.status(404).json({ erro: 'Foto não encontrada.' });

    const filePath = resolveUploadPath(foto.caminho_arquivo || '');
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo da foto não encontrado no servidor.' });
    }

    res.setHeader('Content-Type', foto.tipo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(foto.nome_arquivo || 'foto')}"`);
    return res.sendFile(filePath);
  } catch (err) {
    console.error('Erro ao baixar foto do RDO', err);
    return res.status(500).json({ erro: 'Erro ao baixar foto do RDO.' });
  }
});

router.patch('/:rdoId/foto/:fotoId', auth, async (req, res) => {
  try {
    const { rdoId, fotoId } = req.params;
    const descricao = String(req.body?.descricao || '').trim() || null;

    const foto = await getQuery('SELECT id FROM rdo_fotos WHERE id = ? AND rdo_id = ?', [fotoId, rdoId]);
    if (!foto) return res.status(404).json({ erro: 'Foto não encontrada.' });

    await runQuery('UPDATE rdo_fotos SET descricao = ? WHERE id = ? AND rdo_id = ?', [descricao, fotoId, rdoId]);
    const fotoAtualizada = await getQuery(
      'SELECT id, rdo_id, rdo_atividade_id, nome_arquivo, caminho_arquivo, descricao, atividade_avulsa_descricao, ordem, criado_em, tipo, tamanho FROM rdo_fotos WHERE id = ? AND rdo_id = ?',
      [fotoId, rdoId]
    );
    res.json({ mensagem: 'Descrição da foto atualizada.', foto: fotoAtualizada });
  } catch (err) {
    console.error('Erro ao atualizar descrição da foto', err);
    res.status(500).json({ erro: 'Erro ao atualizar descrição da foto.' });
  }
});

router.delete('/:rdoId/foto/:fotoId', auth, async (req, res) => {
  try {
    const { rdoId, fotoId } = req.params;
    const foto = await getQuery('SELECT id, caminho_arquivo FROM rdo_fotos WHERE id = ? AND rdo_id = ?', [fotoId, rdoId]);
    if (!foto) return res.status(404).json({ erro: 'Foto não encontrada.' });

    await runQuery('DELETE FROM rdo_fotos WHERE id = ? AND rdo_id = ?', [fotoId, rdoId]);

    const filePath = resolveUploadPath(foto.caminho_arquivo || '');
    if (foto.caminho_arquivo && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }

    return res.json({ mensagem: 'Foto removida.' });
  } catch (err) {
    console.error('Erro ao remover foto do RDO', err);
    return res.status(500).json({ erro: 'Erro ao remover foto do RDO.' });
  }
});

// Reordenar fotos do RDO (ordem persistida)
router.patch('/:rdoId/fotos/ordem', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;
    const fotoIds = Array.isArray(req.body?.foto_ids) ? req.body.foto_ids.map(Number).filter(Boolean) : [];
    if (!fotoIds.length) return res.status(400).json({ erro: 'Lista de fotos inválida.' });

    const existentes = await allQuery('SELECT id FROM rdo_fotos WHERE rdo_id = ?', [rdoId]);
    const idsExistentes = new Set((existentes || []).map((f) => Number(f.id)));
    for (const id of fotoIds) {
      if (!idsExistentes.has(id)) {
        return res.status(400).json({ erro: 'Lista contém foto inválida para este RDO.' });
      }
    }

    await runQuery('BEGIN TRANSACTION');
    try {
      for (let i = 0; i < fotoIds.length; i += 1) {
        await runQuery('UPDATE rdo_fotos SET ordem = ? WHERE id = ? AND rdo_id = ?', [i + 1, fotoIds[i], rdoId]);
      }
      await runQuery('COMMIT');
    } catch (txErr) {
      await runQuery('ROLLBACK');
      throw txErr;
    }

    res.json({ mensagem: 'Ordem das fotos atualizada.' });
  } catch (err) {
    console.error('Erro ao reordenar fotos do RDO', err);
    res.status(500).json({ erro: 'Erro ao reordenar fotos.' });
  }
});

module.exports = router;
