import { useEffect, useState, useMemo } from 'react';
import { CheckCircle, Search, ChevronDown, ChevronRight, Fuel } from 'lucide-react';
import { getPostos, getProdutos, getTodosDescontos, setDesconto } from '../services/api';

export default function Precos() {
  const [postos, setPostos] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [descontos, setDescontos] = useState<any[]>([]);
  const [filtro, setFiltro] = useState('');
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [salvo, setSalvo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getPostos().then(setPostos).catch(() => {});
    getProdutos().then(setProdutos).catch(() => {});
    getTodosDescontos().then(setDescontos).catch(() => {});
  }, []);

  // Mapa: postoId → produtoId → valor
  const descontoMap = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const d of descontos) {
      if (!m[d.posto_id]) m[d.posto_id] = {};
      m[d.posto_id][d.produto_id] = Number(d.valor);
    }
    return m;
  }, [descontos]);

  const postosFiltrados = useMemo(() =>
    postos.filter((p) => p.nome.toLowerCase().includes(filtro.toLowerCase())),
    [postos, filtro]
  );

  function toggleCollapse(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function chave(postoId: string, produtoId: string) {
    return `${postoId}|${produtoId}`;
  }

  async function salvar(postoId: string, produtoId: string) {
    const k = chave(postoId, produtoId);
    const valor = parseFloat(editando[k] ?? '0');
    if (isNaN(valor)) return;
    await setDesconto(postoId, produtoId, valor);
    setDescontos((prev) => {
      const exists = prev.find((d) => d.posto_id === postoId && d.produto_id === produtoId);
      if (exists) {
        return prev.map((d) =>
          d.posto_id === postoId && d.produto_id === produtoId ? { ...d, valor } : d
        );
      }
      return [...prev, { posto_id: postoId, produto_id: produtoId, valor }];
    });
    setEditando((prev) => { const n = { ...prev }; delete n[k]; return n; });
    setSalvo(k);
    setTimeout(() => setSalvo(null), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Descontos de Funcionários</h1>
        <p className="text-sm text-gray-500">{postos.length} postos</p>
      </div>

      {/* Filtro */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por posto..."
          className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Postos */}
      <div className="space-y-2">
        {postosFiltrados.map((posto) => {
          const isOpen = !collapsed[posto.id];
          const descPosto = descontoMap[posto.id] ?? {};
          const comDesc = Object.values(descPosto).filter((v) => v > 0).length;

          return (
            <div key={posto.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleCollapse(posto.id)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                    : <ChevronRight className="w-4 h-4 text-gray-400" />
                  }
                  <span className="font-semibold text-white">{posto.nome}</span>
                  <span className="text-xs text-gray-500">
                    {comDesc > 0
                      ? `${comDesc} combustível${comDesc !== 1 ? 'is' : ''} com desconto`
                      : 'sem descontos configurados'}
                  </span>
                </div>
                <div className={`w-2 h-2 rounded-full ${posto.online ? 'bg-green-400' : 'bg-gray-600'}`} />
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 divide-y divide-gray-800">
                  {produtos.map((produto) => {
                    const k = chave(posto.id, produto.id);
                    const valorAtual = descPosto[produto.id] ?? 0;
                    const valorEd = editando[k];
                    const modificado = valorEd !== undefined;

                    return (
                      <div key={produto.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Fuel className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-white">{produto.nome}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {valorAtual === 0 && !modificado && (
                            <span className="text-xs text-gray-600 mr-1">sem desconto</span>
                          )}
                          <span className="text-gray-400 text-sm">R$</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={valorEd ?? valorAtual}
                            onChange={(e) =>
                              setEditando((prev) => ({ ...prev, [k]: e.target.value }))
                            }
                            className="w-24 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {modificado && (
                            <button
                              onClick={() => salvar(posto.id, produto.id)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                            >
                              Salvar
                            </button>
                          )}
                          {salvo === k && <CheckCircle className="w-4 h-4 text-green-400" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
