const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runQuery, allQuery, getQuery } = require('../config/database');
const { auth } = require('../middleware/auth');
const { ensureSchemaReady, sendSchemaOutdated } = require('../utils/schemaGuard');

const router = express.Router();

const ensureAnexosRdoSchema = async () => {
  await ensureSchemaReady({ getQuery, allQuery }, {
    columns: { anexos: ['descricao', 'criado_por', 'criado_em'] }
  });
};

const ensureAnexosRncSchema = async () => {
  await ensureSchemaReady({ getQuery, allQuery }, {
    columns: { anexos: ['rnc_id', 'categoria'] }
  });
};

// Criar diretório de uploads se não existir
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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

const allowedRdoAttachmentExt = /\.(jpe?g|png|webp|gif|heic|heif|pdf|doc|docx|xls|xlsx)$/i;
const allowedRdoAttachmentMime = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/i;

const removeUploadedFile = (file) => {
  try {
    if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
  } catch (_) {}
};

// Configurar multer para upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      cb(null, ensureTenantUploadDir(req.tenantId));
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + sanitizeFilename(file.originalname));
  }
});

const uploadGeral = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif|heic|heif|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(String(file.mimetype || '').toLowerCase());

    if (mimetype || extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido.'));
    }
  }
});

const uploadPdfRdo = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = String(path.extname(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (allowedRdoAttachmentExt.test(ext) && allowedRdoAttachmentMime.test(mime)) return cb(null, true);
    return cb(new Error('Tipo de arquivo não permitido para anexos do RDO.'));
  }
});

const uploadAnexoRdoSingle = (req, res, next) => {
  uploadPdfRdo.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ erro: 'O anexo excede o limite permitido de 25 MB.' });
    }
    return res.status(400).json({ erro: err.message || 'Arquivo de anexo inválido.' });
  });
};

// Upload de arquivo
router.post('/upload/:rdoId', auth, uploadAnexoRdoSingle, async (req, res) => {
  try {
    await ensureAnexosRdoSchema();
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    const { rdoId } = req.params;
    const { originalname, filename, mimetype, size } = req.file;
    const caminhoArquivo = path.posix.join(tenantUploadRelativeDir(req.tenantId), filename);
    const descricao = String(req.body?.descricao || '').trim() || null;

    const result = await runQuery(`
      INSERT INTO anexos (rdo_id, tipo, nome_arquivo, caminho_arquivo, tamanho, descricao, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [rdoId, mimetype, originalname, caminhoArquivo, size, descricao, req.usuario?.id || null]);

    res.status(201).json({
      mensagem: 'Arquivo enviado com sucesso.',
      anexo: {
        id: result.lastID,
        nome_arquivo: originalname,
        tipo: mimetype,
        tamanho: size,
        descricao,
        criado_por: req.usuario?.id || null
      }
    });

  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    if (sendSchemaOutdated(res, error, 'Schema de anexos desatualizado. Execute as migrations pendentes.')) return;
    res.status(500).json({ erro: 'Erro ao fazer upload do arquivo.' });
  }
});

// Upload de arquivo para RNC
router.post('/upload-rnc/:rncId', auth, uploadGeral.single('arquivo'), async (req, res) => {
  try {
    await ensureAnexosRncSchema();

    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    const { rncId } = req.params;
    const rnc = await getQuery('SELECT id, projeto_id, rdo_id, status, criado_por, responsavel_id FROM rnc WHERE id = ?', [rncId]);
    if (!rnc) {
      removeUploadedFile(req.file);
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }
    if (rnc.status === 'Encerrada') {
      removeUploadedFile(req.file);
      return res.status(403).json({ erro: 'Não é permitido anexar arquivos em RNC encerrada.' });
    }
    const uid = String(req.usuario?.id ?? '');
    const podeAnexar = uid === String(rnc.criado_por ?? '') || uid === String(rnc.responsavel_id ?? '') || Boolean(req.usuario?.is_gestor);
    if (!podeAnexar) {
      removeUploadedFile(req.file);
      return res.status(403).json({ erro: 'Sem permissão para anexar arquivos nesta RNC.' });
    }

    const anexoColumns = await allQuery('PRAGMA table_info(anexos)');
    const rdoIdColumn = anexoColumns.find((column) => column.name === 'rdo_id');
    const rdoIdObrigatorio = Boolean(rdoIdColumn && Number(rdoIdColumn.notnull) === 1);

    let rdoIdForInsert = rnc.rdo_id || null;
    if (!rdoIdForInsert) {
      const rdoFallback = await getQuery('SELECT id FROM rdos WHERE projeto_id = ? ORDER BY id DESC LIMIT 1', [rnc.projeto_id]);
      rdoIdForInsert = rdoFallback?.id || null;
    }
    if (rdoIdObrigatorio && !rdoIdForInsert) {
      removeUploadedFile(req.file);
      return res.status(400).json({ erro: 'Não foi possível anexar fotos: esta RNC não possui RDO vinculado e o projeto não tem RDO cadastrado.' });
    }

    const { originalname, filename, mimetype, size } = req.file;
    const caminhoArquivo = path.posix.join(tenantUploadRelativeDir(req.tenantId), filename);
    const categoria = req.body.categoria === 'correcao' ? 'correcao' : 'registro';

    const columns = ['rnc_id', 'tipo', 'nome_arquivo', 'caminho_arquivo', 'tamanho', 'categoria'];
    const values = [rncId, mimetype, originalname, caminhoArquivo, size, categoria];
    if (rdoIdForInsert || rdoIdObrigatorio) {
      columns.unshift('rdo_id');
      values.unshift(rdoIdForInsert);
    }

    const placeholders = columns.map(() => '?').join(', ');
    const result = await runQuery(
      `INSERT INTO anexos (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );

    res.status(201).json({
      mensagem: 'Arquivo enviado com sucesso.',
      anexo: {
        id: result.lastID,
        nome_arquivo: originalname,
        caminho_arquivo: caminhoArquivo,
        tipo: mimetype,
        tamanho: size,
        categoria
      }
    });

  } catch (error) {
    removeUploadedFile(req.file);
    console.error('Erro ao fazer upload (RNC):', error);
    if (sendSchemaOutdated(res, error, 'Schema de anexos de RNC desatualizado. Execute as migrations pendentes.')) return;
    res.status(500).json({ erro: 'Erro ao fazer upload do arquivo (RNC).' });
  }
});

// Listar anexos de um RDO
router.get('/rdo/:rdoId', auth, async (req, res) => {
  try {
    await ensureAnexosRdoSchema();
    const { rdoId } = req.params;

    let anexos;
    try {
      anexos = await allQuery(
        `SELECT a.*, u.nome AS usuario_nome
         FROM anexos a
         LEFT JOIN usuarios u ON u.id = a.criado_por
         WHERE a.rdo_id = ?
         ORDER BY a.criado_em DESC, a.id DESC`,
        [rdoId]
      );
    } catch (queryError) {
      if (!/no such column:.*criado_por|no such column:.*criado_em|no such table: usuarios/i.test(String(queryError?.message || ''))) {
        throw queryError;
      }
      anexos = await allQuery(
        `SELECT a.*, NULL AS usuario_nome
         FROM anexos a
         WHERE a.rdo_id = ?
         ORDER BY a.id DESC`,
        [rdoId]
      );
    }

    res.json(anexos);

  } catch (error) {
    console.error('Erro ao listar anexos:', error);
    if (sendSchemaOutdated(res, error, 'Schema de anexos desatualizado. Execute as migrations pendentes.')) return;
    res.status(500).json({ erro: 'Erro ao listar anexos.' });
  }
});

// Listar anexos de uma RNC
router.get('/rnc/:rncId', auth, async (req, res) => {
  try {
    await ensureAnexosRncSchema();

    const { rncId } = req.params;
    const { categoria } = req.query;
    let sql = 'SELECT * FROM anexos WHERE rnc_id = ?';
    const params = [rncId];
    if (categoria === 'registro' || categoria === 'correcao') {
      sql += ' AND (categoria = ? OR (? = \'registro\' AND categoria IS NULL))';
      params.push(categoria, categoria);
    }
    sql += ' ORDER BY criado_em DESC';
    const anexos = await allQuery(sql, params);
    res.json(anexos);
  } catch (error) {
    console.error('Erro ao listar anexos (RNC):', error);
    if (sendSchemaOutdated(res, error, 'Schema de anexos de RNC desatualizado. Execute as migrations pendentes.')) return;
    res.status(500).json({ erro: 'Erro ao listar anexos da RNC.' });
  }
});

// Download de arquivo
router.get('/download/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const anexo = await getQuery(`
      SELECT a.*, r.projeto_id, r.criado_por AS rdo_criado_por
      FROM anexos a
      LEFT JOIN rdos r ON r.id = a.rdo_id
      WHERE a.id = ?
    `, [id]);

    if (!anexo) {
      return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    }

    if (anexo.rdo_id && anexo.projeto_id && !req.usuario?.is_gestor) {
      const vinculo = await getQuery(
        'SELECT 1 FROM projeto_usuarios WHERE projeto_id = ? AND usuario_id = ? LIMIT 1',
        [anexo.projeto_id, req.usuario?.id]
      );
      if (!vinculo && String(anexo.rdo_criado_por || '') !== String(req.usuario?.id || '')) {
        return res.status(403).json({ erro: 'Sem permissão para baixar este anexo.' });
      }
    }

    const filePath = resolveUploadPath(anexo.caminho_arquivo);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ erro: 'Arquivo não encontrado no servidor.' });
    }

    res.download(filePath, anexo.nome_arquivo);

  } catch (error) {
    console.error('Erro ao fazer download:', error);
    res.status(500).json({ erro: 'Erro ao fazer download do arquivo.' });
  }
});

// Deletar arquivo
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const anexo = await getQuery(
      'SELECT * FROM anexos WHERE id = ?',
      [id]
    );

    if (!anexo) {
      return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    }

    const filePath = resolveUploadPath(anexo.caminho_arquivo);

    // Deletar arquivo físico
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Deletar registro do banco
    await runQuery('DELETE FROM anexos WHERE id = ?', [id]);

    res.json({ mensagem: 'Arquivo deletado com sucesso.' });

  } catch (error) {
    console.error('Erro ao deletar arquivo:', error);
    res.status(500).json({ erro: 'Erro ao deletar arquivo.' });
  }
});

module.exports = router;
