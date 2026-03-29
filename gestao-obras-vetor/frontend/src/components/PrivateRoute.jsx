import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function PrivateRoute({ children, allowedPerfis }) {
  const { usuario, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!usuario) return <Navigate to="/login" />;

  const tenantValido = !!usuario?.tenant_id || (Array.isArray(usuario?.tenant_ids) && usuario.tenant_ids.length > 0);
  const usuarioVerificado = usuario?.verificado !== false;
  if (!tenantValido || !usuarioVerificado) {
    return <Navigate to="/login" replace />;
  }

  if (Array.isArray(allowedPerfis) && allowedPerfis.length > 0) {
    const perfilUsuario = usuario?.perfil;
    if (!allowedPerfis.includes(perfilUsuario)) {
      return <Navigate to="/projetos" replace />;
    }
  }

  return children;
}

export default PrivateRoute;
