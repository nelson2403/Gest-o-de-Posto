import { useEffect, useState } from 'react';
import { Wifi, WifiOff, CreditCard, Fuel } from 'lucide-react';
import { getPostos, getCartoes } from '../services/api';

interface Posto {
  id: string;
  nome: string;
  online: boolean;
  forecourt_ip: string;
}

export default function Dashboard() {
  const [postos, setPostos] = useState<Posto[]>([]);
  const [totalCartoes, setTotalCartoes] = useState(0);
  const [cartoesAtivos, setCartoesAtivos] = useState(0);

  useEffect(() => {
    getPostos().then(setPostos);
    getCartoes().then((cartoes) => {
      setTotalCartoes(cartoes.length);
      setCartoesAtivos(cartoes.filter((c: any) => c.ativo).length);
    });

    const interval = setInterval(() => getPostos().then(setPostos), 15000);
    return () => clearInterval(interval);
  }, []);

  const postosOnline = postos.filter((p) => p.online).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Fuel className="w-6 h-6 text-blue-400" />}
          label="Total de Postos"
          value={postos.length}
          bg="bg-blue-900/30 border-blue-800"
        />
        <StatCard
          icon={<Wifi className="w-6 h-6 text-green-400" />}
          label="Postos Online"
          value={postosOnline}
          bg="bg-green-900/30 border-green-800"
        />
        <StatCard
          icon={<CreditCard className="w-6 h-6 text-purple-400" />}
          label="Cartões Ativos"
          value={cartoesAtivos}
          bg="bg-purple-900/30 border-purple-800"
        />
        <StatCard
          icon={<CreditCard className="w-6 h-6 text-gray-400" />}
          label="Total de Cartões"
          value={totalCartoes}
          bg="bg-gray-800/50 border-gray-700"
        />
      </div>

      {/* Status dos postos */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-3">Status dos Postos</h2>
        <div className="grid gap-3">
          {postos.map((posto) => (
            <div
              key={posto.id}
              className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-5 py-4"
            >
              <div>
                <p className="font-medium text-white">{posto.nome}</p>
                <p className="text-sm text-gray-400">{posto.forecourt_ip || 'IP não configurado'}</p>
              </div>
              <div className={`flex items-center gap-2 text-sm font-medium ${posto.online ? 'text-green-400' : 'text-red-400'}`}>
                {posto.online ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                {posto.online ? 'Online' : 'Offline'}
              </div>
            </div>
          ))}
          {postos.length === 0 && (
            <p className="text-gray-500 text-sm">Nenhum posto cadastrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, bg }: any) {
  return (
    <div className={`rounded-xl border p-5 ${bg}`}>
      <div className="flex items-center gap-3 mb-2">{icon}<span className="text-sm text-gray-300">{label}</span></div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
