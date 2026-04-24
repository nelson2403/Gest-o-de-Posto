import { useEffect, useState, useMemo } from 'react';
import { CheckCircle, Search, ChevronDown, ChevronRight, Fuel } from 'lucide-react';
import { getPostos, getProdutos, getTodosBicos, setDescontosNivel } from '../services/api';

export default function Precos() {
  const [postos, setPostos] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [bicos, setBicos] = useState<any[]>([]);
  const [filtro, setFiltro] = useState('');
  const [editando, setEditando] = useState<Record<string, { n1: string; n2: string }>>({});
  const [salvo, setSalvo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getPostos().then(setPostos).catch(() => {});
    getProdutos().then(setProdutos).catch(() => {});
    getTodosBicos().then(setBicos).catch(() => {});
  }, []);

  // Mapa: postoId → produtoId → { n1, n2 }
  const descontoMap = useMemo(() => {
    const m: Record<string, Record<string, { n1: number; n2: number }>> = {};
    for (const b of bicos) {
      if (!m[b.posto_id]) m[b.posto_id] = {};
      if (!m[b.posto_id][b.produto_id]) {
        m[b.posto_id][b.produto_id] = {
          n1: Number(b.desconto_nivel1 ?? 0),
          n2: Number(b.desconto_nivel2 ?? 0),
        };
      }
    }
    return m;
  }, [bicos]);

  const produtosPorPosto = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const b of bicos) {
      if (!m[b.posto_id]) m[b.posto_id] = new Set();
      m[b.posto_id].add(b.produto_id);
    }
    return m;
  }, [bicos]);

  const postosFiltrados = useMemo(() =>
    postos.filter((p) => p.nome.toLowerCase().includes(filtro.toLowerCase())),
    [postos, filtro],
  );

  function chave(postoId: string, produtoId: string) {
    return `${postoId}|${produtoId}`;
  }

  function setEd(postoId: string, produtoId: string, campo: 'n1' | 'n2', valor: string) {
    const k = chave(postoId, produtoId);
    const atual = descontoMap[postoId]?.[produtoId] ?? { n1: 0, n2: 0 };
    setEditando((prev) => ({
      ...prev,
      [k]: { n1: prev[k]?.n1 ?? String(atual.n1), n2: prev[k]?.n2 ?? String(atual.n2), [campo]: valor },
    }));
  }

  async function salvar(postoId: string, produtoId: string) {
    const k = chave(postoId, produtoId);
    const ed = editando[k];
    if (!ed) return;
    const n1 = parseFloat(ed.n1);
    const n2 = parseFloat(ed.n2);
    if (isNaN(n1) || isNaN(n2)) return;
    await setDescontosNivel(postoId, produtoId, n1, n2);
    setBicos((prev) =>
      prev.map((b) =>
        b.posto_id === postoId && b.produto_id === produtoId
          ? { ...b, desconto_nivel1: n1, desconto_nivel2: n2 }
          : b,
      ),
    );
    setEditando((prev) => { const n = { ...prev }; delete n[k]; return n; });
    setSalvo(k);
    setTimeout(() => setSalvo(null), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Descontos por Nível</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Nível 1 e Nível 2 definem o desconto que cada cartão recebe conforme seu nível.
          </p>
        </div>
        <p className="text-sm text-gray-500">{postos.length} postos</p>
      </div>

      {/* Legenda */}
      <div className="flex gap-3">
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-400">Nível 1</span>
          <span className="text-xs text-gray-400">Desconto padrão dos funcionários</span>
        </div>
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-400">Nível 2</span>
          <span className="text-xs text-gray-400">Desconto especial / gerência</span>
        </div>
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
          const produtosAtivos = produtosPorPosto[posto.id] ?? new Set();
          const descPosto = descontoMap[posto.id] ?? {};
          const comDesc = Object.values(descPosto).filter((d) => d.n1 > 0 || d.n2 > 0).length;

          return (
            <div key={posto.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setCollapsed((p) => ({ ...p, [posto.id]: !p[posto.id] }))}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                    : <ChevronRight className="w-4 h-4 text-gray-400" />}
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
                <div className="border-t border-gray-800">
                  <div className="grid grid-cols-[1fr_156px_156px_90px] gap-3 px-5 py-2 bg-gray-800/30 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    <span>Combustível</span>
                    <span className="text-center text-blue-400">Nível 1 (R$)</span>
                    <span className="text-center text-purple-400">Nível 2 (R$)</span>
                    <span />
                  </div>

                  <div className="divide-y divide-gray-800">
                    {produtos
                      .filter((pr) => produtosAtivos.has(pr.id))
                      .map((produto) => {
                        const atual = descPosto[produto.id] ?? { n1: 0, n2: 0 };
                        const k = chave(posto.id, produto.id);
                        const ed = editando[k];
                        const modificado = ed !== undefined;

                        return (
                          <div key={produto.id} className="grid grid-cols-[1fr_156px_156px_90px] gap-3 items-center px-5 py-3">
                            <div className="flex items-center gap-2">
                              <Fuel className="w-4 h-4 text-gray-500" />
                              <span className="text-sm text-white">{produto.nome}</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-gray-500 text-xs">R$</span>
                              <input
                                type="number" step="0.001" min="0"
                                value={ed?.n1 ?? atual.n1}
                                onChange={(e) => setEd(posto.id, produto.id, 'n1', e.target.value)}
                                className="w-full px-2 py-1.5 bg-gray-800 border border-blue-900/60 rounded-lg text-white text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-gray-500 text-xs">R$</span>
                              <input
                                type="number" step="0.001" min="0"
                                value={ed?.n2 ?? atual.n2}
                                onChange={(e) => setEd(posto.id, produto.id, 'n2', e.target.value)}
                                className="w-full px-2 py-1.5 bg-gray-800 border border-purple-900/60 rounded-lg text-white text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-1">
                              {modificado && (
                                <button
                                  onClick={() => salvar(posto.id, produto.id)}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                                >
                                  Salvar
                                </button>
                              )}
                              {salvo === k && <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />}
                            </div>
                          </div>
                        );
                      })}

                    {produtosAtivos.size === 0 && (
                      <p className="px-5 py-4 text-sm text-gray-600">Nenhum bico cadastrado para este posto.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
