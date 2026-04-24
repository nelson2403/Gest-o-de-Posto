import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, User, UserCog, CheckCircle, XCircle, KeyRound, X } from 'lucide-react';
import { getUsuarios, createUsuario, toggleUsuario, alterarSenhaUsuario, getPostos } from '../services/api';

const ROLES = [
  { value: 0, label: 'Operador', desc: 'Acesso apenas ao seu posto' },
  { value: 1, label: 'Gerente', desc: 'Acesso ao posto + relatórios' },
  { value: 2, label: 'Admin', desc: 'Acesso total a todos os postos' },
];

const FORM_VAZIO = { nome: '', email: '', senha: '', role: '0', posto_id: '' };

function RoleBadge({ role }: { role: number }) {
  const cfg = {
    0: 'bg-gray-800 text-gray-400',
    1: 'bg-blue-900/40 text-blue-400',
    2: 'bg-purple-900/40 text-purple-400',
  }[role] ?? 'bg-gray-800 text-gray-400';
  const label = ROLES.find(r => r.value === role)?.label ?? '?';
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg}`}>{label}</span>;
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [postos, setPostos] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [senhaModal, setSenhaModal] = useState<{ id: string; nome: string } | null>(null);
  const [novaSenha, setNovaSenha] = useState('');

  useEffect(() => {
    carregar();
    getPostos().then(setPostos);
  }, []);

  async function carregar() {
    const data = await getUsuarios();
    setUsuarios(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    const payload: any = {
      nome: form.nome,
      email: form.email,
      senha: form.senha,
      role: parseInt(form.role),
    };
    if (parseInt(form.role) < 2) {
      if (!form.posto_id) {
        setErro('Selecione o posto para este usuário');
        return;
      }
      payload.posto_id = form.posto_id;
    }
    try {
      await createUsuario(payload);
      setSucesso('Usuário criado com sucesso!');
      setForm(FORM_VAZIO);
      setShowForm(false);
      carregar();
      setTimeout(() => setSucesso(''), 3000);
    } catch (err: any) {
      setErro(err.response?.data?.message || 'Erro ao criar usuário');
    }
  }

  async function handleToggle(id: string, ativo: boolean) {
    await toggleUsuario(id, !ativo);
    carregar();
  }

  async function handleAlterarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!senhaModal || novaSenha.length < 4) return;
    try {
      await alterarSenhaUsuario(senhaModal.id, novaSenha);
      setSucesso(`Senha de ${senhaModal.nome} alterada!`);
      setSenhaModal(null);
      setNovaSenha('');
      setTimeout(() => setSucesso(''), 3000);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao alterar senha');
    }
  }

  const roleIcon = (role: number) => {
    if (role === 2) return <ShieldCheck className="w-4 h-4 text-purple-400" />;
    if (role === 1) return <UserCog className="w-4 h-4 text-blue-400" />;
    return <User className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Usuários</h1>
        <button
          onClick={() => { setShowForm(!showForm); setErro(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      {sucesso && (
        <div className="flex items-center gap-2 bg-green-900/30 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">
          <CheckCircle className="w-4 h-4" /> {sucesso}
        </div>
      )}

      {/* Formulário criar */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Novo Usuário</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nome</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nome completo"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="usuario@email.com"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Senha</label>
                <input
                  type="password"
                  value={form.senha}
                  onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 4 caracteres"
                  required
                  minLength={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nível de Acesso</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value, posto_id: '' })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>
                  ))}
                </select>
              </div>
            </div>

            {parseInt(form.role) < 2 && (
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

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Criar Usuário
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {usuarios.length === 0 && (
          <p className="text-gray-500 text-sm">Nenhum usuário cadastrado.</p>
        )}
        {usuarios.map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-5 py-4"
          >
            <div className="flex items-center gap-3">
              {roleIcon(u.role)}
              <div>
                <p className="font-medium text-white">{u.nome}</p>
                <p className="text-xs text-gray-500">{u.email}</p>
                {u.postos && (
                  <p className="text-xs text-gray-400">{u.postos.nome}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <RoleBadge role={u.role} />

              <button
                onClick={() => { setSenhaModal({ id: u.id, nome: u.nome }); setNovaSenha(''); }}
                className="p-2 text-gray-400 hover:text-yellow-400 hover:bg-gray-800 rounded-lg transition-colors"
                title="Alterar senha"
              >
                <KeyRound className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleToggle(u.id, u.ativo)}
                className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  u.ativo
                    ? 'bg-green-900/30 text-green-400 hover:bg-red-900/30 hover:text-red-400'
                    : 'bg-red-900/30 text-red-400 hover:bg-green-900/30 hover:text-green-400'
                }`}
              >
                {u.ativo
                  ? <><CheckCircle className="w-4 h-4" /> Ativo</>
                  : <><XCircle className="w-4 h-4" /> Inativo</>
                }
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal alterar senha */}
      {senhaModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">Alterar Senha</h3>
              <button onClick={() => setSenhaModal(null)} className="text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-400">Usuário: <span className="text-white">{senhaModal.nome}</span></p>
            <form onSubmit={handleAlterarSenha} className="space-y-3">
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nova senha"
                required
                minLength={4}
                autoFocus
              />
              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Salvar Nova Senha
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
