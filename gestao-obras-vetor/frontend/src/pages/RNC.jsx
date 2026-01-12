import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRNCs, createRNC, updateRNC, updateStatusRNC, deleteRNC, getRDOs, getUsuarios, submitCorrecaoRNC, enviarRncParaAprovacao } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Plus, CheckCircle, XCircle, Loader } from 'lucide-react';

const badgeMap = {
  Aberta: 'badge-red',
  'Em andamento': 'badge-yellow',
  Encerrada: 'badge-green'
};

function RNC() {
  const { projetoId } = useParams();
  const { isGestor, usuario } = useAuth();

  const [rncs, setRncs] = useState([]);
  const [rdos, setRdos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [showCorrigirModal, setShowCorrigirModal] = useState(false);
  const [corrigindoId, setCorrigindoId] = useState(null);
  const [correcaoText, setCorrecaoText] = useState('');
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    gravidade: 'Média',
    status: 'Aberta',
    acao_corretiva: '',
    responsavel_id: '',
    rdo_id: ''
  });

  useEffect(() => {
    const carregar = async () => {
      try {
        const [rncRes, rdoRes, usersRes] = await Promise.all([
          getRNCs(projetoId),
          getRDOs(projetoId),
          getUsuarios()
        ]);
        setRncs(rncRes.data);
        setRdos(rdoRes.data);
        setUsuarios(usersRes.data);
      } catch (error) {
        setErro('Erro ao carregar RNC.');
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, [projetoId]);

  const abrirModal = (rnc = null) => {
    setErro('');
    setSucesso('');
    if (rnc) {
      setEditando(rnc.id);
      setFormData({
        titulo: rnc.titulo,
        descricao: rnc.descricao,
        gravidade: rnc.gravidade,
        status: rnc.status,
        acao_corretiva: rnc.acao_corretiva || '',
        responsavel_id: rnc.responsavel_id || '',
        rdo_id: rnc.rdo_id || ''
      });
    } else {
      setEditando(null);
      setFormData({ titulo: '', descricao: '', gravidade: 'Média', status: 'Aberta', acao_corretiva: '', responsavel_id: '', rdo_id: '' });
    }
    setShowModal(true);
  };

  const fecharModal = () => {
    setShowModal(false);
    setEditando(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    const payload = {
      projeto_id: parseInt(projetoId, 10),
      ...formData,
      responsavel_id: formData.responsavel_id ? parseInt(formData.responsavel_id, 10) : null,
      rdo_id: formData.rdo_id ? parseInt(formData.rdo_id, 10) : null
    };

    try {
      if (editando) {
        await updateRNC(editando, payload);
        setSucesso('RNC atualizada.');
      } else {
        await createRNC(payload);
        setSucesso('RNC criada.');
      }
      const res = await getRNCs(projetoId);
      setRncs(res.data);
      fecharModal();
    } catch (error) {
      setErro(error.response?.data?.erro || 'Erro ao salvar RNC.');
    }
  };

  const alterarStatus = async (id, status) => {
    try {
      await updateStatusRNC(id, status);
      const res = await getRNCs(projetoId);
      setRncs(res.data);
    } catch (error) {
      setErro('Erro ao atualizar status.');
    }
  };

  const remover = async (id) => {
    if (!window.confirm('Deseja remover esta RNC?')) return;
    try {
      await deleteRNC(id);
      setRncs(rncs.filter((r) => r.id !== id));
    } catch (error) {
      setErro('Erro ao remover RNC.');
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
            <p className="eyebrow">Riscos e qualidade</p>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertTriangle size={24} /> RNC
            </h1>
          </div>
          <button className="btn btn-primary" onClick={() => abrirModal()}>
            <Plus size={18} /> Nova RNC
          </button>
        </div>

        {sucesso && <div className="alert alert-success">{sucesso}</div>}
        {erro && <div className="alert alert-error">{erro}</div>}

        <div className="grid grid-3">
          {rncs.map((r) => {
            const gravidadeColor = r.gravidade === 'Baixa' ? '#16a34a' : r.gravidade === 'Média' ? '#f59e0b' : r.gravidade === 'Alta' ? '#f97316' : '#dc2626';
            return (
              <div key={r.id} className="card" style={{ borderLeft: `6px solid ${gravidadeColor}` }}>
                <div className="flex-between mb-1">
                  <div>
                    <p className="eyebrow">{r.gravidade}</p>
                    <h3>{r.titulo}</h3>
                    <p style={{ color: 'var(--gray-500)' }}>{r.descricao}</p>
                  </div>
                  <span className={badgeMap[r.status] || 'badge-gray'}>{r.status}</span>
                </div>

                <p style={{ color: 'var(--gray-600)', marginBottom: '6px' }}>
                  Responsável: {r.responsavel_nome || 'Não definido'}
                </p>
                {r.rdo_data && (
                  <p style={{ color: 'var(--gray-500)', fontSize: '13px' }}>
                    RDO: {new Date(r.rdo_data).toLocaleDateString('pt-BR')}
                  </p>
                )}

                <div className="flex gap-1 mt-2">
                  {/* Bloquear edição quando RNC estiver em 'Em análise' para usuários não-gestor */}
                  {!(r.status === 'Em análise' && !isGestor) && (
                    <button className="btn btn-secondary" onClick={() => abrirModal(r)}>
                      Editar
                    </button>
                  )}
                  {/* Permitir ao responsável marcar correção: abrir modal de detalhe da correção */}
                  {(usuario && (usuario.id === r.responsavel_id || usuario.id === r.criado_por)) && r.status !== 'Encerrada' && r.status !== 'Em análise' && (
                    <>
                      <button className="btn btn-primary" onClick={() => { setCorrigindoId(r.id); setCorrecaoText(r.acao_corretiva || ''); setShowCorrigirModal(true); }}>
                        Corrigido
                      </button>
                      <button className="btn btn-blue" onClick={async () => {
                        try {
                          await enviarRncParaAprovacao(r.id);
                          const res = await getRNCs(projetoId);
                          setRncs(res.data);
                        } catch (err) {
                          setErro('Erro ao enviar para aprovação.');
                        }
                      }}>
                        Enviar para aprovação
                      </button>
                    </>
                  )}
                  {isGestor && (
                    <>
                      {/* Gestor actions: quando em análise permite aprovar/reprovar */}
                      {r.status === 'Em análise' && (
                        <>
                          <button className="btn btn-success" onClick={() => alterarStatus(r.id, 'Encerrada')}>
                            <CheckCircle size={16} /> Aprovar
                          </button>
                          <button className="btn btn-danger" onClick={() => alterarStatus(r.id, 'Reprovada')}>
                            <XCircle size={16} /> Reprovar
                          </button>
                        </>
                      )}
                      {/* Permite gestor mover RNCs para Em andamento manualmente */}
                      {r.status !== 'Encerrada' && r.status !== 'Reprovada' && (
                        <button className="btn btn-secondary" onClick={() => alterarStatus(r.id, 'Em andamento')}>Marcar Em andamento</button>
                      )}
                      <button className="btn btn-danger" onClick={() => remover(r.id)}>Remover</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {rncs.length === 0 && (
          <div className="card text-center" style={{ padding: '40px' }}>
            <h3 style={{ color: 'var(--gray-500)' }}>Nenhuma RNC cadastrada.</h3>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="flex-between mb-2">
              <h2>{editando ? 'Editar RNC' : 'Nova RNC'}</h2>
              <button className="btn btn-secondary" onClick={fecharModal}>Fechar</button>
            </div>

            {erro && <div className="alert alert-error">{erro}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Título</label>
                <input
                  type="text"
                  className="form-input"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Descrição</label>
                <textarea
                  className="form-textarea"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-3">
                <div className="form-group">
                  <label className="form-label">Gravidade</label>
                  <select
                    className="form-select"
                    value={formData.gravidade}
                    onChange={(e) => setFormData({ ...formData, gravidade: e.target.value })}
                  >
                    <option value="Baixa">Baixa</option>
                    <option value="Média">Média</option>
                    <option value="Alta">Alta</option>
                    <option value="Crítica">Crítica</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="Aberta">Aberta</option>
                    <option value="Em andamento">Em andamento</option>
                    <option value="Encerrada">Encerrada</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Responsável</label>
                  <select
                    className="form-select"
                    value={formData.responsavel_id}
                    onChange={(e) => setFormData({ ...formData, responsavel_id: e.target.value })}
                  >
                    <option value="">Não definido</option>
                    {usuarios.map((u) => (
                      <option key={u.id} value={u.id}>{u.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Vincular a RDO</label>
                <select
                  className="form-select"
                  value={formData.rdo_id}
                  onChange={(e) => setFormData({ ...formData, rdo_id: e.target.value })}
                >
                  <option value="">Sem vínculo</option>
                  {rdos.map((rdo) => (
                    <option key={rdo.id} value={rdo.id}>
                      {new Date(rdo.data_relatorio).toLocaleDateString('pt-BR')} - {rdo.status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Ação corretiva</label>
                <textarea
                  className="form-textarea"
                  value={formData.acao_corretiva}
                  onChange={(e) => setFormData({ ...formData, acao_corretiva: e.target.value })}
                />
              </div>

              <div className="flex-between mt-3">
                <button type="button" className="btn btn-secondary" onClick={fecharModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: detalhar correção antes de enviar para gestor */}
      {showCorrigirModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: '640px' }}>
            <div className="flex-between mb-2 fade-in">
              <h2>Detalhar correção</h2>
              <button className="btn btn-secondary" onClick={() => { setShowCorrigirModal(false); setCorrigindoId(null); setCorrecaoText(''); }}>Fechar</button>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Descreva o que foi corrigido</label>
              <textarea className="form-textarea" value={correcaoText} onChange={(e) => setCorrecaoText(e.target.value)} />
            </div>

            <div className="flex-between">
              <button className="btn btn-secondary" onClick={() => { setShowCorrigirModal(false); setCorrigindoId(null); setCorrecaoText(''); }}>Cancelar</button>
              <button className="btn btn-primary" onClick={async () => {
                if (!corrigindoId) return;
                try {
                  // Submeter correção e manter em 'Em andamento' — não enviar automaticamente para aprovação
                  await submitCorrecaoRNC(corrigindoId, { acao_corretiva: correcaoText });
                  // feedback visual rápido: manter modal aberto por 400ms para a animação
                  setSucesso('Correção enviada. Status: Em andamento');
                  const res = await getRNCs(projetoId);
                  setRncs(res.data);
                  setTimeout(() => {
                    setShowCorrigirModal(false);
                    setCorrigindoId(null);
                    setCorrecaoText('');
                    setSucesso('');
                  }, 600);
                } catch (err) {
                  setErro('Erro ao enviar correção.');
                }
              }}>Enviar correção</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default RNC;
