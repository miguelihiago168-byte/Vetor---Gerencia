import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LeaveGuardProvider } from './context/LeaveGuardContext';
import PrivateRoute from './components/PrivateRoute';
import NotificationContainer from './components/NotificationContainer';
import Login from './pages/Login';
// Dashboard removido como página inicial; manter rota para compatibilidade opcional
import Dashboard from './pages/Dashboard';
import Projetos from './pages/Projetos';
import ProjetoDetalhes from './pages/ProjetoDetalhes';
import PedidosCompra from './pages/PedidosCompra';
import EAP from './pages/EAP';
import EAPForm from './pages/EAPForm';
import RDOs from './pages/RDOs';
import RDODetalhes from './pages/RDODetalhes';
import RDOForm2 from './pages/RDOForm2';
import Usuarios from './pages/Usuarios';
import RNC from './pages/RNC';
import RNCForm from './pages/RNCForm';
import RNCDetalhes from './pages/RNCDetalhes';
import UsuariosDeleted from './pages/UsuariosDeleted';
import ProjetoSelector from './pages/ProjetoSelector';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <NotificationProvider>
      <AuthProvider>
        <LeaveGuardProvider>
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
            <PrivateRoute>
              <EAP />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/eap/novo" element={
            <PrivateRoute>
              <EAPForm />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/eap/:atividadeId" element={
            <PrivateRoute>
              <EAPForm />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdos" element={
            <PrivateRoute>
              <RDOs />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/pedidos" element={
            <PrivateRoute>
              <PedidosCompra />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdo/:rdoId" element={
            <PrivateRoute>
              <RDODetalhes />
            </PrivateRoute>
          } />
          {/* Alias para evitar erro de rota ao acessar detalhes via /rdos/:rdoId */}
          <Route path="/projeto/:projetoId/rdos/:rdoId" element={
            <PrivateRoute>
              <RDODetalhes />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdos/novo" element={
            <PrivateRoute>
              <RDOForm2 />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdos/:rdoId/editar" element={
            <PrivateRoute>
              <RDOForm2 />
            </PrivateRoute>
          } />
          <Route path="/usuarios" element={
            <PrivateRoute>
              <Usuarios />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/usuarios" element={
            <PrivateRoute>
              <Usuarios />
            </PrivateRoute>
          } />
          <Route path="/usuarios-deleted" element={
            <PrivateRoute>
              <UsuariosDeleted />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rnc" element={
            <PrivateRoute>
              <RNC />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rnc/novo" element={
            <PrivateRoute>
              <RNCForm />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rnc/:rncId" element={
            <PrivateRoute>
              <RNCDetalhes />
            </PrivateRoute>
          } />

          {/* Rotas globais para navegação lateral */}
          <Route path="/rdos" element={<ProjetoSelector destino="rdos" />} />
          <Route path="/eap" element={<ProjetoSelector destino="eap" />} />
          <Route path="/rnc" element={<ProjetoSelector destino="rnc" />} />

           <Route path="/" element={<Navigate to="/projetos" replace />} />
        </Routes>
        <NotificationContainer />
      </BrowserRouter>
    </LeaveGuardProvider>
    </AuthProvider>
  </NotificationProvider>
  </React.StrictMode>
);
