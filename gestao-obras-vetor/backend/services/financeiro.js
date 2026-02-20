const { allQuery, getQuery, runQuery } = require('../config/database');
const { registrarAuditoria } = require('../middleware/auditoria');

let schemaReadyPromise = null;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const toDateOnly = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const isLate = (dataPrevista, status) => {
  if (!dataPrevista || ['RECEBIDO', 'PAGO', 'ESTORNADO'].includes(String(status || '').toUpperCase())) return false;
  const hoje = new Date();
  const hojeDate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const prevista = new Date(`${dataPrevista}T00:00:00`);
  return prevista < hojeDate;
};

const ensureFinanceiroSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await runQuery(`
        CREATE TABLE IF NOT EXISTS financeiro_obra_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projeto_id INTEGER NOT NULL UNIQUE,
          saldo_inicial NUMERIC NOT NULL DEFAULT 0,
          criado_por INTEGER,
          atualizado_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          FOREIGN KEY (atualizado_por) REFERENCES usuarios(id)
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS financeiro_receitas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projeto_id INTEGER NOT NULL,
          numero_contrato TEXT,
          cliente TEXT,
          descricao TEXT,
          valor_previsto NUMERIC NOT NULL,
          valor_recebido NUMERIC NOT NULL DEFAULT 0,
          data_prevista DATE NOT NULL,
          data_recebida DATE,
          nf_numero TEXT,
          status TEXT NOT NULL DEFAULT 'PREVISTO',
          criado_por INTEGER NOT NULL,
          atualizado_por INTEGER,
          recebido_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          FOREIGN KEY (atualizado_por) REFERENCES usuarios(id),
          FOREIGN KEY (recebido_por) REFERENCES usuarios(id)
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS financeiro_despesas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          projeto_id INTEGER NOT NULL,
          tipo TEXT NOT NULL,
          fornecedor TEXT,
          descricao TEXT,
          categoria TEXT,
          valor_previsto NUMERIC NOT NULL,
          valor_pago NUMERIC NOT NULL DEFAULT 0,
          data_prevista DATE NOT NULL,
          data_paga DATE,
          forma_pagamento TEXT,
          status TEXT NOT NULL DEFAULT 'PREVISTO',
          pedido_compra_id INTEGER,
          cotacao_id INTEGER,
          criado_por INTEGER NOT NULL,
          atualizado_por INTEGER,
          pago_por INTEGER,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (pedido_compra_id) REFERENCES pedidos_compra(id),
          FOREIGN KEY (cotacao_id) REFERENCES cotacoes(id),
          FOREIGN KEY (criado_por) REFERENCES usuarios(id),
          FOREIGN KEY (atualizado_por) REFERENCES usuarios(id),
          FOREIGN KEY (pago_por) REFERENCES usuarios(id)
        )
      `);

      await runQuery(`
        CREATE TABLE IF NOT EXISTS financeiro_estornos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entidade_tipo TEXT NOT NULL,
          entidade_id INTEGER NOT NULL,
          projeto_id INTEGER NOT NULL,
          valor_estornado NUMERIC NOT NULL,
          motivo TEXT NOT NULL,
          usuario_id INTEGER NOT NULL,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE,
          FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
        )
      `);

      await runQuery('CREATE INDEX IF NOT EXISTS idx_fin_receitas_proj_data ON financeiro_receitas (projeto_id, data_prevista, data_recebida)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_fin_receitas_status ON financeiro_receitas (status)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_fin_despesas_proj_data ON financeiro_despesas (projeto_id, data_prevista, data_paga)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_fin_despesas_status ON financeiro_despesas (status)');
      await runQuery('CREATE INDEX IF NOT EXISTS idx_fin_estornos_proj ON financeiro_estornos (projeto_id, criado_em)');
      await runQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_despesa_pedido_unico ON financeiro_despesas (pedido_compra_id) WHERE pedido_compra_id IS NOT NULL');
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
};

const getSaldoInicial = async (projetoId) => {
  const row = await getQuery('SELECT saldo_inicial FROM financeiro_obra_config WHERE projeto_id = ?', [projetoId]);
  return toNumber(row?.saldo_inicial);
};

const setSaldoInicial = async (projetoId, saldoInicial, usuarioId) => {
  const atual = await getQuery('SELECT * FROM financeiro_obra_config WHERE projeto_id = ?', [projetoId]);
  if (atual) {
    await runQuery(
      'UPDATE financeiro_obra_config SET saldo_inicial = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE projeto_id = ?',
      [saldoInicial, usuarioId, projetoId]
    );
    const novo = await getQuery('SELECT * FROM financeiro_obra_config WHERE projeto_id = ?', [projetoId]);
    await registrarAuditoria('financeiro_obra_config', atual.id, 'UPDATE', atual, novo, usuarioId, { strict: true });
    return novo;
  }

  const result = await runQuery(
    'INSERT INTO financeiro_obra_config (projeto_id, saldo_inicial, criado_por, atualizado_por) VALUES (?, ?, ?, ?)',
    [projetoId, saldoInicial, usuarioId, usuarioId]
  );
  const novo = await getQuery('SELECT * FROM financeiro_obra_config WHERE id = ?', [result.lastID]);
  await registrarAuditoria('financeiro_obra_config', novo.id, 'CREATE', null, novo, usuarioId, { strict: true });
  return novo;
};

const listarReceitas = async (projetoId, filtros = {}) => {
  const where = ['r.projeto_id = ?'];
  const params = [projetoId];

  if (filtros.inicio) {
    where.push('r.data_prevista >= ?');
    params.push(filtros.inicio);
  }
  if (filtros.fim) {
    where.push('r.data_prevista <= ?');
    params.push(filtros.fim);
  }
  if (filtros.cliente) {
    where.push('LOWER(COALESCE(r.cliente, \"\")) LIKE ?');
    params.push(`%${String(filtros.cliente).toLowerCase()}%`);
  }
  if (filtros.status) {
    where.push('r.status = ?');
    params.push(filtros.status);
  }

  const rows = await allQuery(`
    SELECT r.*, u.nome AS criado_por_nome
    FROM financeiro_receitas r
    LEFT JOIN usuarios u ON u.id = r.criado_por
    WHERE ${where.join(' AND ')}
    ORDER BY r.data_prevista DESC, r.id DESC
  `, params);

  return rows.map((r) => ({
    ...r,
    status_calculado: isLate(r.data_prevista, r.status) ? 'ATRASADO' : r.status
  }));
};

const listarDespesas = async (projetoId, filtros = {}) => {
  const where = ['d.projeto_id = ?'];
  const params = [projetoId];

  if (filtros.inicio) {
    where.push('d.data_prevista >= ?');
    params.push(filtros.inicio);
  }
  if (filtros.fim) {
    where.push('d.data_prevista <= ?');
    params.push(filtros.fim);
  }
  if (filtros.fornecedor) {
    where.push('LOWER(COALESCE(d.fornecedor, \"\")) LIKE ?');
    params.push(`%${String(filtros.fornecedor).toLowerCase()}%`);
  }
  if (filtros.status) {
    where.push('d.status = ?');
    params.push(filtros.status);
  }
  if (filtros.tipo) {
    where.push('d.tipo = ?');
    params.push(filtros.tipo);
  }

  const rows = await allQuery(`
    SELECT d.*, u.nome AS criado_por_nome
    FROM financeiro_despesas d
    LEFT JOIN usuarios u ON u.id = d.criado_por
    WHERE ${where.join(' AND ')}
    ORDER BY d.data_prevista DESC, d.id DESC
  `, params);

  return rows.map((d) => ({
    ...d,
    status_calculado: isLate(d.data_prevista, d.status) ? 'ATRASADO' : d.status
  }));
};

const criarReceita = async (payload, usuarioId) => {
  const result = await runQuery(`
    INSERT INTO financeiro_receitas (
      projeto_id, numero_contrato, cliente, descricao, valor_previsto, valor_recebido, data_prevista, data_recebida, nf_numero, status, criado_por, atualizado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.projeto_id,
    payload.numero_contrato || null,
    payload.cliente || null,
    payload.descricao || null,
    payload.valor_previsto,
    payload.valor_recebido || 0,
    payload.data_prevista,
    payload.data_recebida || null,
    payload.nf_numero || null,
    payload.status || 'PREVISTO',
    usuarioId,
    usuarioId
  ]);

  const nova = await getQuery('SELECT * FROM financeiro_receitas WHERE id = ?', [result.lastID]);
  await registrarAuditoria('financeiro_receitas', nova.id, 'CREATE', null, nova, usuarioId, { strict: true });
  return nova;
};

const criarDespesa = async (payload, usuarioId) => {
  const result = await runQuery(`
    INSERT INTO financeiro_despesas (
      projeto_id, tipo, fornecedor, descricao, categoria, valor_previsto, valor_pago, data_prevista, data_paga, forma_pagamento, status, pedido_compra_id, cotacao_id, criado_por, atualizado_por
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.projeto_id,
    payload.tipo,
    payload.fornecedor || null,
    payload.descricao || null,
    payload.categoria || payload.tipo,
    payload.valor_previsto,
    payload.valor_pago || 0,
    payload.data_prevista,
    payload.data_paga || null,
    payload.forma_pagamento || null,
    payload.status || 'PREVISTO',
    payload.pedido_compra_id || null,
    payload.cotacao_id || null,
    usuarioId,
    usuarioId
  ]);

  const nova = await getQuery('SELECT * FROM financeiro_despesas WHERE id = ?', [result.lastID]);
  await registrarAuditoria('financeiro_despesas', nova.id, 'CREATE', null, nova, usuarioId, { strict: true });
  return nova;
};

const receberReceita = async (id, payload, usuarioId) => {
  const atual = await getQuery('SELECT * FROM financeiro_receitas WHERE id = ?', [id]);
  if (!atual) return null;

  await runQuery(
    'UPDATE financeiro_receitas SET valor_recebido = ?, data_recebida = ?, status = ?, recebido_por = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
    [payload.valor_recebido, payload.data_recebida, 'RECEBIDO', usuarioId, usuarioId, id]
  );

  const novo = await getQuery('SELECT * FROM financeiro_receitas WHERE id = ?', [id]);
  await registrarAuditoria('financeiro_receitas', id, 'RECEBER', atual, novo, usuarioId, { strict: true });
  return novo;
};

const pagarDespesa = async (id, payload, usuarioId) => {
  const atual = await getQuery('SELECT * FROM financeiro_despesas WHERE id = ?', [id]);
  if (!atual) return null;

  await runQuery(
    'UPDATE financeiro_despesas SET valor_pago = ?, data_paga = ?, forma_pagamento = ?, status = ?, pago_por = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
    [payload.valor_pago, payload.data_paga, payload.forma_pagamento || atual.forma_pagamento, 'PAGO', usuarioId, usuarioId, id]
  );

  const novo = await getQuery('SELECT * FROM financeiro_despesas WHERE id = ?', [id]);
  await registrarAuditoria('financeiro_despesas', id, 'PAGAR', atual, novo, usuarioId, { strict: true });
  return novo;
};

const estornarLancamento = async ({ entidadeTipo, entidadeId, valorEstornado, motivo, usuarioId }) => {
  const tabela = entidadeTipo === 'RECEITA' ? 'financeiro_receitas' : 'financeiro_despesas';
  const atual = await getQuery(`SELECT * FROM ${tabela} WHERE id = ?`, [entidadeId]);
  if (!atual) return null;

  await runQuery(
    `UPDATE ${tabela} SET status = 'ESTORNADO', atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`,
    [usuarioId, entidadeId]
  );

  await runQuery(
    'INSERT INTO financeiro_estornos (entidade_tipo, entidade_id, projeto_id, valor_estornado, motivo, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
    [entidadeTipo, entidadeId, atual.projeto_id, valorEstornado, motivo, usuarioId]
  );

  const novo = await getQuery(`SELECT * FROM ${tabela} WHERE id = ?`, [entidadeId]);
  await registrarAuditoria(tabela, entidadeId, 'ESTORNO', atual, novo, usuarioId, { strict: true });
  return novo;
};

const calcularDashboardProjeto = async (projetoId, filtros = {}) => {
  const [receitas, despesas] = await Promise.all([
    listarReceitas(projetoId, filtros),
    listarDespesas(projetoId, filtros)
  ]);

  const saldoInicial = await getSaldoInicial(projetoId);

  const receitasPrevistas = receitas.reduce((acc, r) => acc + toNumber(r.valor_previsto), 0);
  const receitasRecebidas = receitas.reduce((acc, r) => acc + toNumber(r.valor_recebido), 0);
  const despesasPrevistas = despesas.reduce((acc, d) => acc + toNumber(d.valor_previsto), 0);
  const despesasPagas = despesas.reduce((acc, d) => acc + toNumber(d.valor_pago), 0);

  const saldoProjetado = saldoInicial + receitasPrevistas - despesasPrevistas;
  const saldoReal = saldoInicial + receitasRecebidas - despesasPagas;
  const diferenca = saldoProjetado - saldoReal;

  const atrasoReceitas = receitas.filter((r) => r.status_calculado === 'ATRASADO').length;
  const atrasoDespesas = despesas.filter((d) => d.status_calculado === 'ATRASADO').length;

  const percentualExecutadoOrcamento = despesasPrevistas > 0
    ? (despesasPagas / despesasPrevistas) * 100
    : 0;

  return {
    saldo_inicial: saldoInicial,
    receitas_previstas: receitasPrevistas,
    receitas_recebidas: receitasRecebidas,
    despesas_previstas: despesasPrevistas,
    despesas_pagas: despesasPagas,
    saldo_projetado: saldoProjetado,
    saldo_real: saldoReal,
    diferenca,
    percentual_executado_orcamento: percentualExecutadoOrcamento,
    indicador_estouro_orcamento: despesasPagas > despesasPrevistas,
    alertas_receitas_atrasadas: atrasoReceitas,
    alertas_despesas_atrasadas: atrasoDespesas,
    alerta_saldo_negativo_projetado: saldoProjetado < 0
  };
};

const getPeriodoKey = (dataISO, agrupamento) => {
  const d = new Date(`${dataISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  if (agrupamento === 'diario') {
    return d.toISOString().slice(0, 10);
  }

  if (agrupamento === 'semanal') {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = dt.getUTCDay() || 7;
    if (day !== 1) dt.setUTCDate(dt.getUTCDate() + 1 - day);
    return dt.toISOString().slice(0, 10);
  }

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const gerarFluxo = async (projetoId, filtros = {}, agrupamento = 'mensal') => {
  const [receitas, despesas] = await Promise.all([
    listarReceitas(projetoId, filtros),
    listarDespesas(projetoId, filtros)
  ]);

  const mapa = new Map();

  const initBucket = (key) => ({
    periodo: key,
    receitas_previstas: 0,
    receitas_recebidas: 0,
    despesas_previstas: 0,
    despesas_pagas: 0,
    saldo_periodo_projetado: 0,
    saldo_periodo_real: 0
  });

  receitas.forEach((r) => {
    const key = getPeriodoKey(r.data_prevista, agrupamento);
    if (!key) return;
    if (!mapa.has(key)) mapa.set(key, initBucket(key));
    const bucket = mapa.get(key);
    bucket.receitas_previstas += toNumber(r.valor_previsto);
    bucket.receitas_recebidas += toNumber(r.valor_recebido);
  });

  despesas.forEach((d) => {
    const key = getPeriodoKey(d.data_prevista, agrupamento);
    if (!key) return;
    if (!mapa.has(key)) mapa.set(key, initBucket(key));
    const bucket = mapa.get(key);
    bucket.despesas_previstas += toNumber(d.valor_previsto);
    bucket.despesas_pagas += toNumber(d.valor_pago);
  });

  const lista = [...mapa.values()].sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
  lista.forEach((item) => {
    item.saldo_periodo_projetado = item.receitas_previstas - item.despesas_previstas;
    item.saldo_periodo_real = item.receitas_recebidas - item.despesas_pagas;
  });

  return lista;
};

const sincronizarDespesaPedido = async ({ pedido, cotacao, usuarioId }) => {
  if (!pedido?.id || !pedido?.projeto_id || !cotacao?.id) return;

  const quantidade = toNumber(pedido.quantidade);
  const valorUnitario = toNumber(cotacao.valor_unitario);
  const frete = toNumber(String(cotacao.frete || 0).replace(',', '.'));
  const valorPrevisto = (valorUnitario * quantidade) + frete;

  const existente = await getQuery('SELECT * FROM financeiro_despesas WHERE pedido_compra_id = ?', [pedido.id]);

  const dataBase = toDateOnly(pedido.atualizado_em) || toDateOnly(pedido.criado_em) || new Date().toISOString().slice(0, 10);

  if (existente) {
    await runQuery(`
      UPDATE financeiro_despesas
      SET fornecedor = ?, descricao = ?, categoria = ?, valor_previsto = ?, data_prevista = ?, cotacao_id = ?, atualizado_por = ?, atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      cotacao.fornecedor || existente.fornecedor,
      pedido.descricao || existente.descricao,
      'Material',
      valorPrevisto,
      dataBase,
      cotacao.id,
      usuarioId,
      existente.id
    ]);

    const novo = await getQuery('SELECT * FROM financeiro_despesas WHERE id = ?', [existente.id]);
    await registrarAuditoria('financeiro_despesas', existente.id, 'UPDATE', existente, novo, usuarioId, { strict: true });
    return novo;
  }

  return criarDespesa({
    projeto_id: pedido.projeto_id,
    tipo: 'Material',
    fornecedor: cotacao.fornecedor || null,
    descricao: `Pedido #${pedido.id} - ${pedido.descricao || 'Despesa de compra'}`,
    categoria: 'Material',
    valor_previsto: valorPrevisto,
    data_prevista: dataBase,
    status: 'PREVISTO',
    pedido_compra_id: pedido.id,
    cotacao_id: cotacao.id
  }, usuarioId);
};

module.exports = {
  ensureFinanceiroSchema,
  toDateOnly,
  toNumber,
  setSaldoInicial,
  getSaldoInicial,
  listarReceitas,
  listarDespesas,
  criarReceita,
  criarDespesa,
  receberReceita,
  pagarDespesa,
  estornarLancamento,
  calcularDashboardProjeto,
  gerarFluxo,
  sincronizarDespesaPedido
};
