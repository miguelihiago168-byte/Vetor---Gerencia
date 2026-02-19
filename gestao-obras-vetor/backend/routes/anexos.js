const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runQuery, allQuery, getQuery } = require('../config/database');
const { auth } = require('../middleware/auth');

const router = express.Router();

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

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|xls|xlsx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido.'));
    }
  }
});

// Upload de arquivo
router.post('/upload/:rdoId', auth, upload.single('arquivo'), async (req, res) => {
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
router.post('/upload-rnc/:rncId', auth, upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });
    }

    const { rncId } = req.params;
    const rnc = await getQuery('SELECT id, status, criado_por, responsavel_id FROM rnc WHERE id = ?', [rncId]);
    if (!rnc) {
      return res.status(404).json({ erro: 'RNC não encontrada.' });
    }
    if (rnc.status === 'Encerrada') {
      return res.status(403).json({ erro: 'Não é permitido anexar arquivos em RNC encerrada.' });
    }
    if (rnc.criado_por !== req.usuario.id && rnc.responsavel_id !== req.usuario.id && !req.usuario.is_gestor) {
      return res.status(403).json({ erro: 'Sem permissão para anexar arquivos nesta RNC.' });
    }

    const { originalname, filename, mimetype, size } = req.file;

    const result = await runQuery(`
      INSERT INTO anexos (rnc_id, tipo, nome_arquivo, caminho_arquivo, tamanho)
      VALUES (?, ?, ?, ?, ?)
    `, [rncId, mimetype, originalname, filename, size]);

    res.status(201).json({
      mensagem: 'Arquivo enviado com sucesso.',
      anexo: {
        id: result.lastID,
        nome_arquivo: originalname,
        tipo: mimetype
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
      'SELECT * FROM anexos WHERE rdo_id = ? ORDER BY criado_em DESC',
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
    const { rncId } = req.params;
    const anexos = await allQuery(
      'SELECT * FROM anexos WHERE rnc_id = ? ORDER BY criado_em DESC',
      [rncId]
    );
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

    const anexo = await runQuery(
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
