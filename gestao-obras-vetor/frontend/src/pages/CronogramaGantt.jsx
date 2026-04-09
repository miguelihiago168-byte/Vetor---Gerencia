import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import GanttSidebar from '../components/GanttSidebar';
import DependencyRecommendations from '../components/DependencyRecommendations';
import ConfirmDependencyModal from '../components/ConfirmDependencyModal';
import {
  getAtividadesEAP,
  sugerirDependenciasEAP,
  confirmarDependencia,
  aplicarCronogramaGantt,
  obterDadosGantt
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { Zap, RefreshCw, CalendarDays, AlertTriangle, ArrowLeft } from 'lucide-react';

function CronogramaGantt({ hideNavbar = false }) {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const { success, error } = useNotification();

  const [loading, setLoading] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [atividades, setAtividades] = useState([]);
  const [dadosGantt, setDadosGantt] = useState(null);
  const [sugestoesModal, setSugestoesModal] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [previewCronograma, setPreviewCronograma] = useState(null);

  useEffect(() => {
    carregarTudo();
  }, [projetoId]);

  const carregarTudo = async () => {
    try {
      setLoading(true);
      const [atvResp, ganttResp] = await Promise.all([
        getAtividadesEAP(projetoId),
        obterDadosGantt(projetoId, {
          incluirNaoConfirmadas: 'false',
          mostrarCaminoCritico: 'true'
        })
      ]);
      setAtividades(atvResp.data || []);
      setDadosGantt(ganttResp.data || null);
    } catch (err) {
      error('Erro ao carregar cronograma: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setLoading(false);
    }
  };

  const resumo = useMemo(() => {
    const lista = dadosGantt?.atividades || [];
    const atrasadas = lista.filter(a => a.atrasado).length;
    const criticas = lista.filter(a => a.no_caminho_critico).length;
    return {
      total: lista.length,
      atrasadas,
      criticas,
      concluidaPct: lista.length ? Math.round((lista.filter(a => Number(a.percentual_executado || 0) >= 100).length / lista.length) * 100) : 0
    };
  }, [dadosGantt]);

  const handleGerarCronograma = async () => {
    if (!isGestor) {
      error('Apenas gestores podem gerar sugestões automáticas.', 5000);
      return;
    }

    try {
      setCarregando(true);
      const response = await sugerirDependenciasEAP(projetoId, true);
      setSugestoesModal(response.data);
      success('Sugestões geradas com sucesso.', 4000);
    } catch (err) {
      error('Erro ao gerar sugestões: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setCarregando(false);
    }
  };

  const handleConfirmarSelecionadas = async (selecionadas) => {
    if (!selecionadas || selecionadas.length === 0) {
      error('Nenhuma dependência selecionada.', 4000);
      return;
    }

    try {
      setCarregando(true);
      const primeiro = selecionadas[0];
      const sugestao = (sugestoesModal?.sugestoes || []).find(s => `${s.id_origem}_${s.id_destino}` === primeiro);
      if (!sugestao) {
        error('Não foi possível localizar a sugestão selecionada.', 5000);
        return;
      }

      const recarregado = await sugerirDependenciasEAP(projetoId, true);
      const dep = (recarregado.data?.sugestoes || []).find(
        s => s.id_origem === sugestao.id_origem && s.id_destino === sugestao.id_destino
      );

      if (!dep?.id) {
        error('Não foi possível confirmar a dependência.', 5000);
        return;
      }

      const confirmResponse = await confirmarDependencia(dep.id, true);
      setPreviewCronograma(confirmResponse.data?.preview || null);
      setShowConfirmModal(true);
    } catch (err) {
      error('Erro ao confirmar dependência: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setCarregando(false);
    }
  };

  const handleAplicarCronograma = async () => {
    try {
      setCarregando(true);
      await aplicarCronogramaGantt(projetoId);
      success('Cronograma aplicado com sucesso.', 5000);
      setShowConfirmModal(false);
      setSugestoesModal(null);
      await carregarTudo();
    } catch (err) {
      error('Erro ao aplicar cronograma: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setCarregando(false);
    }
  };

  if (loading) {
    return (
      <>
        {!hideNavbar && <Navbar />}
        <div className="container" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="spinner"></div>
        </div>
      </>
    );
  }

  return (
    <>
      {!hideNavbar && <Navbar />}
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {!hideNavbar && (
              <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/planejamento`)}>
                <ArrowLeft size={16} />
                Voltar ao Planejamento
              </button>
            )}
            <h1 style={{ margin: 0 }}>Cronograma (Gantt)</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={carregarTudo} disabled={carregando}>
              <RefreshCw size={16} /> Atualizar
            </button>
            {isGestor && (
              <button className="btn btn-warning" onClick={handleGerarCronograma} disabled={carregando}>
                <Zap size={16} /> {carregando ? 'Processando...' : 'Gerar Sugestões'}
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ padding: 12 }}>
            <small>Total de atividades</small>
            <h2 style={{ margin: '6px 0 0 0' }}>{resumo.total}</h2>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <small>Concluídas</small>
            <h2 style={{ margin: '6px 0 0 0' }}>{resumo.concluidaPct}%</h2>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <small>No caminho crítico</small>
            <h2 style={{ margin: '6px 0 0 0' }}>{resumo.criticas}</h2>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <small>Atrasadas</small>
            <h2 style={{ margin: '6px 0 0 0', color: resumo.atrasadas ? '#dc2626' : 'inherit' }}>{resumo.atrasadas}</h2>
          </div>
        </div>

        {resumo.atrasadas > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 16, borderLeft: '4px solid #dc2626' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="#dc2626" />
              <strong>{resumo.atrasadas} atividade(s) atrasada(s)</strong>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <CalendarDays size={16} />
            <strong>Visão do Cronograma</strong>
          </div>
          <GanttSidebar
            isOpen={true}
            embedded={true}
            dadosGantt={dadosGantt}
            caminhoCritico={dadosGantt?.caminhoCritico}
            folgas={dadosGantt?.folgas}
          />
        </div>
      </div>

      {sugestoesModal && (
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
          zIndex: 8000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            maxWidth: '700px',
            maxHeight: '85vh',
            overflow: 'auto',
            width: '100%',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <DependencyRecommendations
              sugestoes={sugestoesModal.sugestoes || []}
              carregando={carregando}
              onConfirmarTodas={handleConfirmarSelecionadas}
              onAceitar={() => {}}
              onRejeitar={() => {}}
            />
            <div style={{ padding: '12px', textAlign: 'right', borderTop: '1px solid #e0e0e0' }}>
              <button className="btn btn-outline" onClick={() => setSugestoesModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDependencyModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleAplicarCronograma}
        preview={previewCronograma}
        carregando={carregando}
      />
    </>
  );
}

export default CronogramaGantt;
