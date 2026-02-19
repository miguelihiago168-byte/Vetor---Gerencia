const express = require('express');
const { auth } = require('../middleware/auth');
const { allQuery, getQuery, runQuery } = require('../config/database');
const { registrarAuditoria } = require('../middleware/auditoria');

const router = express.Router();

let schemaReadyPromise = null;

const PERFIL_ALMOX = {
  ADMIN: 'ADMINISTRADOR',
  GESTOR: 'GESTOR_OBRA',
  ALMOXARIFE: 'ALMOXARIFE',
  VISUALIZADOR: 'VISUALIZADOR'
};

const CATEGORIAS_ATIVO = [
  'Ferramenta',
  'Equipamento',
  'Máquina',
  'Veículo',
  'EPI',
  'Eletrônico',
  'Outros'
];

const normalizarCategoriaAtivo = (categoria) => {
  if (!categoria || !String(categoria).trim()) return 'Outros';
  const entrada = String(categoria).trim().toLowerCase();
  return CATEGORIAS_ATIVO.find((item) => item.toLowerCase() === entrada) || null;
};

const normalizarValorMonetario = (valor) => {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return 0;
  return Math.round(numero * 100) / 100;
};

const getPerfilAlmox = (usuario) => {
  if (usuario?.perfil_almoxarifado) return usuario.perfil_almoxarifado;
  if (usuario?.is_adm) return PERFIL_ALMOX.ADMIN;
  if (usuario?.is_gestor) return PERFIL_ALMOX.GESTOR;
  return PERFIL_ALMOX.VISUALIZADOR;
};

const canWrite = (perfil) => [PERFIL_ALMOX.ADMIN, PERFIL_ALMOX.ALMOXARIFE].includes(perfil);
const canRead = (perfil) => [PERFIL_ALMOX.ADMIN, PERFIL_ALMOX.GESTOR, PERFIL_ALMOX.ALMOXARIFE, PERFIL_ALMOX.VISUALIZADOR].includes(perfil);

const requireReadPermission = (req, res, next) => {
  const perfil = getPerfilAlmox(req.usuario);
  if (!canRead(perfil)) {
    return res.status(403).json({ erro: 'Sem permissão para visualizar dados do almoxarifado.' });
  }
  req.perfilAlmox = perfil;
  next();
};

const requireWritePermission = (req, res, next) => {
  const perfil = getPerfilAlmox(req.usuario);
  if (!canWrite(perfil)) {
    return res.status(403).json({ erro: 'Sem permissão para registrar movimentações no almoxarifado.' });
  }
  req.perfilAlmox = perfil;
  next();
};

const ensureProjectAccess = async (usuario, perfil, projetoId) => {
  if (!projetoId) return false;
  if (perfil === PERFIL_ALMOX.ADMIN) return true;
  const vinculo = await getQuery(
    'SELECT id FROM projeto_usuarios WHERE projeto_id = ? AND usuario_id = ? LIMIT 1',
    [projetoId, usuario.id]
  );
  return !!vinculo;
};

const validateProjeto = async (projetoId) => {
  return getQuery('SELECT id, nome FROM projetos WHERE id = ? AND ativo = 1', [projetoId]);
};

const resolveColaboradorNome = async (colaboradorId, colaboradorNome) => {
  if (colaboradorId) {
    const colaborador = await getQuery('SELECT id, nome FROM usuarios WHERE id = ? AND ativo = 1', [colaboradorId]);
    if (!colaborador) return null;
    return colaborador.nome;
  }
  if (colaboradorNome && String(colaboradorNome).trim()) return String(colaboradorNome).trim();
  return null;
};

const registrarMovimentacao = async ({
  ferramentaId,
  tipo,
  quantidade,
  projetoOrigemId,
  projetoDestinoId,
  colaboradorId,
  colaboradorNome,
  rdoId,
  alocacaoId,
  justificativa,
  custo,
  usuarioId
}) => {
  return runQuery(`
    INSERT INTO almox_movimentacoes (
      ferramenta_id, tipo, quantidade, projeto_origem_id, projeto_destino_id,
      colaborador_id, colaborador_nome, rdo_id, alocacao_id, justificativa, custo, usuario_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    ferramentaId,
    tipo,
    quantidade,
    projetoOrigemId || null,
    projetoDestinoId || null,
    colaboradorId || null,
    colaboradorNome || null,
    rdoId || null,
    alocacaoId || null,
    justificativa || null,
    custo != null ? normalizarValorMonetario(custo) : null,
    usuarioId
  ]);
};

const ensureSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await runQuery('BEGIN TRANSACTION');
      try {
        await runQuery(`ALTER TABLE usuarios ADD COLUMN perfil_almoxarifado TEXT`);
      } catch (_) {}

      await runQuery(`
        CREATE TABLE IF NOT EXISTS almox_ferramentas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE,
          nome TEXT NOT NULL,
          categoria TEXT NOT NULL DEFAULT 'Outros',
          nf_compra TEXT NOT NULL DEFAULT '',
          marca TEXT,
          modelo TEXT,
          descricao TEXT,
          unidade TEXT DEFAULT 'UN',
          quantidade_total INTEGER NOT NULL DEFAULT 0,
          quantidade_disponivel INTEGER NOT NULL DEFAULT 0,
          valor_reposicao REAL NOT NULL DEFAULT 0,
          ativo INTEGER NOT NULL DEFAULT 1,
          criado_por INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `);

      try {
        await runQuery(`ALTER TABLE almox_ferramentas ADD COLUMN categoria TEXT NOT NULL DEFAULT 'Outros'`);
      } catch (_) {}

      try {
        await runQuery(`ALTER TABLE almox_ferramentas ADD COLUMN nf_compra TEXT NOT NULL DEFAULT ''`);
      } catch (_) {}

      try {
        await runQuery(`ALTER TABLE almox_ferramentas ADD COLUMN marca TEXT`);
      } catch (_) {}

      try {
        await runQuery(`ALTER TABLE almox_ferramentas ADD COLUMN modelo TEXT`);
      } catch (_) {}

      await runQuery(`
        UPDATE almox_ferramentas
        SET categoria = 'Outros'
        WHERE categoria IS NULL OR TRIM(categoria) = ''
      `);

      await runQuery(`
        UPDATE almox_ferramentas
        SET nf_compra = 'NÃO INFORMADA'
        WHERE nf_compra IS NULL OR TRIM(nf_compra) = ''
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS almox_alocacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ferramenta_id INTEGER NOT NULL,
          projeto_id INTEGER NOT NULL,
          colaborador_id INTEGER,
          colaborador_nome TEXT,
          quantidade INTEGER NOT NULL,
          quantidade_devolvida INTEGER NOT NULL DEFAULT 0,
          data_retirada DATETIME DEFAULT CURRENT_TIMESTAMP,
          previsao_devolucao DATE NOT NULL,
          data_devolucao DATETIME,
          status TEXT NOT NULL DEFAULT 'ALOCADA',
          observacao TEXT,
          criado_por INTEGER NOT NULL,
          encerrado_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
          FOREIGN KEY (projeto_id) REFERENCES projetos(id),
          FOREIGN KEY (colaborador_id) REFERENCES usuarios(id),
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          FOREIGN KEY (encerrado_por) REFERENCES usuarios(id)
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS almox_manutencoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ferramenta_id INTEGER NOT NULL,
          alocacao_id INTEGER,
          projeto_id INTEGER NOT NULL,
          quantidade INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT 'EM_MANUTENCAO',
          justificativa TEXT,
          retorna_estoque INTEGER NOT NULL DEFAULT 1,
          custo REAL,
          data_envio DATETIME DEFAULT CURRENT_TIMESTAMP,
          data_retorno DATETIME,
          criado_por INTEGER NOT NULL,
          finalizado_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
          FOREIGN KEY (alocacao_id) REFERENCES almox_alocacoes(id),
          FOREIGN KEY (projeto_id) REFERENCES projetos(id),
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          FOREIGN KEY (finalizado_por) REFERENCES usuarios(id)
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS almox_perdas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ferramenta_id INTEGER NOT NULL,
          alocacao_id INTEGER,
          projeto_id INTEGER NOT NULL,
          quantidade INTEGER NOT NULL,
          valor_unitario REAL NOT NULL,
          custo_total REAL NOT NULL,
          justificativa TEXT,
          criado_por INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
          FOREIGN KEY (alocacao_id) REFERENCES almox_alocacoes(id),
          FOREIGN KEY (projeto_id) REFERENCES projetos(id),
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS almox_movimentacoes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ferramenta_id INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          quantidade INTEGER NOT NULL,
          projeto_origem_id INTEGER,
          projeto_destino_id INTEGER,
          colaborador_id INTEGER,
          colaborador_nome TEXT,
          rdo_id INTEGER,
          alocacao_id INTEGER,
          justificativa TEXT,
          custo REAL,
          usuario_id INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
          FOREIGN KEY (projeto_origem_id) REFERENCES projetos(id),
          FOREIGN KEY (projeto_destino_id) REFERENCES projetos(id),
          FOREIGN KEY (colaborador_id) REFERENCES usuarios(id),
          FOREIGN KEY (rdo_id) REFERENCES rdos(id),
          FOREIGN KEY (alocacao_id) REFERENCES almox_alocacoes(id),
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS rdo_ferramentas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          rdo_id INTEGER NOT NULL,
          ferramenta_id INTEGER NOT NULL,
          alocacao_id INTEGER NOT NULL,
          colaborador_id INTEGER,
          colaborador_nome TEXT,
          quantidade INTEGER NOT NULL,
          criado_por INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE,
          FOREIGN KEY (ferramenta_id) REFERENCES almox_ferramentas(id),
          FOREIGN KEY (alocacao_id) REFERENCES almox_alocacoes(id),
          FOREIGN KEY (colaborador_id) REFERENCES usuarios(id),
          FOREIGN KEY (criado_por) REFERENCES usuarios(id)
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS mao_obra_direta (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          identificador TEXT,
          nome TEXT NOT NULL,
          funcao TEXT NOT NULL,
          ativo INTEGER DEFAULT 1,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          criado_por INTEGER,
          baixado_em DATETIME,
          baixado_por INTEGER,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          FOREIGN KEY (baixado_por) REFERENCES usuarios(id)
        )
      `);

      await runQuery('CREATE INDEX IF NOT EXISTS idx_almox_alocacoes_projeto_status ON almox_alocacoes(projeto_id, status)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_almox_movimentacoes_tipo_data ON almox_movimentacoes(tipo, criado_em)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_almox_perdas_projeto_data ON almox_perdas(projeto_id, criado_em)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_rdo_ferramentas_rdo ON rdo_ferramentas(rdo_id)');

      await runQuery('COMMIT');
    })().catch(async (error) => {
      try { await runQuery('ROLLBACK'); } catch (_) {}
      throw error;
    });
  }
  return schemaReadyPromise;
};

router.use(async (req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    console.error('Erro ao inicializar schema do almoxarifado:', error);
    res.status(500).json({ erro: 'Falha ao inicializar módulo de almoxarifado.' });
  }
});

router.get('/perfil', [auth, requireReadPermission], async (req, res) => {
  res.json({ perfil: req.perfilAlmox });
});

router.get('/colaboradores', [auth, requireReadPermission], async (req, res) => {
  try {
    const usuariosSistema = await allQuery(`
      SELECT id, login, nome, funcao
      FROM usuarios
      WHERE ativo = 1
        AND deletado_em IS NULL
      ORDER BY nome
    `);

    const maoObraDireta = await allQuery(`
      SELECT id, identificador, nome, funcao
      FROM mao_obra_direta
      WHERE ativo = 1
      ORDER BY nome
    `);

    const colaboradores = [
      ...usuariosSistema.map((item) => ({
        id: `USR-${item.id}`,
        tipo: 'sistema',
        usuario_id: item.id,
        nome: item.nome,
        funcao: item.funcao || null,
        identificador: item.login || null
      })),
      ...maoObraDireta.map((item) => ({
        id: `MOD-${item.id}`,
        tipo: 'mao_obra_direta',
        usuario_id: null,
        nome: item.nome,
        funcao: item.funcao || null,
        identificador: item.identificador || null
      }))
    ].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' }));

    res.json(colaboradores);
  } catch (error) {
    console.error('Erro ao listar colaboradores para retirada:', error);
    res.status(500).json({ erro: 'Erro ao listar colaboradores para retirada.' });
  }
});

router.get('/ferramentas', [auth, requireReadPermission], async (req, res) => {
  try {
    const { projeto_id: projetoId, busca } = req.query;
    if (projetoId) {
      const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(projetoId));
      if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });
    }

    const filtros = ['f.ativo = 1'];
    const params = [];

    if (busca) {
      filtros.push('(f.nome LIKE ? OR f.codigo LIKE ?)');
      params.push(`%${busca}%`, `%${busca}%`);
    }

    const ferramentas = await allQuery(`
      SELECT
        f.*,
        COALESCE(SUM(CASE WHEN a.status IN ('ALOCADA', 'EM_MANUTENCAO') THEN (a.quantidade - a.quantidade_devolvida) ELSE 0 END), 0) AS quantidade_alocada
      FROM almox_ferramentas f
      LEFT JOIN almox_alocacoes a ON a.ferramenta_id = f.id
      ${projetoId ? 'AND a.projeto_id = ?' : ''}
      WHERE ${filtros.join(' AND ')}
      GROUP BY f.id
      ORDER BY f.nome
    `, projetoId ? [Number(projetoId), ...params] : params);

    res.json(ferramentas);
  } catch (error) {
    console.error('Erro ao listar ativos:', error);
    res.status(500).json({ erro: 'Erro ao listar ativos.' });
  }
});

router.post('/ferramentas', [auth, requireWritePermission], async (req, res) => {
  try {
    const {
      codigo,
      nome,
      categoria,
      nf_compra: nfCompra,
      marca,
      modelo,
      descricao,
      unidade,
      quantidade_total: quantidadeTotal,
      valor_reposicao: valorReposicao
    } = req.body;
    const quantidade = Number(quantidadeTotal);
    const valorReposicaoNum = normalizarValorMonetario(valorReposicao);
    const categoriaNormalizada = normalizarCategoriaAtivo(categoria);
    const nfCompraNormalizada = String(nfCompra || '').trim();
    const valorInformado = !(valorReposicao === undefined || valorReposicao === null || String(valorReposicao).trim() === '');

    if (!nome || !Number.isInteger(quantidade) || quantidade < 0 || !nfCompraNormalizada || !valorInformado || !Number.isFinite(valorReposicaoNum) || valorReposicaoNum < 0) {
      return res.status(400).json({ erro: 'Campos inválidos para cadastro de ativo.' });
    }
    if (!categoriaNormalizada) {
      return res.status(400).json({ erro: `Categoria inválida. Use: ${CATEGORIAS_ATIVO.join(', ')}.` });
    }

    const result = await runQuery(`
      INSERT INTO almox_ferramentas
      (codigo, nome, categoria, nf_compra, marca, modelo, descricao, unidade, quantidade_total, quantidade_disponivel, valor_reposicao, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      codigo || null,
      String(nome).trim(),
      categoriaNormalizada,
      nfCompraNormalizada,
      marca ? String(marca).trim() : null,
      modelo ? String(modelo).trim() : null,
      descricao || null,
      unidade || 'UN',
      quantidade,
      quantidade,
      valorReposicaoNum,
      req.usuario.id
    ]);

    const ferramenta = await getQuery('SELECT * FROM almox_ferramentas WHERE id = ?', [result.lastID]);
    await registrarMovimentacao({
      ferramentaId: result.lastID,
      tipo: 'CADASTRO',
      quantidade,
      usuarioId: req.usuario.id
    });
    await registrarAuditoria('almox_ferramentas', result.lastID, 'CREATE', null, ferramenta, req.usuario.id, { strict: true });

    res.status(201).json({ ferramenta });
  } catch (error) {
    console.error('Erro ao cadastrar ativo:', error);
    res.status(500).json({ erro: 'Erro ao cadastrar ativo.' });
  }
});

router.get('/alocacoes-abertas', [auth, requireReadPermission], async (req, res) => {
  try {
    const { projeto_id: projetoId } = req.query;
    if (!projetoId) return res.status(400).json({ erro: 'projeto_id é obrigatório.' });

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(projetoId));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const alocacoes = await allQuery(`
      SELECT
        a.*,
        m.id AS manutencao_id,
        f.nome AS ferramenta_nome,
        f.codigo AS ferramenta_codigo,
        f.valor_reposicao,
        u.nome AS colaborador_usuario_nome,
        CASE WHEN date(a.previsao_devolucao) < date('now') AND a.status = 'ALOCADA' THEN 1 ELSE 0 END AS atrasada
      FROM almox_alocacoes a
      LEFT JOIN almox_manutencoes m
        ON m.id = (
          SELECT mm.id
          FROM almox_manutencoes mm
          WHERE mm.alocacao_id = a.id
            AND mm.status = 'EM_MANUTENCAO'
          ORDER BY mm.id DESC
          LIMIT 1
        )
      INNER JOIN almox_ferramentas f ON f.id = a.ferramenta_id
      LEFT JOIN usuarios u ON u.id = a.colaborador_id
      WHERE a.projeto_id = ?
        AND a.status IN ('ALOCADA', 'EM_MANUTENCAO')
      ORDER BY a.previsao_devolucao ASC
    `, [Number(projetoId)]);

    res.json(alocacoes);
  } catch (error) {
    console.error('Erro ao listar alocações abertas:', error);
    res.status(500).json({ erro: 'Erro ao listar alocações abertas.' });
  }
});

router.post('/retiradas', [auth, requireWritePermission], async (req, res) => {
  try {
    const {
      colaborador_id: colaboradorId,
      colaborador_nome: colaboradorNomeBody,
      projeto_id: projetoId,
      ferramenta_id: ferramentaId,
      quantidade,
      previsao_devolucao: previsaoDevolucao,
      observacao
    } = req.body;

    const quantidadeInt = Number(quantidade);
    if (!projetoId || !ferramentaId || !Number.isInteger(quantidadeInt) || quantidadeInt <= 0 || !previsaoDevolucao) {
      return res.status(400).json({ erro: 'Dados obrigatórios não informados para retirada.' });
    }

    const projeto = await validateProjeto(Number(projetoId));
    if (!projeto) return res.status(404).json({ erro: 'Obra não encontrada.' });

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(projetoId));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const colaboradorNome = await resolveColaboradorNome(colaboradorId, colaboradorNomeBody);
    if (!colaboradorNome) {
      return res.status(400).json({ erro: 'Colaborador é obrigatório (ID válido ou nome).' });
    }

    const ferramenta = await getQuery('SELECT * FROM almox_ferramentas WHERE id = ? AND ativo = 1', [Number(ferramentaId)]);
    if (!ferramenta) return res.status(404).json({ erro: 'Ativo não encontrado.' });

    if (Number(ferramenta.quantidade_disponivel) < quantidadeInt) {
      return res.status(400).json({ erro: 'Quantidade indisponível no estoque.' });
    }

    await runQuery('BEGIN TRANSACTION');
    try {
      const alocResult = await runQuery(`
        INSERT INTO almox_alocacoes (
          ferramenta_id, projeto_id, colaborador_id, colaborador_nome,
          quantidade, previsao_devolucao, observacao, criado_por
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        Number(ferramentaId),
        Number(projetoId),
        colaboradorId || null,
        colaboradorNome,
        quantidadeInt,
        previsaoDevolucao,
        observacao || null,
        req.usuario.id
      ]);

      await runQuery(`
        UPDATE almox_ferramentas
        SET quantidade_disponivel = quantidade_disponivel - ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [quantidadeInt, Number(ferramentaId)]);

      await registrarMovimentacao({
        ferramentaId: Number(ferramentaId),
        tipo: 'RETIRADA',
        quantidade: quantidadeInt,
        projetoDestinoId: Number(projetoId),
        colaboradorId: colaboradorId || null,
        colaboradorNome,
        alocacaoId: alocResult.lastID,
        justificativa: observacao,
        usuarioId: req.usuario.id
      });

      await runQuery('COMMIT');

      const alocacao = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [alocResult.lastID]);
      await registrarAuditoria('almox_alocacoes', alocResult.lastID, 'RETIRADA', null, alocacao, req.usuario.id, { strict: true });

      res.status(201).json({ alocacao });
    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Erro ao registrar retirada:', error);
    res.status(500).json({ erro: 'Erro ao registrar retirada.' });
  }
});

router.post('/devolucoes/:alocacaoId', [auth, requireWritePermission], async (req, res) => {
  try {
    const { alocacaoId } = req.params;
    const { quantidade, observacao } = req.body;

    const alocacao = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [Number(alocacaoId)]);
    if (!alocacao) return res.status(404).json({ erro: 'Alocação não encontrada.' });
    if (!['ALOCADA', 'EM_MANUTENCAO'].includes(alocacao.status)) {
      return res.status(400).json({ erro: 'Alocação não permite devolução.' });
    }

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(alocacao.projeto_id));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const restante = Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0);
    const qtd = quantidade ? Number(quantidade) : restante;
    if (!Number.isInteger(qtd) || qtd <= 0 || qtd > restante) {
      return res.status(400).json({ erro: 'Quantidade inválida para devolução.' });
    }

    const novaDevolvida = Number(alocacao.quantidade_devolvida || 0) + qtd;
    const statusFinal = novaDevolvida >= Number(alocacao.quantidade) ? 'DEVOLVIDA' : 'ALOCADA';

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery(`
        UPDATE almox_alocacoes
        SET quantidade_devolvida = ?,
            status = ?,
            observacao = COALESCE(?, observacao),
            atualizado_em = CURRENT_TIMESTAMP,
            data_devolucao = CASE WHEN ? = 'DEVOLVIDA' THEN CURRENT_TIMESTAMP ELSE data_devolucao END,
            encerrado_por = CASE WHEN ? = 'DEVOLVIDA' THEN ? ELSE encerrado_por END
        WHERE id = ?
      `, [
        novaDevolvida,
        statusFinal,
        observacao || null,
        statusFinal,
        statusFinal,
        req.usuario.id,
        Number(alocacaoId)
      ]);

      await runQuery(`
        UPDATE almox_ferramentas
        SET quantidade_disponivel = quantidade_disponivel + ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [qtd, Number(alocacao.ferramenta_id)]);

      await registrarMovimentacao({
        ferramentaId: Number(alocacao.ferramenta_id),
        tipo: 'DEVOLUCAO',
        quantidade: qtd,
        projetoOrigemId: Number(alocacao.projeto_id),
        colaboradorId: alocacao.colaborador_id,
        colaboradorNome: alocacao.colaborador_nome,
        alocacaoId: Number(alocacaoId),
        justificativa: observacao,
        usuarioId: req.usuario.id
      });

      await runQuery('COMMIT');
    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }

    const alocacaoAtualizada = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [Number(alocacaoId)]);
    await registrarAuditoria('almox_alocacoes', Number(alocacaoId), 'DEVOLUCAO', alocacao, alocacaoAtualizada, req.usuario.id, { strict: true });

    res.json({ alocacao: alocacaoAtualizada });
  } catch (error) {
    console.error('Erro ao registrar devolução:', error);
    res.status(500).json({ erro: 'Erro ao registrar devolução.' });
  }
});

router.post('/manutencao/enviar', [auth, requireWritePermission], async (req, res) => {
  try {
    const {
      alocacao_id: alocacaoId,
      quantidade,
      justificativa,
      enviar_para_manutencao: enviarParaManutencao,
      custo
    } = req.body;

    if (!alocacaoId || !Number.isInteger(Number(quantidade || 1))) {
      return res.status(400).json({ erro: 'Dados inválidos para manutenção.' });
    }

    const alocacao = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [Number(alocacaoId)]);
    if (!alocacao) return res.status(404).json({ erro: 'Alocação não encontrada.' });

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(alocacao.projeto_id));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const qtd = Number(quantidade || 1);
    const restante = Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0);
    if (qtd <= 0 || qtd > restante) {
      return res.status(400).json({ erro: 'Quantidade inválida para manutenção/baixa.' });
    }

    const ferramenta = await getQuery('SELECT * FROM almox_ferramentas WHERE id = ?', [Number(alocacao.ferramenta_id)]);
    if (!ferramenta) return res.status(404).json({ erro: 'Ativo não encontrado.' });

    await runQuery('BEGIN TRANSACTION');
    try {
      if (enviarParaManutencao === false) {
        if (!justificativa) {
          await runQuery('ROLLBACK');
          return res.status(400).json({ erro: 'Justificativa é obrigatória para baixa definitiva.' });
        }

        const custoTotal = normalizarValorMonetario(Number(ferramenta.valor_reposicao || 0) * qtd);

        await runQuery(`
          UPDATE almox_alocacoes
          SET status = 'BAIXA_DEFINITIVA', data_devolucao = CURRENT_TIMESTAMP,
              atualizado_em = CURRENT_TIMESTAMP, encerrado_por = ?
          WHERE id = ?
        `, [req.usuario.id, Number(alocacaoId)]);

        await runQuery(`
          UPDATE almox_ferramentas
          SET quantidade_total = quantidade_total - ?, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [qtd, Number(alocacao.ferramenta_id)]);

        await runQuery(`
          INSERT INTO almox_perdas (ferramenta_id, alocacao_id, projeto_id, quantidade, valor_unitario, custo_total, justificativa, criado_por)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          Number(alocacao.ferramenta_id),
          Number(alocacaoId),
          Number(alocacao.projeto_id),
          qtd,
          normalizarValorMonetario(ferramenta.valor_reposicao || 0),
          custoTotal,
          justificativa,
          req.usuario.id
        ]);

        await registrarMovimentacao({
          ferramentaId: Number(alocacao.ferramenta_id),
          tipo: 'BAIXA_DEFINITIVA',
          quantidade: qtd,
          projetoOrigemId: Number(alocacao.projeto_id),
          colaboradorId: alocacao.colaborador_id,
          colaboradorNome: alocacao.colaborador_nome,
          alocacaoId: Number(alocacaoId),
          justificativa,
          custo: custoTotal,
          usuarioId: req.usuario.id
        });
      } else {
        const manutResult = await runQuery(`
          INSERT INTO almox_manutencoes
          (ferramenta_id, alocacao_id, projeto_id, quantidade, justificativa, retorna_estoque, custo, criado_por)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        `, [
          Number(alocacao.ferramenta_id),
          Number(alocacaoId),
          Number(alocacao.projeto_id),
          qtd,
          justificativa || null,
          custo != null ? normalizarValorMonetario(custo) : null,
          req.usuario.id
        ]);

        await runQuery(`
          UPDATE almox_alocacoes
          SET status = 'EM_MANUTENCAO', atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [Number(alocacaoId)]);

        await registrarMovimentacao({
          ferramentaId: Number(alocacao.ferramenta_id),
          tipo: 'MANUTENCAO_ENVIO',
          quantidade: qtd,
          projetoOrigemId: Number(alocacao.projeto_id),
          colaboradorId: alocacao.colaborador_id,
          colaboradorNome: alocacao.colaborador_nome,
          alocacaoId: Number(alocacaoId),
          justificativa,
          usuarioId: req.usuario.id
        });

        const manutencao = await getQuery('SELECT * FROM almox_manutencoes WHERE id = ?', [manutResult.lastID]);
        await runQuery('COMMIT');
        return res.status(201).json({ manutencao });
      }

      await runQuery('COMMIT');
      res.json({ ok: true });
    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Erro ao enviar para manutenção:', error);
    res.status(500).json({ erro: 'Erro ao processar manutenção.' });
  }
});

router.post('/manutencao/:id/concluir', [auth, requireWritePermission], async (req, res) => {
  try {
    const { id } = req.params;
    const { retornar_estoque: retornarEstoque, justificativa, custo_perda: custoPerda } = req.body;

    const manutencao = await getQuery('SELECT * FROM almox_manutencoes WHERE id = ?', [Number(id)]);
    if (!manutencao) return res.status(404).json({ erro: 'Registro de manutenção não encontrado.' });
    if (manutencao.status !== 'EM_MANUTENCAO') return res.status(400).json({ erro: 'Manutenção já concluída.' });

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(manutencao.projeto_id));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    if (retornarEstoque === false && !justificativa) {
      return res.status(400).json({ erro: 'Justificativa é obrigatória quando não retorna ao estoque.' });
    }

    const ferramenta = await getQuery('SELECT * FROM almox_ferramentas WHERE id = ?', [Number(manutencao.ferramenta_id)]);
    if (!ferramenta) return res.status(404).json({ erro: 'Ativo não encontrado.' });
    const alocacaoManutencao = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [Number(manutencao.alocacao_id)]);

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery(`
        UPDATE almox_manutencoes
        SET status = 'CONCLUIDA',
            retorna_estoque = ?,
            justificativa = COALESCE(?, justificativa),
            data_retorno = CURRENT_TIMESTAMP,
            finalizado_por = ?,
            atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [retornarEstoque === false ? 0 : 1, justificativa || null, req.usuario.id, Number(id)]);

      if (retornarEstoque === false) {
        const custoTotal = normalizarValorMonetario(custoPerda || (Number(ferramenta.valor_reposicao || 0) * Number(manutencao.quantidade)));
        await runQuery(`
          UPDATE almox_alocacoes
          SET status = 'BAIXA_DEFINITIVA', data_devolucao = CURRENT_TIMESTAMP,
              atualizado_em = CURRENT_TIMESTAMP, encerrado_por = ?
          WHERE id = ?
        `, [req.usuario.id, Number(manutencao.alocacao_id)]);

        await runQuery(`
          UPDATE almox_ferramentas
          SET quantidade_total = quantidade_total - ?, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [Number(manutencao.quantidade), Number(manutencao.ferramenta_id)]);

        await runQuery(`
          INSERT INTO almox_perdas (ferramenta_id, alocacao_id, projeto_id, quantidade, valor_unitario, custo_total, justificativa, criado_por)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          Number(manutencao.ferramenta_id),
          Number(manutencao.alocacao_id),
          Number(manutencao.projeto_id),
          Number(manutencao.quantidade),
          normalizarValorMonetario(ferramenta.valor_reposicao || 0),
          custoTotal,
          justificativa,
          req.usuario.id
        ]);

        await registrarMovimentacao({
          ferramentaId: Number(manutencao.ferramenta_id),
          tipo: 'BAIXA_DEFINITIVA',
          quantidade: Number(manutencao.quantidade),
          projetoOrigemId: Number(manutencao.projeto_id),
          colaboradorId: alocacaoManutencao?.colaborador_id,
          colaboradorNome: alocacaoManutencao?.colaborador_nome,
          alocacaoId: Number(manutencao.alocacao_id),
          justificativa,
          custo: custoTotal,
          usuarioId: req.usuario.id
        });
      } else {
        await runQuery(`
          UPDATE almox_alocacoes
          SET status = 'DEVOLVIDA',
              data_devolucao = CURRENT_TIMESTAMP,
              quantidade_devolvida = quantidade,
              atualizado_em = CURRENT_TIMESTAMP,
              encerrado_por = ?
          WHERE id = ?
        `, [req.usuario.id, Number(manutencao.alocacao_id)]);

        await runQuery(`
          UPDATE almox_ferramentas
          SET quantidade_disponivel = quantidade_disponivel + ?, atualizado_em = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [Number(manutencao.quantidade), Number(manutencao.ferramenta_id)]);

        await registrarMovimentacao({
          ferramentaId: Number(manutencao.ferramenta_id),
          tipo: 'MANUTENCAO_RETORNO',
          quantidade: Number(manutencao.quantidade),
          projetoOrigemId: Number(manutencao.projeto_id),
          alocacaoId: Number(manutencao.alocacao_id),
          justificativa,
          usuarioId: req.usuario.id
        });
      }

      await runQuery('COMMIT');
    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }

    const manutencaoAtualizada = await getQuery('SELECT * FROM almox_manutencoes WHERE id = ?', [Number(id)]);
    await registrarAuditoria('almox_manutencoes', Number(id), 'CONCLUSAO', manutencao, manutencaoAtualizada, req.usuario.id, { strict: true });

    res.json({ manutencao: manutencaoAtualizada });
  } catch (error) {
    console.error('Erro ao concluir manutenção:', error);
    res.status(500).json({ erro: 'Erro ao concluir manutenção.' });
  }
});

router.post('/perdas', [auth, requireWritePermission], async (req, res) => {
  try {
    const { alocacao_id: alocacaoId, quantidade, justificativa } = req.body;
    if (!alocacaoId || !Number.isInteger(Number(quantidade)) || Number(quantidade) <= 0) {
      return res.status(400).json({ erro: 'Dados inválidos para registrar perda.' });
    }

    const alocacao = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [Number(alocacaoId)]);
    if (!alocacao) return res.status(404).json({ erro: 'Alocação não encontrada.' });

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(alocacao.projeto_id));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const qtd = Number(quantidade);
    const restante = Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0);
    if (qtd > restante) return res.status(400).json({ erro: 'Quantidade de perda maior que o saldo da alocação.' });

    const ferramenta = await getQuery('SELECT * FROM almox_ferramentas WHERE id = ?', [Number(alocacao.ferramenta_id)]);
    if (!ferramenta) return res.status(404).json({ erro: 'Ativo não encontrado.' });

    const custoTotal = normalizarValorMonetario(Number(ferramenta.valor_reposicao || 0) * qtd);

    await runQuery('BEGIN TRANSACTION');
    try {
      await runQuery(`
        UPDATE almox_ferramentas
        SET quantidade_total = quantidade_total - ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [qtd, Number(ferramenta.id)]);

      await runQuery(`
        UPDATE almox_alocacoes
        SET status = CASE WHEN (quantidade_devolvida + ?) >= quantidade THEN 'PERDIDA' ELSE status END,
            quantidade_devolvida = quantidade_devolvida + ?,
            data_devolucao = CASE WHEN (quantidade_devolvida + ?) >= quantidade THEN CURRENT_TIMESTAMP ELSE data_devolucao END,
            atualizado_em = CURRENT_TIMESTAMP,
            encerrado_por = CASE WHEN (quantidade_devolvida + ?) >= quantidade THEN ? ELSE encerrado_por END
        WHERE id = ?
      `, [qtd, qtd, qtd, qtd, req.usuario.id, Number(alocacaoId)]);

      const perdaResult = await runQuery(`
        INSERT INTO almox_perdas (ferramenta_id, alocacao_id, projeto_id, quantidade, valor_unitario, custo_total, justificativa, criado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        Number(ferramenta.id),
        Number(alocacaoId),
        Number(alocacao.projeto_id),
        qtd,
        normalizarValorMonetario(ferramenta.valor_reposicao || 0),
        custoTotal,
        justificativa || null,
        req.usuario.id
      ]);

      await registrarMovimentacao({
        ferramentaId: Number(ferramenta.id),
        tipo: 'PERDA',
        quantidade: qtd,
        projetoOrigemId: Number(alocacao.projeto_id),
        colaboradorId: alocacao.colaborador_id,
        colaboradorNome: alocacao.colaborador_nome,
        alocacaoId: Number(alocacaoId),
        justificativa,
        custo: custoTotal,
        usuarioId: req.usuario.id
      });

      await runQuery('COMMIT');

      const perda = await getQuery('SELECT * FROM almox_perdas WHERE id = ?', [perdaResult.lastID]);
      await registrarAuditoria('almox_perdas', perdaResult.lastID, 'PERDA', null, perda, req.usuario.id, { strict: true });
      res.status(201).json({ perda });
    } catch (error) {
      await runQuery('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Erro ao registrar perda:', error);
    res.status(500).json({ erro: 'Erro ao registrar perda.' });
  }
});

router.post('/transferencias', [auth, requireWritePermission], async (req, res) => {
  try {
    const { alocacao_id: alocacaoId, obra_destino_id: obraDestinoId, previsao_devolucao: previsaoDevolucao, observacao } = req.body;
    if (!alocacaoId || !obraDestinoId) {
      return res.status(400).json({ erro: 'alocacao_id e obra_destino_id são obrigatórios.' });
    }

    const alocacao = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [Number(alocacaoId)]);
    if (!alocacao) return res.status(404).json({ erro: 'Alocação não encontrada.' });
    if (alocacao.status !== 'ALOCADA') return res.status(400).json({ erro: 'Somente alocações ativas podem ser transferidas.' });

    const origemOk = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(alocacao.projeto_id));
    const destinoOk = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(obraDestinoId));
    if (!origemOk || !destinoOk) return res.status(403).json({ erro: 'Sem acesso às obras de origem ou destino.' });

    const obraDestino = await validateProjeto(Number(obraDestinoId));
    if (!obraDestino) return res.status(404).json({ erro: 'Obra de destino não encontrada.' });

    await runQuery(`
      UPDATE almox_alocacoes
      SET projeto_id = ?,
          previsao_devolucao = COALESCE(?, previsao_devolucao),
          observacao = COALESCE(?, observacao),
          atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [Number(obraDestinoId), previsaoDevolucao || null, observacao || null, Number(alocacaoId)]);

    await registrarMovimentacao({
      ferramentaId: Number(alocacao.ferramenta_id),
      tipo: 'TRANSFERENCIA',
      quantidade: Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0),
      projetoOrigemId: Number(alocacao.projeto_id),
      projetoDestinoId: Number(obraDestinoId),
      colaboradorId: alocacao.colaborador_id,
      colaboradorNome: alocacao.colaborador_nome,
      alocacaoId: Number(alocacaoId),
      justificativa: observacao,
      usuarioId: req.usuario.id
    });

    const alocacaoAtualizada = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [Number(alocacaoId)]);
    await registrarAuditoria('almox_alocacoes', Number(alocacaoId), 'TRANSFERENCIA', alocacao, alocacaoAtualizada, req.usuario.id, { strict: true });

    res.json({ alocacao: alocacaoAtualizada });
  } catch (error) {
    console.error('Erro ao transferir ativo:', error);
    res.status(500).json({ erro: 'Erro ao transferir ativo.' });
  }
});

router.get('/dashboard/projeto/:projetoId', [auth, requireReadPermission], async (req, res) => {
  try {
    const { projetoId } = req.params;
    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(projetoId));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const [ferramentasAlocadas, ferramentasAtrasadas, ferramentasManutencao, perdasResumo, listaAtivos] = await Promise.all([
      getQuery(`
        SELECT COALESCE(SUM(quantidade - quantidade_devolvida), 0) AS total
        FROM almox_alocacoes
        WHERE projeto_id = ? AND status = 'ALOCADA'
      `, [Number(projetoId)]),
      getQuery(`
        SELECT COALESCE(SUM(quantidade - quantidade_devolvida), 0) AS total
        FROM almox_alocacoes
        WHERE projeto_id = ? AND status = 'ALOCADA' AND date(previsao_devolucao) < date('now')
      `, [Number(projetoId)]),
      getQuery(`
        SELECT COALESCE(SUM(quantidade), 0) AS total
        FROM almox_manutencoes
        WHERE projeto_id = ? AND status = 'EM_MANUTENCAO'
      `, [Number(projetoId)]),
      getQuery(`
        SELECT COALESCE(SUM(quantidade), 0) AS total_perdas,
               COALESCE(SUM(custo_total), 0) AS custo_perdas
        FROM almox_perdas
        WHERE projeto_id = ?
      `, [Number(projetoId)]),
      allQuery(`
        SELECT
          a.id,
          a.ferramenta_id,
          f.nome AS ferramenta_nome,
          f.codigo AS ferramenta_codigo,
          a.colaborador_nome,
          a.quantidade,
          a.quantidade_devolvida,
          a.previsao_devolucao,
          a.status,
          CASE WHEN date(a.previsao_devolucao) < date('now') AND a.status = 'ALOCADA' THEN 1 ELSE 0 END AS atrasada
        FROM almox_alocacoes a
        INNER JOIN almox_ferramentas f ON f.id = a.ferramenta_id
        WHERE a.projeto_id = ?
          AND a.status IN ('ALOCADA', 'EM_MANUTENCAO')
        ORDER BY a.previsao_devolucao ASC
      `, [Number(projetoId)])
    ]);

    res.json({
      ferramentas_alocadas: Number(ferramentasAlocadas?.total || 0),
      ferramentas_atrasadas: Number(ferramentasAtrasadas?.total || 0),
      ferramentas_manutencao: Number(ferramentasManutencao?.total || 0),
      total_perdas: Number(perdasResumo?.total_perdas || 0),
      custo_perdas: Number(perdasResumo?.custo_perdas || 0),
      ativos: listaAtivos
    });
  } catch (error) {
    console.error('Erro no dashboard do almoxarifado:', error);
    res.status(500).json({ erro: 'Erro ao carregar dashboard de almoxarifado.' });
  }
});

router.get('/relatorios/movimentacoes', [auth, requireReadPermission], async (req, res) => {
  try {
    const { projeto_id: projetoId } = req.query;
    if (projetoId) {
      const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(projetoId));
      if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });
    }

    const movimentacoes = await allQuery(`
      SELECT
        m.*,
        f.nome AS ferramenta_nome,
        f.codigo AS ferramenta_codigo,
        f.marca AS ferramenta_marca,
        f.modelo AS ferramenta_modelo,
        f.nf_compra AS ferramenta_nf_compra,
        po.nome AS projeto_origem_nome,
        pd.nome AS projeto_destino_nome,
        u.nome AS usuario_nome
      FROM almox_movimentacoes m
      INNER JOIN almox_ferramentas f ON f.id = m.ferramenta_id
      LEFT JOIN projetos po ON po.id = m.projeto_origem_id
      LEFT JOIN projetos pd ON pd.id = m.projeto_destino_id
      LEFT JOIN usuarios u ON u.id = m.usuario_id
      WHERE (? IS NULL OR m.projeto_origem_id = ? OR m.projeto_destino_id = ?)
      ORDER BY m.id DESC
      LIMIT 500
    `, [projetoId ? Number(projetoId) : null, projetoId ? Number(projetoId) : null, projetoId ? Number(projetoId) : null]);

    res.json(movimentacoes);
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({ erro: 'Erro ao gerar relatório de movimentações.' });
  }
});

router.get('/relatorios/perdas', [auth, requireReadPermission], async (req, res) => {
  try {
    const { projeto_id: projetoId } = req.query;
    if (projetoId) {
      const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(projetoId));
      if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });
    }

    const perdas = await allQuery(`
      SELECT
        p.*,
        f.nome AS ferramenta_nome,
        f.codigo AS ferramenta_codigo,
        f.marca AS ferramenta_marca,
        f.modelo AS ferramenta_modelo,
        f.nf_compra AS ferramenta_nf_compra,
        COALESCE(uc.nome, a.colaborador_nome) AS colaborador_nome,
        pr.nome AS projeto_nome,
        u.nome AS usuario_nome
      FROM almox_perdas p
      INNER JOIN almox_ferramentas f ON f.id = p.ferramenta_id
      LEFT JOIN almox_alocacoes a ON a.id = p.alocacao_id
      LEFT JOIN usuarios uc ON uc.id = a.colaborador_id
      LEFT JOIN projetos pr ON pr.id = p.projeto_id
      LEFT JOIN usuarios u ON u.id = p.criado_por
      WHERE (? IS NULL OR p.projeto_id = ?)
      ORDER BY p.id DESC
      LIMIT 500
    `, [projetoId ? Number(projetoId) : null, projetoId ? Number(projetoId) : null]);

    res.json(perdas);
  } catch (error) {
    console.error('Erro ao gerar relatório de perdas:', error);
    res.status(500).json({ erro: 'Erro ao gerar relatório de perdas.' });
  }
});

router.get('/rdo/:rdoId/ferramentas-disponiveis', [auth, requireReadPermission], async (req, res) => {
  try {
    const { rdoId } = req.params;
    const rdo = await getQuery('SELECT id, projeto_id FROM rdos WHERE id = ?', [Number(rdoId)]);
    if (!rdo) return res.status(404).json({ erro: 'RDO não encontrado.' });

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(rdo.projeto_id));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const alocacoes = await allQuery(`
      SELECT
        a.id,
        a.ferramenta_id,
        f.nome AS ferramenta_nome,
        f.codigo AS ferramenta_codigo,
        a.colaborador_id,
        a.colaborador_nome,
        (a.quantidade - a.quantidade_devolvida) AS quantidade_disponivel_alocada,
        a.previsao_devolucao
      FROM almox_alocacoes a
      INNER JOIN almox_ferramentas f ON f.id = a.ferramenta_id
      WHERE a.projeto_id = ?
        AND a.status IN ('ALOCADA', 'EM_MANUTENCAO')
      ORDER BY f.nome
    `, [Number(rdo.projeto_id)]);

    res.json(alocacoes);
  } catch (error) {
    console.error('Erro ao listar ativos disponíveis para RDO:', error);
    res.status(500).json({ erro: 'Erro ao listar ativos disponíveis para o RDO.' });
  }
});

router.get('/rdo/:rdoId/ferramentas', [auth, requireReadPermission], async (req, res) => {
  try {
    const { rdoId } = req.params;
    const rdo = await getQuery('SELECT id, projeto_id FROM rdos WHERE id = ?', [Number(rdoId)]);
    if (!rdo) return res.status(404).json({ erro: 'RDO não encontrado.' });

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(rdo.projeto_id));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const itens = await allQuery(`
      SELECT
        rf.*,
        f.nome AS ferramenta_nome,
        f.codigo AS ferramenta_codigo,
        COALESCE(u.nome, rf.colaborador_nome) AS colaborador
      FROM rdo_ferramentas rf
      INNER JOIN almox_ferramentas f ON f.id = rf.ferramenta_id
      LEFT JOIN usuarios u ON u.id = rf.colaborador_id
      WHERE rf.rdo_id = ?
      ORDER BY rf.id DESC
    `, [Number(rdoId)]);

    res.json(itens);
  } catch (error) {
    console.error('Erro ao listar ativos do RDO:', error);
    res.status(500).json({ erro: 'Erro ao listar ativos utilizados no RDO.' });
  }
});

router.post('/rdo/:rdoId/ferramentas', [auth, requireWritePermission], async (req, res) => {
  try {
    const { rdoId } = req.params;
    const { alocacao_id: alocacaoId, quantidade } = req.body;
    const qtd = Number(quantidade);

    if (!alocacaoId || !Number.isInteger(qtd) || qtd <= 0) {
      return res.status(400).json({ erro: 'alocacao_id e quantidade válidos são obrigatórios.' });
    }

    const rdo = await getQuery('SELECT id, projeto_id FROM rdos WHERE id = ?', [Number(rdoId)]);
    if (!rdo) return res.status(404).json({ erro: 'RDO não encontrado.' });

    const ok = await ensureProjectAccess(req.usuario, req.perfilAlmox, Number(rdo.projeto_id));
    if (!ok) return res.status(403).json({ erro: 'Sem acesso a esta obra.' });

    const alocacao = await getQuery('SELECT * FROM almox_alocacoes WHERE id = ?', [Number(alocacaoId)]);
    if (!alocacao) return res.status(404).json({ erro: 'Alocação não encontrada.' });
    if (Number(alocacao.projeto_id) !== Number(rdo.projeto_id)) {
      return res.status(400).json({ erro: 'A alocação deve pertencer à mesma obra do RDO.' });
    }

    const saldoAlocacao = Number(alocacao.quantidade) - Number(alocacao.quantidade_devolvida || 0);
    if (qtd > saldoAlocacao) return res.status(400).json({ erro: 'Quantidade excede saldo alocado.' });

    const result = await runQuery(`
      INSERT INTO rdo_ferramentas
      (rdo_id, ferramenta_id, alocacao_id, colaborador_id, colaborador_nome, quantidade, criado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      Number(rdoId),
      Number(alocacao.ferramenta_id),
      Number(alocacaoId),
      alocacao.colaborador_id || null,
      alocacao.colaborador_nome || null,
      qtd,
      req.usuario.id
    ]);

    await registrarMovimentacao({
      ferramentaId: Number(alocacao.ferramenta_id),
      tipo: 'VINCULO_RDO',
      quantidade: qtd,
      projetoOrigemId: Number(rdo.projeto_id),
      colaboradorId: alocacao.colaborador_id,
      colaboradorNome: alocacao.colaborador_nome,
      rdoId: Number(rdoId),
      alocacaoId: Number(alocacaoId),
      usuarioId: req.usuario.id
    });

    const item = await getQuery('SELECT * FROM rdo_ferramentas WHERE id = ?', [result.lastID]);
    await registrarAuditoria('rdo_ferramentas', result.lastID, 'CREATE', null, item, req.usuario.id, { strict: true });
    res.status(201).json({ item });
  } catch (error) {
    console.error('Erro ao vincular ativo ao RDO:', error);
    res.status(500).json({ erro: 'Erro ao vincular ativo ao RDO.' });
  }
});

module.exports = router;