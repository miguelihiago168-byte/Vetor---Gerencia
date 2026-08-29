import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRightLeft, Boxes, ChevronDown, ClipboardCheck, PackageMinus, PackagePlus, Search, Truck, Warehouse } from 'lucide-react';
import ComprasLayout from '../components/ComprasLayout';
import Button from '../components/ui/Button';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import {
  aprovarEstoqueTransferencia, cancelarEstoqueTransferencia, confirmarEstoqueTransferencia, criarEstoqueTransferencia, despacharEstoqueTransferencia,
  getEstoqueLotes, getEstoquePendencias, getEstoqueSaldos, getEstoqueTransferencias,
  getProjetos, receberEstoquePendencia, registrarSaidaEstoque, rejeitarEstoqueTransferencia, separarEstoqueTransferencia
} from '../services/api';
import './Estoque.css';

const fmt = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value || 0));
const moeda = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const toDateTime = (value) => value ? new Date(value).toLocaleString('pt-BR') : '—';
const dadosDaCompra = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
};
const rotuloStatusTransferencia = (status) => ({
  SOLICITADA: 'Aguardando aprovação',
  APROVADA_RESERVADA: 'Aprovada e reservada',
  EM_SEPARACAO: 'Em separação',
  AGUARDANDO_RECEBIMENTO: 'Aguardando recebimento',
  CONCLUIDA: 'Recebida',
  REJEITADA: 'Reprovada',
  CANCELADA: 'Cancelada'
}[status] || String(status || '').replaceAll('_', ' '));
const descricaoTransferencia = (produto) => {
  const dados = dadosDaCompra(produto.dados_compra);
  return [dados.especificacao_tecnica, dados.marca, dados.modelo].filter(Boolean).join(' · ');
};

export default function Estoque() {
  const { projetoId } = useParams();
  const { success, error } = useNotification();
  const { perfil } = useAuth();
  const [projetos, setProjetos] = useState([]);
  const [localSelecionado, setLocalSelecionado] = useState(projetoId ? `OBRA:${projetoId}` : 'CENTRAL');
  const [busca, setBusca] = useState('');
  const [saldos, setSaldos] = useState([]);
  const [pendencias, setPendencias] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recebimento, setRecebimento] = useState({ pendencia_id: '', quantidade: '', fornecedor_nome: '', nota_fiscal: '', lote: '', local_armazenamento: 'Estoque central', observacoes: '', requer_inspecao: false });
  const [transferencia, setTransferencia] = useState({ insumo_id: '', lote_id: '', quantidade: '', destino: '', justificativa: '' });
  const [saida, setSaida] = useState({ lote_id: '', quantidade: '', frente_servico: '', elemento_construtivo: '', responsavel_nome: '', observacoes: '' });
  const [lotes, setLotes] = useState([]);
  const [menuTransferencia, setMenuTransferencia] = useState(null);

  const localAtual = useMemo(() => {
    if (localSelecionado === 'CENTRAL') return { chave: 'CENTRAL', label: 'Estoque central', projetoId: null };
    const id = Number(localSelecionado.replace('OBRA:', ''));
    return { chave: localSelecionado, label: projetos.find((item) => Number(item.id) === id)?.nome || 'Obra', projetoId: id };
  }, [localSelecionado, projetos]);

  const carregar = async () => {
    try {
      setLoading(true);
      const params = localAtual.projetoId ? { projeto_id: localAtual.projetoId, q: busca || undefined } : { local: 'CENTRAL', q: busca || undefined };
      const [saldoRes, pendenciaRes, projetoRes, transferRes] = await Promise.all([
        getEstoqueSaldos(params), getEstoquePendencias(), getProjetos(), getEstoqueTransferencias()
      ]);
      setSaldos(saldoRes.data || []);
      setPendencias(pendenciaRes.data || []);
      setProjetos(projetoRes.data || []);
      setTransferencias(transferRes.data || []);
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao carregar o estoque.', 7000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, [localSelecionado]);

  const procurar = (event) => {
    event.preventDefault();
    carregar();
  };

  const selecionarInsumo = async (saldo) => {
    try {
      const params = localAtual.projetoId ? { projeto_id: localAtual.projetoId } : { local: 'CENTRAL' };
      const response = await getEstoqueLotes(saldo.insumo_id, params);
      setLotes(response.data || []);
      setTransferencia((current) => ({ ...current, insumo_id: String(saldo.insumo_id), lote_id: String(response.data?.[0]?.id || ''), quantidade: '', destino: '', justificativa: '' }));
      setSaida({ lote_id: String(response.data?.[0]?.id || ''), quantidade: '', frente_servico: '', elemento_construtivo: '', responsavel_nome: '', observacoes: '' });
      requestAnimationFrame(() => document.getElementById('transferir-insumos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } catch (err) {
      error(err?.response?.data?.erro || 'Erro ao carregar os lotes do insumo.', 6000);
    }
  };

  const receber = async (event) => {
    event.preventDefault();
    if (!recebimento.pendencia_id || !(Number(recebimento.quantidade) > 0)) return error('Selecione uma compra pendente e informe a quantidade recebida.', 6000);
    try {
      const resposta = await receberEstoquePendencia(recebimento.pendencia_id, { ...recebimento, quantidade: Number(recebimento.quantidade) });
      const chaveDestino = resposta.data?.local?.chave || (selectedPending?.projeto_solicitante_id ? `OBRA:${selectedPending.projeto_solicitante_id}` : 'CENTRAL');
      const nomeDestino = chaveDestino === 'CENTRAL'
        ? 'estoque central'
        : `estoque da obra ${projetos.find((projeto) => `OBRA:${projeto.id}` === chaveDestino)?.nome || ''}`.trim();
      success(`Recebimento registrado no ${nomeDestino}${recebimento.requer_inspecao ? ' e enviado para quarentena da Qualidade.' : '.'}`, 5000);
      setRecebimento({ pendencia_id: '', quantidade: '', fornecedor_nome: '', nota_fiscal: '', lote: '', local_armazenamento: 'Estoque central', observacoes: '', requer_inspecao: false });
      if (localAtual.chave === chaveDestino) await carregar();
      else setLocalSelecionado(chaveDestino);
    } catch (err) {
      error(err?.response?.data?.erro || 'Não foi possível registrar o recebimento.', 7000);
    }
  };

  const criarTransferencia = async (event) => {
    event.preventDefault();
    if (!transferencia.lote_id || !(Number(transferencia.quantidade) > 0) || !transferencia.destino) return error('Selecione um lote, quantidade e destino.', 6000);
    const destinoProjeto = transferencia.destino === 'CENTRAL' ? null : Number(transferencia.destino.replace('OBRA:', ''));
    try {
      await criarEstoqueTransferencia({
        origem_projeto_id: localAtual.projetoId,
        destino_projeto_id: destinoProjeto,
        justificativa: transferencia.justificativa || null,
        itens: [{ lote_id: Number(transferencia.lote_id), quantidade: Number(transferencia.quantidade) }]
      });
      success('Transferência criada e aguardando aprovação da origem.', 5000);
      setTransferencia({ insumo_id: '', lote_id: '', quantidade: '', destino: '', justificativa: '' });
      setLotes([]);
      await carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Não foi possível criar a transferência.', 7000);
    }
  };

  const registrarUso = async (event) => {
    event.preventDefault();
    if (!localAtual.projetoId) return error('A baixa para uso deve ser registrada no estoque de uma obra.', 6000);
    if (!saida.lote_id || !(Number(saida.quantidade) > 0) || !saida.frente_servico || !saida.responsavel_nome) return error('Selecione uma entrada e informe quantidade, responsável e frente de serviço.', 6000);
    try {
      await registrarSaidaEstoque({ ...saida, lote_id: Number(saida.lote_id), projeto_id: localAtual.projetoId, quantidade: Number(saida.quantidade) });
      success('Baixa para uso registrada e vinculada à obra.', 5000);
      setSaida((current) => ({ ...current, quantidade: '', frente_servico: '', elemento_construtivo: '', responsavel_nome: '', observacoes: '' }));
      await carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Não foi possível registrar a baixa para uso.', 7000);
    }
  };

  const aprovar = async (id) => {
    try { await aprovarEstoqueTransferencia(id); success('Saldo reservado e transferência enviada para confirmação.', 5000); await carregar(); }
    catch (err) { error(err?.response?.data?.erro || 'Erro ao aprovar a origem.', 7000); }
  };
  const confirmar = async (id) => {
    try { await confirmarEstoqueTransferencia(id); success('Recebimento no destino confirmado.', 5000); await carregar(); }
    catch (err) { error(err?.response?.data?.erro || 'Erro ao confirmar o destino.', 7000); }
  };
  const separar = async (id) => {
    try { await separarEstoqueTransferencia(id); success('Material marcado como em separação pelo almoxarifado.', 5000); await carregar(); }
    catch (err) { error(err?.response?.data?.erro || 'Erro ao iniciar a separação.', 7000); }
  };
  const despachar = async (id) => {
    try { await despacharEstoqueTransferencia(id); success('Saída física registrada. Aguardando recebimento no destino.', 5000); await carregar(); }
    catch (err) { error(err?.response?.data?.erro || 'Erro ao registrar a saída física.', 7000); }
  };
  const encerrarTransferencia = async (id, acao) => {
    const corrigir = acao === 'corrigir';
    const justificativa = window.prompt(corrigir ? 'Informe o que deve ser corrigido (opcional):' : 'Informe o motivo da reprovação (opcional):');
    if (justificativa === null) return;
    try {
      if (corrigir) await cancelarEstoqueTransferencia(id, justificativa || null);
      else await rejeitarEstoqueTransferencia(id, justificativa || null);
      setMenuTransferencia(null);
      success(corrigir ? 'Transferência cancelada para correção. O saldo foi liberado.' : 'Transferência reprovada e saldo liberado.', 5000);
      await carregar();
    } catch (err) {
      error(err?.response?.data?.erro || 'Não foi possível alterar a transferência.', 7000);
    }
  };

  const selectedPending = pendencias.find((item) => String(item.id) === String(recebimento.pendencia_id));
  const compraSelecionada = dadosDaCompra(selectedPending?.dados_compra);
  const totalDisponivel = saldos.reduce((total, item) => total + Number(item.quantidade_disponivel || 0), 0);
  const podeAprovarTransferencia = ['ADM', 'Gestor Geral'].includes(perfil);
  const podeOperarAlmoxarifado = ['ADM', 'Gestor Geral', 'Almoxarife'].includes(perfil);
  const podeConfirmarRecebimento = ['ADM', 'Gestor Geral', 'Almoxarife', 'Gestor da Obra', 'Gestor Local'].includes(perfil);

  return <ComprasLayout title="Estoque de insumos">
    <div className="estoque-page">
      <section className="estoque-intro card">
        <div><p className="eyebrow">SUPRIMENTOS / ESTOQUE</p><h2><Warehouse size={22} /> {localAtual.label}</h2><p>Compras da obra entram nela; compras sem projeto entram no estoque central. Transferências mantêm lote, NF e fornecedor.</p></div>
        <label><span>Visualizar estoque</span><select className="form-select" value={localSelecionado} onChange={(event) => setLocalSelecionado(event.target.value)}><option value="CENTRAL">Estoque central</option>{projetos.map((projeto) => <option key={projeto.id} value={`OBRA:${projeto.id}`}>{projeto.nome}</option>)}</select></label>
      </section>

      <div className="estoque-kpis">
        <article className="card"><Boxes /><div><strong>{saldos.length}</strong><span>insumos com saldo</span></div></article>
        <article className="card"><PackagePlus /><div><strong>{fmt(totalDisponivel)}</strong><span>unidades disponíveis</span></div></article>
        <article className="card"><Truck /><div><strong>{pendencias.length}</strong><span>entregas pendentes</span></div></article>
      </div>

      <section className="estoque-grid">
        <form className="card estoque-form" onSubmit={receber}>
          <h3><ClipboardCheck size={18} /> Receber compra</h3>
          <p>O saldo só entra quando a entrega física for registrada.</p>
          <select className="form-select" value={recebimento.pendencia_id} onChange={(event) => { const pending = pendencias.find((item) => String(item.id) === event.target.value); setRecebimento((current) => ({ ...current, pendencia_id: event.target.value, quantidade: pending?.quantidade_pendente || '', fornecedor_nome: pending?.fornecedor_nome || '' })); }}>
            <option value="">Selecione a compra pendente</option>
            {pendencias.map((item) => <option key={item.id} value={item.id}>{item.descricao} — pendente {fmt(item.quantidade_pendente)} {item.unidade}</option>)}
          </select>
          {selectedPending && <small>Pedido para {selectedPending.projeto_solicitante_nome || 'obra não informada'} · comprado: {fmt(selectedPending.quantidade_comprada)} {selectedPending.unidade}</small>}
          {selectedPending && <small className="estoque-destino-recebimento">Entrada prevista: {selectedPending.projeto_solicitante_nome ? `estoque da obra ${selectedPending.projeto_solicitante_nome}` : 'estoque central'}.</small>}
          {selectedPending && <div className="estoque-detalhes-compra">
            <strong>Informações da compra</strong>
            <dl>
              <div><dt>Produto</dt><dd>{selectedPending.descricao}</dd></div>
              <div><dt>Quantidade</dt><dd>{fmt(selectedPending.quantidade_comprada)} {selectedPending.unidade} · pendente {fmt(selectedPending.quantidade_pendente)} {selectedPending.unidade}</dd></div>
              <div><dt>Fornecedor</dt><dd>{selectedPending.fornecedor_nome || 'Não informado'}</dd></div>
              {compraSelecionada.especificacao_tecnica && <div><dt>Especificação</dt><dd>{compraSelecionada.especificacao_tecnica}</dd></div>}
              {compraSelecionada.fornecedor_cnpj && <div><dt>CNPJ</dt><dd>{compraSelecionada.fornecedor_cnpj}</dd></div>}
              {compraSelecionada.fornecedor_telefone && <div><dt>Telefone</dt><dd>{compraSelecionada.fornecedor_telefone}</dd></div>}
              {compraSelecionada.fornecedor_email && <div><dt>E-mail</dt><dd>{compraSelecionada.fornecedor_email}</dd></div>}
              {compraSelecionada.marca && <div><dt>Marca</dt><dd>{compraSelecionada.marca}</dd></div>}
              {compraSelecionada.modelo && <div><dt>Modelo</dt><dd>{compraSelecionada.modelo}</dd></div>}
              {compraSelecionada.valor_unitario != null && <div><dt>Valor unitário</dt><dd>{moeda(compraSelecionada.valor_unitario)}</dd></div>}
              {compraSelecionada.frete != null && <div><dt>Frete</dt><dd>{moeda(compraSelecionada.frete)}</dd></div>}
              {compraSelecionada.prazo_entrega && <div><dt>Prazo de entrega</dt><dd>{compraSelecionada.prazo_entrega}</dd></div>}
              {compraSelecionada.condicao_pagamento && <div><dt>Pagamento</dt><dd>{compraSelecionada.condicao_pagamento}</dd></div>}
              {compraSelecionada.garantia && <div><dt>Garantia</dt><dd>{compraSelecionada.garantia}</dd></div>}
              {compraSelecionada.observacao_cotacao && <div className="estoque-detalhe-amplo"><dt>Observações da cotação</dt><dd>{compraSelecionada.observacao_cotacao}</dd></div>}
            </dl>
          </div>}
          <div className="estoque-form-grid"><input className="form-input" type="number" min="0.001" step="0.001" placeholder="Quantidade recebida" value={recebimento.quantidade} onChange={(event) => setRecebimento({ ...recebimento, quantidade: event.target.value })} /><input className="form-input" placeholder="Fornecedor" value={recebimento.fornecedor_nome} onChange={(event) => setRecebimento({ ...recebimento, fornecedor_nome: event.target.value })} /><input className="form-input" placeholder="Nota fiscal (opcional)" value={recebimento.nota_fiscal} onChange={(event) => setRecebimento({ ...recebimento, nota_fiscal: event.target.value })} /><input className="form-input" placeholder="Lote (opcional)" value={recebimento.lote} onChange={(event) => setRecebimento({ ...recebimento, lote: event.target.value })} /></div>
          <label className="estoque-destino-recebimento"><input type="checkbox" checked={recebimento.requer_inspecao} onChange={(event) => setRecebimento({ ...recebimento, requer_inspecao: event.target.checked })} /> Exige inspeção da Qualidade (entrada fica em quarentena)</label>
          <textarea className="form-textarea" rows="2" placeholder="Observações (opcional)" value={recebimento.observacoes} onChange={(event) => setRecebimento({ ...recebimento, observacoes: event.target.value })} />
          <Button type="submit" startIcon={PackagePlus}>Registrar entrada</Button>
        </form>

        <form id="transferir-insumos" className="card estoque-form" onSubmit={criarTransferencia}>
          <h3><ArrowRightLeft size={18} /> Transferir insumos</h3>
          <p>{transferencia.insumo_id ? 'Escolha o lote, informe o destino e crie a solicitação. Depois, confirme origem e destino na lista abaixo.' : 'Clique em “Transferir” na linha do saldo para selecionar o insumo de origem.'}</p>
          {transferencia.insumo_id && <small className="estoque-destino-recebimento">Origem: {localAtual.label} · lote sugerido: o mais antigo disponível.</small>}
          <select className="form-select" disabled={!lotes.length} value={transferencia.lote_id} onChange={(event) => setTransferencia({ ...transferencia, lote_id: event.target.value })}>
            <option value="">Selecione o lote</option>{lotes.map((lote) => <option key={lote.id} value={lote.id}>{lote.nota_fiscal ? `NF ${lote.nota_fiscal} · ` : ''}{lote.lote ? `Lote ${lote.lote} · ` : ''}disponível {fmt(lote.quantidade_disponivel)} {lote.unidade}</option>)}
          </select>
          <div className="estoque-form-grid"><input className="form-input" type="number" min="0.001" step="0.001" max={lotes.find((lote) => String(lote.id) === transferencia.lote_id)?.quantidade_disponivel || undefined} placeholder="Quantidade" value={transferencia.quantidade} onChange={(event) => setTransferencia({ ...transferencia, quantidade: event.target.value })} /><select className="form-select" value={transferencia.destino} onChange={(event) => setTransferencia({ ...transferencia, destino: event.target.value })}><option value="">Destino</option>{localAtual.chave !== 'CENTRAL' && <option value="CENTRAL">Estoque central</option>}{projetos.filter((p) => `OBRA:${p.id}` !== localAtual.chave).map((p) => <option key={p.id} value={`OBRA:${p.id}`}>{p.nome}</option>)}</select></div>
          <textarea className="form-textarea" rows="2" placeholder="Justificativa (opcional)" value={transferencia.justificativa} onChange={(event) => setTransferencia({ ...transferencia, justificativa: event.target.value })} />
          <Button type="submit" disabled={!lotes.length} startIcon={ArrowRightLeft}>Criar transferência</Button>
        </form>

        <form className="card estoque-form" onSubmit={registrarUso}>
          <h3><PackageMinus size={18} /> Baixar para uso na obra</h3>
          <p>Registre a retirada física vinculando o material à frente de serviço ou atividade da obra.</p>
          {!localAtual.projetoId && <small className="estoque-destino-recebimento">Selecione uma obra acima para registrar o uso.</small>}
          <select className="form-select" disabled={!localAtual.projetoId || !lotes.length} value={saida.lote_id} onChange={(event) => setSaida({ ...saida, lote_id: event.target.value })}>
            <option value="">Selecione uma entrada</option>{lotes.map((lote) => <option key={lote.id} value={lote.id}>{lote.nome} · disponível {fmt(lote.quantidade_disponivel)} {lote.unidade}{Number(lote.quantidade_quarentena) ? ' · em quarentena' : ''}</option>)}
          </select>
          <div className="estoque-form-grid"><input className="form-input" type="number" min="0.001" step="0.001" max={lotes.find((lote) => String(lote.id) === saida.lote_id)?.quantidade_disponivel || undefined} placeholder="Quantidade utilizada" value={saida.quantidade} onChange={(event) => setSaida({ ...saida, quantidade: event.target.value })} /><input className="form-input" placeholder="Responsável pela retirada" value={saida.responsavel_nome} onChange={(event) => setSaida({ ...saida, responsavel_nome: event.target.value })} /><input className="form-input" placeholder="Frente de serviço *" value={saida.frente_servico} onChange={(event) => setSaida({ ...saida, frente_servico: event.target.value })} /><input className="form-input" placeholder="Elemento construtivo (opcional)" value={saida.elemento_construtivo} onChange={(event) => setSaida({ ...saida, elemento_construtivo: event.target.value })} /></div>
          <textarea className="form-textarea" rows="2" placeholder="Observações (opcional)" value={saida.observacoes} onChange={(event) => setSaida({ ...saida, observacoes: event.target.value })} />
          <Button type="submit" disabled={!localAtual.projetoId || !lotes.length} startIcon={PackageMinus}>Registrar uso</Button>
        </form>
      </section>

      <section className="card estoque-list">
        <div className="estoque-list-header"><div><h3>Saldo por insumo</h3><p>Os totais agrupam compras iguais, preservando o detalhe por lote.</p></div><form onSubmit={procurar}><Search size={16} /><input className="form-input" placeholder="Insumo, NF, lote ou fornecedor" value={busca} onChange={(event) => setBusca(event.target.value)} /></form></div>
        {loading ? <div className="loading"><div className="spinner" /></div> : <div className="table-wrap"><table className="table"><thead><tr><th>Insumo</th><th>Unidade</th><th>Físico</th><th>Quarentena</th><th>Reservado</th><th>Disponível</th><th>Lotes</th><th /></tr></thead><tbody>{saldos.map((item) => <tr key={`${item.insumo_id}-${item.local_chave}`}><td><strong>{item.nome}</strong></td><td>{item.unidade}</td><td>{fmt(item.quantidade_fisica)}</td><td>{fmt(item.quantidade_quarentena)}</td><td>{fmt(item.quantidade_reservada)}</td><td><strong>{fmt(item.quantidade_disponivel)}</strong></td><td>{item.total_lotes}</td><td><Button size="sm" variant="outline" onClick={() => selecionarInsumo(item)}>Selecionar</Button></td></tr>)}{!saldos.length && <tr><td colSpan="8">Nenhum saldo encontrado neste estoque.</td></tr>}</tbody></table></div>}
      </section>

      <section className="card estoque-list">
        <div className="estoque-list-header"><div><h3>Transferências</h3><p>1. solicitar · 2. aprovar e reservar · 3. separar · 4. registrar saída · 5. confirmar recebimento.</p></div></div>
        <div className="table-wrap"><table className="table"><thead><tr><th>Origem</th><th>Destino</th><th>O que está indo</th><th>Status</th><th>Solicitado por</th><th>Data</th><th /></tr></thead><tbody>{transferencias.map((item) => {
          const emAberto = ['SOLICITADA', 'APROVADA_RESERVADA', 'EM_SEPARACAO', 'AGUARDANDO_RECEBIMENTO'].includes(item.status);
          const podeCorrigir = ['SOLICITADA', 'APROVADA_RESERVADA', 'EM_SEPARACAO'].includes(item.status) && (podeAprovarTransferencia || podeConfirmarRecebimento);
          return <tr key={item.id}><td>{item.origem_obra_nome || 'Estoque central'}</td><td>{item.destino_obra_nome || 'Estoque central'}</td><td className="estoque-itens-transferencia">{item.itens?.length ? item.itens.map((produto) => <div key={`${item.id}-${produto.lote_id}`}><strong>{produto.descricao}</strong>{descricaoTransferencia(produto) && <span className="estoque-especificacao-transferencia"> · {descricaoTransferencia(produto)}</span>}<br /><span>{fmt(produto.quantidade)} {produto.unidade}{produto.lote ? ` · lote ${produto.lote}` : ''}{produto.nota_fiscal ? ` · NF ${produto.nota_fiscal}` : ''}{produto.fornecedor_nome ? ` · ${produto.fornecedor_nome}` : ''}</span></div>) : 'Itens não informados'}</td><td><span className={`estoque-status ${item.status.toLowerCase()}`}>{rotuloStatusTransferencia(item.status)}</span></td><td>{item.solicitante_nome || '—'}</td><td>{toDateTime(item.criada_em)}</td><td>{emAberto && <div className="estoque-acoes"><Button size="sm" variant="outline" endIcon={ChevronDown} onClick={() => setMenuTransferencia(menuTransferencia === item.id ? null : item.id)}>Ações</Button>{menuTransferencia === item.id && <div className="estoque-menu-acoes">{item.status === 'SOLICITADA' && podeAprovarTransferencia && <button type="button" onClick={() => aprovar(item.id)}>Aprovar e reservar</button>}{item.status === 'APROVADA_RESERVADA' && podeOperarAlmoxarifado && <button type="button" onClick={() => separar(item.id)}>Iniciar separação</button>}{item.status === 'EM_SEPARACAO' && podeOperarAlmoxarifado && <button type="button" onClick={() => despachar(item.id)}>Registrar saída física</button>}{item.status === 'AGUARDANDO_RECEBIMENTO' && podeConfirmarRecebimento && <button type="button" onClick={() => confirmar(item.id)}>Confirmar recebimento</button>}{podeCorrigir && <button type="button" onClick={() => encerrarTransferencia(item.id, 'corrigir')}>Corrigir / cancelar</button>}{item.status === 'SOLICITADA' && podeAprovarTransferencia && <button type="button" className="danger" onClick={() => encerrarTransferencia(item.id, 'reprovar')}>Reprovar</button>}</div>}</div>}</td></tr>;
        })}{!transferencias.length && <tr><td colSpan="7">Nenhuma transferência registrada.</td></tr>}</tbody></table></div>
      </section>
    </div>
  </ComprasLayout>;
}
