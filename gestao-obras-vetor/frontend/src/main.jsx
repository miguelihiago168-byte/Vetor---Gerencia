import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LeaveGuardProvider } from './context/LeaveGuardContext';
import { DialogProvider } from './context/DialogContext';
import { UserPreferencesProvider } from './context/UserPreferencesContext';
import PrivateRoute from './components/PrivateRoute';
import NotificationContainer from './components/NotificationContainer';
import Login from './pages/Login';
import CriarConta from './pages/CriarConta';
import RedefinirSenha from './pages/RedefinirSenha';
// Dashboard removido como página inicial; manter rota para compatibilidade opcional
import Dashboard from './pages/Dashboard';
import Projetos from './pages/Projetos';
import ProjetoDetalhes from './pages/ProjetoDetalhes';
import PedidosCompra from './pages/PedidosCompra';
import Requisicoes from './pages/Requisicoes';
import RequisicaoDetalhe from './pages/RequisicaoDetalhe';
import RequisicaoKanban from './pages/RequisicaoKanban';
import CotacoesFinalizadas from './pages/CotacoesFinalizadas';
import CotacoesNegadas from './pages/CotacoesNegadas';
import Fornecedores from './pages/Fornecedores';
import ComprasStatusList from './pages/ComprasStatusList';
import ComprasGlobal from './pages/ComprasGlobal';
// FINANCEIRO DESATIVADO
// import FinanceiroFluxoCaixa from './pages/FinanceiroFluxoCaixa';
import EAP from './pages/EAP';
import EAPForm from './pages/EAPForm';
import CurvaS from './pages/CurvaS';
import CronogramaGantt from './pages/CronogramaGantt';
import PlanejamentoDashboard from './pages/PlanejamentoDashboard';
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
import MeuPerfil from './pages/MeuPerfil';
import PrimeiroAcesso from './pages/PrimeiroAcesso';
import EmailDashboard from './pages/EmailDashboard';
import './index.css';
import './dark-mode.css';

const PERFIS_RDO = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade', 'Fiscal'];
const PERFIS_RNC = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade', 'Fiscal'];
const PERFIS_CURVA_S = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade', 'Fiscal'];
const PERFIS_EAP = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade'];
const PERFIS_GANTT = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'Gestor da Qualidade', 'Gestor de Qualidade'];
const PERFIS_PLANEJAMENTO = PERFIS_EAP;
const PERFIS_COMPRAS = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'ADM', 'Almoxarife'];
const PERFIS_GESTORES_ADM = ['Gestor Geral', 'ADM'];
const PERFIS_ATIVOS = ['Gestor Geral', 'Gestor da Obra', 'Gestor Local', 'ADM', 'Almoxarife'];
const PERFIS_USUARIOS = ['Gestor Geral', 'ADM'];

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <AuthProvider>
        <UserPreferencesProvider>
          <LeaveGuardProvider>
            <DialogProvider>
              <BrowserRouter>
                <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register/:token" element={<CriarConta />} />
          <Route path="/redefinir-senha/:token" element={<RedefinirSenha />} />
          <Route path="/criar-conta" element={<Navigate to="/login" replace />} />
          <Route path="/primeiro-acesso" element={<PrivateRoute allowPendingFirstAccess><PrimeiroAcesso /></PrivateRoute>} />
          <Route path="/perfil" element={<PrivateRoute><MeuPerfil /></PrivateRoute>} />
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
          <Route path="/projeto/:projetoId/planejamento" element={
            <PrivateRoute allowedPerfis={PERFIS_PLANEJAMENTO}>
              <PlanejamentoDashboard />
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
          <Route path="/projeto/:projetoId/gantt" element={
            <PrivateRoute allowedPerfis={PERFIS_GANTT}>
              <CronogramaGantt />
            </PrivateRoute>
          } />

          {/* Pedidos legados — mantidos para compatibilidade */}
          <Route path="/projeto/:projetoId/pedidos" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <PedidosCompra />
            </PrivateRoute>
          } />
          {/* Novo módulo de Requisições multi-itens */}
          <Route path="/projeto/:projetoId/compras" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <Requisicoes />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/compras/:id" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <RequisicaoDetalhe />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/compras/kanban" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <RequisicaoKanban />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/compras/status/:statusItem" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <ComprasStatusList />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/compras/finalizadas" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <CotacoesFinalizadas />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/compras/negadas" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <CotacoesNegadas />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/compras/fornecedores" element={
            <PrivateRoute allowedPerfis={PERFIS_GESTORES_ADM}>
              <Fornecedores />
            </PrivateRoute>
          } />
          {/* FINANCEIRO DESATIVADO
          <Route path="/projeto/:projetoId/financeiro" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <FinanceiroFluxoCaixa />
            </PrivateRoute>
          } />
          */}
          <Route path="/projeto/:projetoId/rdo/:rdoId" element={
            <PrivateRoute allowedPerfis={PERFIS_RDO}>
              <RDODetalhes />
            </PrivateRoute>
          } />
          {/* Alias para evitar erro de rota ao acessar detalhes via /rdos/:rdoId */}
          <Route path="/projeto/:projetoId/rdos" element={
            <PrivateRoute allowedPerfis={PERFIS_RDO}>
              <RDOs />
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
          <Route path="/projeto/:projetoId/email-dashboard" element={
            <PrivateRoute>
              <EmailDashboard />
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



          <Route path="/compras/kanban" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <RequisicaoKanban />
            </PrivateRoute>
          } />
          <Route path="/compras/finalizadas" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <CotacoesFinalizadas />
            </PrivateRoute>
          } />
          <Route path="/compras/negadas" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <CotacoesNegadas />
            </PrivateRoute>
          } />
          <Route path="/compras/:id" element={
            <PrivateRoute allowedPerfis={PERFIS_COMPRAS}>
              <RequisicaoDetalhe />
            </PrivateRoute>
          } />
          <Route path="/fornecedores" element={
            <PrivateRoute allowedPerfis={PERFIS_GESTORES_ADM}>
              <Fornecedores />
            </PrivateRoute>
          } />
          {/* Rotas globais para navegação lateral */}
          <Route path="/rdos" element={<ProjetoSelector destino="rdos" />} />
          <Route path="/eap" element={<ProjetoSelector destino="eap" />} />
          <Route path="/planejamento" element={<ProjetoSelector destino="planejamento" />} />
          <Route path="/curva-s" element={<ProjetoSelector destino="curva-s" />} />
          <Route path="/gantt" element={<ProjetoSelector destino="gantt" />} />
          <Route path="/rnc" element={<ProjetoSelector destino="rnc" />} />
          <Route path="/compras" element={<PrivateRoute allowedPerfis={PERFIS_COMPRAS}><ComprasGlobal /></PrivateRoute>} />
          <Route path="/compras/status/:statusSlug" element={<PrivateRoute allowedPerfis={PERFIS_COMPRAS}><ComprasStatusList /></PrivateRoute>} />
          {/* FINANCEIRO DESATIVADO: <Route path="/financeiro" element={<ProjetoSelector destino="financeiro" />} /> */}
          <Route path="/ativos" element={<ProjetoSelector destino="almoxarifado" />} />
          {/* Email Dashboard */}
          <Route path="/email-dashboard" element={<PrivateRoute><EmailDashboard /></PrivateRoute>} />
          <Route path="/" element={<Navigate to="/projetos" replace />} />
                </Routes>
                <NotificationContainer />
              </BrowserRouter>
            </DialogProvider>
          </LeaveGuardProvider>
        </UserPreferencesProvider>
      </AuthProvider>
    </NotificationProvider>
  </React.StrictMode>
);
