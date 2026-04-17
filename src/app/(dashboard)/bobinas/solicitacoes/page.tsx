'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'

interface Posto { id: string; nome: string; ativo: boolean }
interface Adquirente { id: string; nome: string }
interface Maquininha {
  id: string; posto_id: string; numero_serie: string | null; modelo: string | null
  status: string; adquirente_id: string; adquirentes?: Adquirente
}
interface SolicitacaoBobina {
  id: string; posto_id: string; maquininha_id: string | null; adquirente_solicitado_id: string | null
  solicitado_por: string; status: 'pendente' | 'atendida' | 'cancelada' | 'solicitado'
  tipo: 'bobina' | 'desinstalacao'
  observacoes: string | null; criado_em: string; atualizado_em: string
  postos?: Posto; maquininhas?: (Maquininha & { adquirentes?: Adquirente }) | null
  adquirente_solicitado?: Adquirente | null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendente: 'bg-yellow-100 text-yellow-800', solicitado: 'bg-purple-100 text-purple-800',
    atendida: 'bg-green-100 text-green-800', cancelada: 'bg-red-100 text-red-800',
  }
  const labels: Record<string, string> = {
    pendente: 'Pendente', solicitado: 'Solicitado', atendida: 'Atendida', cancelada: 'Cancelada',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-800'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface Toast { id: number; message: string; type: 'success' | 'error' }

const emptyForm = () => ({
  posto_id: '', maquininha_id: '', adquirente_solicitado_id: '', solicitado_por: '', observacoes: '',
  tipo_solicitacao: 'bobina' as 'bobina' | 'desinstalacao',
})

export default function SolicitacoesPage() {
  const { usuario } = useAuthContext()
  const userName = usuario?.nome ?? ''

  const [loading, setLoading]             = useState(true)
  const [solicitacoes, setSolicitacoes]   = useState<SolicitacaoBobina[]>([])
  const [statusFilter, setStatusFilter]   = useState<string>('todos')
  const [toasts, setToasts]               = useState<Toast[]>([])
  const [postos, setPostos]               = useState<Posto[]>([])
  const [adquirentes, setAdquirentes]     = useState<Adquirente[]>([])

  const [showNewModal, setShowNewModal]   = useState(false)
  const [newForm, setNewForm]             = useState(emptyForm())
  const [newMaquininhas, setNewMaquininhas] = useState<Maquininha[]>([])
  const [submitting, setSubmitting]       = useState(false)

  const [editModal, setEditModal]         = useState<SolicitacaoBobina | null>(null)
  const [editForm, setEditForm]           = useState(emptyForm())
  const [editMaquininhas, setEditMaquininhas] = useState<Maquininha[]>([])
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [atenderModal, setAtenderModal]   = useState<SolicitacaoBobina | null>(null)
  const [atenderForm, setAtenderForm]     = useState({ realizado_por: '', data_troca: '', observacoes: '', numero_serie_novo: '', modelo_novo: '' })
  const [atenderSubmitting, setAtenderSubmitting] = useState(false)

  const [deleteId, setDeleteId]           = useState<string | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  useEffect(() => { init() }, [])

  async function init() {
    const supabase = createClient()
    await Promise.all([loadSolicitacoes(supabase), loadPostos(supabase), loadAdquirentes(supabase)])
    setLoading(false)
  }

  async function loadSolicitacoes(supabase: ReturnType<typeof createClient>) {
    const { data, error } = await supabase
      .from('solicitacoes_bobinas')
      .select('*, postos(nome), maquininhas(numero_serie, modelo, adquirentes(nome)), adquirente_solicitado:adquirentes!adquirente_solicitado_id(id, nome)')
      .order('criado_em', { ascending: false })
    if (error) { addToast('Erro ao carregar solicitações', 'error'); return }
    setSolicitacoes((data as SolicitacaoBobina[]) ?? [])
  }

  async function loadPostos(supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase.from('postos').select('id, nome, ativo').eq('ativo', true).order('nome')
    setPostos((data as Posto[]) ?? [])
  }

  async function loadAdquirentes(supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase.from('adquirentes').select('id, nome').order('nome')
    setAdquirentes((data as Adquirente[]) ?? [])
  }

  async function loadMaquininhas(postoId: string, setter: (m: Maquininha[]) => void) {
    const supabase = createClient()
    const { data } = await supabase
      .from('maquininhas')
      .select('id, posto_id, numero_serie, modelo, status, adquirente_id, adquirentes(nome)')
      .eq('posto_id', postoId).order('modelo')
    setter((data as unknown as Maquininha[]) ?? [])
  }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newForm.posto_id || !newForm.solicitado_por.trim()) {
      addToast('Preencha todos os campos obrigatórios', 'error'); return
    }
    if (newForm.tipo_solicitacao === 'desinstalacao' && !newForm.maquininha_id) {
      addToast('Selecione a maquininha a ser desinstalada', 'error'); return
    }
    if (newForm.tipo_solicitacao === 'bobina' && !newForm.maquininha_id && !newForm.adquirente_solicitado_id) {
      addToast('Selecione uma maquininha existente ou um adquirente para nova solicitação', 'error'); return
    }
    setSubmitting(true)
    const supabase = createClient()
    const isDesinstalacao = newForm.tipo_solicitacao === 'desinstalacao'
    const status = (!isDesinstalacao && newForm.adquirente_solicitado_id) ? 'solicitado' : 'pendente'
    const { error } = await supabase.from('solicitacoes_bobinas').insert({
      posto_id: newForm.posto_id,
      maquininha_id: newForm.maquininha_id || null,
      adquirente_solicitado_id: isDesinstalacao ? null : (newForm.adquirente_solicitado_id || null),
      solicitado_por: newForm.solicitado_por.trim(),
      observacoes: newForm.observacoes.trim() || null,
      tipo: newForm.tipo_solicitacao,
      status,
    })
    if (error) { addToast('Erro ao criar solicitação', 'error'); setSubmitting(false); return }
    addToast('Solicitação criada com sucesso!', 'success')
    closeNewModal()
    await loadSolicitacoes(createClient())
    setSubmitting(false)
  }

  function closeNewModal() {
    setShowNewModal(false)
    setNewForm({ ...emptyForm(), solicitado_por: userName })
    setNewMaquininhas([])
  }

  function openEditModal(sol: SolicitacaoBobina) {
    setEditForm({
      posto_id: sol.posto_id, maquininha_id: sol.maquininha_id ?? '',
      adquirente_solicitado_id: sol.adquirente_solicitado_id ?? '',
      solicitado_por: sol.solicitado_por, observacoes: sol.observacoes ?? '',
      tipo_solicitacao: sol.tipo ?? 'bobina',
    })
    setEditMaquininhas([])
    if (sol.posto_id) loadMaquininhas(sol.posto_id, setEditMaquininhas)
    setEditModal(sol)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editModal) return
    if (!editForm.posto_id || !editForm.solicitado_por.trim()) {
      addToast('Preencha todos os campos obrigatórios', 'error'); return
    }
    if (editForm.tipo_solicitacao === 'desinstalacao' && !editForm.maquininha_id) {
      addToast('Selecione a maquininha a ser desinstalada', 'error'); return
    }
    if (editForm.tipo_solicitacao === 'bobina' && !editForm.maquininha_id && !editForm.adquirente_solicitado_id) {
      addToast('Selecione uma maquininha ou um adquirente', 'error'); return
    }
    setEditSubmitting(true)
    const supabase = createClient()
    const isDesinstalacao = editForm.tipo_solicitacao === 'desinstalacao'
    const status = (!isDesinstalacao && editForm.adquirente_solicitado_id) ? 'solicitado' : 'pendente'
    const { error } = await supabase.from('solicitacoes_bobinas').update({
      posto_id: editForm.posto_id,
      maquininha_id: editForm.maquininha_id || null,
      adquirente_solicitado_id: isDesinstalacao ? null : (editForm.adquirente_solicitado_id || null),
      solicitado_por: editForm.solicitado_por.trim(),
      observacoes: editForm.observacoes.trim() || null,
      tipo: editForm.tipo_solicitacao,
      status,
    }).eq('id', editModal.id)
    if (error) { addToast('Erro ao salvar alterações', 'error'); setEditSubmitting(false); return }
    addToast('Solicitação atualizada!', 'success')
    setEditModal(null); setEditMaquininhas([])
    await loadSolicitacoes(createClient())
    setEditSubmitting(false)
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleteSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.from('solicitacoes_bobinas').delete().eq('id', deleteId)
    if (error) { addToast('Erro ao excluir solicitação', 'error'); setDeleteSubmitting(false); return }
    addToast('Solicitação excluída!', 'success')
    setDeleteId(null)
    await loadSolicitacoes(createClient())
    setDeleteSubmitting(false)
  }

  async function handleCancelar(id: string) {
    const supabase = createClient()
    const { error } = await supabase.from('solicitacoes_bobinas').update({ status: 'cancelada' }).eq('id', id)
    if (error) { addToast('Erro ao cancelar solicitação', 'error'); return }
    addToast('Solicitação cancelada', 'success')
    await loadSolicitacoes(createClient())
  }

  function openAtenderModal(sol: SolicitacaoBobina) {
    const now = new Date()
    const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setAtenderForm({ realizado_por: userName, data_troca: localISO, observacoes: '', numero_serie_novo: '', modelo_novo: '' })
    setAtenderModal(sol)
  }

  async function handleAtenderSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!atenderModal) return
    if (!atenderForm.realizado_por.trim() || !atenderForm.data_troca) {
      addToast('Preencha todos os campos obrigatórios', 'error'); return
    }

    const isDesinstalacao = atenderModal.tipo === 'desinstalacao'
    const isTroca = !isDesinstalacao && !!atenderModal.maquininha_id
    const isNova  = !isDesinstalacao && !!atenderModal.adquirente_solicitado_id

    if (isTroca && !atenderForm.numero_serie_novo.trim()) {
      addToast('Informe o número de série da nova maquininha', 'error'); return
    }
    if (isNova && (!atenderForm.numero_serie_novo.trim() || !atenderForm.modelo_novo.trim())) {
      addToast('Informe o número de série e o modelo do novo equipamento', 'error'); return
    }

    setAtenderSubmitting(true)
    const supabase = createClient()

    // Desinstalação: marcar maquininha como devolvida
    if (isDesinstalacao && atenderModal.maquininha_id) {
      const { error: devError } = await supabase.from('maquininhas')
        .update({
          status: 'devolvida',
          motivo_status: atenderForm.observacoes.trim() || 'Devolvida ao adquirente',
        })
        .eq('id', atenderModal.maquininha_id)
      if (devError) { addToast('Erro ao atualizar status da maquininha', 'error'); setAtenderSubmitting(false); return }
    }

    if (isTroca) {
      const { error: updateMaqError } = await supabase.from('maquininhas')
        .update({ numero_serie: atenderForm.numero_serie_novo.trim() }).eq('id', atenderModal.maquininha_id!)
      if (updateMaqError) { addToast('Erro ao atualizar número de série', 'error'); setAtenderSubmitting(false); return }
      const { error: trocaError } = await supabase.from('trocas_bobinas').insert({
        solicitacao_id: atenderModal.id, posto_id: atenderModal.posto_id,
        maquininha_id: atenderModal.maquininha_id, realizado_por: atenderForm.realizado_por.trim(),
        data_troca: new Date(atenderForm.data_troca).toISOString(), observacoes: atenderForm.observacoes.trim() || null,
      })
      if (trocaError) { addToast('Erro ao registrar troca', 'error'); setAtenderSubmitting(false); return }
    }

    if (isNova) {
      const { data: novaMaq, error: insertMaqError } = await supabase.from('maquininhas').insert({
        posto_id: atenderModal.posto_id, adquirente_id: atenderModal.adquirente_solicitado_id!,
        numero_serie: atenderForm.numero_serie_novo.trim(), modelo: atenderForm.modelo_novo.trim(), status: 'ativo',
      }).select('id').single()
      if (insertMaqError) { addToast('Erro ao cadastrar nova maquininha', 'error'); setAtenderSubmitting(false); return }
      const { error: trocaError } = await supabase.from('trocas_bobinas').insert({
        solicitacao_id: atenderModal.id, posto_id: atenderModal.posto_id, maquininha_id: novaMaq.id,
        realizado_por: atenderForm.realizado_por.trim(), data_troca: new Date(atenderForm.data_troca).toISOString(),
        observacoes: atenderForm.observacoes.trim() || null,
      })
      if (trocaError) { addToast('Erro ao registrar troca', 'error'); setAtenderSubmitting(false); return }
    }

    const { error: updateError } = await supabase.from('solicitacoes_bobinas').update({ status: 'atendida' }).eq('id', atenderModal.id)
    if (updateError) addToast('Erro ao atualizar status', 'error')
    else addToast('Solicitação atendida!', 'success')
    setAtenderModal(null)
    await loadSolicitacoes(createClient())
    setAtenderSubmitting(false)
  }

  const filtered = statusFilter === 'todos' ? solicitacoes : solicitacoes.filter(s => s.status === statusFilter)

  return (
    <div className="animate-fade-in">
      <Header title="Solicitações de Bobinas" description="Gerencie as solicitações de troca" />

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${t.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="p-6 space-y-4">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-200 rounded w-48" />
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded" />)}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-600 font-medium">Filtrar:</span>
                {['todos', 'pendente', 'solicitado', 'atendida', 'cancelada'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'}`}>
                    {s === 'todos' ? 'Todos' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <button
                onClick={() => { setNewForm({ ...emptyForm(), solicitado_por: userName }); setShowNewModal(true) }}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Nova Solicitação
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {filtered.length === 0 ? (
                <div className="px-6 py-16 text-center text-gray-400">
                  <p className="text-sm">Nenhuma solicitação encontrada</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Posto</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Maquininha / Adquirente</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Solicitado por</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filtered.map(s => (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(s.criado_em)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {s.tipo === 'desinstalacao'
                              ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">Desinstalação</span>
                              : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Maquininhas</span>
                            }
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{s.postos?.nome ?? '-'}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {s.maquininhas
                              ? [s.maquininhas.modelo ?? 'Sem modelo', `N/S: ${s.maquininhas.numero_serie ?? 'N/A'}`, s.maquininhas.adquirentes?.nome].filter(Boolean).join(' · ')
                              : s.adquirente_solicitado
                                ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 border border-purple-200 rounded-full text-xs text-purple-700 font-medium">
                                    Nova maquininha · {s.adquirente_solicitado.nome}
                                  </span>
                                : '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{s.solicitado_por}</td>
                          <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {(s.status === 'pendente' || s.status === 'solicitado') && (
                                <button onClick={() => openAtenderModal(s)} className="px-2.5 py-1 bg-green-100 hover:bg-green-200 text-green-800 text-xs font-medium rounded-lg transition-colors">Atender</button>
                              )}
                              {(s.status === 'pendente' || s.status === 'solicitado') && (
                                <button onClick={() => handleCancelar(s.id)} className="px-2.5 py-1 bg-orange-100 hover:bg-orange-200 text-orange-800 text-xs font-medium rounded-lg transition-colors">Cancelar</button>
                              )}
                              <button onClick={() => openEditModal(s)} className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors" title="Editar">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => setDeleteId(s.id)} className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors" title="Excluir">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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

      {/* Modal Nova Solicitação */}
      {showNewModal && (
        <ModalSolicitacao title="Nova Solicitação de Maquininhas" postos={postos} adquirentes={adquirentes}
          maquininhas={newMaquininhas} form={newForm} submitting={submitting}
          onPostoChange={id => { setNewForm(f => ({ ...f, posto_id: id, maquininha_id: '' })); if (id) loadMaquininhas(id, setNewMaquininhas); else setNewMaquininhas([]) }}
          onFormChange={(field, value) => setNewForm(f => ({ ...f, [field]: value }))}
          onSubmit={handleNewSubmit} onClose={closeNewModal}
        />
      )}

      {/* Modal Editar */}
      {editModal && (
        <ModalSolicitacao title="Editar Solicitação" postos={postos} adquirentes={adquirentes}
          maquininhas={editMaquininhas} form={editForm} submitting={editSubmitting}
          onPostoChange={id => { setEditForm(f => ({ ...f, posto_id: id, maquininha_id: '' })); if (id) loadMaquininhas(id, setEditMaquininhas); else setEditMaquininhas([]) }}
          onFormChange={(field, value) => setEditForm(f => ({ ...f, [field]: value }))}
          onSubmit={handleEditSubmit} onClose={() => { setEditModal(null); setEditMaquininhas([]) }}
          submitLabel="Salvar Alterações" submitClass="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400"
        />
      )}

      {/* Modal Atender */}
      {atenderModal && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 text-lg">Atender Solicitação</h2>
              <button onClick={() => setAtenderModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 pt-4">
              <div className={`border rounded-lg px-4 py-3 text-sm ${atenderModal.tipo === 'desinstalacao' ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                <p className="font-medium">
                  {atenderModal.tipo === 'desinstalacao' ? '🔌 Desinstalação — ' : ''}
                  Posto: <span className="font-semibold">{atenderModal.postos?.nome}</span>
                </p>
                {atenderModal.maquininhas && (
                  <p className="mt-1 text-xs">{[atenderModal.maquininhas.modelo ?? 'Sem modelo', `N/S: ${atenderModal.maquininhas.numero_serie ?? 'N/A'}`, atenderModal.maquininhas.adquirentes?.nome].filter(Boolean).join(' · ')}</p>
                )}
                {atenderModal.adquirente_solicitado && (
                  <p className="mt-1 text-xs">Nova maquininha — Adquirente: <span className="font-semibold">{atenderModal.adquirente_solicitado.nome}</span></p>
                )}
                {atenderModal.tipo === 'desinstalacao' && (
                  <p className="mt-1.5 text-xs font-medium text-purple-700">A maquininha será marcada como <strong>Devolvida ao Adquirente</strong>.</p>
                )}
              </div>
            </div>
            <form onSubmit={handleAtenderSubmit} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Realizado por <span className="text-red-500">*</span></label>
                <input type="text" value={atenderForm.realizado_por} onChange={e => setAtenderForm(f => ({ ...f, realizado_por: e.target.value }))} required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Nome de quem realizou" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data e Hora <span className="text-red-500">*</span></label>
                <input type="datetime-local" value={atenderForm.data_troca} onChange={e => setAtenderForm(f => ({ ...f, data_troca: e.target.value }))} required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
              </div>
              {atenderModal.tipo !== 'desinstalacao' && (atenderModal.maquininha_id || atenderModal.adquirente_solicitado_id) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número de Série da Nova Maquininha <span className="text-red-500">*</span></label>
                  <input type="text" value={atenderForm.numero_serie_novo} onChange={e => setAtenderForm(f => ({ ...f, numero_serie_novo: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Informe o número de série" />
                </div>
              )}
              {atenderModal.tipo !== 'desinstalacao' && atenderModal.adquirente_solicitado_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modelo da Nova Maquininha <span className="text-red-500">*</span></label>
                  <input type="text" value={atenderForm.modelo_novo} onChange={e => setAtenderForm(f => ({ ...f, modelo_novo: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Informe o modelo" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea value={atenderForm.observacoes} onChange={e => setAtenderForm(f => ({ ...f, observacoes: e.target.value }))} rows={3}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" placeholder="Observações opcionais..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAtenderModal(null)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={atenderSubmitting} className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg font-medium transition-colors">
                  {atenderSubmitting ? 'Salvando...' : 'Confirmar Atendimento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Excluir */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Excluir solicitação</h3>
                <p className="text-sm text-gray-500 mt-0.5">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm">Cancelar</button>
              <button onClick={handleDelete} disabled={deleteSubmitting} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded-lg font-medium transition-colors text-sm">
                {deleteSubmitting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface ModalSolicitacaoProps {
  title: string; postos: Posto[]; adquirentes: Adquirente[]; maquininhas: Maquininha[]
  form: { posto_id: string; maquininha_id: string; adquirente_solicitado_id: string; solicitado_por: string; observacoes: string; tipo_solicitacao: 'bobina' | 'desinstalacao' }
  submitting: boolean; onPostoChange: (id: string) => void; onFormChange: (field: string, value: string) => void
  onSubmit: (e: React.FormEvent) => void; onClose: () => void
  submitLabel?: string; submitClass?: string
}

function ModalSolicitacao({ title, postos, adquirentes, maquininhas, form, submitting, onPostoChange, onFormChange, onSubmit, onClose, submitLabel = 'Criar Solicitação', submitClass = 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300' }: ModalSolicitacaoProps) {
  const isDesinstalacao = form.tipo_solicitacao === 'desinstalacao'
  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-semibold text-gray-900 text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={onSubmit} className="px-6 py-5 space-y-4">
          {/* Tipo de solicitação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Solicitação <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => onFormChange('tipo_solicitacao', 'bobina')}
                className={`px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-colors ${!isDesinstalacao ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                <div className="font-semibold">📱 Maquininhas</div>
                <div className="text-xs opacity-70 mt-0.5">Troca ou nova maquininha</div>
              </button>
              <button type="button"
                onClick={() => { onFormChange('tipo_solicitacao', 'desinstalacao'); onFormChange('adquirente_solicitado_id', '') }}
                className={`px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-colors ${isDesinstalacao ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                <div className="font-semibold">🔌 Desinstalação</div>
                <div className="text-xs opacity-70 mt-0.5">Devolver maquininha</div>
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Posto <span className="text-red-500">*</span></label>
            <select value={form.posto_id} onChange={e => onPostoChange(e.target.value)} required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
              <option value="">Selecione um posto</option>
              {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maquininha {isDesinstalacao ? <span className="text-red-500">*</span> : <span className="ml-1 text-xs text-gray-400 font-normal">(opcional se solicitar nova)</span>}
            </label>
            <select value={form.maquininha_id} onChange={e => onFormChange('maquininha_id', e.target.value)} disabled={!form.posto_id} required={isDesinstalacao} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white disabled:bg-gray-100 disabled:text-gray-400">
              <option value="">{form.posto_id ? (isDesinstalacao ? 'Selecione a maquininha a desinstalar' : 'Nenhuma (solicitar nova)') : 'Selecione um posto primeiro'}</option>
              {maquininhas.map(m => <option key={m.id} value={m.id}>{[m.modelo ?? 'Sem modelo', `N/S: ${m.numero_serie ?? 'N/A'}`, m.adquirentes?.nome].filter(Boolean).join(' · ')}</option>)}
            </select>
          </div>
          {!isDesinstalacao && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solicitar nova maquininha — Adquirente <span className="ml-1 text-xs text-gray-400 font-normal">(opcional se selecionou maquininha)</span></label>
            <select value={form.adquirente_solicitado_id} onChange={e => onFormChange('adquirente_solicitado_id', e.target.value)} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white">
              <option value="">Não solicitar nova maquininha</option>
              {adquirentes.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
            {form.adquirente_solicitado_id && <p className="mt-1 text-xs text-purple-600">Status será definido como <strong>Solicitado</strong></p>}
          </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solicitado por <span className="text-red-500">*</span></label>
            <input type="text" value={form.solicitado_por} onChange={e => onFormChange('solicitado_por', e.target.value)} required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Nome de quem está solicitando" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea value={form.observacoes} onChange={e => onFormChange('observacoes', e.target.value)} rows={3} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" placeholder="Observações opcionais..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors">Cancelar</button>
            <button type="submit" disabled={submitting} className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium transition-colors ${submitClass}`}>
              {submitting ? 'Salvando...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
