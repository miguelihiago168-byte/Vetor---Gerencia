import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import EAP from './EAP';
import CurvaS from './CurvaS';
import CronogramaGantt from './CronogramaGantt';
import { Layers, TrendingUp, Network, ChevronRight } from 'lucide-react';
import './PlanejamentoDashboard.css';

function PlanejamentoDashboard() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [abaAtiva, setAbaAtiva] = useState('eap');

  const abas = [
    { 
      id: 'eap', 
      label: 'EAP', 
      icon: Layers,
      description: 'Estrutura Analítica do Projeto',
      color: '#3b82f6'
    },
    { 
      id: 'curva-s', 
      label: 'Curva S', 
      icon: TrendingUp,
      description: 'Evolução planejado vs realizado',
      color: '#10b981'
    },
    { 
      id: 'gantt', 
      label: 'Cronograma', 
      icon: Network,
      description: 'Diagrama de Gantt e dependências',
      color: '#f59e0b'
    }
  ];

  const renderConteudo = () => {
    switch (abaAtiva) {
      case 'eap':
        return <EAP hideNavbar={true} />;
      case 'curva-s':
        return <CurvaS hideNavbar={true} />;
      case 'gantt':
        return <CronogramaGantt hideNavbar={true} />;
      default:
        return <EAP hideNavbar={true} />;
    }
  };

  const abaAtualLabel = abas.find(a => a.id === abaAtiva)?.label || 'EAP';

  return (
    <>
      <Navbar />
      <div className="planejamento-container">
        <aside className="planejamento-sidebar">
          <div className="planejamento-header">
            <h2 className="planejamento-title">Planejamento</h2>
            <p className="planejamento-subtitle">Selecione uma ferramenta</p>
          </div>
          
          <nav className="planejamento-abas">
            {abas.map((aba) => {
              const Icon = aba.icon;
              const isActive = abaAtiva === aba.id;
              return (
                <button
                  key={aba.id}
                  className={`planejamento-aba ${isActive ? 'active' : ''}`}
                  onClick={() => setAbaAtiva(aba.id)}
                  style={{
                    borderLeftColor: isActive ? aba.color : 'transparent'
                  }}
                >
                  <div className="planejamento-aba-icon" style={{ backgroundColor: `${aba.color}20` }}>
                    <Icon size={20} style={{ color: aba.color }} />
                  </div>
                  <div className="planejamento-aba-text">
                    <p className="planejamento-aba-label">{aba.label}</p>
                    <p className="planejamento-aba-desc">{aba.description}</p>
                  </div>
                  {isActive && <ChevronRight size={18} style={{ color: aba.color }} />}
                </button>
              );
            })}
          </nav>

          <div className="planejamento-footer">
            <button
              className="planejamento-btn-open"
              onClick={() => {
                const abaId = abas.find(a => a.id === abaAtiva)?.id;
                if (abaId === 'eap') navigate(`/projeto/${projetoId}/eap`);
                if (abaId === 'curva-s') navigate(`/projeto/${projetoId}/curva-s`);
                if (abaId === 'gantt') navigate(`/projeto/${projetoId}/gantt`);
              }}
            >
              <ChevronRight size={16} />
              Abrir em tela cheia
            </button>
          </div>
        </aside>

        <main className="planejamento-conteudo">
          {renderConteudo()}
        </main>
      </div>
    </>
  );
}

export default PlanejamentoDashboard;
