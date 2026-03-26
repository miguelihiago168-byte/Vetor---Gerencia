import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
} from 'react';
import { storage } from '../utils/storage';
import { APP_VERSION, PERFIS_GESTOR } from '../utils/constants';
import { setLogoutCallback } from '../services/api';

interface Usuario {
  id: number;
  nome: string;
  login: string;
  perfil: string;
  is_gestor?: number;
  is_adm?: number;
  [key: string]: unknown;
}

interface AuthContextType {
  usuario: Usuario | null;
  loading: boolean;
  loginAuth: (token: string, dadosUsuario: Usuario) => Promise<void>;
  logout: () => Promise<void>;
  atualizarUsuarioLogado: (dados: Partial<Usuario>) => Promise<void>;
  isGestor: boolean;
  isAdm: boolean;
  perfil: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    await storage.clearAll();
    setUsuario(null);
  }, []);

  useEffect(() => {
    setLogoutCallback(logout);
  }, [logout]);

  useEffect(() => {
    (async () => {
      try {
        const version = await storage.getAppVersion();
        if (version !== APP_VERSION) {
          await storage.clearAll();
          await storage.setAppVersion();
          setLoading(false);
          return;
        }
        const token = await storage.getToken();
        const usuarioSalvo = await storage.getUsuario();
        if (token && usuarioSalvo) {
          setUsuario(usuarioSalvo as Usuario);
        }
      } catch {
        await storage.clearAll();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loginAuth = async (token: string, dadosUsuario: Usuario) => {
    await storage.setToken(token);
    await storage.setUsuario(dadosUsuario as unknown as Record<string, unknown>);
    await storage.setAppVersion();
    setUsuario(dadosUsuario);
  };

  const atualizarUsuarioLogado = async (dados: Partial<Usuario>) => {
    const novosDados = { ...usuario, ...dados } as Usuario;
    await storage.setUsuario(novosDados as unknown as Record<string, unknown>);
    setUsuario(novosDados);
  };

  const perfil = usuario?.perfil ?? null;
  const isGestor = perfil !== null && PERFIS_GESTOR.includes(perfil);
  const isAdm = perfil === 'ADM' || usuario?.is_adm === 1;

  return (
    <AuthContext.Provider
      value={{
        usuario,
        loading,
        loginAuth,
        logout,
        atualizarUsuarioLogado,
        isGestor,
        isAdm,
        perfil,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
