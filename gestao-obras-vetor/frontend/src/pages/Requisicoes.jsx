import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ComprasLayout from '../components/ComprasLayout';
import { useAuth } from '../context/AuthContext';
import { listarRequisicoesProjeto, listarRequisicoes, criarRequisicao, getProjeto, getProjetos } from '../services/api';

const TIPOS_MATERIAL = ['Materiais Elétricos','Materiais Civis','Materiais Eletrônicos','Ferramentas','EPIs','Serviços','Outros'];
const URGENCIAS = ['Normal','Urgente','Emergencial'];
const UNIDADES = ['un','m','m²','m³','kg','g','L','t','cx','pc','pç','par','jg','rolo','h','dia','vb'];

const URGENCIA_BADGE = { Normal: 'badge badge-gray', Urgente: 'badge badge-yellow', Emergencial: 'badge badge-red' };
const URGENCIA_COLOR = { Normal: '#64748b', Urgente: '#d97706', Emergencial: '#dc2626' };
const STATUS_BADGE = {
  'Em análise': 'badge badge-blue', 'Em cotação': 'badge badge-blue',
  'Aguardando decisão gestor geral': 'badge badge-yellow',
  'Compra autorizada': 'badge badge-green', 'Finalizada': 'badge badge-green',
  'Encerrada sem compra': 'badge badge-red',
};
const ITEM_VAZIO = { descricao: '', quantidade: '', unidade: 'un', especificacao_tecnica: '', justificativa: '', impacto_cronograma: false, impacto_seguranca: false, impacto_qualidade: false };

export default function Requisicoes() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { usuario } = useAuth();

  const [projeto, setProjeto] = useState(null);
  const [projetos, setProjetos] = useState([]);
  const [requisicoes, setRequisicoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ tipo_material: '', urgencia: '', status_requisicao: '' });
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({ projeto_id: '', tipo_material: '', urgencia: 'Normal', observacao_geral: '' });
  const [itens, setItens] = useState([{ ...ITEM_VAZIO }]);
  const [step, setStep] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const podeCriar = ['ADM', 'Gestor Geral', 'Gestor da Obra', 'Almoxarife'].includes(usuario?.perfil || '');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      if (projetoId) {
        const [projRes, reqRes] = await Promise.all([
          getProjeto(projetoId),
          listarRequisicoesProjeto(projetoId, {
            tipo_material: filtros.tipo_material || undefined,
            urgencia: filtros.urgencia || undefined,
            status_requisicao: filtros.status_requisicao || undefined,
          }),
        ]);
        setProjeto(projRes.data);
        setRequisicoes(reqRes.data);
      } else {
        const [projsRes, reqsRes] = await Promise.all([
          getProjetos(),
          listarRequisicoes({
            tipo_material: filtros.tipo_material || undefined,
            urgencia: filtros.urgencia || undefined,
            status_requisicao: filtros.status_requisicao || undefined,
          }),
        ]);
        setProjetos(projsRes.data || []);
        const data = reqsRes.data;
        setRequisicoes(Array.isArray(data) ? data : (data?.requisicoes || []));
      }
    } catch { setErro('Erro ao carregar requisições.'); }
    finally { setLoading(false); }
  }, [projetoId, filtros]);

  useEffect(() => { carregar(); }, [carregar]);

  // Pré-carrega lista de projetos para o modal (mesmo quando dentro de um projeto)
  useEffect(() => {
    if (!projetoId && projetos.length === 0) {
      getProjetos().then(r => setProjetos(r.data || [])).catch(() => {});
    }
  }, [projetoId]); // eslint-disable-line

  const addItem    = () => { if (itens.length < 10) setItens([...itens, { ...ITEM_VAZIO }]); };
  const removeItem = (idx) => { if (itens.length > 1) setItens(itens.filter((_, i) => i !== idx)); };
  const updateItem = (idx, f, v) => setItens(itens.map((it, i) => i === idx ? { ...it, [f]: v } : it));

  const resetModal = () => {
    setForm({ projeto_id: projetoId || '', tipo_material: '', urgencia: 'Normal', observacao_geral: '' });
    setItens([{ ...ITEM_VAZIO }]); setStep(1); setErro(''); setModalAberto(false);
  };

  const salvarRequisicao = async (e) => {
    e.preventDefault();
    const pid = projetoId || form.projeto_id;
    if (!pid) { setErro('Selecione o projeto.'); return; }
    for (let i = 0; i < itens.length; i++) {
      if (!itens[i].descricao.trim()) { setErro(`Item ${i + 1}: descrição obrigatória.`); return; }
      if (!itens[i].quantidade || Number(itens[i].quantidade) <= 0) { setErro(`Item ${i + 1}: quantidade inválida.`); return; }
    }
    if (!form.tipo_material) { setErro('Selecione o tipo de material.'); return; }
    setErro(''); setSalvando(true);
    try {
      await criarRequisicao({ ...form, projeto_id: Number(pid), itens });
      resetModal(); carregar();
    } catch (err) { setErro(err.response?.data?.erro || 'Erro ao criar requisição.'); }
    finally { setSalvando(false); }
  };

  const irParaDetalhe = (r) => {
    if (projetoId) navigate(`/projeto/${projetoId}/compras/${r.id}`);
    else navigate(`/compras/${r.id}`);
  };

  return (
    <ComprasLayout
      title="Requisições de Compra"
      extraHeader={podeCriar ? <button className="btn btn-primary" onClick={() => { setForm({ projeto_id: projetoId || '', tipo_material: '', urgencia: 'Normal', observacao_geral: '' }); setItens([{ ...ITEM_VAZIO }]); setStep(1); setErro(''); setModalAberto(true); }}>+ Nova Requisição</button> : null}
    >
      {projeto && <p style={{ marginTop: -8, marginBottom: 16, color: 'var(--gray-500)', fontSize: '0.88rem' }}>Projeto: <strong>{projeto.nome}</strong></p>}

      {/* Filtros */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-input" style={{ flex: 1, minWidth: 160 }} value={filtros.tipo_material} onChange={(e) => setFiltros({ ...filtros, tipo_material: e.target.value })}>
            <option value="">Todos os tipos</option>
            {TIPOS_MATERIAL.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-input" style={{ flex: 1, minWidth: 140 }} value={filtros.urgencia} onChange={(e) => setFiltros({ ...filtros, urgencia: e.target.value })}>
            <option value="">Qualquer urgência</option>
            {URGENCIAS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <select className="form-input" style={{ flex: 1, minWidth: 200 }} value={filtros.status_requisicao} onChange={(e) => setFiltros({ ...filtros, status_requisicao: e.target.value })}>
            <option value="">Todos os status</option>
            {Object.keys(STATUS_BADGE).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(filtros.tipo_material || filtros.urgencia || filtros.status_requisicao) && (
            <button className="btn btn-secondary" onClick={() => setFiltros({ tipo_material: '', urgencia: '', status_requisicao: '' })}>Limpar</button>
          )}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto 1rem' }} />Carregando...</div>
      ) : requisicoes.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>
          <p>Nenhuma requisição encontrada.</p>
          {podeCriar && <p style={{ fontSize: '0.9rem' }}>Clique em "+ Nova Requisição" para iniciar.</p>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {requisicoes.map((r) => (
            <div key={r.id} className="card" style={{ padding: '1rem 1.25rem', cursor: 'pointer' }}
              onClick={() => irParaDetalhe(r)}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 20px rgba(14,165,233,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = ''}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>{r.numero_requisicao}</span>
                  <h3 style={{ margin: '0.2rem 0 0', fontSize: '1rem', fontWeight: 700 }}>{r.tipo_material}</h3>
                  {r.projeto_nome && !projetoId && <span style={{ color: 'var(--gray-500)', fontSize: '0.83rem' }}>{r.projeto_nome}</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span className={URGENCIA_BADGE[r.urgencia] || 'badge badge-gray'}>{r.urgencia}</span>
                  <span className={STATUS_BADGE[r.status_requisicao] || 'badge badge-gray'}>{r.status_requisicao}</span>
                </div>
              </div>
              <div style={{ marginTop: '0.65rem', display: 'flex', gap: '1.25rem', color: 'var(--gray-500)', fontSize: '0.83rem', flexWrap: 'wrap' }}>
                <span>Solicitante: <strong>{r.solicitante_nome || '—'}</strong></span>
                <span>Itens: <strong>{r.total_itens}</strong></span>
                <span style={{ color: '#047857' }}>Comprados: <strong>{r.itens_comprados}</strong></span>
                <span style={{ color: '#b91c1c' }}>Reprovados: <strong>{r.itens_reprovados}</strong></span>
                <span>{new Date(r.criado_em).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal multi-step */}
      {modalAberto && (
        <div className="modal-overlay fade-in" role="dialog" aria-modal="true" onClick={resetModal}>
          <div className="modal-card" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
            {/* Passos */}
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
                {/* Projeto (quando fora do contexto de projeto) */}
                {!projetoId && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label className="form-label">Projeto *</label>
                    <select className="form-input" value={form.projeto_id} onChange={(e) => setForm({ ...form, projeto_id: e.target.value })}>
                      <option value="">Selecione o projeto...</option>
                      {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                )}

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
                          <input type="radio" name="urgencia" value={u} checked={form.urgencia === u} onChange={() => setForm({ ...form, urgencia: u })} style={{ display: 'none' }} />
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
                {erro && <p className="alert alert-error" style={{ marginTop: '1rem' }}>{erro}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button className="btn btn-secondary" type="button" onClick={resetModal}>Cancelar</button>
                  <button className="btn btn-primary" type="button" onClick={() => {
                    if (!projetoId && !form.projeto_id) { setErro('Selecione o projeto.'); return; }
                    if (!form.tipo_material) { setErro('Selecione o tipo de material.'); return; }
                    setErro(''); setStep(2);
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
                {erro && <p className="alert alert-error">{erro}</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => { setStep(1); setErro(''); }}>← Voltar</button>
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
