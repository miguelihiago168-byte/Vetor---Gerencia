import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import {
  criarDespesaFinanceiro,
  criarReceitaFinanceiro,
  estornarDespesaFinanceiro,
  estornarReceitaFinanceiro,
  getFinanceiroDashboard,
  getFluxoCaixaFinanceiro,
  listarDespesasFinanceiro,
  listarReceitasFinanceiro,
  pagarDespesaFinanceiro,
  receberReceitaFinanceiro,
  updateFinanceiroSaldoInicial
} from '../services/api';
import { formatMoneyBR, formatMoneyInputBR, parseMoneyBR } from '../utils/currency';

const TIPOS_DESPESA = ['Material', 'Mão de obra', 'Equipamento', 'Transporte', 'Administrativo'];

function FinanceiroFluxoCaixa() {
  const { projetoId } = useParams();
  const { perfil } = useAuth();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [fluxo, setFluxo] = useState([]);
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [agrupamento, setAgrupamento] = useState('mensal');

  const [filtros, setFiltros] = useState({
    inicio: '',
    fim: '',
    cliente: '',
    fornecedor: ''
  });

  const [saldoInicialInput, setSaldoInicialInput] = useState('');

  const [novaReceita, setNovaReceita] = useState({
    numero_contrato: '',
    cliente: '',
    descricao: '',
    valor_previsto: '',
    data_prevista: '',
    nf_numero: ''
  });

  const [novaDespesa, setNovaDespesa] = useState({
    tipo: 'Material',
    fornecedor: '',
    descricao: '',
    valor_previsto: '',
    data_prevista: '',
    forma_pagamento: ''
  });

  const canFinance = ['ADM', 'Gestor Geral'].includes(perfil);

  const carregarDados = async () => {
    setErro('');
    try {
      setLoading(true);
      const paramsBase = {
        inicio: filtros.inicio || undefined,
        fim: filtros.fim || undefined
      };

      const [dashRes, fluxoRes, receitasRes, despesasRes] = await Promise.all([
        getFinanceiroDashboard(projetoId, paramsBase),
        getFluxoCaixaFinanceiro(projetoId, { ...paramsBase, agrupamento }),
        listarReceitasFinanceiro(projetoId, { ...paramsBase, cliente: filtros.cliente || undefined }),
        listarDespesasFinanceiro(projetoId, { ...paramsBase, fornecedor: filtros.fornecedor || undefined })
      ]);

      setDashboard(dashRes.data);
      setFluxo(fluxoRes.data || []);
      setReceitas(receitasRes.data || []);
      setDespesas(despesasRes.data || []);
      setSaldoInicialInput(formatMoneyBR(dashRes.data?.saldo_inicial || 0));
    } catch (e) {
      setErro(e?.response?.data?.erro || 'Erro ao carregar dados do fluxo de caixa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [projetoId, agrupamento]);

  const salvarSaldoInicial = async () => {
    if (!canFinance) return;
    setErro('');
    setSucesso('');
    try {
      await updateFinanceiroSaldoInicial(projetoId, parseMoneyBR(saldoInicialInput));
      await carregarDados();
      setSucesso('Saldo inicial atualizado com sucesso.');
    } catch (e) {
      setErro(e?.response?.data?.erro || 'Erro ao atualizar saldo inicial.');
    }
  };

  const salvarReceita = async (e) => {
    e.preventDefault();
    if (!canFinance) return;
    setErro('');
    setSucesso('');
    try {
      await criarReceitaFinanceiro(projetoId, {
        ...novaReceita,
        valor_previsto: parseMoneyBR(novaReceita.valor_previsto)
      });
      setNovaReceita({ numero_contrato: '', cliente: '', descricao: '', valor_previsto: '', data_prevista: '', nf_numero: '' });
      await carregarDados();
      setSucesso('Receita prevista cadastrada com sucesso.');
    } catch (e) {
      setErro(e?.response?.data?.erro || 'Erro ao cadastrar receita.');
    }
  };

  const salvarDespesa = async (e) => {
    e.preventDefault();
    if (!canFinance) return;
    setErro('');
    setSucesso('');
    try {
      await criarDespesaFinanceiro(projetoId, {
        ...novaDespesa,
        valor_previsto: parseMoneyBR(novaDespesa.valor_previsto)
      });
      setNovaDespesa({ tipo: 'Material', fornecedor: '', descricao: '', valor_previsto: '', data_prevista: '', forma_pagamento: '' });
      await carregarDados();
      setSucesso('Despesa prevista cadastrada com sucesso.');
    } catch (e) {
      setErro(e?.response?.data?.erro || 'Erro ao cadastrar despesa.');
    }
  };

  const receberReceita = async (receita) => {
    if (!canFinance) return;
    const valorRecebido = window.prompt('Valor recebido (formato 0,00):', formatMoneyBR(receita.valor_previsto));
    if (!valorRecebido) return;

    try {
      await receberReceitaFinanceiro(receita.id, {
        valor_recebido: parseMoneyBR(valorRecebido),
        data_recebida: new Date().toISOString().slice(0, 10)
      });
      await carregarDados();
      setSucesso('Receita recebida registrada.');
    } catch (e) {
      setErro(e?.response?.data?.erro || 'Erro ao registrar recebimento.');
    }
  };

  const pagarDespesa = async (despesa) => {
    if (!canFinance) return;
    const valorPago = window.prompt('Valor pago (formato 0,00):', formatMoneyBR(despesa.valor_previsto));
    if (!valorPago) return;

    try {
      await pagarDespesaFinanceiro(despesa.id, {
        valor_pago: parseMoneyBR(valorPago),
        data_paga: new Date().toISOString().slice(0, 10),
        forma_pagamento: despesa.forma_pagamento || 'Transferência'
      });
      await carregarDados();
      setSucesso('Pagamento da despesa registrado.');
    } catch (e) {
      setErro(e?.response?.data?.erro || 'Erro ao registrar pagamento.');
    }
  };

  const estornarReceita = async (receita) => {
    if (!canFinance) return;
    const motivo = window.prompt('Motivo do estorno:');
    if (!motivo) return;

    try {
      await estornarReceitaFinanceiro(receita.id, {
        valor_estornado: receita.valor_recebido || receita.valor_previsto,
        motivo
      });
      await carregarDados();
      setSucesso('Receita estornada com sucesso.');
    } catch (e) {
      setErro(e?.response?.data?.erro || 'Erro ao estornar receita.');
    }
  };

  const estornarDespesa = async (despesa) => {
    if (!canFinance) return;
    const motivo = window.prompt('Motivo do estorno:');
    if (!motivo) return;

    try {
      await estornarDespesaFinanceiro(despesa.id, {
        valor_estornado: despesa.valor_pago || despesa.valor_previsto,
        motivo
      });
      await carregarDados();
      setSucesso('Despesa estornada com sucesso.');
    } catch (e) {
      setErro(e?.response?.data?.erro || 'Erro ao estornar despesa.');
    }
  };

  const dadosComparativo = useMemo(() => [{
    nome: 'Previsto x Realizado',
    receitas_previstas: dashboard?.receitas_previstas || 0,
    receitas_recebidas: dashboard?.receitas_recebidas || 0,
    despesas_previstas: dashboard?.despesas_previstas || 0,
    despesas_pagas: dashboard?.despesas_pagas || 0
  }], [dashboard]);

  return (
    <>
      <Navbar />
      <div className="container">
        <div className="flex-between mb-3">
          <h1>Fluxo de Caixa</h1>
          <div className="flex" style={{ gap: 8 }}>
            <select className="form-select" value={agrupamento} onChange={(e) => setAgrupamento(e.target.value)}>
              <option value="diario">Diário</option>
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
            </select>
            <button className="btn btn-secondary" onClick={carregarDados}>Atualizar</button>
          </div>
        </div>

        {erro && <div className="alert alert-error">{erro}</div>}
        {sucesso && <div className="alert alert-success">{sucesso}</div>}

        <div className="card mb-3">
          <h2 className="card-header">Filtros</h2>
          <div className="grid grid-4" style={{ gap: 12 }}>
            <input className="form-input" type="date" value={filtros.inicio} onChange={(e) => setFiltros({ ...filtros, inicio: e.target.value })} />
            <input className="form-input" type="date" value={filtros.fim} onChange={(e) => setFiltros({ ...filtros, fim: e.target.value })} />
            <input className="form-input" placeholder="Cliente" value={filtros.cliente} onChange={(e) => setFiltros({ ...filtros, cliente: e.target.value })} />
            <input className="form-input" placeholder="Fornecedor" value={filtros.fornecedor} onChange={(e) => setFiltros({ ...filtros, fornecedor: e.target.value })} />
          </div>
          <div className="mt-2">
            <button className="btn btn-primary" onClick={carregarDados}>Aplicar filtros</button>
          </div>
        </div>

        <div className="grid grid-4 mb-3">
          <div className="card" style={{ marginBottom: 0 }}>
            <p className="eyebrow">Saldo Inicial</p>
            <h3>R$ {formatMoneyBR(dashboard?.saldo_inicial || 0)}</h3>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <p className="eyebrow">Saldo Projetado</p>
            <h3 style={{ color: (dashboard?.saldo_projetado || 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>R$ {formatMoneyBR(dashboard?.saldo_projetado || 0)}</h3>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <p className="eyebrow">Saldo Real</p>
            <h3 style={{ color: (dashboard?.saldo_real || 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>R$ {formatMoneyBR(dashboard?.saldo_real || 0)}</h3>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <p className="eyebrow">Diferença</p>
            <h3 style={{ color: (dashboard?.diferenca || 0) < 0 ? 'var(--danger)' : 'var(--info)' }}>R$ {formatMoneyBR(dashboard?.diferenca || 0)}</h3>
          </div>
        </div>

        <div className="grid grid-2 mb-3">
          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="card-header">Ajustar saldo inicial da obra</h2>
            <div className="flex" style={{ gap: 12 }}>
              <input
                className="form-input"
                value={saldoInicialInput}
                onChange={(e) => setSaldoInicialInput(formatMoneyInputBR(e.target.value))}
                placeholder="0,00"
                inputMode="numeric"
                disabled={!canFinance}
              />
              <button className="btn btn-primary" onClick={salvarSaldoInicial} disabled={!canFinance}>Salvar</button>
            </div>
            {!canFinance && <p className="mt-2" style={{ color: 'var(--gray-600)' }}>Somente ADM e Gestor Geral podem alterar.</p>}
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="card-header">Indicadores de risco</h2>
            <p>Orçamento executado: <strong>{(dashboard?.percentual_executado_orcamento || 0).toFixed(2)}%</strong></p>
            <p>Estouro de orçamento: <strong style={{ color: dashboard?.indicador_estouro_orcamento ? 'var(--danger)' : 'var(--success)' }}>{dashboard?.indicador_estouro_orcamento ? 'Sim' : 'Não'}</strong></p>
            <p>Receitas atrasadas: <strong>{dashboard?.alertas_receitas_atrasadas || 0}</strong></p>
            <p>Despesas atrasadas: <strong>{dashboard?.alertas_despesas_atrasadas || 0}</strong></p>
            <p>Saldo projetado negativo: <strong style={{ color: dashboard?.alerta_saldo_negativo_projetado ? 'var(--danger)' : 'var(--success)' }}>{dashboard?.alerta_saldo_negativo_projetado ? 'Sim' : 'Não'}</strong></p>
          </div>
        </div>

        <div className="grid grid-2 mb-3">
          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="card-header">Evolução do saldo</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={fluxo}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" />
                  <YAxis />
                  <Tooltip formatter={(v) => `R$ ${formatMoneyBR(v)}`} />
                  <Legend />
                  <Line type="monotone" dataKey="saldo_periodo_projetado" name="Saldo projetado" stroke="#0284c7" strokeWidth={2} />
                  <Line type="monotone" dataKey="saldo_periodo_real" name="Saldo real" stroke="#16a34a" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="card-header">Previsto x Realizado</h2>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={dadosComparativo}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" />
                  <YAxis />
                  <Tooltip formatter={(v) => `R$ ${formatMoneyBR(v)}`} />
                  <Legend />
                  <Bar dataKey="receitas_previstas" name="Receitas previstas" fill="#38bdf8" />
                  <Bar dataKey="receitas_recebidas" name="Receitas recebidas" fill="#2563eb" />
                  <Bar dataKey="despesas_previstas" name="Despesas previstas" fill="#fb923c" />
                  <Bar dataKey="despesas_pagas" name="Despesas pagas" fill="#dc2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-2 mb-3">
          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="card-header">Nova receita prevista</h2>
            <form onSubmit={salvarReceita} className="grid" style={{ gap: 10 }}>
              <input className="form-input" placeholder="Número do contrato" value={novaReceita.numero_contrato} onChange={(e) => setNovaReceita({ ...novaReceita, numero_contrato: e.target.value })} disabled={!canFinance} />
              <input className="form-input" placeholder="Cliente" value={novaReceita.cliente} onChange={(e) => setNovaReceita({ ...novaReceita, cliente: e.target.value })} disabled={!canFinance} />
              <input className="form-input" placeholder="Descrição" value={novaReceita.descricao} onChange={(e) => setNovaReceita({ ...novaReceita, descricao: e.target.value })} disabled={!canFinance} />
              <div className="grid grid-2" style={{ gap: 10 }}>
                <input className="form-input" inputMode="numeric" placeholder="Valor previsto (0,00)" value={novaReceita.valor_previsto} onChange={(e) => setNovaReceita({ ...novaReceita, valor_previsto: formatMoneyInputBR(e.target.value) })} disabled={!canFinance} />
                <input className="form-input" type="date" value={novaReceita.data_prevista} onChange={(e) => setNovaReceita({ ...novaReceita, data_prevista: e.target.value })} disabled={!canFinance} />
              </div>
              <input className="form-input" placeholder="Nº Nota Fiscal" value={novaReceita.nf_numero} onChange={(e) => setNovaReceita({ ...novaReceita, nf_numero: e.target.value })} disabled={!canFinance} />
              <button className="btn btn-primary" type="submit" disabled={!canFinance}>Salvar receita</button>
            </form>
          </div>

          <div className="card" style={{ marginBottom: 0 }}>
            <h2 className="card-header">Nova despesa prevista</h2>
            <form onSubmit={salvarDespesa} className="grid" style={{ gap: 10 }}>
              <select className="form-select" value={novaDespesa.tipo} onChange={(e) => setNovaDespesa({ ...novaDespesa, tipo: e.target.value })} disabled={!canFinance}>
                {TIPOS_DESPESA.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
              <input className="form-input" placeholder="Fornecedor" value={novaDespesa.fornecedor} onChange={(e) => setNovaDespesa({ ...novaDespesa, fornecedor: e.target.value })} disabled={!canFinance} />
              <input className="form-input" placeholder="Descrição" value={novaDespesa.descricao} onChange={(e) => setNovaDespesa({ ...novaDespesa, descricao: e.target.value })} disabled={!canFinance} />
              <div className="grid grid-2" style={{ gap: 10 }}>
                <input className="form-input" inputMode="numeric" placeholder="Valor previsto (0,00)" value={novaDespesa.valor_previsto} onChange={(e) => setNovaDespesa({ ...novaDespesa, valor_previsto: formatMoneyInputBR(e.target.value) })} disabled={!canFinance} />
                <input className="form-input" type="date" value={novaDespesa.data_prevista} onChange={(e) => setNovaDespesa({ ...novaDespesa, data_prevista: e.target.value })} disabled={!canFinance} />
              </div>
              <input className="form-input" placeholder="Forma de pagamento" value={novaDespesa.forma_pagamento} onChange={(e) => setNovaDespesa({ ...novaDespesa, forma_pagamento: e.target.value })} disabled={!canFinance} />
              <button className="btn btn-primary" type="submit" disabled={!canFinance}>Salvar despesa</button>
            </form>
          </div>
        </div>

        <div className="card mb-3">
          <h2 className="card-header">Receitas</h2>
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Contrato</th>
                    <th>Cliente</th>
                    <th>Valor previsto</th>
                    <th>Valor recebido</th>
                    <th>Data prevista</th>
                    <th>Data recebida</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {receitas.map((r) => (
                    <tr key={r.id}>
                      <td>{r.numero_contrato || '-'}</td>
                      <td>{r.cliente || '-'}</td>
                      <td>R$ {formatMoneyBR(r.valor_previsto)}</td>
                      <td>R$ {formatMoneyBR(r.valor_recebido)}</td>
                      <td>{r.data_prevista ? new Date(r.data_prevista).toLocaleDateString('pt-BR') : '-'}</td>
                      <td>{r.data_recebida ? new Date(r.data_recebida).toLocaleDateString('pt-BR') : '-'}</td>
                      <td>
                        <span className={r.status_calculado === 'ATRASADO' ? 'badge badge-red' : r.status === 'RECEBIDO' ? 'badge badge-green' : 'badge badge-yellow'}>
                          {r.status_calculado}
                        </span>
                      </td>
                      <td>
                        <div className="flex" style={{ gap: 8 }}>
                          {canFinance && r.status !== 'RECEBIDO' && r.status !== 'ESTORNADO' && (
                            <button className="btn btn-success" type="button" onClick={() => receberReceita(r)}>Receber</button>
                          )}
                          {canFinance && r.status === 'RECEBIDO' && (
                            <button className="btn btn-danger" type="button" onClick={() => estornarReceita(r)}>Estornar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {receitas.length === 0 && <tr><td colSpan={8}>Nenhuma receita encontrada.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="card-header">Despesas</h2>
          {loading ? <div className="loading"><div className="spinner"></div></div> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Fornecedor</th>
                    <th>Descrição</th>
                    <th>Valor previsto</th>
                    <th>Valor pago</th>
                    <th>Data prevista</th>
                    <th>Data paga</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {despesas.map((d) => (
                    <tr key={d.id}>
                      <td>{d.tipo}</td>
                      <td>{d.fornecedor || '-'}</td>
                      <td>{d.descricao || '-'}</td>
                      <td>R$ {formatMoneyBR(d.valor_previsto)}</td>
                      <td>R$ {formatMoneyBR(d.valor_pago)}</td>
                      <td>{d.data_prevista ? new Date(d.data_prevista).toLocaleDateString('pt-BR') : '-'}</td>
                      <td>{d.data_paga ? new Date(d.data_paga).toLocaleDateString('pt-BR') : '-'}</td>
                      <td>
                        <span className={d.status_calculado === 'ATRASADO' ? 'badge badge-red' : d.status === 'PAGO' ? 'badge badge-green' : 'badge badge-yellow'}>
                          {d.status_calculado}
                        </span>
                      </td>
                      <td>
                        <div className="flex" style={{ gap: 8 }}>
                          {canFinance && d.status !== 'PAGO' && d.status !== 'ESTORNADO' && (
                            <button className="btn btn-success" type="button" onClick={() => pagarDespesa(d)}>Pagar</button>
                          )}
                          {canFinance && d.status === 'PAGO' && (
                            <button className="btn btn-danger" type="button" onClick={() => estornarDespesa(d)}>Estornar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {despesas.length === 0 && <tr><td colSpan={9}>Nenhuma despesa encontrada.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default FinanceiroFluxoCaixa;
