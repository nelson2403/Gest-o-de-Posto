import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { login as apiLogin } from '../services/api';

interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: number;
  posto_id: string | null;
}

interface AuthContextType {
  usuario: Usuario | null;
  isAdmin: boolean;
  isGerente: boolean;
  fazer_login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  useEffect(() => {
    const salvo = localStorage.getItem('usuario');
    if (salvo) setUsuario(JSON.parse(salvo));
  }, []);

  async function fazer_login(email: string, senha: string) {
    const res = await apiLogin(email, senha);
    localStorage.setItem('token', res.access_token);
    localStorage.setItem('usuario', JSON.stringify(res.usuario));
    setUsuario(res.usuario);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{
      usuario,
      isAdmin: (usuario?.role ?? -1) >= 2,
      isGerente: (usuario?.role ?? -1) >= 1,
      fazer_login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
