import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getRDOs,
  getRDO,
  createRDO,
  updateRDO,
  updateStatusRDO,
  deleteRDO,
  getAtividadesEAP,
  uploadAnexo,
  deleteAnexo
} from '../services/api';
import { getUsuarios } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, FileText, Check, X, UploadCloud, Trash2, Send } from 'lucide-react';

const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

const statusBadge = {
  'Em preenchimento': 'badge-blue',
  'Em análise': 'badge-yellow',
  'Aprovado': 'badge-green',
  'Reprovado': 'badge-red'
};

function RDOs() {
  const { projetoId } = useParams();
  const { isGestor, usuario } = useAuth();

  const [rdos, setRdos] = useState([]);
  const [atividadesEap, setAtividadesEap] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [editando, setEditando] = useState(null);
  const navigate = useNavigate();
  const [selectedRdo, setSelectedRdo] = useState(null);
  const [openActionFor, setOpenActionFor] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);

  const [formData, setFormData] = useState({
    data_relatorio: '',
    dia_semana: '',
    // Horário de trabalho
    entrada_saida_inicio: '07:00',
    entrada_saida_fim: '17:00',
    intervalo_almoco_inicio: '12:00',
    intervalo_almoco_fim: '13:00',
    horas_trabalhadas: 0,
    // Clima e tempo
    clima_manha: 'Claro',
    clima_tarde: 'Claro',
    tempo_manha: '★',
    tempo_tarde: '★',
    // Praticabilidade
    praticabilidade_manha: 'Praticável',
    praticabilidade_tarde: 'Praticável',
    // Mão de obra (mantém os campos de totalização também)
    mao_obra_direta: 0,
    mao_obra_indireta: 0,
    mao_obra_terceiros: 0,
    mao_obra_detalhada: [], // Array de {nome, funcao, entrada, saida, intervalo, horas}
    equipamentos: '',
    ocorrencias: '',
    comentarios: '',
    atividades: []
  });

  const [draftAtividade, setDraftAtividade] = useState({
    atividade_eap_id: '',
    percentual_executado: '',
    quantidade_executada: '',
    observacao: ''
  });

  useEffect(() => {
    const carregar = async () => {
      try {
        const [rdosRes, eapRes] = await Promise.all([
          getRDOs(projetoId),
          getAtividadesEAP(projetoId)
        ]);
        setRdos(rdosRes.data);
        setAtividadesEap(eapRes.data);
      } catch (error) {
        setErro('Erro ao carregar RDOs.');
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [projetoId]);

  const resetForm = () => {
    setEditando(null);
    setFormData({
      data_relatorio: '',
      dia_semana: '',
      // Horário de trabalho
      entrada_saida_inicio: '07:00',
      entrada_saida_fim: '17:00',
      intervalo_almoco_inicio: '12:00',
      intervalo_almoco_fim: '13:00',
      horas_trabalhadas: 0,
      // Clima e tempo
      clima_manha: 'Claro',
      clima_tarde: 'Claro',
      tempo_manha: '★',
      tempo_tarde: '★',
      // Praticabilidade
      praticabilidade_manha: 'Praticável',
      praticabilidade_tarde: 'Praticável',
      // Mão de obra
      mao_obra_direta: 0,
      mao_obra_indireta: 0,
      mao_obra_terceiros: 0,
      mao_obra_detalhada: [],
      equipamentos: '',
      ocorrencias: '',
      comentarios: '',
      atividades: []
    });
    setDraftAtividade({ atividade_eap_id: '', percentual_executado: '', quantidade_executada: '', observacao: '' });
  };

  const abrirForm = (rdoId = null) => {
    // Navega para a página dedicada de criação/edição do RDO
    if (rdoId) {
      navigate(`/projeto/${projetoId}/rdos/${rdoId}/editar`);
    } else {
      navigate(`/projeto/${projetoId}/rdos/novo`);
    }
  };

  const fecharForm = () => {
    setShowForm(false);
    resetForm();
  };

  const weekdayFromDate = (value) => (value ? dias[new Date(value).getDay()] : '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (!formData.data_relatorio) {
      setErro('Data do relatório é obrigatória.');
      return;
    }

    const payload = {
      ...formData,
      projeto_id: parseInt(projetoId, 10),
      dia_semana: weekdayFromDate(formData.data_relatorio),
      mao_obra_detalhada: formData.mao_obra_detalhada || [],
      atividades: formData.atividades.map((a) => ({
        ...a,
        atividade_eap_id: parseInt(a.atividade_eap_id, 10),
        percentual_executado: parseFloat(a.percentual_executado)
      }))
    };

    try {
      if (editando) {
        await updateRDO(editando, payload);
        setSucesso('RDO atualizado.');
      } else {
        await createRDO(payload);
        setSucesso('RDO criado e salvo como rascunho.');
      }
      const lista = await getRDOs(projetoId);
      setRdos(lista.data);
      fecharForm();
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao salvar RDO.');
    }
  };

  const handleAddAtividade = () => {
    if (!draftAtividade.atividade_eap_id) return;

    // impedir seleção de atividades-mãe (que servem de título)
    const infoAtvCheck = atividadesEap.find(a => a.id === Number(draftAtividade.atividade_eap_id));
    if (infoAtvCheck && (infoAtvCheck.pai_id === null || infoAtvCheck.pai_id === undefined)) {
      setErro('Atividades mãe não podem ser selecionadas. Escolha uma sub-atividade.');
      return;
    }

    if (infoAtvCheck && (infoAtvCheck.percentual_executado || 0) >= 100) {
      setErro('Esta atividade já está 100% concluída e não pode receber avanço.');
      return;
    }

    // permitir adicionar se informou quantidade_executada ou percentual_executado
    const qt = draftAtividade.quantidade_executada;
    let perc = draftAtividade.percentual_executado;

    // Se informou quantidade e a atividade tem quantidade_total, calcular percentual
    if ((qt !== undefined && qt !== null && qt !== '') && (!perc || perc === '')) {
      const info = atividadesEap.find(a => a.id === Number(draftAtividade.atividade_eap_id));
      const quantidadeTotal = info ? (info.quantidade_total || 0) : 0;
      const parsedQ = parseFloat(qt);
      if (quantidadeTotal && !isNaN(parsedQ)) {
        perc = Math.min(Math.round((parsedQ / quantidadeTotal) * 10000) / 100, 100);
      } else {
        perc = 0;
      }
    }

    if ((qt === '' || qt === undefined) && (perc === '' || perc === undefined)) return;

    const item = {
      atividade_eap_id: draftAtividade.atividade_eap_id,
      quantidade_executada: qt,
      percentual_executado: perc || 0,
      observacao: draftAtividade.observacao || ''
    };

    const jaExiste = formData.atividades.some((a) => a.atividade_eap_id === item.atividade_eap_id);
    const novaLista = jaExiste
      ? formData.atividades.map((a) => a.atividade_eap_id === item.atividade_eap_id ? item : a)
      : [...formData.atividades, item];
    setFormData({ ...formData, atividades: novaLista });
    setDraftAtividade({ atividade_eap_id: '', percentual_executado: '', quantidade_executada: '', observacao: '' });
  };

  const removerAtividade = (id) => {
    setFormData({ ...formData, atividades: formData.atividades.filter((a) => a.atividade_eap_id !== id) });
  };

  const abrirDetalhe = async (id) => {
    try {
      const res = await getRDO(id);
      const rdo = res.data;
      // enriquecer historico_status com nome do usuário
      let historico = [];
      try {
        historico = rdo.historico_status ? JSON.parse(rdo.historico_status) : [];
      } catch (e) { historico = []; }
      // não manter historico_status_parsed no frontend — não será exibido por solicitação
      rdo.historico_status_parsed = [];

      setSelectedRdo(rdo);
      setShowDetail(true);
    } catch (error) {
      setErro('Erro ao carregar RDO.');
    }
  };

  const toggleActionBox = (id) => {
    setOpenActionFor(prev => prev === id ? null : id);
  };

  const handleAction = async (id, action) => {
    setErro('');
    try {
      if (action === 'preenchimento') {
        await updateStatusRDO(id, 'Em preenchimento');
      } else if (action === 'enviar') {
        await updateStatusRDO(id, 'Em análise');
      } else if (action === 'aprovar') {
        await updateStatusRDO(id, 'Aprovado');
      } else if (action === 'reabrir') {
        await updateStatusRDO(id, 'Em preenchimento');
      }
      const lista = await getRDOs(projetoId);
      setRdos(lista.data);
      if (selectedRdo?.id === id) {
        const res = await getRDO(id);
        setSelectedRdo(res.data);
      }
      setOpenActionFor(null);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Erro ao executar ação.');
    }
  };

  const fecharDetalhe = () => {
    setShowDetail(false);
    setSelectedRdo(null);
    setFile(null);
  };

  const alterarStatus = async (id, status) => {
    try {
      await updateStatusRDO(id, status);
      setSucesso(`Status atualizado para ${status}.`);
      const lista = await getRDOs(projetoId);
      setRdos(lista.data);
      if (selectedRdo?.id === id) {
        const res = await getRDO(id);
        setSelectedRdo(res.data);
      }
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao alterar status.');
    }
  };

  const removerRdo = async (id) => {
    if (!window.confirm('Deseja remover este RDO?')) return;
    try {
      await deleteRDO(id);
      setRdos(rdos.filter((r) => r.id !== id));
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao excluir RDO.');
    }
  };

  const enviarAnexo = async () => {
    if (!file || !selectedRdo) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('arquivo', file);
      await uploadAnexo(selectedRdo.id, form);
      const atual = await getRDO(selectedRdo.id);
      setSelectedRdo(atual.data);
      setFile(null);
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao enviar anexo.');
    } finally {
      setUploading(false);
    }
  };

  const removerAnexo = async (id) => {
    if (!selectedRdo) return;
    try {
      await deleteAnexo(id);
      const atual = await getRDO(selectedRdo.id);
      setSelectedRdo(atual.data);
    } catch (error) {
      setErro('Erro ao remover anexo.');
    }
  };

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
        <div className="flex-between mb-3">
          <div>
            <p className="eyebrow">Projeto #{projetoId}</p>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileText size={26} /> Relatórios Diários (RDO)
            </h1>
          </div>
          <button className="btn btn-primary" onClick={() => abrirForm()}>
            <Plus size={18} /> Novo RDO
          </button>
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <div className="card">
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Mão de obra</th>
                  <th>Criado por</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // ordenar RDOs: colocar aprovados por último, dentro dos grupos ordenar por data desc
                  const sorted = [...rdos].sort((a,b) => {
                    const aAprov = a.status === 'Aprovado' ? 1 : 0;
                    const bAprov = b.status === 'Aprovado' ? 1 : 0;
                    if (aAprov !== bAprov) return aAprov - bAprov;
                    return new Date(b.data_relatorio) - new Date(a.data_relatorio);
                  });
                  return sorted.map((rdo) => (
                  <tr key={rdo.id} style={{ position: 'relative' }}>
                    <td><strong>{new Date(rdo.data_relatorio).toLocaleDateString('pt-BR')}</strong><br /><small>{rdo.dia_semana}</small></td>
                    <td><span className={statusBadge[rdo.status] || 'badge-gray'}>{rdo.status}</span></td>
                    <td>{(rdo.mao_obra_direta || 0) + (rdo.mao_obra_indireta || 0) + (rdo.mao_obra_terceiros || 0)}</td>
                    <td>{rdo.criado_por_nome}</td>
                    <td className="flex gap-1" style={{ position: 'relative' }}>
                      <div style={{ position: 'relative' }}>
                        <button className="btn btn-secondary" onClick={() => toggleActionBox(rdo.id)} style={{ padding: '8px 12px' }}>
                          •••
                        </button>
                        {openActionFor === rdo.id && (
                          <div className="action-box fade-in">
                            <div className="action-item" onClick={() => handleAction(rdo.id, 'preenchimento')}>Marcar como 'Em preenchimento'</div>
                            <div className="action-item" onClick={() => handleAction(rdo.id, 'enviar')}>Enviar para aprovação</div>
                            {isGestor && <div className="action-item" onClick={() => handleAction(rdo.id, 'aprovar')}>Marcar como 'Aprovado'</div>}
                            {isGestor && <div className="action-item" onClick={() => handleAction(rdo.id, 'reabrir')}>Reabrir para preenchimento</div>}
                          </div>
                        )}
                      </div>
                      <button className="btn btn-secondary" onClick={() => abrirDetalhe(rdo.id)} style={{ padding: '8px 12px' }}>
                        Ver
                      </button>
                      {rdo.status !== 'Aprovado' && rdo.status !== 'Em análise' && (
                        <button className="btn btn-secondary" onClick={() => abrirForm(rdo.id)} style={{ padding: '8px 12px' }}>
                          Editar
                        </button>
                      )}
                      {rdo.status !== 'Aprovado' && rdo.status !== 'Em análise' && (
                        <button className="btn btn-danger" onClick={() => removerRdo(rdo.id)} style={{ padding: '8px 12px' }}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                  ))
                })()}
              </tbody>
            </table>
          </div>
          {rdos.length === 0 && (
            <p className="text-center" style={{ padding: '20px', color: 'var(--gray-500)' }}>
              Nenhum RDO cadastrado para este projeto.
            </p>
          )}
        </div>

        {/* O formulário de RDO agora é uma página dedicada: /projeto/:projetoId/rdos/novo (RDOForm.jsx) */}

        {/* Modal Detalhe */}
        {showDetail && selectedRdo && (
          <div className="modal-overlay">
            <div className="modal-card" style={{ maxWidth: '900px' }}>
                <div className="flex-between mb-2">
                  <div>
                    <p className="eyebrow">RDO</p>
                    <h2>{new Date(selectedRdo.data_relatorio).toLocaleDateString('pt-BR')} · {selectedRdo.dia_semana}</h2>
                    <span className={statusBadge[selectedRdo.status] || 'badge-gray'}>{selectedRdo.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {(selectedRdo.status !== 'Em análise' || isGestor) && (
                      <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rdos/${selectedRdo.id}/editar`)}>Editar</button>
                    )}
                    <button className="btn btn-secondary" onClick={fecharDetalhe}>Fechar</button>
                  </div>
                </div>

              <div className="grid grid-2">
                <div className="card" style={{ padding: '16px' }}>
                  <h3 className="card-header">Resumo</h3>
                  <p><strong>Clima manhã:</strong> {selectedRdo.clima_manha || '-'} </p>
                  <p><strong>Clima tarde:</strong> {selectedRdo.clima_tarde || '-'} </p>
                  <p><strong>Equipamentos:</strong> {selectedRdo.equipamentos || '-'} </p>
                  <p><strong>Ocorrências:</strong> {selectedRdo.ocorrencias || '-'} </p>
                  <p><strong>Comentários:</strong> {selectedRdo.comentarios || '-'} </p>
                </div>

                <div className="card" style={{ padding: '16px' }}>
                  <h3 className="card-header">Mão de obra detalhada</h3>
                  {selectedRdo.mao_obra_detalhada && selectedRdo.mao_obra_detalhada.length > 0 ? (
                    selectedRdo.mao_obra_detalhada.map((c, idx) => (
                      <div key={idx} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <strong>{c.nome}</strong>
                            <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>{c.funcao || ''} {c.classificacao ? `· ${c.classificacao}` : ''}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div>{c.entrada || '-'} → {c.saida || '-'}</div>
                            <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>Horas: {c.horas ?? '-'}</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : ( selectedRdo.colaboradores && selectedRdo.colaboradores.length > 0 ? (
                    selectedRdo.colaboradores.map((c) => (
                      <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <strong>{c.nome}</strong>
                            <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>{c.funcao || ''}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>Sem horários registrados</div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p style={{ color: 'var(--gray-500)' }}>Nenhum colaborador vinculado.</p>
                  ))}
                </div>

                {/* Aprovação: movida para abaixo dos anexos e simplificada */}
              </div>
              {/* Histórico de status removido da visualização conforme solicitado */}

              <div className="card" style={{ padding: '16px' }}>
                <h3 className="card-header">Atividades executadas</h3>
                {/* (Stepper removido por solicitação) */}
                {selectedRdo.atividades?.length === 0 && (
                  <p style={{ color: 'var(--gray-500)' }}>Nenhuma atividade vinculada.</p>
                )}
                {selectedRdo.atividades?.map((a) => (
                  <div key={a.id} className="card" style={{ padding: '12px', marginBottom: '8px' }}>
                    <div className="flex-between">
                      <div>
                        <strong>{a.codigo_eap}</strong> - {a.descricao}
                        <p style={{ color: 'var(--gray-500)', marginTop: '4px' }}>+{a.percentual_executado}%</p>
                      </div>
                      {a.observacao && <span className="badge badge-gray">{a.observacao}</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: '16px' }}>
                <div className="flex-between mb-2">
                  <h3 className="card-header">Anexos</h3>
                  <div className="flex gap-1">
                    <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    <button className="btn btn-secondary" onClick={enviarAnexo} disabled={uploading || !file}>
                      <UploadCloud size={16} /> {uploading ? 'Enviando...' : 'Enviar'}
                    </button>
                  </div>
                </div>
                {selectedRdo.anexos?.length === 0 && <p style={{ color: 'var(--gray-500)' }}>Sem anexos.</p>}
                {selectedRdo.anexos?.map((anexo) => (
                  <div key={anexo.id} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                    <span>{anexo.nome_arquivo}</span>
                    <button className="btn btn-danger" onClick={() => removerAnexo(anexo.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
                {/* Aprovação (compacta) */}
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--gray-100)', background: 'white', boxShadow: 'var(--shadow-soft)', width: 280 }}>
                    <div style={{ fontSize: 12, color: 'var(--gray-600)', marginBottom: 6 }}>Aprovação</div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{selectedRdo.status}</div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {selectedRdo.status === 'Em preenchimento' && (
                        <button className="btn btn-secondary" onClick={() => alterarStatus(selectedRdo.id, 'Em análise')} style={{ padding: '6px 10px' }}>
                          Enviar
                        </button>
                      )}
                      {isGestor && selectedRdo.status === 'Em análise' && (
                        <>
                          <button className="btn btn-success" onClick={() => alterarStatus(selectedRdo.id, 'Aprovado')} style={{ padding: '6px 10px' }}>Aprovar</button>
                          <button className="btn btn-danger" onClick={() => alterarStatus(selectedRdo.id, 'Reprovado')} style={{ padding: '6px 10px' }}>Reprovar</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default RDOs;
