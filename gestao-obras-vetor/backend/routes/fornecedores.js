const express = require('express');
const router = express.Router();
const { allQuery, getQuery, runQuery } = require('../config/database');
const { carregarPerfilUsuario } = require('../middleware/rbac');
const { inferirPerfil } = require('../constants/access');

// Middleware de autenticação injetado pelo server.js (authMiddleware)
const { auth } = require('../middleware/auth');

router.use(auth);

// ─── Listar fornecedores ───────────────────────────────────────────────────
// GET /api/fornecedores?ativo=1&q=texto
router.get('/', async (req, res) => {
  try {
    const { ativo = '1', q } = req.query;
    let sql = 'SELECT * FROM fornecedores WHERE 1=1';
    const params = [];

    if (ativo !== 'todos') {
      sql += ' AND ativo = ?';
      params.push(Number(ativo));
    }
    if (q) {
      sql += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY razao_social ASC';

    const rows = await allQuery(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[fornecedores] Erro ao listar:', err);
    res.status(500).json({ erro: 'Erro ao listar fornecedores.' });
  }
});

// ─── Detalhar fornecedor ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const row = await getQuery('SELECT * FROM fornecedores WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ erro: 'Fornecedor não encontrado.' });
    res.json(row);
  } catch (err) {
    console.error('[fornecedores] Erro ao detalhar:', err);
    res.status(500).json({ erro: 'Erro ao buscar fornecedor.' });
  }
});

// ─── Criar fornecedor ─────────────────────────────────────────────────────
// Permitido: ADM, Gestor Geral
router.post('/', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);
    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para cadastrar fornecedores.' });
    }

    const { razao_social, nome_fantasia, cnpj, telefone, email, observacao } = req.body;
    if (!razao_social || !razao_social.trim()) {
      return res.status(400).json({ erro: 'Razão social obrigatória.' });
    }

    if (cnpj && cnpj.trim()) {
      const exist = await getQuery('SELECT id FROM fornecedores WHERE cnpj = ?', [cnpj.trim()]);
      if (exist) return res.status(409).json({ erro: 'Já existe um fornecedor com este CNPJ.' });
    }

    const result = await runQuery(
      `INSERT INTO fornecedores (razao_social, nome_fantasia, cnpj, telefone, email, observacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        razao_social.trim(),
        nome_fantasia?.trim() || null,
        cnpj?.trim() || null,
        telefone?.trim() || null,
        email?.trim() || null,
        observacao?.trim() || null,
      ]
    );

    const novo = await getQuery('SELECT * FROM fornecedores WHERE id = ?', [result.lastID]);
    res.status(201).json(novo);
  } catch (err) {
    console.error('[fornecedores] Erro ao criar:', err);
    res.status(500).json({ erro: 'Erro ao criar fornecedor.' });
  }
});

// ─── Editar fornecedor ────────────────────────────────────────────────────
// Permitido: ADM, Gestor Geral
router.patch('/:id', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);
    if (!['ADM', 'Gestor Geral'].includes(perfil)) {
      return res.status(403).json({ erro: 'Sem permissão para editar fornecedores.' });
    }

    const atual = await getQuery('SELECT * FROM fornecedores WHERE id = ?', [req.params.id]);
    if (!atual) return res.status(404).json({ erro: 'Fornecedor não encontrado.' });

    const { razao_social, nome_fantasia, cnpj, telefone, email, observacao } = req.body;

    if (cnpj && cnpj.trim() && cnpj.trim() !== atual.cnpj) {
      const exist = await getQuery(
        'SELECT id FROM fornecedores WHERE cnpj = ? AND id <> ?',
        [cnpj.trim(), req.params.id]
      );
      if (exist) return res.status(409).json({ erro: 'Já existe um fornecedor com este CNPJ.' });
    }

    await runQuery(
      `UPDATE fornecedores SET
        razao_social  = COALESCE(?, razao_social),
        nome_fantasia = ?,
        cnpj          = COALESCE(?, cnpj),
        telefone      = ?,
        email         = ?,
        observacao    = ?,
        atualizado_em = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        razao_social?.trim() || null,
        nome_fantasia?.trim() ?? atual.nome_fantasia,
        cnpj?.trim() || null,
        telefone?.trim() ?? atual.telefone,
        email?.trim() ?? atual.email,
        observacao?.trim() ?? atual.observacao,
        req.params.id,
      ]
    );

    const atualizado = await getQuery('SELECT * FROM fornecedores WHERE id = ?', [req.params.id]);
    res.json(atualizado);
  } catch (err) {
    console.error('[fornecedores] Erro ao editar:', err);
    res.status(500).json({ erro: 'Erro ao editar fornecedor.' });
  }
});

// ─── Inativar/Reativar fornecedor ─────────────────────────────────────────
// Apenas ADM
router.delete('/:id', async (req, res) => {
  try {
    const usuario = await carregarPerfilUsuario(req.usuario.id);
    const perfil = inferirPerfil(usuario);
    if (perfil !== 'ADM') {
      return res.status(403).json({ erro: 'Apenas ADM pode inativar fornecedores.' });
    }

    const atual = await getQuery('SELECT * FROM fornecedores WHERE id = ?', [req.params.id]);
    if (!atual) return res.status(404).json({ erro: 'Fornecedor não encontrado.' });

    const novoAtivo = atual.ativo === 1 ? 0 : 1;
    await runQuery(
      'UPDATE fornecedores SET ativo = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
      [novoAtivo, req.params.id]
    );

    res.json({ mensagem: novoAtivo === 0 ? 'Fornecedor inativado.' : 'Fornecedor reativado.', ativo: novoAtivo });
  } catch (err) {
    console.error('[fornecedores] Erro ao inativar:', err);
    res.status(500).json({ erro: 'Erro ao inativar fornecedor.' });
  }
});

module.exports = router;
