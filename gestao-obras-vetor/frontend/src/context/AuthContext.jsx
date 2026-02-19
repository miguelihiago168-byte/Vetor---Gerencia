import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
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
    setUsuario(dadosUsuario);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  };

  const perfil = usuario?.perfil || null;
  const isGestor = perfil === 'Gestor Geral' || perfil === 'Gestor da Obra' || perfil === 'Gestor Local' || usuario?.is_gestor === 1;
  const isAdm = perfil === 'ADM' || usuario?.is_adm === 1;

  return (
    <AuthContext.Provider value={{ usuario, loading, loginAuth, logout, isGestor, isAdm, perfil }}>
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
