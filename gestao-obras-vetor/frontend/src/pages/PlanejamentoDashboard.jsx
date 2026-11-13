import React from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useLeaveGuard } from '../context/LeaveGuardContext';
import { useDialog } from '../context/DialogContext';
import EAP from './EAP';
import RelatorioSemanal from './RelatorioSemanal';
import CurvaS from './CurvaS';
import CronogramaGantt from './CronogramaGantt';
import { Maximize2, LayoutDashboard } from 'lucide-react';
import './PlanejamentoDashboard.css';

function PlanejamentoDashboard() {
  const { projetoId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedTab = new URLSearchParams(location.search).get('aba');
  const abaAtiva = ['eap', 'curva-s', 'gantt', 'relatorio-semanal'].includes(requestedTab) ? requestedTab : 'eap';
  const { isDirty } = useLeaveGuard();
  const { confirm } = useDialog();
  const canLeave = async () => !isDirty || confirm({ title: 'Descartar alterações?', message: 'Há alterações não salvas. Deseja sair desta tela?', confirmText: 'Descartar', cancelText: 'Continuar editando' });

  const abas = [{ id: 'eap', label: 'EAP' }, { id: 'curva-s', label: 'Curva S' }, { id: 'gantt', label: 'Cronograma' }, { id: 'relatorio-semanal', label: 'Relatório semanal' }];

  const renderConteudo = () => {
    switch (abaAtiva) {
      case 'relatorio-semanal':
        return <RelatorioSemanal />;
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
          

          {abaAtiva !== 'relatorio-semanal' && <div className="planejamento-footer">
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
          </div>}
        </div>

        <main className="planejamento-conteudo" aria-label={abaAtualLabel}>
          {renderConteudo()}
        </main>
      </div>
    </div>
  );
}

export default PlanejamentoDashboard;
