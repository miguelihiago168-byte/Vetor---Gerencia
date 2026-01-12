import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getAtividadesEAP, createAtividade, updateAtividade, deleteAtividade, getHistoricoAtividade } from '../services/api';
import { Plus, Edit, Trash2, ChevronRight, ChevronDown, History } from 'lucide-react';

function EAP() {
  const { projetoId } = useParams();
  const [atividades, setAtividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [editando, setEditando] = useState(null);
  const [expandidos, setExpandidos] = useState({});
  const [formData, setFormData] = useState({
    codigo_eap: '',
    descricao: '',
    percentual_previsto: 0,
    pai_id: null,
    eh_atividade_principal: false,
    unidade_medida: '',
    quantidade_total: 0
  });
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => {
    carregarAtividades();
  }, [projetoId]);

  const carregarAtividades = async () => {
    try {
      const response = await getAtividadesEAP(projetoId);
      setAtividades(response.data);
    } catch (error) {
      setErro('Erro ao carregar atividades.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    try {
      const dados = {
        ...formData,
        projeto_id: parseInt(projetoId),
        ordem: atividades.length
      };

      if (editando) {
        await updateAtividade(editando.id, dados);
        setSucesso('Atividade atualizada com sucesso!');
      } else {
        await createAtividade(dados);
        setSucesso('Atividade criada com sucesso!');
      }
      
      await carregarAtividades();
      fecharModal();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao salvar atividade.');
    }
  };

  const abrirModal = (atividade = null) => {
    if (atividade) {
      setEditando(atividade);
      setFormData({
        codigo_eap: atividade.codigo_eap,
        descricao: atividade.descricao,
        percentual_previsto: atividade.percentual_previsto,
        pai_id: atividade.pai_id,
        eh_atividade_principal: !atividade.pai_id,
        unidade_medida: atividade.unidade_medida || '',
        quantidade_total: atividade.quantidade_total || 0
      });
    } else {
      setEditando(null);
      setFormData({
        codigo_eap: '',
        descricao: '',
        percentual_previsto: 0,
        pai_id: null,
        eh_atividade_principal: true,
        unidade_medida: '',
        quantidade_total: 0
      });
    }
    setShowModal(true);
  };

  const fecharModal = () => {
    setShowModal(false);
    setEditando(null);
    setErro('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deseja realmente deletar esta atividade? Isso afetará sub-atividades e RDOs vinculados.')) return;

    try {
      await deleteAtividade(id);
      setSucesso('Atividade deletada com sucesso!');
      await carregarAtividades();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error) {
      setErro('Erro ao deletar atividade.');
    }
  };

  const vincularSubAtividade = (atividade) => {
    // Abre modal para criar sub-atividade já vinculada à atividade fornecida
    setEditando(null);
    setFormData({
      codigo_eap: '',
      descricao: '',
      percentual_previsto: 0,
      pai_id: atividade.id,
      eh_atividade_principal: false,
      unidade_medida: '',
      quantidade_total: 0
    });
    setShowModal(true);
  };

  const verHistorico = async (atividadeId) => {
    try {
      const response = await getHistoricoAtividade(atividadeId);
      setHistorico(response.data);
      setShowHistorico(true);
    } catch (error) {
      setErro('Erro ao carregar histórico.');
    }
  };

  const toggleExpand = (id) => {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getCorStatus = (status) => {
    switch (status) {
      case 'Concluída': return 'var(--success)';
      case 'Em andamento': return 'var(--warning)';
      default: return 'var(--secondary)';
    }
  };

  const renderAtividade = (atividade, nivel = 0) => {
    const filhos = atividades.filter(a => a.pai_id === atividade.id);
    const temFilhos = filhos.length > 0;
    const expandido = expandidos[atividade.id];

    return (
      <div key={atividade.id}>
            <div style={{
              backgroundColor: !atividade.pai_id ? 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)' : 'white',
              padding: '12px',
              borderLeft: `4px solid ${getCorStatus(atividade.status)}`,
              marginBottom: '8px',
              borderRadius: '8px',
              marginLeft: `${nivel * 32}px`,
              boxShadow: 'var(--shadow-soft)'
            }}>
              <div className="flex-between">
                <div style={{ flex: 1 }}>
                  <div className="flex" style={{ alignItems: 'center', gap: '12px' }}>
                    {temFilhos && (
                      <button
                        onClick={() => toggleExpand(atividade.id)}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                      >
                        {expandido ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      </button>
                    )}
                    
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '16px', color: 'var(--primary)' }}>
                          {atividade.codigo_eap}
                        </strong>
                        <span style={{ fontSize: '14px', fontWeight: !atividade.pai_id ? '700' : '500' }}>{atividade.descricao}</span>
                        {!atividade.pai_id && <span className="badge badge-blue">Principal</span>}
                        <span className={
                          atividade.status === 'Concluída' ? 'badge badge-green' :
                          atividade.status === 'Em andamento' ? 'badge badge-yellow' :
                          'badge badge-gray'
                        }>
                          {atividade.status}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: '13px', color: 'var(--gray-600)' }}>
                        {atividade.percentual_previsto > 0 && (
                          <>Previsto: {atividade.percentual_previsto}% | </>
                        )}
                        Executado: <strong style={{ color: getCorStatus(atividade.status) }}>
                          {atividade.percentual_executado?.toFixed(1)}%
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

            <div className="flex gap-1">
              <button
                onClick={() => verHistorico(atividade.id)}
                className="btn btn-secondary"
                style={{ padding: '6px 12px' }}
                title="Ver histórico"
              >
                <History size={16} />
              </button>
              { !atividade.pai_id && (
                <button
                  onClick={() => vincularSubAtividade(atividade)}
                  className="btn btn-primary"
                  style={{ padding: '6px 12px' }}
                  title="Vincular sub-atividade"
                >
                  <Plus size={16} />
                </button>
              )}
              <button
                onClick={() => abrirModal(atividade)}
                className="btn btn-secondary"
                style={{ padding: '6px 12px' }}
              >
                <Edit size={16} />
              </button>
              <button
                onClick={() => handleDelete(atividade.id)}
                className="btn btn-danger"
                style={{ padding: '6px 12px' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          {/* Barra de progresso */}
          <div style={{
            marginTop: '8px',
            height: '8px',
            backgroundColor: 'var(--gray-200)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(atividade.percentual_executado || 0, 100)}%`,
              backgroundColor: getCorStatus(atividade.status),
              transition: 'width 0.3s'
            }} />
          </div>
        </div>

        {/* Renderizar filhos se expandido */}
        {temFilhos && expandido && filhos.map(filho => renderAtividade(filho, nivel + 1))}
      </div>
    );
  };

  const atividadesRaiz = atividades.filter(a => !a.pai_id);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="loading"><div className="spinner"></div></div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container">
        <div className="flex-between mb-4">
          <h1>📊 Estrutura Analítica do Projeto (EAP)</h1>
          <button onClick={() => abrirModal()} className="btn btn-primary">
            <Plus size={20} />
            Nova Atividade
          </button>
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <div className="card">
          {atividadesRaiz.length === 0 ? (
            <div className="text-center" style={{ padding: '60px' }}>
              <h3 style={{ color: 'var(--gray-500)' }}>Nenhuma atividade cadastrada</h3>
              <p style={{ color: 'var(--gray-400)', marginTop: '8px' }}>
                Clique em "Nova Atividade" para começar
              </p>
            </div>
          ) : (
            atividadesRaiz.map(atividade => renderAtividade(atividade))
          )}
        </div>

        {/* Modal de Atividade */}
        {showModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%'
            }}>
              <h2 className="mb-3">{editando ? 'Editar Atividade' : 'Nova Atividade'}</h2>
              <p className="eyebrow" style={{ marginBottom: '16px' }}>
                {formData.eh_atividade_principal ? '📁 Atividade Principal (Categoria)' : '📋 Sub-atividade (Com percentual)'}
              </p>

              {erro && <div className="alert alert-error mb-3">{erro}</div>}

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Código EAP * <small style={{color: 'var(--gray-500)'}}>Ex: 1.0 (principal), 1.1 (sub)</small></label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.codigo_eap}
                    onChange={(e) => setFormData({ ...formData, codigo_eap: e.target.value })}
                    placeholder="Ex: 1.0, 1.1, 2.0"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Descrição * <small style={{color: 'var(--gray-500)'}}>Nome da atividade</small></label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Ex: Documentação, Elétrica, Escavação"
                    required
                  />
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      checked={formData.eh_atividade_principal}
                      onChange={(e) => setFormData({ ...formData, eh_atividade_principal: e.target.checked, pai_id: null, percentual_previsto: e.target.checked ? 0 : formData.percentual_previsto })}
                    />
                    <span className="form-label" style={{ margin: 0 }}>Atividade Principal (sem percentual)</span>
                  </label>
                </div>

                {!formData.eh_atividade_principal && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Atividade Pai (principal) *</label>
                      <select
                        className="form-select"
                        value={formData.pai_id || ''}
                        onChange={(e) => setFormData({ ...formData, pai_id: e.target.value ? parseInt(e.target.value) : null })}
                        required
                      >
                        <option value="">Selecione atividade principal</option>
                        {atividades.filter(a => !a.pai_id).map(atividade => (
                          <option key={atividade.id} value={atividade.id}>
                            {atividade.codigo_eap} - {atividade.descricao}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Percentual Previsto (%) *</label>
                      <input
                        type="number"
                        className="form-input"
                        value={formData.percentual_previsto}
                        onChange={(e) => setFormData({ ...formData, percentual_previsto: parseFloat(e.target.value) })}
                        min="0"
                        max="100"
                        step="0.1"
                        required
                      />
                    </div>

                    <div className="grid grid-2">
                      <div className="form-group">
                        <label className="form-label">Unidade de Medida * <small style={{color: 'var(--gray-500)'}}>Ex: estacas, m², kg</small></label>
                        <input
                          type="text"
                          className="form-input"
                          value={formData.unidade_medida}
                          onChange={(e) => setFormData({ ...formData, unidade_medida: e.target.value })}
                          placeholder="estacas"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Quantidade Total * <small style={{color: 'var(--gray-500)'}}>Ex: 559</small></label>
                        <input
                          type="number"
                          className="form-input"
                          value={formData.quantidade_total}
                          onChange={(e) => setFormData({ ...formData, quantidade_total: parseFloat(e.target.value) })}
                          min="0"
                          step="0.1"
                          required
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-2 mt-4">
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    {editando ? 'Atualizar' : 'Criar'}
                  </button>
                  <button 
                    type="button" 
                    onClick={fecharModal} 
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Histórico */}
        {showHistorico && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '700px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto'
            }}>
              <h2 className="mb-3">📋 Histórico de Execuções</h2>

              {historico.length === 0 ? (
                <p className="text-center" style={{ padding: '20px', color: 'var(--gray-500)' }}>
                  Nenhum histórico de execução encontrado.
                </p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Usuário</th>
                      <th>% Anterior</th>
                      <th>% Executado</th>
                      <th>% Novo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map(h => (
                      <tr key={h.id}>
                        <td>{new Date(h.data_execucao).toLocaleDateString('pt-BR')}</td>
                        <td>{h.usuario_nome}</td>
                        <td>{h.percentual_anterior.toFixed(1)}%</td>
                        <td><strong>+{h.percentual_executado.toFixed(1)}%</strong></td>
                        <td><strong>{h.percentual_novo.toFixed(1)}%</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <button 
                onClick={() => setShowHistorico(false)} 
                className="btn btn-secondary mt-3"
                style={{ width: '100%' }}
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default EAP;
