import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Boxes, ClipboardList, PackageMinus, Search, Warehouse } from 'lucide-react';
import ComprasLayout from '../components/ComprasLayout';
import Button from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { getEstoqueLotes, getEstoqueSaldos, getProjetos, getSaidasEstoque, registrarSaidaEstoque, getEstoqueTransferencias, aprovarEstoqueTransferencia, separarEstoqueTransferencia, despacharEstoqueTransferencia, confirmarEstoqueTransferencia, cancelarEstoqueTransferencia } from '../services/api';
import './Estoque.css';

const fmt = value => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(Number(value || 0));
const nowLocal = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const blank = () => ({ lote_id: '', quantidade: '', responsavel_nome: '', frente_servico: '', elemento_construtivo: '', aplicado_em: nowLocal(), observacoes: '' });

export default function Estoque() {
  const { projetoId } = useParams();
  const { perfil } = useAuth();
  const [projetos, setProjetos] = useState([]); const [obra, setObra] = useState(projetoId || '');
  const [saldos, setSaldos] = useState([]); const [saidas, setSaidas] = useState([]); const [lotes, setLotes] = useState([]);
  const [oldTransfers, setOldTransfers] = useState([]);
  const [form, setForm] = useState(blank); const [selected, setSelected] = useState(null); const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const canWrite = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Almoxarife'].includes(perfil);
  useEffect(() => { getProjetos().then(r => setProjetos(r.data || [])).catch(() => setError('Não foi possível carregar as obras.')); }, []);
  useEffect(() => { setObra(projetoId || ''); }, [projetoId]);
  const load = useCallback(async () => {
    if (!obra) { setSaldos([]); setSaidas([]); return; }
    setLoading(true); setError('');
    try { const [s, h, transfers] = await Promise.all([getEstoqueSaldos({ projeto_id: obra }), getSaidasEstoque(obra), getEstoqueTransferencias()]); setSaldos(s.data || []); setSaidas(h.data || []); setOldTransfers((transfers.data || []).filter(t => ['SOLICITADA', 'APROVADA_RESERVADA', 'EM_SEPARACAO', 'AGUARDANDO_RECEBIMENTO'].includes(t.status) && [String(t.origem_projeto_id), String(t.destino_projeto_id)].includes(String(obra)))); setLoadFailed(false); }
    catch (err) { setLoadFailed(true); setError(err.response?.data?.erro || 'Não foi possível carregar o estoque.'); }
    finally { setLoading(false); }
  }, [obra]);
  useEffect(() => { setSelected(null); setLotes([]); setForm(blank()); setNotice(''); load(); }, [load]);
  const selectItem = async item => {
    setError(''); setNotice('');
    try { const result = await getEstoqueLotes(item.insumo_id, { projeto_id: obra }); const available = (result.data || []).filter(lote => Number(lote.quantidade_disponivel) > 0); setLotes(available); setSelected(item); setForm({ ...blank(), lote_id: String(available[0]?.id || '') }); }
    catch (err) { setError(err.response?.data?.erro || 'Não foi possível consultar as entradas do insumo.'); }
  };
  const submit = async event => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try { await registrarSaidaEstoque({ ...form, lote_id: Number(form.lote_id), projeto_id: Number(obra), quantidade: Number(form.quantidade), aplicado_em: new Date(form.aplicado_em).toISOString() }); setSelected(null); setLotes([]); setForm(blank()); await load(); setNotice('Baixa registrada no estoque da obra.'); }
    catch (err) { setError(err.response?.data?.erro || 'Não foi possível registrar a baixa.'); }
    finally { setSaving(false); }
  };
  const updateTransfer = async (action, id) => { setError(''); try { await action(id); await load(); setNotice('Transferência anterior atualizada.'); } catch (err) { setError(err.response?.data?.erro || 'Não foi possível atualizar a transferência anterior.'); } };
  const shown = saldos.filter(item => item.nome.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
  const lote = lotes.find(entry => String(entry.id) === form.lote_id);
  return <ComprasLayout title="Estoque de insumos"><div className="estoque-page">
    <section className="estoque-intro card"><div><p className="eyebrow">SUPRIMENTOS / ESTOQUE DA OBRA</p><h2><Warehouse size={22}/> {projetos.find(p => String(p.id) === String(obra))?.nome || 'Selecione uma obra'}</h2><p>Consulte os materiais recebidos pela RIR e registre as quantidades retiradas para uso.</p></div><label><span>Obra</span><select className="form-select" value={obra} onChange={event => setObra(event.target.value)}><option value="">Selecione uma obra</option>{projetos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label></section>
    {error && <div className="alert alert-error" role="alert">{error}</div>}{notice && <div className="material-success-notice" role="status">{notice}</div>}
    {!obra ? <section className="card suprimentos-empty-card">Selecione uma obra para consultar seu estoque.</section> : loadFailed ? <section className="card suprimentos-empty-card"><p>Não foi possível consultar os dados desta obra.</p><Button onClick={load}>Tentar novamente</Button></section> : <>
      {oldTransfers.length > 0 && <details className="card estoque-list"><summary>Transferências anteriores em andamento ({oldTransfers.length})</summary><p>Conclua ou cancele os processos existentes para liberar os saldos. Novas transferências não podem ser criadas.</p>{oldTransfers.map(t => <div className="estoque-old-transfer" key={t.id}><span>{t.origem_obra_nome || 'Estoque central'} → {t.destino_obra_nome || 'Estoque central'} · {t.status.replaceAll('_', ' ')}</span><div>{['ADM', 'Gestor Geral'].includes(perfil) && t.status === 'SOLICITADA' && <Button size="sm" onClick={() => updateTransfer(aprovarEstoqueTransferencia, t.id)}>Aprovar</Button>}{['ADM', 'Gestor Geral', 'Almoxarife'].includes(perfil) && t.status === 'APROVADA_RESERVADA' && <Button size="sm" onClick={() => updateTransfer(separarEstoqueTransferencia, t.id)}>Separar</Button>}{['ADM', 'Gestor Geral', 'Almoxarife'].includes(perfil) && t.status === 'EM_SEPARACAO' && <Button size="sm" onClick={() => updateTransfer(despacharEstoqueTransferencia, t.id)}>Registrar saída</Button>}{canWrite && t.status === 'AGUARDANDO_RECEBIMENTO' && <Button size="sm" onClick={() => updateTransfer(confirmarEstoqueTransferencia, t.id)}>Confirmar recebimento</Button>}{canWrite && ['SOLICITADA', 'APROVADA_RESERVADA', 'EM_SEPARACAO'].includes(t.status) && <Button size="sm" onClick={() => updateTransfer(cancelarEstoqueTransferencia, t.id)}>Cancelar</Button>}</div></div>)}</details>}
      <section className="card estoque-list"><div className="estoque-list-header"><div><h3><Boxes size={18}/> Saldo de insumos</h3><p>As quantidades são informativas e refletem os recebimentos e baixas registrados.</p></div><label className="estoque-search"><Search size={16}/><span className="estoque-sr-only">Buscar insumo</span><input className="form-input" placeholder="Buscar insumo" value={search} onChange={e => setSearch(e.target.value)}/></label></div>
        {loading ? <p>Carregando estoque...</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Insumo</th><th>Unidade</th><th>Saldo físico</th><th>Disponível para baixa</th><th>Em inspeção / tratamento</th><th>Entradas</th><th>Ação</th></tr></thead><tbody>{shown.map(item => <tr key={item.insumo_id}><td><strong>{item.nome}</strong></td><td>{item.unidade}</td><td>{fmt(item.quantidade_fisica)}</td><td><strong>{fmt(item.quantidade_disponivel)}</strong></td><td>{fmt(item.quantidade_quarentena)}<br/><small>Aguardando: {fmt(item.aguardando_inspecao)} · Bloqueado: {fmt(item.quantidade_bloqueada)} · Rejeitado: {fmt(item.quantidade_rejeitada)}</small></td><td>{item.total_lotes}</td><td>{canWrite && <Button size="sm" onClick={() => selectItem(item)} disabled={Number(item.quantidade_disponivel) <= 0}>Dar baixa</Button>}</td></tr>)}{!shown.length && <tr><td colSpan="7">Nenhum insumo encontrado nesta obra.</td></tr>}</tbody></table></div>}
      </section>
      {selected && <form className="card estoque-form estoque-baixa" onSubmit={submit}><h3><PackageMinus size={18}/> Registrar baixa · {selected.nome}</h3><p>Selecione a entrada e informe quem retirou, quando e onde o material foi usado.</p><label>Entrada<select className="form-select" required value={form.lote_id} onChange={e => setForm({ ...form, lote_id:e.target.value })}><option value="">Selecione a entrada</option>{lotes.map(item => <option key={item.id} value={item.id}>{item.nota_fiscal ? `NF ${item.nota_fiscal} · ` : ''}{item.lote ? `Lote ${item.lote} · ` : ''}disponível {fmt(item.quantidade_disponivel)} {item.unidade}</option>)}</select></label><div className="estoque-form-grid"><label>Quantidade ({selected.unidade})<input className="form-input" required type="number" min="0.0001" step="0.0001" max={lote?.quantidade_disponivel} value={form.quantidade} onChange={e => setForm({...form,quantidade:e.target.value})}/></label><label>Quem retirou<input className="form-input" required maxLength="200" value={form.responsavel_nome} onChange={e => setForm({...form,responsavel_nome:e.target.value})}/></label><label>Data e hora da retirada<input className="form-input" required type="datetime-local" value={form.aplicado_em} onChange={e => setForm({...form,aplicado_em:e.target.value})}/></label><label>Onde foi usado<input className="form-input" required maxLength="300" placeholder="Frente de serviço ou local" value={form.frente_servico} onChange={e => setForm({...form,frente_servico:e.target.value})}/></label><label>Elemento ou detalhe (opcional)<input className="form-input" value={form.elemento_construtivo} onChange={e => setForm({...form,elemento_construtivo:e.target.value})}/></label></div><label>Observações<textarea className="form-textarea" rows="2" value={form.observacoes} onChange={e => setForm({...form,observacoes:e.target.value})}/></label><div className="estoque-form-actions"><Button type="button" onClick={() => setSelected(null)} disabled={saving}>Cancelar</Button><Button type="submit" tone="primary" variant="solid" loading={saving}>Registrar baixa</Button></div></form>}
      <section className="card estoque-list"><div className="estoque-list-header"><div><h3><ClipboardList size={18}/> Histórico de baixas</h3><p>Últimas retiradas registradas nesta obra.</p></div></div><div className="table-wrap"><table className="table"><thead><tr><th>Data e hora</th><th>Insumo</th><th>Quantidade</th><th>Quem retirou</th><th>Onde foi usado</th><th>Registrado por</th></tr></thead><tbody>{saidas.map(item => <tr key={item.id}><td>{new Date(item.aplicado_em).toLocaleString('pt-BR')}</td><td>{item.nome}</td><td>{fmt(item.quantidade)} {item.unidade}</td><td>{item.responsavel_nome}</td><td>{item.frente_servico}{item.elemento_construtivo ? ` · ${item.elemento_construtivo}` : ''}</td><td>{item.registrado_por || '—'}</td></tr>)}{!saidas.length && <tr><td colSpan="6">Nenhuma baixa registrada nesta obra.</td></tr>}</tbody></table></div></section>
    </>}
  </div></ComprasLayout>;
}
