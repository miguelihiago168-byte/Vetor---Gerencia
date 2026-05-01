import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);
const APP_VERSION = '3';

// Helper: pega o storage onde o token foi salvo (localStorage tem prioridade)
const getStorage = () => {
  if (localStorage.getItem('token')) return localStorage;
  if (sessionStorage.getItem('token')) return sessionStorage;
  return null;
};

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      // Verifica app_version apenas no localStorage
      if (localStorage.getItem('app_version') !== APP_VERSION) {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('usuario');
        localStorage.setItem('app_version', APP_VERSION);
        setLoading(false);
        return;
      }
      const storage = getStorage();
      const token = storage?.getItem('token');
      const usuarioStorage = storage?.getItem('usuario');
      
      if (token && usuarioStorage) {
        setUsuario(JSON.parse(usuarioStorage));
      }
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('usuario');
    }
    setLoading(false);
  }, []);

  const loginAuth = (token, dadosUsuario, manterLogin = true) => {
    const storage = manterLogin ? localStorage : sessionStorage;
    // Limpa o outro storage para evitar conflito
    if (manterLogin) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('usuario');
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
    }
    storage.setItem('token', token);
    storage.setItem('usuario', JSON.stringify(dadosUsuario));
    localStorage.setItem('app_version', APP_VERSION);
    setUsuario(dadosUsuario);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('usuario');
    setUsuario(null);
  };

  const atualizarUsuarioLogado = (dadosAtualizados) => {
    const novosDados = { ...usuario, ...dadosAtualizados };
    const storage = getStorage() || localStorage;
    storage.setItem('usuario', JSON.stringify(novosDados));
    setUsuario(novosDados);
  };

  const primeiroAcessoPendente = usuario?.primeiro_acesso_pendente === true;
  const perfil = usuario?.perfil || null;
  const isGestor = perfil === 'Gestor Geral' || perfil === 'Gestor da Obra' || perfil === 'Gestor Local';
  const isAdm = perfil === 'ADM' || usuario?.is_adm === 1;

  return (
    <AuthContext.Provider value={{ usuario, loading, loginAuth, logout, atualizarUsuarioLogado, isGestor, isAdm, perfil, primeiroAcessoPendente }}>
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
