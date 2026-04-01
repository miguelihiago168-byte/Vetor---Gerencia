import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRNCs, updateStatusRNC, getAnexosRNC, uploadAnexoRNC, submitCorrecaoRNC, enviarRncParaAprovacao } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import RNCTimeline from '../components/RNCTimeline';
import './RNCDetalhes.css';

function RNCDetalhes() {
  const { projetoId, rncId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isGestor, usuario } = useAuth();
  const [rnc, setRnc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [anexos, setAnexos] = useState([]);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoDesc, setFotoDesc] = useState('');
  const [mostrarResposta, setMostrarResposta] = useState(false);
  const [acaoCorretiva, setAcaoCorretiva] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { success, error } = useNotification();

  useEffect(() => {
    carregarRNC();
  }, [rncId]);

  useEffect(() => {
    // Se vier ?responder=1 e o usuário puder responder, abrir o formulário
    const params = new URLSearchParams(location.search);
    const mustOpen = params.get('responder') === '1';
    if (mustOpen && rnc && (usuario?.id === rnc.responsavel_id || isGestor) && rnc.status !== 'Encerrada') {
      setMostrarResposta(true);
    }
  }, [location.search, rnc, usuario, isGestor]);

  const carregarRNC = async () => {
    try {
      setLoading(true);
      const response = await getRNCs(projetoId);
      const rncEncontrada = response.data.find(r => r.id == rncId);
      if (rncEncontrada) {
        setRnc(rncEncontrada);
        try {
          const anexosRes = await getAnexosRNC(rncId);
          setAnexos(anexosRes.data || []);
        } catch {}
      } else {
        setErro('RNC não encontrada');
      }
    } catch (error) {
      console.error('Erro ao carregar RNC:', error);
      setErro('Erro ao carregar RNC');
    } finally {
      setLoading(false);
    }
  };

  // Preencher o textarea com a correção realizada já registrada
  useEffect(() => {
    if (rnc && typeof rnc.descricao_correcao === 'string') {
      setAcaoCorretiva(rnc.descricao_correcao);
    }
  }, [rnc?.descricao_correcao]);

  const formatLocalDate = (dstr) => {
    if (!dstr) return 'N/A';
    const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const dt = new Date(parseInt(m[1],10), parseInt(m[2],10)-1, parseInt(m[3],10));
      return dt.toLocaleDateString('pt-BR');
    }
    const dt = new Date(dstr);
    return isNaN(dt.getTime()) ? dstr : dt.toLocaleDateString('pt-BR');
  };

  const statusLabel = (s) => {
    if (s === 'Em análise') return 'Em aprovação';
    return s || 'N/A';
  };

  const aprovarRNC = async () => {
    try {
      await updateStatusRNC(rncId, 'Encerrada');
      setRnc(prev => ({ ...prev, status: 'Encerrada' }));
    } catch (err) {
      error('Falha ao aprovar RNC: ' + (err.response?.data?.erro || err.message), 7000);
    }
  };

  const reprovarRNC = async () => {
    try {
      await updateStatusRNC(rncId, 'Reprovada');
      setRnc(prev => ({ ...prev, status: 'Reprovada' }));
    } catch (err) {
      error('Falha ao reprovar RNC: ' + (err.response?.data?.erro || err.message), 7000);
    }
  };

  const enviarParaAprovacao = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      // Se o usuário digitou uma correção nova, salva antes de enviar para aprovação
      const texto = (acaoCorretiva || '').trim();
      if (texto && texto !== (rnc.descricao_correcao || '')) {
        await submitCorrecaoRNC(rncId, { descricao_correcao: texto });
        setRnc(prev => ({ ...prev, descricao_correcao: texto, status: 'Em andamento' }));
      }
      await enviarRncParaAprovacao(rncId);
      setRnc(prev => ({ ...prev, status: 'Em análise' }));
      setMostrarResposta(false);
      success('Resposta enviada para aprovação.', 5000);
    } catch (err) {
      error('Falha ao enviar resposta: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setEnviando(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container rnc-det-container center">
          <div className="spinner"></div>
        </div>
      </>
    );
  }

  if (!rnc) {
    return (
      <>
        <Navbar />
        <div className="container rnc-det-container">
          <div className="card" style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>{erro || 'RNC não encontrada'}</div>
          <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rnc`)}>
            <ArrowLeft size={16} /> Voltar
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container rnc-det-container">
        <div className="rnc-det-header">
          <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rnc`)}>
            <ArrowLeft size={16} />
          </button>
          <h1>RNC: {rnc.titulo}</h1>
          {isGestor && rnc.status === 'Em análise' && (
            <div className="rnc-det-approve">
              <button className="btn btn-success" onClick={aprovarRNC}>
                Aprovar
              </button>
              <button className="btn btn-danger" onClick={reprovarRNC}>
                Reprovar
              </button>
            </div>
          )}
        </div>

        <RNCTimeline rnc={rnc} />

        <div className="card rnc-det-card">
          <h2>Detalhes da RNC</h2>
          <div className="rnc-det-info-grid">
            <div className="rnc-det-info"><span className="label">ID:</span><span className="value">{rnc.id}</span></div>
            <div className="rnc-det-info"><span className="label">Título:</span><span className="value">{rnc.titulo}</span></div>
            <div className="rnc-det-info"><span className="label">Status:</span><span className="value">{statusLabel(rnc.status)}</span></div>
            <div className="rnc-det-info"><span className="label">Data de Criação:</span><span className="value">{formatLocalDate(rnc.criado_em)}</span></div>
            <div className="rnc-det-info"><span className="label">Prevista p/ encerramento:</span><span className="value">{formatLocalDate(rnc.data_prevista_encerramento)}</span></div>
            <div className="rnc-det-info"><span className="label">Gravidade:</span><span className="value">{rnc.gravidade || 'N/A'}</span></div>
            <div className="rnc-det-info"><span className="label">Responsável:</span><span className="value">{rnc.responsavel_nome || 'N/A'}</span></div>
            <div className="rnc-det-info"><span className="label">RDO Relacionado:</span><span className="value">{rnc.rdo_id ? `${rnc.rdo_id} ${rnc.rdo_data ? '(' + formatLocalDate(rnc.rdo_data) + ')' : ''}` : 'N/A'}</span></div>
            <div className="rnc-det-info"><span className="label">Norma/Referência:</span><span className="value">{rnc.norma_referencia || 'N/A'}</span></div>
            <div className="rnc-det-info"><span className="label">Área/Local afetado:</span><span className="value">{rnc.area_afetada || 'N/A'}</span></div>
          </div>

          {rnc.descricao && (
            <div className="rnc-det-section">
              <h3>Descrição</h3>
              <p className="text-prewrap">{rnc.descricao}</p>
            </div>
          )}

          {rnc.acao_corretiva && (
            <div className="rnc-det-section">
              <h3>Ação Corretiva</h3>
              <p className="text-prewrap">{rnc.acao_corretiva}</p>
            </div>
          )}

          {rnc.descricao_correcao && (
            <div className="rnc-det-section">
              <h3>Correção realizada</h3>
              <p className="text-prewrap">{rnc.descricao_correcao}</p>
            </div>
          )}

          {rnc.registros_fotograficos && (
            <div style={{ marginTop: '16px' }}>
              <strong>Registros fotográficos:</strong>
              <p style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>{rnc.registros_fotograficos}</p>
            </div>
          )}

          {mostrarResposta && (usuario?.id === rnc.responsavel_id || usuario?.id === rnc.criado_por || isGestor) && rnc.status !== 'Encerrada' && (
            <div className="rnc-det-section rnc-det-response">
              <h3>Resposta do Responsável</h3>
              <p className="muted">Descreva o que foi corrigido. Anexos só podem ser adicionados enquanto a RNC não estiver encerrada.</p>
              <div className="form-group">
                <label className="form-label">Descrição da correção</label>
                <textarea className="form-input" rows={4} value={acaoCorretiva} onChange={(e) => setAcaoCorretiva(e.target.value)} placeholder="O que foi feito para corrigir a não conformidade?" />
              </div>
              <div className="rnc-det-actions">
                <button className="btn btn-warning" disabled={enviando} onClick={enviarParaAprovacao}>{enviando ? 'Enviando...' : 'Enviar resposta'}</button>
              </div>
            </div>
          )}
          <div className="rnc-det-section">
            <h3>Anexos (Fotos)</h3>
            <div className="rnc-det-attachments">
              {anexos.map((anexo) => (
                <div key={anexo.id} className="rnc-det-attach-item">
                  <AlertTriangle size={16} />
                  <div className="attach-name">{anexo.nome_arquivo}</div>
                </div>
              ))}
              {anexos.length === 0 && (
                <div className="muted">Nenhum anexo.</div>
              )}
            </div>
            {(isGestor || usuario?.id === rnc.criado_por || usuario?.id === rnc.responsavel_id) && rnc.status !== 'Encerrada' && (
              <div className="rnc-det-upload-grid">
                <div className="form-group">
                  <label className="form-label">Foto</label>
                  <input className="form-input" type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files?.[0] || null)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input className="form-input" type="text" value={fotoDesc} onChange={(e) => setFotoDesc(e.target.value)} placeholder="Descrição opcional" />
                </div>
                <div className="rnc-det-actions">
                  <button className="btn btn-secondary" disabled={!fotoFile} onClick={async () => {
                    try {
                      const fd = new FormData();
                      fd.append('arquivo', fotoFile);
                      fd.append('descricao', fotoDesc || 'Registro fotográfico');
                      await uploadAnexoRNC(rncId, fd);
                      const anexosRes = await getAnexosRNC(rncId);
                      setAnexos(anexosRes.data || []);
                      setFotoFile(null);
                      setFotoDesc('');
                    } catch (err) {
                      error('Falha ao enviar foto: ' + (err.response?.data?.erro || err.message), 7000);
                    }
                  }}>Enviar foto</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default RNCDetalhes;