import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { useAuth } from '../context/AuthContext';
import { listarRequisicoes, criarRequisicao, getProjetos } from '../services/api';

const TIPOS_MATERIAL = ['Materiais Elétricos','Materiais Civis','Materiais Eletrônicos','Ferramentas','EPIs','Serviços','Outros'];
const URGENCIAS      = ['Normal','Urgente','Emergencial'];
const UNIDADES       = ['un','m','m²','m³','kg','g','L','t','cx','pc','pç','par','jg','rolo','h','dia','vb'];
const URGENCIA_COLOR = { Normal: '#64748b', Urgente: '#d97706', Emergencial: '#dc2626' };
const ITEM_VAZIO     = { descricao: '', quantidade: '', unidade: 'un', especificacao_tecnica: '', justificativa: '', impacto_cronograma: false, impacto_seguranca: false, impacto_qualidade: false };

const STATUS_BADGE = {
  'Em análise':                      'badge badge-blue',
  'Em cotação':                      'badge badge-blue',
  'Aguardando decisão gestor geral': 'badge badge-yellow',
  'Compra autorizada':               'badge badge-green',
  'Finalizada':                      'badge badge-green',
  'Encerrada sem compra':            'badge badge-red',
};

const URG_BADGE = {
  Normal:      'badge badge-gray',
  Urgente:     'badge badge-yellow',
  Emergencial: 'badge badge-red',
};

export default function ComprasGlobal() {
  const navigate = useNavigate();
  const { usuario } = useAuth();

  const [requisicoes, setRequisicoes] = useState([]);
  const [resumo, setResumo] = useState({ total: 0, ag_analise: 0, em_cotacao: 0, ag_decisao: 0, prontos: 0 });
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ status_requisicao: '', urgencia: '', data_inicio: '', data_fim: '' });
  const [busca, setBusca] = useState('');

  /* ── modal nova requisição ── */
  const [modalAberto, setModalAberto] = useState(false);
  const [projetos, setProjetos]       = useState([]);
  const [form, setForm]               = useState({ projeto_id: '', tipo_material: '', urgencia: 'Normal', observacao_geral: '' });
  const [itens, setItens]             = useState([{ ...ITEM_VAZIO }]);
  const [step, setStep]               = useState(1);
  const [salvando, setSalvando]       = useState(false);
  const [erroModal, setErroModal]     = useState('');

  const podeCriar = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'].includes(usuario?.perfil || '');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filtros.status_requisicao) params.status_requisicao = filtros.status_requisicao;
      if (filtros.urgencia)          params.urgencia          = filtros.urgencia;
      if (filtros.data_inicio)       params.data_inicio       = filtros.data_inicio;
      if (filtros.data_fim)          params.data_fim          = filtros.data_fim;
      const res = await listarRequisicoes(params);
      setRequisicoes(res.data.requisicoes || []);
      setResumo(res.data.resumo || {});
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirModal = async () => {
    if (projetos.length === 0) {
      try { const r = await getProjetos(); setProjetos(r.data || []); } catch {}
    }
    setForm({ projeto_id: '', tipo_material: '', urgencia: 'Normal', observacao_geral: '' });
    setItens([{ ...ITEM_VAZIO }]); setStep(1); setErroModal(''); setModalAberto(true);
  };

  const resetModal = () => { setModalAberto(false); setStep(1); setErroModal(''); };

  const addItem    = () => { if (itens.length < 10) setItens([...itens, { ...ITEM_VAZIO }]); };
  const removeItem = (idx) => { if (itens.length > 1) setItens(itens.filter((_, i) => i !== idx)); };
  const updateItem = (idx, f, v) => setItens(itens.map((it, i) => i === idx ? { ...it, [f]: v } : it));

  const salvarRequisicao = async (e) => {
    e.preventDefault();
    if (!form.projeto_id) { setErroModal('Selecione o projeto.'); return; }
    for (let i = 0; i < itens.length; i++) {
      if (!itens[i].descricao.trim()) { setErroModal(`Item ${i + 1}: descrição obrigatória.`); return; }
      if (!itens[i].quantidade || Number(itens[i].quantidade) <= 0) { setErroModal(`Item ${i + 1}: quantidade inválida.`); return; }
    }
    if (!form.tipo_material) { setErroModal('Selecione o tipo de material.'); return; }
    setErroModal(''); setSalvando(true);
    try {
      await criarRequisicao({ ...form, projeto_id: Number(form.projeto_id), itens });
      resetModal(); carregar();
    } catch (err) { setErroModal(err.response?.data?.erro || 'Erro ao criar requisição.'); }
    finally { setSalvando(false); }
  };

  const lista = busca
    ? requisicoes.filter((r) =>
        r.numero_requisicao?.toLowerCase().includes(busca.toLowerCase()) ||
        r.tipo_material?.toLowerCase().includes(busca.toLowerCase()) ||
        r.projeto_nome?.toLowerCase().includes(busca.toLowerCase()) ||
        r.solicitante_nome?.toLowerCase().includes(busca.toLowerCase())
      )
    : requisicoes;

  const temFiltros = Object.values(filtros).some(Boolean) || busca;

  return (
    <ComprasLayout
      title="Painel Global de Compras"
      extraHeader={podeCriar ? <button className="btn btn-primary" onClick={abrirModal}>+ Nova Requisição</button> : null}
    >
      <p style={{ marginTop: -8, marginBottom: 16, color: 'var(--gray-500)', fontSize: '0.88rem' }}>
        Requisições de todas as obras
      </p>

      {/* Cards resumo */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total',               valor: resumo.total,      cls: 'badge badge-gray' },
          { label: 'Aguard. análise',     valor: resumo.ag_analise, cls: 'badge badge-blue' },
          { label: 'Em cotação',          valor: resumo.em_cotacao, cls: 'badge badge-blue' },
          { label: 'Aguard. gestor',      valor: resumo.ag_decisao, cls: 'badge badge-yellow' },
          { label: 'Prontos p/ compra',   valor: resumo.prontos,    cls: 'badge badge-green' },
        ].map((c) => (
          <div key={c.label} className="card" style={{ flex: '1 1 130px', padding: '1rem' }}>
            <p style={{ margin: 0, color: 'var(--gray-400)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</p>
            <p style={{ margin: '0.3rem 0 0', fontWeight: 700, fontSize: '1.4rem', color: 'var(--secondary)' }}>{c.valor ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        <input className="form-input" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar requisição, obra, solicitante..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="form-input" style={{ width: 'auto' }} value={filtros.status_requisicao} onChange={(e) => setFiltros({ ...filtros, status_requisicao: e.target.value })}>
          <option value="">Todos os status</option>
          <option>Em análise</option>
          <option>Em cotação</option>
          <option>Aguardando decisão gestor geral</option>
          <option>Compra autorizada</option>
          <option>Finalizada</option>
          <option>Encerrada sem compra</option>
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={filtros.urgencia} onChange={(e) => setFiltros({ ...filtros, urgencia: e.target.value })}>
          <option value="">Qualquer urgência</option>
          <option>Normal</option>
          <option>Urgente</option>
          <option>Emergencial</option>
        </select>
        <input type="date" className="form-input" style={{ width: 'auto' }} value={filtros.data_inicio} onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value })} title="Data início" />
        <input type="date" className="form-input" style={{ width: 'auto' }} value={filtros.data_fim} onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value })} title="Data fim" />
        {temFiltros && (
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem' }}
            onClick={() => { setFiltros({ status_requisicao: '', urgencia: '', data_inicio: '', data_fim: '' }); setBusca(''); }}>
            Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : lista.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
          Nenhuma requisição encontrada.
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>Nº</th><th>Obra</th><th>Tipo</th><th>Urgência</th>
                <th>Solicitante</th><th>Itens</th><th>Status</th><th>Data</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td><span style={{ color: 'var(--primary)', fontSize: '0.82rem', fontWeight: 600 }}>{r.numero_requisicao}</span></td>
                  <td style={{ fontWeight: 600 }}>{r.projeto_nome || `#${r.projeto_id}`}</td>
                  <td style={{ fontSize: '0.85rem' }}>{r.tipo_material}</td>
                  <td><span className={URG_BADGE[r.urgencia] || 'badge badge-gray'}>{r.urgencia}</span></td>
                  <td style={{ fontSize: '0.85rem' }}>{r.solicitante_nome || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
                      {r.itens_comprados || 0}/{r.total_itens || 0}
                    </span>
                  </td>
                  <td><span className={STATUS_BADGE[r.status_requisicao] || 'badge badge-gray'} style={{ fontSize: '0.75rem' }}>{r.status_requisicao}</span></td>
                  <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{r.criado_em ? new Date(r.criado_em).toLocaleDateString('pt-BR') : '—'}</td>
                  <td>
                    <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                      onClick={() => navigate(`/compras/${r.id}`)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ Modal Nova Requisição ═══ */}
      {modalAberto && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal-card" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', marginBottom: '1.5rem' }}>
              {[{ n: 1, label: 'Dados Gerais' }, { n: 2, label: 'Itens' }].map(({ n, label }) => (
                <div key={n} style={{ flex: 1, textAlign: 'center', paddingBottom: '0.6rem', borderBottom: step === n ? '3px solid var(--primary)' : '3px solid #e2e8f0', color: step === n ? 'var(--primary)' : 'var(--gray-400)', fontWeight: step === n ? 700 : 500, fontSize: '0.9rem' }}>
                  {n}. {label}
                </div>
              ))}
            </div>
            <h2 className="card-header" style={{ marginBottom: '1.25rem' }}>{step === 1 ? 'Nova Requisição — Dados Gerais' : 'Nova Requisição — Itens'}</h2>

            {step === 1 && (
              <div>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label className="form-label">Projeto *</label>
                  <select className="form-input" value={form.projeto_id} onChange={(e) => setForm({ ...form, projeto_id: e.target.value })}>
                    <option value="">Selecione o projeto...</option>
                    {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label className="form-label">Tipo de Material *</label>
                    <select className="form-input" value={form.tipo_material} onChange={(e) => setForm({ ...form, tipo_material: e.target.value })}>
                      <option value="">Selecione...</option>
                      {TIPOS_MATERIAL.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Urgência *</label>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      {URGENCIAS.map((u) => (
                        <label key={u} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', padding: '0.45rem 0.9rem', borderRadius: 8, border: `2px solid ${form.urgencia === u ? URGENCIA_COLOR[u] : '#e2e8f0'}`, background: form.urgencia === u ? `${URGENCIA_COLOR[u]}15` : 'white', fontSize: '0.86rem', fontWeight: form.urgencia === u ? 700 : 400, color: form.urgencia === u ? URGENCIA_COLOR[u] : 'var(--gray-600)', userSelect: 'none', transition: 'all 0.15s' }}>
                          <input type="radio" name="urgencia_cg" value={u} checked={form.urgencia === u} onChange={() => setForm({ ...form, urgencia: u })} style={{ display: 'none' }} />
                          {u}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="form-label">Observação Geral</label>
                  <textarea className="form-input" rows={3} style={{ resize: 'vertical' }} value={form.observacao_geral} onChange={(e) => setForm({ ...form, observacao_geral: e.target.value })} />
                </div>
                {erroModal && <p className="alert alert-error" style={{ marginTop: '1rem' }}>{erroModal}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button className="btn btn-secondary" type="button" onClick={resetModal}>Cancelar</button>
                  <button className="btn btn-primary" type="button" onClick={() => {
                    if (!form.projeto_id) { setErroModal('Selecione o projeto.'); return; }
                    if (!form.tipo_material) { setErroModal('Selecione o tipo de material.'); return; }
                    setErroModal(''); setStep(2);
                  }}>Próximo →</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <form onSubmit={salvarRequisicao}>
                {itens.map((item, idx) => (
                  <div key={idx} className="card" style={{ marginBottom: '0.75rem', padding: '1rem', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <strong style={{ color: 'var(--primary)' }}>Item {idx + 1}</strong>
                      {itens.length > 1 && <button type="button" onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div><label className="form-label">Descrição *</label><input className="form-input" value={item.descricao} onChange={(e) => updateItem(idx, 'descricao', e.target.value)} required /></div>
                      <div><label className="form-label">Quantidade *</label><input className="form-input" type="number" min="0.01" step="any" value={item.quantidade} onChange={(e) => updateItem(idx, 'quantidade', e.target.value)} required /></div>
                      <div>
                        <label className="form-label">Unidade</label>
                        <select className="form-input" value={item.unidade} onChange={(e) => updateItem(idx, 'unidade', e.target.value)}>
                          {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <div><label className="form-label">Especificação Técnica</label><input className="form-input" value={item.especificacao_tecnica} onChange={(e) => updateItem(idx, 'especificacao_tecnica', e.target.value)} /></div>
                      <div><label className="form-label">Justificativa</label><input className="form-input" value={item.justificativa} onChange={(e) => updateItem(idx, 'justificativa', e.target.value)} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {[['impacto_cronograma','⏱ Cronograma'],['impacto_seguranca','⚠ Segurança'],['impacto_qualidade','✅ Qualidade']].map(([field, label]) => (
                        <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--gray-600)', userSelect: 'none' }}>
                          <input type="checkbox" checked={item[field]} onChange={(e) => updateItem(idx, field, e.target.checked)} />{label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {itens.length < 10 && <button type="button" className="btn btn-secondary" style={{ width: '100%', marginBottom: '1rem' }} onClick={addItem}>+ Adicionar Item ({itens.length}/10)</button>}
                {erroModal && <p className="alert alert-error">{erroModal}</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setStep(1); setErroModal(''); }}>← Voltar</button>
                  <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Enviando...' : 'Criar Requisição'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </ComprasLayout>
  );
}
