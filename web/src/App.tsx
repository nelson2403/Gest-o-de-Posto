import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, CreditCard, Fuel, LogOut, Users, ClipboardList, Gauge, BarChart3 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Cartoes from './pages/Cartoes';
import Precos from './pages/Precos';
import PrecoBomba from './pages/PrecoBomba';
import Postos from './pages/Postos';
import Usuarios from './pages/Usuarios';
import Relatorios from './pages/Relatorios';

function Layout({ children }: { children: React.ReactNode }) {
  const { usuario, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Sidebar */}
      <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-6 border-b border-gray-800">
          <h1 className="text-white font-bold text-base leading-tight">Cartão de Desconto</h1>
          <p className="text-gray-500 text-xs mt-0.5">{usuario?.nome}</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/" end className={navClass}>
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </NavLink>
          <NavLink to="/cartoes" className={navClass}>
            <CreditCard className="w-4 h-4" /> Cartões
          </NavLink>
          <NavLink to="/precos" className={navClass}>
            <Fuel className="w-4 h-4" /> Descontos
          </NavLink>
          <NavLink to="/bombas" className={navClass}>
            <Gauge className="w-4 h-4" /> Preços da Bomba
          </NavLink>
          <NavLink to="/relatorios" className={navClass}>
            <BarChart3 className="w-4 h-4" /> Relatórios
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/postos" className={navClass}>
                <ClipboardList className="w-4 h-4" /> Postos
              </NavLink>
              <NavLink to="/usuarios" className={navClass}>
                <Users className="w-4 h-4" /> Usuários
              </NavLink>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 w-full text-left text-gray-400 hover:text-red-400 text-sm rounded-lg hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/cartoes" element={<PrivateRoute><Cartoes /></PrivateRoute>} />
      <Route path="/precos" element={<PrivateRoute><Precos /></PrivateRoute>} />
      <Route path="/bombas" element={<PrivateRoute><PrecoBomba /></PrivateRoute>} />
      <Route path="/relatorios" element={<PrivateRoute><Relatorios /></PrivateRoute>} />
      <Route path="/postos" element={<PrivateRoute><Postos /></PrivateRoute>} />
      <Route path="/usuarios" element={<PrivateRoute><Usuarios /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
