'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'

interface Posto { id: string; nome: string }
interface Maquininha { id: string; posto_id: string; numero_serie: string | null; modelo: string | null; status: string; adquirente_id: string; adquirentes?: { nome: string } }
interface SolicitacaoBobina { id: string; posto_id: string; maquininha_id: string | null; solicitado_por: string; status: string; criado_em: string; observacoes: string | null; atualizado_em: string }
interface TrocaBobina {
  id: string; solicitacao_id: string | null; posto_id: string; maquininha_id: string
  realizado_por: string; data_troca: string; observacoes: string | null; criado_em: string
  postos?: Posto; maquininhas?: Maquininha & { adquirentes?: { nome: string } }
  solicitacoes_bobinas?: SolicitacaoBobina
}
interface Toast { id: number; message: string; type: 'success' | 'error' }

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function TrocasPage() {
  const { usuario } = useAuthContext()
  const userName = usuario?.nome ?? ''

  const [loading, setLoading]   = useState(true)
  const [trocas, setTrocas]     = useState<TrocaBobina[]>([])
  const [toasts, setToasts]     = useState<Toast[]>([])
  const [filterPosto, setFilterPosto] = useState('')
  const [filterFrom, setFilterFrom]   = useState('')
  const [filterTo, setFilterTo]       = useState('')
  const [postos, setPostos]     = useState<Posto[]>([])
  const [showModal, setShowModal]     = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [modalMaquininhas, setModalMaquininhas] = useState<Maquininha[]>([])
  const [pendenteSolicitacoes, setPendenteSolicitacoes] = useState<SolicitacaoBobina[]>([])
  const [form, setForm] = useState({ posto_id: '', maquininha_id: '', realizado_por: '', data_troca: '', solicitacao_id: '', observacoes: '' })
  const [submitting, setSubmitting]   = useState(false)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  useEffect(() => { init() }, [])

  async function init() {
    const supabase = createClient()
    await Promise.all([loadTrocas(supabase), loadPostos(supabase)])
    setLoading(false)
  }

  async function loadTrocas(supabase: ReturnType<typeof createClient>) {
    const { data, error } = await supabase
      .from('trocas_bobinas')
      .select('*, postos(nome), maquininhas(numero_serie, modelo, adquirentes(nome)), solicitacoes_bobinas(id, solicitado_por)')
      .order('data_troca', { ascending: false })
    if (error) { addToast('Erro ao carregar trocas', 'error'); return }
    setTrocas((data as TrocaBobina[]) ?? [])
  }

  async function loadPostos(supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase.from('postos').select('id, nome, ativo').order('nome')
    setPostos((data as Posto[]) ?? [])
  }

  async function loadMaquininhas(postoId: string) {
    const supabase = createClient()
    const { data } = await supabase.from('maquininhas').select('id, posto_id, numero_serie, modelo, status, adquirente_id, adquirentes(nome)').eq('posto_id', postoId).order('modelo')
    setModalMaquininhas((data as unknown as Maquininha[]) ?? [])
  }

  async function loadPendenteSolicitacoes(postoId: string, maquininhaId: string) {
    if (!postoId || !maquininhaId) { setPendenteSolicitacoes([]); return }
    const supabase = createClient()
    const { data } = await supabase.from('solicitacoes_bobinas')
      .select('id, posto_id, maquininha_id, solicitado_por, status, criado_em, observacoes, atualizado_em')
      .eq('posto_id', postoId).eq('maquininha_id', maquininhaId).eq('status', 'pendente').order('criado_em', { ascending: false })
    setPendenteSolicitacoes((data as SolicitacaoBobina[]) ?? [])
  }

  function openModal() {
    const now = new Date()
    const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setEditingId(null)
    setForm({ posto_id: '', maquininha_id: '', realizado_por: userName, data_troca: localISO, solicitacao_id: '', observacoes: '' })
    setModalMaquininhas([]); setPendenteSolicitacoes([]); setShowModal(true)
  }

  async function openEditModal(t: TrocaBobina) {
    const localISO = new Date(new Date(t.data_troca).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setEditingId(t.id)
    setForm({ posto_id: t.posto_id, maquininha_id: t.maquininha_id, realizado_por: t.realizado_por, data_troca: localISO, solicitacao_id: t.solicitacao_id ?? '', observacoes: t.observacoes ?? '' })
    setPendenteSolicitacoes([])
    await loadMaquininhas(t.posto_id)
    setShowModal(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta troca? Esta ação não pode ser desfeita.')) return
    setDeletingId(id)
    const supabase = createClient()
    const { error } = await supabase.from('trocas_bobinas').delete().eq('id', id)
    if (error) addToast('Erro ao excluir troca', 'error')
    else { addToast('Troca excluída!', 'success'); await loadTrocas(supabase) }
    setDeletingId(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.posto_id || !form.maquininha_id || !form.realizado_por.trim() || !form.data_troca) {
      addToast('Preencha todos os campos obrigatórios', 'error'); return
    }
    setSubmitting(true)
    const supabase = createClient()
    const payload = {
      posto_id: form.posto_id, maquininha_id: form.maquininha_id, realizado_por: form.realizado_por.trim(),
      data_troca: new Date(form.data_troca).toISOString(), solicitacao_id: form.solicitacao_id || null, observacoes: form.observacoes.trim() || null,
    }
    if (editingId) {
      const { error } = await supabase.from('trocas_bobinas').update(payload).eq('id', editingId)
      if (error) { addToast('Erro ao salvar alterações', 'error'); setSubmitting(false); return }
      addToast('Troca atualizada!', 'success')
    } else {
      const { error } = await supabase.from('trocas_bobinas').insert(payload)
      if (error) { addToast('Erro ao registrar troca', 'error'); setSubmitting(false); return }
      if (form.solicitacao_id) {
        await supabase.from('solicitacoes_bobinas').update({ status: 'atendida' }).eq('id', form.solicitacao_id)
      }
      addToast('Troca registrada com sucesso!', 'success')
    }
    setShowModal(false)
    await loadTrocas(supabase)
    setSubmitting(false)
  }

  const filtered = trocas.filter(t => {
    if (filterPosto && t.posto_id !== filterPosto) return false
    if (filterFrom) { const from = new Date(filterFrom); from.setHours(0,0,0,0); if (new Date(t.data_troca) < from) return false }
    if (filterTo)   { const to   = new Date(filterTo);   to.setHours(23,59,59,999); if (new Date(t.data_troca) > to) return false }
    return true
  })

  return (
    <div className="animate-fade-in">
      <Header title="Trocas de Bobinas" description="Histórico de trocas realizadas" />

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${t.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="p-3 md:p-6 space-y-4">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-200 rounded w-48" />
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded" />)}
            </div>
          </div>
        ) : (
          <>
            {/* Filtros */}
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Posto</label>
                    <select value={filterPosto} onChange={e => setFilterPosto(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                      <option value="">Todos os postos</option>
                      {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Data inicial</label>
                    <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Data final</label>
                    <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(filterPosto || filterFrom || filterTo) && (
                    <button onClick={() => { setFilterPosto(''); setFilterFrom(''); setFilterTo('') }} className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Limpar</button>
                  )}
                  <button onClick={openModal} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Registrar Troca
                  </button>
                </div>
              </div>
            </div>

            {(filterPosto || filterFrom || filterTo) && (
              <p className="text-sm text-gray-500">{filtered.length} resultado{filtered.length !== 1 ? 's' : ''} encontrado{filtered.length !== 1 ? 's' : ''}</p>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {filtered.length === 0 ? (
                <div className="px-6 py-16 text-center text-gray-400 text-sm">Nenhuma troca encontrada</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Data da Troca</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Posto</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Maquininha</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Realizado por</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Solicitação</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Observações</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{formatDate(t.data_troca)}</td>
                          <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{t.postos?.nome ?? '-'}</td>
                          <td className="px-6 py-4 text-gray-600">
                            {t.maquininhas ? [t.maquininhas.modelo ?? 'Sem modelo', `N/S: ${t.maquininhas.numero_serie ?? 'N/A'}`, t.maquininhas.adquirentes?.nome].filter(Boolean).join(' · ') : '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">{t.realizado_por}</td>
                          <td className="px-6 py-4 text-gray-500 text-xs">
                            {t.solicitacao_id ? <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">#{t.solicitacao_id.slice(0, 8)}</span> : <span className="text-gray-400 italic">Direto</span>}
                          </td>
                          <td className="px-6 py-4 text-gray-500">
                            {t.observacoes ? <span className="italic text-xs" title={t.observacoes}>{t.observacoes.length > 40 ? t.observacoes.slice(0, 40) + '...' : t.observacoes}</span> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => openEditModal(t)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => handleDelete(t.id)} disabled={deletingId === t.id} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40" title="Excluir">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal Troca */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-semibold text-gray-900 text-lg">{editingId ? 'Editar Troca' : 'Registrar Troca de Bobina'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Posto <span className="text-red-500">*</span></label>
                <select value={form.posto_id} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, posto_id: val, maquininha_id: '', solicitacao_id: '' })); if (val) loadMaquininhas(val); else setModalMaquininhas([]); setPendenteSolicitacoes([]) }} required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
                  <option value="">Selecione um posto</option>
                  {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maquininha <span className="text-red-500">*</span></label>
                <select value={form.maquininha_id} onChange={e => { const val = e.target.value; setForm(f => ({ ...f, maquininha_id: val, solicitacao_id: '' })); if (val && form.posto_id) loadPendenteSolicitacoes(form.posto_id, val); else setPendenteSolicitacoes([]) }} required disabled={!form.posto_id} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white disabled:bg-gray-100 disabled:text-gray-400">
                  <option value="">{form.posto_id ? 'Selecione uma maquininha' : 'Selecione um posto primeiro'}</option>
                  {modalMaquininhas.map(m => <option key={m.id} value={m.id}>{[m.modelo ?? 'Sem modelo', `N/S: ${m.numero_serie ?? 'N/A'}`, m.adquirentes?.nome].filter(Boolean).join(' · ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Realizado por <span className="text-red-500">*</span></label>
                <input type="text" value={form.realizado_por} onChange={e => setForm(f => ({ ...f, realizado_por: e.target.value }))} required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Nome de quem realizou a troca" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data e Hora da Troca <span className="text-red-500">*</span></label>
                <input type="datetime-local" value={form.data_troca} onChange={e => setForm(f => ({ ...f, data_troca: e.target.value }))} required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vincular a solicitação pendente? <span className="text-gray-400 font-normal ml-1">(opcional)</span></label>
                <select value={form.solicitacao_id} onChange={e => setForm(f => ({ ...f, solicitacao_id: e.target.value }))} disabled={!form.maquininha_id} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white disabled:bg-gray-100 disabled:text-gray-400">
                  <option value="">{!form.maquininha_id ? 'Selecione posto e maquininha primeiro' : pendenteSolicitacoes.length === 0 ? 'Nenhuma solicitação pendente' : 'Não vincular'}</option>
                  {pendenteSolicitacoes.map(s => <option key={s.id} value={s.id}>#{s.id.slice(0, 8)} · {formatDate(s.criado_em)} · {s.solicitado_por}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" placeholder="Observações opcionais..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-lg font-medium transition-colors">
                  {submitting ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Registrar Troca'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
