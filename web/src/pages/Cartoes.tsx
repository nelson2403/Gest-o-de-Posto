import { useEffect, useRef, useState, useMemo } from 'react';
import { Plus, CreditCard, CheckCircle, XCircle, Scan, Pencil, X, ChevronDown, ChevronRight } from 'lucide-react';
import { getCartoes, getPostos, createCartao, renomearCartao, toggleCartao, alterarNivelCartao, deleteCartao } from '../services/api';
import { useAuth } from '../context/AuthContext';

const NIVEIS = [
  { value: 0, label: 'Sem desconto', color: 'bg-gray-800 text-gray-400' },
  { value: 1, label: 'Nível 1', color: 'bg-blue-900/40 text-blue-400' },
  { value: 2, label: 'Nível 2', color: 'bg-purple-900/40 text-purple-400' },
];

function NivelBadge({ nivel }: { nivel: number }) {
  const n = NIVEIS.find((x) => x.value === nivel) ?? NIVEIS[1];
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${n.color}`}>
      {n.label}
    </span>
  );
}

export default function Cartoes() {
  const { isAdmin, usuario } = useAuth();
  const [cartoes, setCartoes] = useState<any[]>([]);
  const [postos, setPostos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ codigo: '', nome_funcionario: '', posto_id: '', nivel: 1 });
  const [scanning, setScanning] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregar();
    getPostos().then(setPostos);
  }, []);

  useEffect(() => {
    if (!usuario?.posto_id) return;
    setForm((f) => ({ ...f, posto_id: usuario.posto_id! }));
  }, [usuario]);

  async function carregar() {
    const data = await getCartoes();
    setCartoes(data);
  }

  const grupos = useMemo(() => {
    const map: Record<string, { postoNome: string; cartoes: any[] }> = {};
    for (const c of cartoes) {
      const postoId = c.posto_id;
      const postoNome = c.postos?.nome ?? 'Sem posto';
      if (!map[postoId]) map[postoId] = { postoNome, cartoes: [] };
      map[postoId].cartoes.push(c);
    }
    return Object.entries(map).sort((a, b) => a[1].postoNome.localeCompare(b[1].postoNome));
  }, [cartoes]);

  function iniciarScan() {
    setScanning(true);
    setForm((f) => ({ ...f, codigo: '' }));
    setTimeout(() => scanRef.current?.focus(), 100);
  }

  function handleScanInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && form.codigo.length >= 4) setScanning(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await createCartao(form);
      setSucesso('Cartão cadastrado com sucesso!');
      setForm({ codigo: '', nome_funcionario: '', posto_id: usuario?.posto_id || '', nivel: 1 });
      setShowForm(false);
      carregar();
      setTimeout(() => setSucesso(''), 3000);
    } catch (err: any) {
      setErro(err.response?.data?.message || 'Erro ao cadastrar cartão');
    }
  }

  async function handleToggle(id: string, ativo: boolean) {
    await toggleCartao(id, !ativo);
    carregar();
  }

  async function handleNivel(id: string, nivel: number) {
    await alterarNivelCartao(id, nivel);
    setCartoes((prev) => prev.map((c) => c.id === id ? { ...c, nivel, sincronizado: false } : c));
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover cartão permanentemente?')) return;
    await deleteCartao(id);
    carregar();
  }

  async function salvarEdicao(id: string) {
    if (!editNome.trim()) return;
    await renomearCartao(id, editNome.trim());
    setEditandoId(null);
    carregar();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cartões de Funcionários</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Cartão
        </button>
      </div>

      {sucesso && (
        <div className="flex items-center gap-2 bg-green-900/30 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">
          <CheckCircle className="w-4 h-4" /> {sucesso}
        </div>
      )}

      {/* Formulário de cadastro */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-400" /> Cadastrar Novo Cartão
            </h2>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Código RFID</label>
              {scanning ? (
                <div className="relative">
                  <input
                    ref={scanRef}
                    type="text"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    onKeyDown={handleScanInput}
                    className="w-full px-4 py-3 bg-blue-900/30 border-2 border-blue-500 rounded-lg text-white text-center text-lg tracking-widest animate-pulse focus:outline-none"
                    placeholder="Aguardando leitura do cartão..."
                  />
                  <Scan className="absolute right-3 top-3.5 w-5 h-5 text-blue-400" />
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.codigo}
                    onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                    className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Código do cartão"
                    required
                  />
                  <button
                    type="button"
                    onClick={iniciarScan}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-900/50 border border-blue-700 text-blue-300 rounded-lg text-sm hover:bg-blue-900 transition-colors"
                  >
                    <Scan className="w-4 h-4" /> Usar Leitor
                  </button>
                </div>
              )}
              {form.codigo && !scanning && (
                <p className="text-xs text-green-400 mt-1">Código capturado: {form.codigo}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Funcionário</label>
              <input
                type="text"
                value={form.nome_funcionario}
                onChange={(e) => setForm({ ...form, nome_funcionario: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nome completo"
                required
              />
            </div>

            {/* Nível de desconto */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Nível de Desconto</label>
              <div className="flex gap-2">
                {NIVEIS.map((n) => (
                  <button
                    key={n.value}
                    type="button"
                    onClick={() => setForm({ ...form, nivel: n.value })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.nivel === n.value
                        ? n.value === 0 ? 'bg-gray-700 border-gray-500 text-white'
                          : n.value === 1 ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-purple-700 border-purple-500 text-white'
                        : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Posto</label>
                <select
                  value={form.posto_id}
                  onChange={(e) => setForm({ ...form, posto_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecione o posto</option>
                  {postos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            )}

            {erro && (
              <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{erro}</p>
            )}

            <div className="flex gap-2">
              <button type="submit" className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors">
                Cadastrar Cartão
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grupos por posto */}
      <div className="space-y-3">
        {cartoes.length === 0 && <p className="text-gray-500 text-sm">Nenhum cartão cadastrado.</p>}

        {grupos.map(([postoId, grupo]) => {
          const isOpen = !collapsed[postoId];
          const ativos = grupo.cartoes.filter((c) => c.ativo).length;

          return (
            <div key={postoId} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setCollapsed((prev) => ({ ...prev, [postoId]: !prev[postoId] }))}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isOpen
                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                    : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <span className="font-semibold text-white">{grupo.postoNome}</span>
                  <span className="text-xs text-gray-500">
                    {grupo.cartoes.length} cartão{grupo.cartoes.length !== 1 ? 'ões' : ''} · {ativos} ativo{ativos !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 divide-y divide-gray-800">
                  {grupo.cartoes.map((cartao) => (
                    <div key={cartao.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                      {/* Info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <CreditCard className={`w-5 h-5 flex-shrink-0 ${cartao.ativo ? 'text-blue-400' : 'text-gray-600'}`} />
                        <div className="flex-1 min-w-0">
                          {editandoId === cartao.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editNome}
                                onChange={(e) => setEditNome(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') salvarEdicao(cartao.id);
                                  if (e.key === 'Escape') setEditandoId(null);
                                }}
                                className="px-2 py-1 bg-gray-800 border border-blue-500 rounded text-white text-sm focus:outline-none"
                                autoFocus
                              />
                              <button onClick={() => salvarEdicao(cartao.id)} className="text-green-400 hover:text-green-300">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditandoId(null)} className="text-gray-500 hover:text-white">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-white truncate">{cartao.nome_funcionario}</p>
                              <button
                                onClick={() => { setEditandoId(cartao.id); setEditNome(cartao.nome_funcionario); }}
                                className="text-gray-600 hover:text-blue-400 flex-shrink-0"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          <p className="text-xs text-gray-500 font-mono">{cartao.codigo}</p>
                        </div>
                      </div>

                      {/* Controles */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Selector de nível inline */}
                        <select
                          value={cartao.nivel ?? 1}
                          onChange={(e) => handleNivel(cartao.id, Number(e.target.value))}
                          className="text-xs px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                        >
                          {NIVEIS.map((n) => (
                            <option key={n.value} value={n.value}>{n.label}</option>
                          ))}
                        </select>

                        {/* Status sync */}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          cartao.sincronizado
                            ? 'bg-green-900/40 text-green-400'
                            : 'bg-yellow-900/40 text-yellow-400'
                        }`}>
                          {cartao.sincronizado ? 'Sincronizado' : 'Pendente'}
                        </span>

                        {/* Ativo / Inativo */}
                        <button
                          onClick={() => handleToggle(cartao.id, cartao.ativo)}
                          className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                            cartao.ativo
                              ? 'bg-green-900/30 text-green-400 hover:bg-red-900/30 hover:text-red-400'
                              : 'bg-red-900/30 text-red-400 hover:bg-green-900/30 hover:text-green-400'
                          }`}
                        >
                          {cartao.ativo
                            ? <><CheckCircle className="w-4 h-4" /> Ativo</>
                            : <><XCircle className="w-4 h-4" /> Inativo</>}
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(cartao.id)}
                            className="text-gray-600 hover:text-red-400 text-lg leading-none transition-colors p-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
