import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projetos from './pages/Projetos';
import ProjetoDetalhes from './pages/ProjetoDetalhes';
import EAP from './pages/EAP';
import RDOs from './pages/RDOs';
import RDOForm from './pages/RDOForm';
import Usuarios from './pages/Usuarios';
import RNC from './pages/RNC';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />
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
          <Route path="/projeto/:projetoId/rdos" element={
            <PrivateRoute>
              <RDOs />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdos/novo" element={
            <PrivateRoute>
              <RDOForm />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rdos/:rdoId/editar" element={
            <PrivateRoute>
              <RDOForm />
            </PrivateRoute>
          } />
          <Route path="/usuarios" element={
            <PrivateRoute>
              <Usuarios />
            </PrivateRoute>
          } />
          <Route path="/projeto/:projetoId/rnc" element={
            <PrivateRoute>
              <RNC />
            </PrivateRoute>
          } />
          <Route path="/" element={<Navigate to="/projetos" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
