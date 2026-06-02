'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  Loader2, Users, MapPin, Building2, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

type ContaBancariaSimples = { id: string; banco: string }

type Conciliador = {
  id: string
  nome: string
  email: string
  empresa_id: string
  postos: string[]
}

export default function ConciliadoresPage() {
  const supabase = createClient()
  const { canUser } = useAuthContext()
  const isMasterAdmin = canUser('usuarios.edit')

  const [conciliadores, setConciliadores] = useState<Conciliador[]>([])
  const [loading, setLoading] = useState(true)

  // ── Modal postos do conciliador ──────────────────────────────────
  const [selectedConc,   setSelectedConc]   = useState<Conciliador | null>(null)
  const [openPostos,     setOpenPostos]     = useState(false)
  const [postosEmpresa,  setPostosEmpresa]  = useState<{ id: string; nome: string }[]>([])
  const [postosAtivos,   setPostosAtivos]   = useState<Set<string>>(new Set())
  const [bancosAtivos,   setBancosAtivos]   = useState<Set<string>>(new Set())
  const [contasPorPosto, setContasPorPosto] = useState<Record<string, ContaBancariaSimples[]>>({})
  const [loadingPostos,  setLoadingPostos]  = useState(false)
  const [savingPostos,   setSavingPostos]   = useState(false)

  async function load() {
    setLoading(true)

    const { data: users } = await supabase
      .from('usuarios')
      .select('id, nome, email, empresa_id')
      .eq('role', 'operador_conciliador')
      .order('nome')

    const ids = (users ?? []).map((u: any) => u.id)
    const { data: recorrentes } = ids.length
      ? await supabase
          .from('tarefas_recorrentes')
          .select('usuario_id, posto:postos(nome)')
          .in('usuario_id', ids)
          .eq('ativo', true)
          .not('posto_id', 'is', null)
      : { data: [] }

    const postosPorUser: Record<string, string[]> = {}
    for (const r of recorrentes ?? []) {
      const uid  = r.usuario_id as string
      const nome = (r as any).posto?.nome as string | undefined
      if (!nome) continue
      if (!postosPorUser[uid]) postosPorUser[uid] = []
      if (!postosPorUser[uid].includes(nome)) postosPorUser[uid].push(nome)
    }

    setConciliadores(
      (users ?? []).map((u: any) => ({
        id:         u.id,
        nome:       u.nome,
        email:      u.email,
        empresa_id: u.empresa_id,
        postos:     postosPorUser[u.id] ?? [],
      }))
    )
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Abrir modal de postos ────────────────────────────────────────
  async function openGerenciarPostos(conc: Conciliador) {
    setSelectedConc(conc)
    setLoadingPostos(true)
    setOpenPostos(true)
    setBancosAtivos(new Set())
    setContasPorPosto({})

    const [{ data: postos }, { data: recorrentes }, { data: contas }] = await Promise.all([
      supabase.from('postos').select('id, nome').eq('empresa_id', conc.empresa_id).order('nome'),
      supabase
        .from('tarefas_recorrentes')
        .select('posto_id, conta_bancaria_id, banco')
        .eq('usuario_id', conc.id)
        .eq('ativo', true)
        .not('posto_id', 'is', null),
      supabase
        .from('contas_bancarias')
        .select('id, posto_id, banco')
        .eq('empresa_id', conc.empresa_id)
        .not('banco', 'is', null)
        .order('banco'),
    ])

    const porPosto: Record<string, ContaBancariaSimples[]> = {}
    for (const c of contas ?? []) {
      if (!c.posto_id) continue
      if (!porPosto[c.posto_id]) porPosto[c.posto_id] = []
      porPosto[c.posto_id].push({ id: c.id, banco: c.banco })
    }

    const postosSet = new Set<string>()
    const bancosSet = new Set<string>()
    for (const r of recorrentes ?? []) {
      if (r.posto_id) {
        postosSet.add(r.posto_id)
        if (r.conta_bancaria_id) bancosSet.add(`${r.posto_id}:${r.conta_bancaria_id}`)
      }
    }

    setPostosEmpresa((postos ?? []) as { id: string; nome: string }[])
    setContasPorPosto(porPosto)
    setPostosAtivos(postosSet)
    setBancosAtivos(bancosSet)
    setLoadingPostos(false)
  }

  async function handleSavePostos() {
    if (!selectedConc) return
    setSavingPostos(true)

    try {
      const res = await fetch('/api/conciliadores/postos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conciliadorId:  selectedConc.id,
          empresaId:      selectedConc.empresa_id,
          postosEmpresa,
          postosAtivos:   Array.from(postosAtivos),
          bancosAtivos:   Array.from(bancosAtivos),
          contasPorPosto,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        toast({ variant: 'destructive', title: 'Erro ao salvar', description: json.error })
        return
      }

      const totalAtivos = bancosAtivos.size || postosAtivos.size
      toast({ title: 'Salvo!', description: `${totalAtivos} tarefa(s) recorrente(s) ativa(s) para ${selectedConc.nome}.` })

      // Atualiza card na lista
      const postosNomes = postosEmpresa.filter(p => postosAtivos.has(p.id)).map(p => p.nome)
      setConciliadores(prev => prev.map(c =>
        c.id === selectedConc.id ? { ...c, postos: postosNomes } : c
      ))

      setOpenPostos(false)
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro inesperado', description: e.message })
    } finally {
      setSavingPostos(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title="Conciliadores"
        description="Configure os postos e bancos de cada conciliador"
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : conciliadores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
            <Users className="w-12 h-12 opacity-20" />
            <p className="text-sm font-medium">Nenhum conciliador cadastrado</p>
            <p className="text-[12px] text-gray-400 text-center max-w-xs">
              Crie um usuário com o cargo <strong>Operador Conciliador</strong> na página de Usuários e volte aqui para configurar os postos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
            {conciliadores.map(conc => (
              <button
                key={conc.id}
                onClick={() => isMasterAdmin ? openGerenciarPostos(conc) : undefined}
                className={cn(
                  'w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 transition-all',
                  isMasterAdmin ? 'hover:border-cyan-200 hover:shadow-md cursor-pointer group' : 'cursor-default'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0 text-cyan-700 font-bold text-[15px]">
                    {conc.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[14px] font-semibold text-gray-800 truncate">{conc.nome}</p>
                      {isMasterAdmin && (
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-cyan-500 flex-shrink-0 transition-colors" />
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{conc.email}</p>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-50">
                  {conc.postos.length === 0 ? (
                    <p className="text-[12px] text-gray-400 italic">Nenhum posto configurado</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {conc.postos.slice(0, 4).map(p => (
                        <span key={p} className="inline-flex items-center gap-1 text-[11px] bg-cyan-50 text-cyan-700 border border-cyan-100 rounded-full px-2.5 py-0.5 font-medium">
                          <Building2 className="w-3 h-3" />
                          {p}
                        </span>
                      ))}
                      {conc.postos.length > 4 && (
                        <span className="text-[11px] text-gray-400 self-center">+{conc.postos.length - 4} mais</span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal postos do conciliador ── */}
      <Dialog open={openPostos} onOpenChange={open => { if (!savingPostos) setOpenPostos(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                <MapPin className="w-4 h-4 text-cyan-600" />
              </div>
              <div>
                <DialogTitle>Postos do Conciliador</DialogTitle>
                {selectedConc && (
                  <p className="text-[12px] text-gray-400 mt-0.5">{selectedConc.nome}</p>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="py-1">
            <p className="text-[12px] text-gray-500 mb-3">
              Selecione os postos e bancos. Uma tarefa diária será gerada automaticamente para cada combinação marcada.
            </p>

            {loadingPostos ? (
              <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[13px]">Carregando postos...</span>
              </div>
            ) : postosEmpresa.length === 0 ? (
              <p className="text-[13px] text-gray-400 text-center py-6">Nenhum posto cadastrado para esta empresa.</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {postosEmpresa.map(posto => {
                  const checked = postosAtivos.has(posto.id)
                  const contas  = contasPorPosto[posto.id] ?? []
                  return (
                    <div key={posto.id}>
                      <label className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                        checked ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-gray-50 border border-transparent'
                      )}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const next = new Set(postosAtivos)
                            if (e.target.checked) next.add(posto.id)
                            else next.delete(posto.id)
                            setPostosAtivos(next)
                          }}
                          className="w-4 h-4 rounded accent-cyan-600"
                        />
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <MapPin className={cn('w-3.5 h-3.5 flex-shrink-0', checked ? 'text-cyan-600' : 'text-gray-400')} />
                          <span className={cn('text-[13px] truncate', checked ? 'font-medium text-gray-800' : 'text-gray-600')}>
                            {posto.nome}
                          </span>
                          {contas.length > 0 && (
                            <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">
                              {contas.length} banco{contas.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </label>

                      {checked && contas.length > 0 && (
                        <div className="ml-8 mb-1 space-y-0.5">
                          {contas.map(conta => {
                            const bancoKey     = `${posto.id}:${conta.id}`
                            const bancoChecked = bancosAtivos.has(bancoKey)
                            return (
                              <label
                                key={conta.id}
                                className={cn(
                                  'flex items-center gap-2.5 px-3 py-1.5 rounded-md cursor-pointer transition-colors text-[12px]',
                                  bancoChecked
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'hover:bg-gray-50 text-gray-500 border border-transparent'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={bancoChecked}
                                  onChange={e => {
                                    const next = new Set(bancosAtivos)
                                    if (e.target.checked) next.add(bancoKey)
                                    else next.delete(bancoKey)
                                    setBancosAtivos(next)
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-blue-600"
                                />
                                <span className={cn('font-medium', bancoChecked ? 'text-blue-800' : 'text-gray-500')}>
                                  {conta.banco}
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {postosEmpresa.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-3">
                {postosAtivos.size} posto(s) · {bancosAtivos.size} banco(s) selecionado(s)
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPostos(false)} disabled={savingPostos}>Cancelar</Button>
            <Button
              onClick={handleSavePostos}
              disabled={savingPostos || loadingPostos}
              className="bg-cyan-600 hover:bg-cyan-700 min-w-[90px]"
            >
              {savingPostos ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
