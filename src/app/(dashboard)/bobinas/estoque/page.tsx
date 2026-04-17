'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'

interface Posto { id: string; nome: string; ativo: boolean }
interface EntradaBobina { id: string; quantidade: number; recebido_por: string; data_entrada: string; nota_fiscal: string | null; observacoes: string | null; criado_em: string }
interface EnvioBobina { id: string; posto_id: string; quantidade: number; enviado_por: string; data_envio: string; observacoes: string | null; criado_em: string; postos?: { nome: string } }
interface Toast { id: number; message: string; type: 'success' | 'error' }

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function EstoquePage() {
  const { usuario } = useAuthContext()
  const userName = usuario?.nome ?? ''

  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState<'entradas' | 'envios'>('envios')
  const [totalEntradas, setTotalEntradas] = useState(0)
  const [totalEnvios, setTotalEnvios]     = useState(0)
  const [entradas, setEntradas] = useState<EntradaBobina[]>([])
  const [envios, setEnvios]     = useState<EnvioBobina[]>([])
  const [postos, setPostos]     = useState<Posto[]>([])
  const [toasts, setToasts]     = useState<Toast[]>([])

  const [showEntradaModal, setShowEntradaModal] = useState(false)
  const [showEnvioModal, setShowEnvioModal]     = useState(false)
  const [submitting, setSubmitting]             = useState(false)

  const [entradaQtd, setEntradaQtd] = useState('')
  const [entradaNF, setEntradaNF]   = useState('')
  const [entradaObs, setEntradaObs] = useState('')
  const [envioPosto, setEnvioPosto] = useState('')
  const [envioQtd, setEnvioQtd]     = useState('')
  const [envioObs, setEnvioObs]     = useState('')

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }, [])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const [entradasRes, enviosRes, postosRes] = await Promise.all([
      supabase.from('entradas_bobinas').select('*').order('data_entrada', { ascending: false }),
      supabase.from('envios_bobinas').select('*, postos(nome)').order('data_envio', { ascending: false }),
      supabase.from('postos').select('id, nome, ativo').eq('ativo', true).order('nome'),
    ])
    const entradasData = (entradasRes.data ?? []) as EntradaBobina[]
    const enviosData   = (enviosRes.data ?? []) as EnvioBobina[]
    setEntradas(entradasData)
    setEnvios(enviosData)
    setPostos((postosRes.data ?? []) as Posto[])
    setTotalEntradas(entradasData.reduce((s, e) => s + e.quantidade, 0))
    setTotalEnvios(enviosData.reduce((s, e) => s + e.quantidade, 0))
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleEntrada(e: React.FormEvent) {
    e.preventDefault()
    const qtd = parseInt(entradaQtd)
    if (!qtd || qtd <= 0) return
    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.from('entradas_bobinas').insert({
      quantidade: qtd, recebido_por: userName, nota_fiscal: entradaNF.trim() || null, observacoes: entradaObs.trim() || null,
    })
    setSubmitting(false)
    if (error) { addToast('Erro ao registrar entrada.', 'error'); return }
    addToast(`Entrada de ${qtd} bobina(s) registrada!`, 'success')
    setShowEntradaModal(false); setEntradaQtd(''); setEntradaNF(''); setEntradaObs('')
    loadData()
  }

  async function handleEnvio(e: React.FormEvent) {
    e.preventDefault()
    const qtd = parseInt(envioQtd)
    if (!qtd || qtd <= 0 || !envioPosto) return
    const estoqueAtual = totalEntradas - totalEnvios
    if (qtd > estoqueAtual) { addToast(`Estoque insuficiente. Disponível: ${estoqueAtual} bobina(s).`, 'error'); return }
    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.from('envios_bobinas').insert({
      posto_id: envioPosto, quantidade: qtd, enviado_por: userName, observacoes: envioObs.trim() || null,
    })
    setSubmitting(false)
    if (error) { addToast('Erro ao registrar envio.', 'error'); return }
    addToast(`Envio de ${qtd} bobina(s) registrado!`, 'success')
    setShowEnvioModal(false); setEnvioPosto(''); setEnvioQtd(''); setEnvioObs('')
    loadData()
  }

  const estoqueAtual = totalEntradas - totalEnvios

  return (
    <div className="animate-fade-in">
      <Header title="Estoque de Bobinas" description="Controle de entradas e envios" />

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${t.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="p-3 md:p-6 space-y-6">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[1,2,3].map(i => <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 h-28" />)}
            </div>
          </div>
        ) : (
          <>
            {/* Cards de estoque */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`rounded-xl shadow-sm border p-6 flex items-center gap-4 ${estoqueAtual <= 10 ? 'bg-red-50 border-red-200' : estoqueAtual <= 30 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${estoqueAtual <= 10 ? 'bg-red-100' : estoqueAtual <= 30 ? 'bg-yellow-100' : 'bg-green-100'}`}>
                  <svg className={`w-7 h-7 ${estoqueAtual <= 10 ? 'text-red-600' : estoqueAtual <= 30 ? 'text-yellow-600' : 'text-green-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">Estoque na Matriz</p>
                  <p className={`text-3xl font-bold ${estoqueAtual <= 10 ? 'text-red-700' : estoqueAtual <= 30 ? 'text-yellow-700' : 'text-green-700'}`}>{estoqueAtual}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{estoqueAtual <= 10 ? 'Estoque baixo!' : estoqueAtual <= 30 ? 'Atenção: estoque baixo' : 'bobinas disponíveis'}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center gap-4">
                <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" /></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Recebido</p>
                  <p className="text-3xl font-bold text-gray-900">{totalEntradas}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{entradas.length} entrada(s)</p>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Enviado</p>
                  <p className="text-3xl font-bold text-gray-900">{totalEnvios}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{envios.length} envio(s)</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={() => setShowEntradaModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Registrar Entrada
              </button>
              <button onClick={() => setShowEnvioModal(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                Enviar para Posto
              </button>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="border-b border-gray-200 flex">
                <button onClick={() => setTab('envios')} className={`px-6 py-3.5 text-sm font-medium border-b-2 transition-colors ${tab === 'envios' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  Envios para Postos ({envios.length})
                </button>
                <button onClick={() => setTab('entradas')} className={`px-6 py-3.5 text-sm font-medium border-b-2 transition-colors ${tab === 'entradas' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  Entradas na Matriz ({entradas.length})
                </button>
              </div>

              {tab === 'envios' && (
                envios.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-400 text-sm">Nenhum envio registrado</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Posto</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Qtd</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Enviado por</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Observações</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {envios.map(env => (
                          <tr key={env.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{formatDate(env.data_envio)}</td>
                            <td className="px-6 py-4 font-medium text-gray-900">{env.postos?.nome ?? '-'}</td>
                            <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">{env.quantidade}</span></td>
                            <td className="px-6 py-4 text-gray-600">{env.enviado_por}</td>
                            <td className="px-6 py-4 text-gray-400 text-xs">{env.observacoes ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {tab === 'entradas' && (
                entradas.length === 0 ? (
                  <div className="px-6 py-12 text-center text-gray-400 text-sm">Nenhuma entrada registrada</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-gray-50">
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Qtd</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Recebido por</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Nota Fiscal</th>
                        <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Observações</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-100">
                        {entradas.map(ent => (
                          <tr key={ent.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{formatDate(ent.data_entrada)}</td>
                            <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">+{ent.quantidade}</span></td>
                            <td className="px-6 py-4 text-gray-600">{ent.recebido_por}</td>
                            <td className="px-6 py-4 text-gray-600 font-mono text-xs">{ent.nota_fiscal ?? '-'}</td>
                            <td className="px-6 py-4 text-gray-400 text-xs">{ent.observacoes ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* Modal Entrada */}
      {showEntradaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Registrar Entrada de Bobinas</h2>
              <button onClick={() => setShowEntradaModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleEntrada} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade recebida *</label>
                <input type="number" min="1" value={entradaQtd} onChange={e => setEntradaQtd(e.target.value)} required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-bold" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nota Fiscal</label>
                <input type="text" value={entradaNF} onChange={e => setEntradaNF(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="NF-0000 (opcional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea value={entradaObs} onChange={e => setEntradaObs(e.target.value)} rows={2}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Opcional..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEntradaModal(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg text-sm font-semibold transition-colors">
                  {submitting ? 'Salvando...' : 'Registrar Entrada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Envio */}
      {showEnvioModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Enviar Bobinas para Posto</h2>
              <button onClick={() => setShowEnvioModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleEnvio} className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-600">Estoque disponível na matriz:</span>
                <span className={`text-lg font-bold ${estoqueAtual <= 10 ? 'text-red-600' : 'text-green-600'}`}>{estoqueAtual} bobina(s)</span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Posto *</label>
                <select value={envioPosto} onChange={e => setEnvioPosto(e.target.value)} required className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white">
                  <option value="">Selecione o posto...</option>
                  {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade a enviar *</label>
                <input type="number" min="1" max={estoqueAtual} value={envioQtd} onChange={e => setEnvioQtd(e.target.value)} required
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-lg font-bold" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea value={envioObs} onChange={e => setEnvioObs(e.target.value)} rows={2}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" placeholder="Opcional..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowEnvioModal(false)} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={submitting || estoqueAtual === 0} className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg text-sm font-semibold transition-colors">
                  {submitting ? 'Enviando...' : 'Confirmar Envio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
