import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);
const APP_VERSION = '2';

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem('app_version') !== APP_VERSION) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        localStorage.setItem('app_version', APP_VERSION);
        setLoading(false);
        return;
      }
      const token = localStorage.getItem('token');
      const usuarioStorage = localStorage.getItem('usuario');
      
      if (token && usuarioStorage) {
        setUsuario(JSON.parse(usuarioStorage));
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
      // Limpar dados corrompidos
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
    }
    setLoading(false);
  }, []);

  const loginAuth = (token, dadosUsuario) => {
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(dadosUsuario));
    localStorage.setItem('app_version', APP_VERSION);
    setUsuario(dadosUsuario);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  };

  const atualizarUsuarioLogado = (dadosAtualizados) => {
    const novosDados = { ...usuario, ...dadosAtualizados };
    localStorage.setItem('usuario', JSON.stringify(novosDados));
    setUsuario(novosDados);
  };
  const perfil = usuario?.perfil || null;
  const isGestor = perfil === 'Gestor Geral' || perfil === 'Gestor da Obra' || perfil === 'Gestor Local';
  const isAdm = perfil === 'ADM' || usuario?.is_adm === 1;

  return (
    <AuthContext.Provider value={{ usuario, loading, loginAuth, logout, atualizarUsuarioLogado, isGestor, isAdm, perfil }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
