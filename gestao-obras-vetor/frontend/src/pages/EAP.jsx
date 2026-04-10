import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { 
  getAtividadesEAP, 
  recalcularEapProjeto, 
  deleteAtividade
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useDialog } from '../context/DialogContext';
import { useNotification } from '../context/NotificationContext';
import { Activity, Plus, Eye, ChevronRight, ChevronDown, Trash2, ArrowLeft } from 'lucide-react';

function EAP({ hideNavbar = false }) {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const { isGestor } = useAuth();
  const { confirm } = useDialog();
  const { success, error } = useNotification();
  const [atividades, setAtividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState(new Set());

  useEffect(() => {
    carregarAtividades();
  }, [projetoId]);

  const carregarAtividades = async () => {
    try {
      setLoading(true);
      console.log('Carregando EAP para projeto:', projetoId);
      const response = await getAtividadesEAP(projetoId);
      console.log('EAP carregada:', response.data);
      setAtividades(response.data || []);
    } catch (err) {
      console.error('Erro ao carregar EAP:', err);
      error('Erro ao carregar EAP: ' + (err.response?.data?.erro || err.message), 7000);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const formatarDataBr = (valor) => {
    if (!valor) return '-';
    const match = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return valor;
  };

  const handleExcluirAtividade = async (atividade) => {
    const ok = await confirm({
      title: 'Excluir atividade',
      message: `Deseja excluir a atividade ${atividade.codigo_eap} - ${atividade.descricao}?`,
      confirmText: 'Excluir',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    try {
      await deleteAtividade(atividade.id);
      success('Atividade excluída com sucesso.', 5000);
      await carregarAtividades();
    } catch (err) {
      error('Erro ao excluir atividade: ' + (err.response?.data?.erro || err.message), 7000);
    }
  };

  const buildHierarchy = (atividades) => {
    const byId = {};
    const roots = [];

    // Indexar todas as atividades por ID
    atividades.forEach(atividade => {
      byId[atividade.id] = { ...atividade, children: [] };
    });

    // Construir hierarquia
    atividades.forEach(atividade => {
      if (atividade.pai_id) {
        if (byId[atividade.pai_id]) {
          byId[atividade.pai_id].children.push(byId[atividade.id]);
        }
      } else {
        roots.push(byId[atividade.id]);
      }
    });

    // Ordenar raízes por código EAP (numérico)
    roots.sort((a, b) => {
      const aNum = parseFloat(a.codigo_eap) || 0;
      const bNum = parseFloat(b.codigo_eap) || 0;
      return aNum - bNum;
    });

    // Ordenar filhos recursivamente por código EAP (numérico)
    const ordenarFilhos = (atividade) => {
      if (atividade.children && atividade.children.length > 0) {
        atividade.children.sort((a, b) => {
          const aNum = parseFloat(a.codigo_eap) || 0;
          const bNum = parseFloat(b.codigo_eap) || 0;
          return aNum - bNum;
        });
        atividade.children.forEach(ordenarFilhos);
      }
    };

    roots.forEach(ordenarFilhos);

    return roots;
  };

  const renderAtividade = (atividade, level = 0) => {
    const hasChildren = atividade.children && atividade.children.length > 0;
    const isExpanded = expandedItems.has(atividade.id);
    const podeAdicionarFilha = !atividade.pai_id;
    const tituloAtividade = `${atividade.codigo_eap} ${atividade.nome || atividade.descricao || ''}`.trim();
    const descricaoExtra = (atividade.descricao && atividade.nome && atividade.descricao !== atividade.nome)
      ? atividade.descricao
      : '';

    return (
      <div key={atividade.id}>
        <div 
          className="card" 
          style={{ 
            padding: '15px', 
            marginBottom: '8px',
            marginLeft: `${level * 20}px`,
            borderLeft: `4px solid ${getStatusColor(atividade.status)}`
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
              {hasChildren && (
                <button
                  onClick={() => toggleExpanded(atividade.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              )}
              {!hasChildren && <div style={{ width: '20px' }}></div>}
              
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <strong>{tituloAtividade}</strong>
                  {descricaoExtra && (
                    <span style={{ fontSize: '14px', color: 'var(--gray-600)' }}>
                      {descricaoExtra}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '15px', fontSize: '13px', color: 'var(--gray-600)' }}>
                  {/* Para atividades mãe, não exibir previsto */}
                  {!hasChildren && (
                    <span>Previsto: {atividade.quantidade_total || 0} {atividade.unidade_medida || ''}</span>
                  )}
                  <span>Peso: {atividade.peso_percentual_projeto || atividade.percentual_previsto || 0}%</span>
                  <span>
                    Planejado: <strong>{formatarDataBr(atividade.data_inicio_planejada)}</strong> até <strong>{formatarDataBr(atividade.data_fim_planejada)}</strong>
                  </span>
                  <span>Executado: {atividade.percentual_executado || 0}%</span>
                  <span>Status: {atividade.status}</span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/projeto/${projetoId}/eap/${atividade.id}`)}
                title="Editar"
              >
                <Eye size={16} />
              </button>
              {podeAdicionarFilha && (
                <button
                  className="btn btn-outline"
                  onClick={() => navigate(`/projeto/${projetoId}/eap/novo?pai=${atividade.id}`)}
                  title="Adicionar filha"
                >
                  +
                </button>
              )}
              <button
                className="btn btn-danger"
                onClick={() => handleExcluirAtividade(atividade)}
                title="Excluir atividade"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          
          {/* Barra de progresso */}
          <div style={{ marginTop: '10px' }}>
            <div className="progress-bar" style={{ height: '6px' }}>
              <div 
                className="progress-fill"
                style={{ 
                  width: `${atividade.percentual_executado || 0}%`,
                  backgroundColor: getStatusColor(atividade.status)
                }}
              ></div>
            </div>
          </div>
        </div>
        
        {/* Renderizar filhos se expandido */}
        {hasChildren && isExpanded && (
          <div>
            {atividade.children.map(child => renderAtividade(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Concluída': return '#4CAF50';
      case 'Em andamento': return '#2196F3';
      case 'Não iniciada': return '#FF9800';
      default: return '#9E9E9E';
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

  const hierarchy = buildHierarchy(atividades);

  return (
    <>
      {!hideNavbar && <Navbar />}
      <div className="container" style={{ paddingTop: '24px', paddingBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {!hideNavbar && (
              <button className="btn btn-secondary" onClick={() => navigate(`/projeto/${projetoId}/planejamento`)}>
                <ArrowLeft size={16} />
                Voltar ao Planejamento
              </button>
            )}
            <h1 style={{ margin: 0 }}>EAP do Projeto</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={() => navigate(`/projeto/${projetoId}/eap/novo`)}>
              <Plus size={16} />
              Nova Atividade
            </button>
            {isGestor && (
              <button className="btn btn-secondary" onClick={async () => {
                const ok = await confirm({
                  title: 'Recalcular EAP',
                  message: 'Recalcular avanço da EAP para este projeto?',
                  confirmText: 'Recalcular',
                  cancelText: 'Cancelar'
                });
                if (!ok) return;
                try {
                  const resp = await recalcularEapProjeto(projetoId);
                  success(resp.data?.mensagem || 'EAP recalculada.', 5000);
                  carregarAtividades();
                } catch (err) {
                  error('Erro ao recalcular EAP: ' + (err.response?.data?.erro || err.message), 7000);
                }
              }}>
                Recalcular EAP
              </button>
            )}
          </div>
        </div>

        {hierarchy.length === 0 ? (
          <div className="card text-center" style={{ padding: '60px' }}>
            <Activity size={48} style={{ color: 'var(--gray-400)', marginBottom: '16px' }} />
            <h3 style={{ color: 'var(--gray-500)' }}>Nenhuma atividade encontrada</h3>
            <p style={{ color: 'var(--gray-400)', marginTop: '8px' }}>
              Crie a primeira atividade para este projeto.
            </p>
          </div>
        ) : (
          <div>
            {hierarchy.map(atividade => renderAtividade(atividade))}
          </div>
        )}
      </div>
    </>
  );
}

export default EAP;
