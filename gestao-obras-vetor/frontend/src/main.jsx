import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LeaveGuardProvider } from './context/LeaveGuardContext';
import { DialogProvider } from './context/DialogContext';
import PrivateRoute from './components/PrivateRoute';
import NotificationContainer from './components/NotificationContainer';
import Login from './pages/Login';
// Dashboard removido como página inicial; manter rota para compatibilidade opcional
import Dashboard from './pages/Dashboard';
import Projetos from './pages/Projetos';
import ProjetoDetalhes from './pages/ProjetoDetalhes';
import PedidosCompra from './pages/PedidosCompra';
import FinanceiroFluxoCaixa from './pages/FinanceiroFluxoCaixa';
import EAP from './pages/EAP';
import EAPForm from './pages/EAPForm';
import CurvaS from './pages/CurvaS';
import RDOs from './pages/RDOs';
import RDODetalhes from './pages/RDODetalhes';
import RDOForm2 from './pages/RDOForm2';
import Usuarios from './pages/Usuarios';
import RNC from './pages/RNC';
import RNCForm from './pages/RNCForm';
import RNCDetalhes from './pages/RNCDetalhes';
import ProjetoSelector from './pages/ProjetoSelector';
import AlmoxarifadoDashboard from './pages/AlmoxarifadoDashboard';
import AlmoxFerramentas from './pages/AlmoxFerramentas';
import AlmoxRetirada from './pages/AlmoxRetirada';
import AlmoxDevolucao from './pages/AlmoxDevolucao';
import AlmoxManutencao from './pages/AlmoxManutencao';
import AlmoxPerdas from './pages/AlmoxPerdas';
import AlmoxRelatorios from './pages/AlmoxRelatorios';
import './index.css';

const MOBILE_BREAKPOINT = 900;

function MobileDisabledGate({ children }) {
  const [isMobileViewport, setIsMobileViewport] = React.useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= MOBILE_BREAKPOINT;
  });

  React.useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth <= MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (isMobileViewport) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        background: '#f5f7fa',
        color: '#1f2937',
        fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif'
      }}>
        <div style={{ maxWidth: '480px' }}>
          <h1 style={{ marginBottom: '12px', fontSize: '1.5rem' }}>Versão mobile desativada</h1>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            Este sistema está temporariamente disponível apenas para telas maiores.
            Acesse por um computador ou aumente a largura da janela.
          </p>
        </div>
      </div>
    );
  }

  return children;
}

const PERFIS_RDO = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade', 'Fiscal'];
const PERFIS_RNC = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade', 'Fiscal'];
const PERFIS_CURVA_S = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade', 'Fiscal'];
const PERFIS_EAP = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade'];
const PERFIS_COMPRAS = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'ADM', 'Almoxarife'];
const PERFIS_ATIVOS = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade', 'ADM', 'Almoxarife'];
const PERFIS_USUARIOS = ['Gestor Geral', 'ADM'];

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MobileDisabledGate>
      <NotificationProvider>
        <AuthProvider>
          <LeaveGuardProvider>
          <DialogProvider>
          <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          {/* Redirecionar Dashboard para Projetos */}
          <Route path="/dashboard" element={<Navigate to="/projetos" replace />} />
          <Route path="/projetos" element={
            <PrivateRoute>
              <Projetos />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId" element={
            <PrivateRoute>
              <ProjetoDetalhes />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/eap" element={
            <PrivateRoute allowedPerfis={PERFIS_EAP}>
              <EAP />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/eap/novo" element={
            <PrivateRoute allowedPerfis={PERFIS_EAP}>
              <EAPForm />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/eap/:atividadeId" element={
            <PrivateRoute allowedPerfis={PERFIS_EAP}>
              <EAPForm />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/curva-s" element={
            <PrivateRoute allowedPerfis={PERFIS_CURVA_S}>
              <CurvaS />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdos" element={
            <PrivateRoute allowedPerfis={PERFIS_RDO}>
              <RDOs />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/pedidos" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <PedidosCompra />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/financeiro" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <FinanceiroFluxoCaixa />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdo/:rdoId" element={
            <PrivateRoute allowedPerfis={PERFIS_RDO}>
              <RDODetalhes />
            </PrivateRoute>
          } />
          {/* Alias para evitar erro de rota ao acessar detalhes via /rdos/:rdoId */}
          <Route path="/projeto/:projetoId/rdos/:rdoId" element={
            <PrivateRoute allowedPerfis={PERFIS_RDO}>
              <RDODetalhes />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdos/novo" element={
            <PrivateRoute allowedPerfis={PERFIS_RDO}>
              <RDOForm2 />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdos/:rdoId/editar" element={
            <PrivateRoute allowedPerfis={PERFIS_RDO}>
              <RDOForm2 />
            </PrivateRoute>
          } />
          <Route path="/usuarios" element={
            <PrivateRoute allowedPerfis={PERFIS_USUARIOS}>
              <Usuarios />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/usuarios" element={
            <PrivateRoute allowedPerfis={PERFIS_USUARIOS}>
              <Usuarios />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rnc" element={
            <PrivateRoute allowedPerfis={PERFIS_RNC}>
              <RNC />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rnc/novo" element={
            <PrivateRoute allowedPerfis={PERFIS_RNC}>
              <RNCForm />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rnc/:rncId" element={
            <PrivateRoute allowedPerfis={PERFIS_RNC}>
              <RNCDetalhes />
            </PrivateRoute>
          } />

          <Route path="/projeto/:projetoId/almoxarifado" element={
            <PrivateRoute allowedPerfis={PERFIS_ATIVOS}>
              <AlmoxarifadoDashboard />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/almoxarifado/ferramentas" element={
            <PrivateRoute allowedPerfis={PERFIS_ATIVOS}>
              <AlmoxFerramentas />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/almoxarifado/retirada" element={
            <PrivateRoute allowedPerfis={PERFIS_ATIVOS}>
              <AlmoxRetirada />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/almoxarifado/devolucao" element={
            <PrivateRoute allowedPerfis={PERFIS_ATIVOS}>
              <AlmoxDevolucao />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/almoxarifado/manutencao" element={
            <PrivateRoute allowedPerfis={PERFIS_ATIVOS}>
              <AlmoxManutencao />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/almoxarifado/perdas" element={
            <PrivateRoute allowedPerfis={PERFIS_ATIVOS}>
              <AlmoxPerdas />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/almoxarifado/relatorios" element={
            <PrivateRoute allowedPerfis={PERFIS_ATIVOS}>
              <AlmoxRelatorios />
            </PrivateRoute>
          } />

          {/* Rotas globais para navegação lateral */}
          <Route path="/rdos" element={<ProjetoSelector destino="rdos" />} />
          <Route path="/eap" element={<ProjetoSelector destino="eap" />} />
          <Route path="/curva-s" element={<ProjetoSelector destino="curva-s" />} />
          <Route path="/rnc" element={<ProjetoSelector destino="rnc" />} />
           <Route path="/compras" element={<ProjetoSelector destino="pedidos" />} />
           <Route path="/financeiro" element={<ProjetoSelector destino="financeiro" />} />
           <Route path="/ativos" element={<ProjetoSelector destino="almoxarifado" />} />
           <Route path="/" element={<Navigate to="/projetos" replace />} />
          </Routes>
          <NotificationContainer />
        </BrowserRouter>
        </DialogProvider>
      </LeaveGuardProvider>
      </AuthProvider>
    </NotificationProvider>
    </MobileDisabledGate>
  </React.StrictMode>
);
