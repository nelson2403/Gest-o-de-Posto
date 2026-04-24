import { useEffect, useState, useMemo, useCallback } from 'react';
import { CheckCircle, Gauge, Fuel, Search, ChevronDown, ChevronRight, Layers, List } from 'lucide-react';
import { getPostos, getProdutos, getTodosBicos, updatePrecoBase } from '../services/api';

// ─── Aba 1: por posto (visão individual) ────────────────────────────────────

function AbaIndividual({
  postos, produtos, bicos,
}: { postos: any[]; produtos: any[]; bicos: any[] }) {
  const [filtro, setFiltro] = useState('');
  const [editando, setEditando] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [bicosState, setBicosState] = useState<any[]>(bicos);

  useEffect(() => { setBicosState(bicos); }, [bicos]);

  const bicosPorPosto = useMemo(() => {
    const m: Record<string, Record<string, any[]>> = {};
    for (const b of bicosState) {
      if (!m[b.posto_id]) m[b.posto_id] = {};
      if (!m[b.posto_id][b.produto_id]) m[b.posto_id][b.produto_id] = [];
      m[b.posto_id][b.produto_id].push(b);
    }
    return m;
  }, [bicosState]);

  const postosFiltrados = useMemo(() =>
    postos.filter((p) => p.nome.toLowerCase().includes(filtro.toLowerCase())),
    [postos, filtro]
  );

  async function salvar(bico: any) {
    const novoPreco = parseFloat(editando[bico.id] ?? '');
    if (isNaN(novoPreco) || novoPreco <= 0) return;
    setSalvando(bico.id);
    try {
      await updatePrecoBase(bico.id, novoPreco);
      setBicosState((prev) => prev.map((b) => b.id === bico.id ? { ...b, preco_base: novoPreco } : b));
      setEditando((prev) => { const n = { ...prev }; delete n[bico.id]; return n; });
      setSalvo(bico.id);
      setTimeout(() => setSalvo(null), 2000);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
        <input
          type="text" value={filtro} onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por posto..."
          className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {postosFiltrados.map((posto) => {
        const isOpen = !collapsed[posto.id];
        const gruposProd = bicosPorPosto[posto.id] ?? {};
        const totalBicos = Object.values(gruposProd).flat().length;

        return (
          <div key={posto.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setCollapsed((p) => ({ ...p, [posto.id]: !p[posto.id] }))}
              className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                <span className="font-semibold text-white">{posto.nome}</span>
                <span className="text-xs text-gray-500">{totalBicos} bico{totalBicos !== 1 ? 's' : ''}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${posto.online ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                {posto.online ? 'Online' : 'Offline'}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-gray-800">
                {totalBicos === 0 && <p className="px-5 py-4 text-sm text-gray-500">Nenhum bico cadastrado.</p>}
                {produtos.filter((pr) => gruposProd[pr.id]?.length > 0).map((produto) => {
                  const bicosProd = (gruposProd[produto.id] ?? []).sort((a, b) => a.bico_forecourt - b.bico_forecourt);
                  return (
                    <div key={produto.id} className="border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-2 px-5 py-2 bg-gray-800/30">
                        <Fuel className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-medium text-white">{produto.nome}</span>
                      </div>
                      {bicosProd.map((bico) => {
                        const precoBase = Number(bico.preco_base);
                        const n1 = Number(bico.desconto_nivel1 ?? 0);
                        const n2 = Number(bico.desconto_nivel2 ?? 0);
                        const precoN1 = n1 > 0 ? precoBase - n1 : null;
                        const precoN2 = n2 > 0 ? precoBase - n2 : null;
                        const valorEd = editando[bico.id];
                        const modificado = valorEd !== undefined;
                        return (
                          <div key={bico.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-800/20">
                            <div className="flex items-center gap-2 w-24 flex-shrink-0">
                              <Gauge className="w-3.5 h-3.5 text-gray-500" />
                              <span className="text-sm text-gray-300">Bico {bico.bico_forecourt}</span>
                            </div>
                            <div className="flex items-center gap-5 flex-1 px-4">
                              <div>
                                <p className="text-xs text-gray-500">Tabela</p>
                                <p className="text-base font-mono font-bold text-white">R$ {precoBase.toFixed(3)}</p>
                              </div>
                              {precoN1 !== null && (
                                <div>
                                  <p className="text-xs text-blue-400">Nível 1</p>
                                  <p className="text-base font-mono font-semibold text-blue-300">R$ {precoN1.toFixed(3)}</p>
                                </div>
                              )}
                              {precoN2 !== null && (
                                <div>
                                  <p className="text-xs text-purple-400">Nível 2</p>
                                  <p className="text-base font-mono font-semibold text-purple-300">R$ {precoN2.toFixed(3)}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-gray-500 text-xs">R$</span>
                              <input
                                type="number" step="0.001" min="0.001"
                                value={valorEd ?? precoBase}
                                onChange={(e) => setEditando((prev) => ({ ...prev, [bico.id]: e.target.value }))}
                                className="w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              {modificado && (
                                <button onClick={() => salvar(bico)} disabled={salvando === bico.id}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                                  {salvando === bico.id ? '...' : 'Salvar'}
                                </button>
                              )}
                              {salvo === bico.id && <CheckCircle className="w-4 h-4 text-green-400" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Aba 2: atualização em lote ──────────────────────────────────────────────

function AbaLote({
  postos, produtos, bicos: bicosOrig,
}: { postos: any[]; produtos: any[]; bicos: any[] }) {
  const [produtoId, setProdutoId] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [novoPreco, setNovoPreco] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; total: number } | null>(null);
  const [bicos, setBicos] = useState<any[]>(bicosOrig);

  useEffect(() => { setBicos(bicosOrig); }, [bicosOrig]);
  useEffect(() => { setSelecionados(new Set()); setNovoPreco(''); setResultado(null); }, [produtoId]);

  const postoById = useMemo(() => Object.fromEntries(postos.map((p) => [p.id, p])), [postos]);

  // Bicos do produto selecionado, agrupados por preço atual, um bico por posto
  // (usamos só o primeiro bico do posto naquele produto para definir o preço representativo)
  const gruposPorPreco = useMemo(() => {
    if (!produtoId) return [];
    const bicosProd = bicos.filter((b) => b.produto_id === produtoId);

    // Um representante por posto: menor bico_forecourt
    const porPosto: Record<string, any> = {};
    for (const b of bicosProd) {
      if (!porPosto[b.posto_id] || b.bico_forecourt < porPosto[b.posto_id].bico_forecourt) {
        porPosto[b.posto_id] = b;
      }
    }

    // Todos os bicos do posto+produto (para atualizar todos juntos)
    const todosPorPosto: Record<string, any[]> = {};
    for (const b of bicosProd) {
      if (!todosPorPosto[b.posto_id]) todosPorPosto[b.posto_id] = [];
      todosPorPosto[b.posto_id].push(b);
    }

    // Agrupar representantes pelo preço atual
    const grupos: Record<string, { preco: number; postos: Array<{ postoId: string; bicos: any[] }> }> = {};
    for (const [postoId, bico] of Object.entries(porPosto)) {
      const preco = Number(bico.preco_base).toFixed(3);
      if (!grupos[preco]) grupos[preco] = { preco: Number(preco), postos: [] };
      grupos[preco].postos.push({ postoId, bicos: todosPorPosto[postoId] ?? [] });
    }

    return Object.values(grupos).sort((a, b) => a.preco - b.preco);
  }, [produtoId, bicos]);

  function togglePosto(postoId: string) {
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (n.has(postoId)) n.delete(postoId); else n.add(postoId);
      return n;
    });
  }

  function toggleGrupo(grupo: typeof gruposPorPreco[number]) {
    const ids = grupo.postos.map((p) => p.postoId);
    const todosSelecionados = ids.every((id) => selecionados.has(id));
    setSelecionados((prev) => {
      const n = new Set(prev);
      if (todosSelecionados) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  }

  function selecionarTodos() {
    const todos = gruposPorPreco.flatMap((g) => g.postos.map((p) => p.postoId));
    setSelecionados((prev) =>
      prev.size === todos.length ? new Set() : new Set(todos)
    );
  }

  async function aplicar() {
    const preco = parseFloat(novoPreco);
    if (isNaN(preco) || preco <= 0 || selecionados.size === 0) return;
    setAplicando(true);
    setResultado(null);

    // Todos os bicos dos postos selecionados para o produto escolhido
    const bicosParaAtualizar = gruposPorPreco
      .flatMap((g) => g.postos)
      .filter((p) => selecionados.has(p.postoId))
      .flatMap((p) => p.bicos);

    let ok = 0;
    await Promise.all(
      bicosParaAtualizar.map(async (bico) => {
        try {
          await updatePrecoBase(bico.id, preco);
          setBicos((prev) => prev.map((b) => b.id === bico.id ? { ...b, preco_base: preco } : b));
          ok++;
        } catch {}
      })
    );

    setResultado({ ok, total: bicosParaAtualizar.length });
    setAplicando(false);
    setSelecionados(new Set());
    setNovoPreco('');
  }

  const totalSelecionados = selecionados.size;
  const totalPostos = gruposPorPreco.flatMap((g) => g.postos).length;

  return (
    <div className="space-y-5">
      {/* Seletor de combustível */}
      <div className="max-w-xs">
        <label className="block text-sm font-medium text-gray-300 mb-1">Combustível</label>
        <select
          value={produtoId}
          onChange={(e) => setProdutoId(e.target.value)}
          className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Selecione o combustível...</option>
          {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>

      {produtoId && gruposPorPreco.length === 0 && (
        <p className="text-gray-500 text-sm">Nenhum posto possui bicos para este combustível.</p>
      )}

      {produtoId && gruposPorPreco.length > 0 && (
        <>
          {/* Barra de ação */}
          <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-5 py-3">
            <div className="flex items-center gap-4">
              <button
                onClick={selecionarTodos}
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                {totalSelecionados === totalPostos ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
              {totalSelecionados > 0 && (
                <span className="text-sm text-gray-400">
                  {totalSelecionados} posto{totalSelecionados !== 1 ? 's' : ''} selecionado{totalSelecionados !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {totalSelecionados > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">Novo preço: R$</span>
                <input
                  type="number" step="0.001" min="0.001"
                  value={novoPreco}
                  onChange={(e) => setNovoPreco(e.target.value)}
                  placeholder="0.000"
                  className="w-28 px-3 py-1.5 bg-gray-800 border border-blue-600 rounded-lg text-white text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={aplicar}
                  disabled={aplicando || !novoPreco}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {aplicando ? 'Aplicando...' : `Aplicar para ${totalSelecionados} posto${totalSelecionados !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>

          {resultado && (
            <div className="flex items-center gap-2 bg-green-900/30 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">
              <CheckCircle className="w-4 h-4" />
              {resultado.ok} de {resultado.total} bico{resultado.total !== 1 ? 's' : ''} atualizado{resultado.total !== 1 ? 's' : ''} com sucesso.
              O serviço Python enviará os novos preços ao concentrador em até 10s.
            </div>
          )}

          {/* Grupos por preço */}
          <div className="space-y-3">
            {gruposPorPreco.map((grupo) => {
              const ids = grupo.postos.map((p) => p.postoId);
              const todosMarcados = ids.every((id) => selecionados.has(id));
              const algunsMarcados = ids.some((id) => selecionados.has(id));

              return (
                <div key={grupo.preco} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  {/* Cabeçalho do grupo de preço */}
                  <div className="flex items-center gap-3 px-5 py-3 bg-gray-800/50 border-b border-gray-800">
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      ref={(el) => { if (el) el.indeterminate = algunsMarcados && !todosMarcados; }}
                      onChange={() => toggleGrupo(grupo)}
                      className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                    />
                    <Fuel className="w-4 h-4 text-blue-400" />
                    <span className="font-mono text-lg font-bold text-white">R$ {grupo.preco.toFixed(3)}</span>
                    <span className="text-xs text-gray-500">
                      — {grupo.postos.length} posto{grupo.postos.length !== 1 ? 's' : ''} com este preço
                    </span>
                    <button
                      onClick={() => toggleGrupo(grupo)}
                      className="ml-auto text-xs text-blue-400 hover:text-blue-300"
                    >
                      {todosMarcados ? 'Desmarcar grupo' : 'Selecionar grupo'}
                    </button>
                  </div>

                  {/* Postos do grupo */}
                  <div className="divide-y divide-gray-800">
                    {grupo.postos
                      .sort((a, b) => (postoById[a.postoId]?.nome ?? '').localeCompare(postoById[b.postoId]?.nome ?? ''))
                      .map(({ postoId, bicos: bicosPosto }) => {
                        const posto = postoById[postoId];
                        const marcado = selecionados.has(postoId);
                        return (
                          <label
                            key={postoId}
                            className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${marcado ? 'bg-blue-900/10' : 'hover:bg-gray-800/30'}`}
                          >
                            <input
                              type="checkbox" checked={marcado}
                              onChange={() => togglePosto(postoId)}
                              className="w-4 h-4 rounded accent-blue-500"
                            />
                            <div className="flex items-center gap-2 flex-1">
                              <div className={`w-1.5 h-1.5 rounded-full ${posto?.online ? 'bg-green-400' : 'bg-gray-600'}`} />
                              <span className={`text-sm font-medium ${marcado ? 'text-white' : 'text-gray-300'}`}>
                                {posto?.nome ?? postoId}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {bicosPosto.length} bico{bicosPosto.length !== 1 ? 's' : ''}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function PrecoBomba() {
  const [postos, setPostos] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [bicos, setBicos] = useState<any[]>([]);
  const [aba, setAba] = useState<'individual' | 'lote'>('individual');

  useEffect(() => {
    getPostos().then(setPostos).catch(() => {});
    getProdutos().then(setProdutos).catch(() => {});
    getTodosBicos().then(setBicos).catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Preços da Bomba</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Alterações são enviadas ao concentrador Horus em até 10 segundos.
        </p>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setAba('individual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'individual' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <List className="w-4 h-4" /> Por Posto
        </button>
        <button
          onClick={() => setAba('lote')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${aba === 'lote' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          <Layers className="w-4 h-4" /> Atualização em Lote
        </button>
      </div>

      {aba === 'individual' && (
        <AbaIndividual postos={postos} produtos={produtos} bicos={bicos} />
      )}
      {aba === 'lote' && (
        <AbaLote postos={postos} produtos={produtos} bicos={bicos} />
      )}
    </div>
  );
}
