import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Wifi, WifiOff, X, Check } from 'lucide-react';
import { getPostos, createPosto, updatePosto, deletePosto } from '../services/api';

interface Posto {
  id: string;
  nome: string;
  forecourt_ip: string;
  forecourt_port: number;
  online: boolean;
}

const FORM_VAZIO = { nome: '', forecourt_ip: '', forecourt_port: '' };

export default function Postos() {
  const [postos, setPostos] = useState<Posto[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Posto | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const data = await getPostos();
    setPostos(data);
  }

  function abrirCriar() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setErro('');
    setShowForm(true);
  }

  function abrirEditar(posto: Posto) {
    setEditando(posto);
    setForm({
      nome: posto.nome,
      forecourt_ip: posto.forecourt_ip || '',
      forecourt_port: String(posto.forecourt_port || ''),
    });
    setErro('');
    setShowForm(true);
  }

  function fecharForm() {
    setShowForm(false);
    setEditando(null);
    setForm(FORM_VAZIO);
    setErro('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    const payload = {
      nome: form.nome,
      forecourt_ip: form.forecourt_ip,
      forecourt_port: parseInt(form.forecourt_port) || 0,
    };
    try {
      if (editando) {
        await updatePosto(editando.id, payload);
        setSucesso('Posto atualizado!');
      } else {
        await createPosto(payload);
        setSucesso('Posto cadastrado!');
      }
      fecharForm();
      carregar();
      setTimeout(() => setSucesso(''), 3000);
    } catch (err: any) {
      setErro(err.response?.data?.message || 'Erro ao salvar posto');
    }
  }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Remover "${nome}"? Todos os bicos, cartões e descontos do posto serão excluídos.`)) return;
    try {
      await deletePosto(id);
      carregar();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao remover');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Postos</h1>
        <button
          onClick={abrirCriar}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Posto
        </button>
      </div>

      {sucesso && (
        <div className="flex items-center gap-2 bg-green-900/30 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">
          <Check className="w-4 h-4" /> {sucesso}
        </div>
      )}

      {/* Formulário */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              {editando ? 'Editar Posto' : 'Novo Posto'}
            </h2>
            <button onClick={fecharForm} className="text-gray-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Nome</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ex: Posto Capricho"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">IP do Concentrador</label>
                <input
                  type="text"
                  value={form.forecourt_ip}
                  onChange={(e) => setForm({ ...form, forecourt_ip: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="10.100.x.91"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Porta</label>
                <input
                  type="number"
                  value={form.forecourt_port}
                  onChange={(e) => setForm({ ...form, forecourt_port: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="1771"
                />
              </div>
            </div>

            {erro && (
              <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">{erro}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                {editando ? 'Salvar Alterações' : 'Cadastrar Posto'}
              </button>
              <button
                type="button"
                onClick={fecharForm}
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
        {postos.length === 0 && (
          <p className="text-gray-500 text-sm">Nenhum posto cadastrado.</p>
        )}
        {postos.map((posto) => (
          <div
            key={posto.id}
            className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-5 py-4"
          >
            <div className="flex items-center gap-3">
              {posto.online
                ? <Wifi className="w-5 h-5 text-green-400" />
                : <WifiOff className="w-5 h-5 text-gray-600" />
              }
              <div>
                <p className="font-medium text-white">{posto.nome}</p>
                <p className="text-xs text-gray-500 font-mono">
                  {posto.forecourt_ip || '—'}:{posto.forecourt_port || '—'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                posto.online
                  ? 'bg-green-900/40 text-green-400'
                  : 'bg-gray-800 text-gray-500'
              }`}>
                {posto.online ? 'Online' : 'Offline'}
              </span>
              <button
                onClick={() => abrirEditar(posto)}
                className="p-2 text-gray-400 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(posto.id, posto.nome)}
                className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
