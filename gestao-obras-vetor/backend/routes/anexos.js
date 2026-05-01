const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runQuery, allQuery, getQuery } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

const ensureAnexosRncSchema = async () => {
  // Ambientes legados (principalmente tenant DB) podem não ter colunas de RNC.
  try {
    await runQuery('ALTER TABLE anexos ADD COLUMN rnc_id INTEGER');
  } catch (_) { /* coluna já existe */ }
  try {
    await runQuery("ALTER TABLE anexos ADD COLUMN categoria TEXT DEFAULT 'registro'");
  } catch (_) { /* coluna já existe */ }
};

// Criar diretório de uploads se não existir
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurar multer para upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = String(path.extname(file.originalname || '')).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (ext === '.pdf' || mime.includes('pdf')) return cb(null, true);
    return cb(new Error('Anexos do RDO aceitam somente arquivos PDF.'));
  }
});

// Upload de arquivo
router.post('/upload/:rdoId', auth, uploadPdfRdo.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    const { rdoId } = req.params;
    const { originalname, filename, mimetype, size } = req.file;

    const result = await runQuery(`
      INSERT INTO anexos (rdo_id, tipo, nome_arquivo, caminho_arquivo, tamanho)
      VALUES (?, ?, ?, ?, ?)
    `, [rdoId, mimetype, originalname, filename, size]);

    res.status(201).json({
      mensagem: 'Arquivo enviado com sucesso.',
      anexo: {
        id: result.lastID,
        nome_arquivo: originalname,
        tipo: mimetype
      }
    });

  } catch (error) {
    console.error('Erro ao fazer upload:', error);
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
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }
    if (rnc.status === 'Encerrada') {
      return res.status(403).json({ erro: 'Não é permitido anexar arquivos em RNC encerrada.' });
    }
    const uid = String(req.usuario?.id ?? '');
    const podeAnexar = uid === String(rnc.criado_por ?? '') || uid === String(rnc.responsavel_id ?? '') || Boolean(req.usuario?.is_gestor);
    if (!podeAnexar) {
      return res.status(403).json({ erro: 'Sem permissão para anexar arquivos nesta RNC.' });
    }

    // Compatibilidade com bases antigas: anexos.rdo_id pode ser NOT NULL.
    let rdoIdForInsert = rnc.rdo_id || null;
    if (!rdoIdForInsert) {
      const rdoFallback = await getQuery('SELECT id FROM rdos WHERE projeto_id = ? ORDER BY id DESC LIMIT 1', [rnc.projeto_id]);
      rdoIdForInsert = rdoFallback?.id || null;
    }
    if (!rdoIdForInsert) {
      return res.status(400).json({ erro: 'Não foi possível anexar fotos: esta RNC não possui RDO vinculado e o projeto não tem RDO cadastrado.' });
    }

    const { originalname, filename, mimetype, size } = req.file;
    const categoria = req.body.categoria === 'correcao' ? 'correcao' : 'registro';

    const result = await runQuery(`
      INSERT INTO anexos (rdo_id, rnc_id, tipo, nome_arquivo, caminho_arquivo, tamanho, categoria)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [rdoIdForInsert, rncId, mimetype, originalname, filename, size, categoria]);

    res.status(201).json({
      mensagem: 'Arquivo enviado com sucesso.',
      anexo: {
        id: result.lastID,
        nome_arquivo: originalname,
        tipo: mimetype,
        categoria
      }
    });

  } catch (error) {
    console.error('Erro ao fazer upload (RNC):', error);
    res.status(500).json({ erro: 'Erro ao fazer upload do arquivo (RNC).' });
  }
});

// Listar anexos de um RDO
router.get('/rdo/:rdoId', auth, async (req, res) => {
  try {
    const { rdoId } = req.params;

    const anexos = await allQuery(
      `SELECT *
       FROM anexos
       WHERE rdo_id = ?
         AND (
           LOWER(COALESCE(tipo, '')) LIKE '%pdf%'
           OR LOWER(COALESCE(nome_arquivo, '')) LIKE '%.pdf'
         )
       ORDER BY criado_em DESC`,
      [rdoId]
    );

    res.json(anexos);

  } catch (error) {
    console.error('Erro ao listar anexos:', error);
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
    res.status(500).json({ erro: 'Erro ao listar anexos da RNC.' });
  }
});

// Download de arquivo
router.get('/download/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const anexo = await getQuery(
      'SELECT * FROM anexos WHERE id = ?',
      [id]
    );

    if (!anexo) {
      return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    }

    const filePath = path.join(uploadsDir, anexo.caminho_arquivo);

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

    const filePath = path.join(uploadsDir, anexo.caminho_arquivo);

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
