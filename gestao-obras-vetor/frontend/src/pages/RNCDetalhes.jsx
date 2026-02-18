import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getRNCs, updateStatusRNC, getAnexosRNC, uploadAnexoRNC, submitCorrecaoRNC, enviarRncParaAprovacao } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

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
    } catch (error) {
      alert('Falha ao aprovar RNC: ' + (error.response?.data?.erro || error.message));
    }
  };

  const reprovarRNC = async () => {
    try {
      await updateStatusRNC(rncId, 'Reprovada');
      setRnc(prev => ({ ...prev, status: 'Reprovada' }));
    } catch (error) {
      alert('Falha ao reprovar RNC: ' + (error.response?.data?.erro || error.message));
    }
  };

  const enviarParaAprovacao = async () => {
    try {
      // Se o usuário digitou uma correção nova, salva antes de enviar para aprovação
      const texto = (acaoCorretiva || '').trim();
      if (texto && texto !== (rnc.acao_corretiva || '')) {
        await submitCorrecaoRNC(rncId, { acao_corretiva: texto });
        setRnc(prev => ({ ...prev, acao_corretiva: texto, status: 'Em andamento' }));
      }
      await enviarRncParaAprovacao(rncId);
      setRnc(prev => ({ ...prev, status: 'Em análise' }));
      setMostrarResposta(false);
    } catch (error) {
      alert('Falha ao enviar para aprovação: ' + (error.response?.data?.erro || error.message));
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      </>
    );
  }

  if (!rnc) {
    return (
      <>
        <Navbar />
        <div className="container">
          <div className="alert alert-error">{erro || 'RNC não encontrada'}</div>
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
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/rnc`)}>
            <ArrowLeft size={16} />
          </button>
          <h1>RNC: {rnc.titulo}</h1>
          {/* Removido: chip de status e botão de abrir/fechar resposta no cabeçalho */}
          {isGestor && rnc.status === 'Em análise' && (
            <>
              <button className="btn btn-success" onClick={aprovarRNC} style={{ marginLeft: '8px' }}>
                Aprovar
              </button>
              <button className="btn btn-danger" onClick={reprovarRNC} style={{ marginLeft: '8px' }}>
                Reprovar
              </button>
            </>
          )}
          {/* Removido: botão de gerar PDF no cabeçalho */}
        </div>

        <div className="card" style={{ padding: '24px' }}>
          <h2>Detalhes da RNC</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div>
              <strong>ID:</strong> {rnc.id}
            </div>
            <div>
              <strong>Título:</strong> {rnc.titulo}
            </div>
            <div>
              <strong>Status:</strong> {statusLabel(rnc.status)}
            </div>
            <div>
              <strong>Data de Criação:</strong> {formatLocalDate(rnc.criado_em)}
            </div>
            <div>
              <strong>Data prevista para encerramento:</strong> {formatLocalDate(rnc.data_prevista_encerramento)}
            </div>
          </div>

          {rnc.descricao && (
            <div style={{ marginTop: '24px' }}>
              <strong>Descrição:</strong>
              <p style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>{rnc.descricao}</p>
            </div>
          )}

          {rnc.registros_fotograficos && (
            <div style={{ marginTop: '16px' }}>
              <strong>Registros fotográficos:</strong>
              <p style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>{rnc.registros_fotograficos}</p>
            </div>
          )}

          {mostrarResposta && (usuario?.id === rnc.responsavel_id || usuario?.id === rnc.criado_por || isGestor) && rnc.status !== 'Encerrada' && (
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
              <h3>Resposta do Responsável</h3>
              <p style={{ color: 'var(--gray-600)', marginTop: '4px' }}>Descreva o que foi corrigido. Fotos poderão ser adicionadas depois.</p>
              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label">Descrição da correção</label>
                <textarea className="form-input" rows={4} value={acaoCorretiva} onChange={(e) => setAcaoCorretiva(e.target.value)} placeholder="O que foi feito para corrigir a não conformidade?" />
              </div>
              {/* Botões removidos aqui; Enviar para aprovação ficará ao final da tela */}
            </div>
          )}
          <div style={{ marginTop: '24px' }}>
            <h3>Anexos (Fotos)</h3>
            <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
              {anexos.map((anexo) => (
                <div key={anexo.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', border: '1px solid #eee', borderRadius: '4px' }}>
                  <AlertTriangle size={16} />
                  <div style={{ flex: 1, fontSize: '14px' }}>{anexo.nome_arquivo}</div>
                </div>
              ))}
              {anexos.length === 0 && (
                <div style={{ color: '#666' }}>Nenhum anexo.</div>
              )}
            </div>
            {(isGestor || usuario?.id === rnc.criado_por || usuario?.id === rnc.responsavel_id) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: '12px', marginTop: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Foto</label>
                  <input className="form-input" type="file" accept="image/*" onChange={(e) => setFotoFile(e.target.files?.[0] || null)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição</label>
                  <input className="form-input" type="text" value={fotoDesc} onChange={(e) => setFotoDesc(e.target.value)} placeholder="Descrição opcional" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
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
                      alert('Falha ao enviar foto: ' + (err.response?.data?.erro || err.message));
                    }
                  }}>Enviar foto</button>
                </div>
              </div>
            )}
            {/* Botão final: Enviar para aprovação */}
            {(rnc.status !== 'Encerrada' && rnc.status !== 'Em análise') && (isGestor || usuario?.id === rnc.criado_por || usuario?.id === rnc.responsavel_id) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  className="btn btn-warning"
                  onClick={enviarParaAprovacao}
                >
                  Enviar para aprovação
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default RNCDetalhes;