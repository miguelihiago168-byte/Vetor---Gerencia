import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { useDialog } from '../context/DialogContext';
import EAP from './EAP';
import CurvaS from './CurvaS';
import CronogramaGantt from './CronogramaGantt';
import { Layers, TrendingUp, Network, Maximize2, LayoutDashboard } from 'lucide-react';
import './PlanejamentoDashboard.css';

function PlanejamentoDashboard() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const [abaAtiva, setAbaAtiva] = useState('eap');
  const { isDirty } = useLeaveGuard();
  const { confirm } = useDialog();
  const canLeave = async () => !isDirty || confirm({ title: 'Descartar alterações?', message: 'Há alterações não salvas. Deseja sair desta tela?', confirmText: 'Descartar', cancelText: 'Continuar editando' });

  const abas = [
    { 
      id: 'eap', 
      label: 'EAP', 
      icon: Layers,
      description: 'Estrutura Analítica do Projeto',
    },
    { 
      id: 'curva-s', 
      label: 'Curva S', 
      icon: TrendingUp,
      description: 'Evolução planejado vs realizado',
    },
    { 
      id: 'gantt', 
      label: 'Cronograma', 
      icon: Network,
      description: 'Diagrama de Gantt e dependências',
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
    <div className="planejamento-layout">
      <Navbar />
      <div className="planejamento-container">
        <div className="planejamento-navigation">
          <div className="planejamento-header">
            <span className="planejamento-symbol"><LayoutDashboard size={21} aria-hidden="true" /></span>
            <div><h2 className="planejamento-title">Planejamento</h2><p className="planejamento-subtitle">Ferramentas do projeto</p></div>
          </div>
          
          <nav className="planejamento-abas" aria-label="Ferramentas de planejamento">
            {abas.map((aba) => {
              const Icon = aba.icon;
              const isActive = abaAtiva === aba.id;
              return (
                <button
                  key={aba.id}
                  className={`planejamento-aba ${isActive ? 'active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  title={aba.description}
                  onClick={async () => { if (aba.id !== abaAtiva && await canLeave()) setAbaAtiva(aba.id); }}
                >
                  <div className="planejamento-aba-icon">
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <div className="planejamento-aba-text">
                    <p className="planejamento-aba-label">{aba.label}</p>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="planejamento-footer">
            <button
              className="planejamento-btn-open"
              onClick={async () => {
                if (!await canLeave()) return;
                const abaId = abas.find(a => a.id === abaAtiva)?.id;
                if (abaId === 'eap') navigate(`/projeto/${projetoId}/eap`);
                if (abaId === 'curva-s') navigate(`/projeto/${projetoId}/curva-s`);
                if (abaId === 'gantt') navigate(`/projeto/${projetoId}/gantt`);
              }}
            >
              <Maximize2 size={16} aria-hidden="true" />
              Abrir em tela cheia
            </button>
          </div>
        </div>

        <main className="planejamento-conteudo" aria-label={abaAtualLabel}>
          {renderConteudo()}
        </main>
      </div>
    </div>
  );
}

export default PlanejamentoDashboard;
