'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  Loader2, ScanSearch, Landmark, CalendarPlus,
  CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw,
  MapPin, Calendar, Users, ChevronRight, Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Tarefa, StatusTarefa } from '@/types/database.types'

const STATUS_CONFIG: Record<StatusTarefa, { label: string; icon: React.ElementType; className: string }> = {
  pendente:     { label: 'Pendente',     icon: Clock,         className: 'bg-gray-100 text-gray-700 border-gray-200' },
  em_andamento: { label: 'Em andamento', icon: AlertTriangle, className: 'bg-blue-100 text-blue-700 border-blue-200' },
  concluido:    { label: 'Concluído',    icon: CheckCircle2,  className: 'bg-green-100 text-green-700 border-green-200' },
  cancelado:    { label: 'Cancelado',    icon: XCircle,       className: 'bg-red-100 text-red-700 border-red-200' },
}

type ContaBancariaSimples = { id: string; banco: string }

type Conciliador = {
  id: string
  nome: string
  email: string
  empresa_id: string
  postos: string[]
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

export default function TarefasConciliacaoPage() {
  const supabase = createClient()
  const { usuario, canUser } = useAuthContext()
  const isMasterAdmin = canUser('usuarios.edit')

  const [tarefas,  setTarefas]  = useState<Tarefa[]>([])
  const [loading,  setLoading]  = useState(true)
  const [gerando,  setGerando]  = useState(false)

  // ── Modal conciliadores ──────────────────────────────────────────
  const [openConciliadores, setOpenConciliadores] = useState(false)
  const [conciliadores, setConciliadores] = useState<Conciliador[]>([])
  const [loadingConc, setLoadingConc] = useState(false)

  // ── Modal postos do conciliador selecionado ──────────────────────
  const [selectedConc,  setSelectedConc]  = useState<Conciliador | null>(null)
  const [openPostos,    setOpenPostos]    = useState(false)
  const [postosEmpresa, setPostosEmpresa] = useState<{ id: string; nome: string }[]>([])
  const [postosAtivos,  setPostosAtivos]  = useState<Set<string>>(new Set())
  const [bancosAtivos,  setBancosAtivos]  = useState<Set<string>>(new Set())
  const [contasPorPosto, setContasPorPosto] = useState<Record<string, ContaBancariaSimples[]>>({})
  const [loadingPostos, setLoadingPostos] = useState(false)
  const [savingPostos,  setSavingPostos]  = useState(false)

  // ── Modal dia especial ───────────────────────────────────────────
  const [openDiaEspecial, setOpenDiaEspecial] = useState(false)
  const [diaEspecialData, setDiaEspecialData] = useState('')
  const [diaEspecialDesc, setDiaEspecialDesc] = useState('')
  const [gerandoEspecial, setGerandoEspecial] = useState(false)

  // ── Carregar lista de tarefas ────────────────────────────────────
  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('tarefas')
      .select('*, usuario:usuarios(id, nome, email), posto:postos(id, nome)')
      .eq('categoria', 'conciliacao_bancaria')
      .order('data_inicio', { ascending: false })
      .limit(200)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar tarefas', description: error.message })
    } else {
      setTarefas((data ?? []) as Tarefa[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Gerar próximo dia ────────────────────────────────────────────
  async function handleGerarProximoDia() {
    setGerando(true)
    const { data, error } = await supabase.rpc('gerar_tarefas_proximo_dia')
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao gerar tarefas', description: error.message })
    } else {
      const qtd = data as number
      toast({
        title: qtd === 0 ? 'Nenhuma tarefa nova' : `${qtd} tarefa${qtd !== 1 ? 's' : ''} gerada${qtd !== 1 ? 's' : ''}!`,
        description: qtd === 0 ? 'As tarefas do próximo dia já existem.' : 'Tarefas criadas com sucesso.',
      })
      load()
    }
    setGerando(false)
  }

  async function handleGerarDiaEspecial() {
    if (!diaEspecialData) { toast({ variant: 'destructive', title: 'Selecione uma data' }); return }
    setGerandoEspecial(true)
    const { data, error } = await supabase.rpc('gerar_tarefas_dia_especial', { p_data: diaEspecialData })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao gerar tarefas', description: error.message })
    } else {
      const qtd = data as number
      const [y, m, d] = diaEspecialData.split('-')
      const dataFmt = `${d}/${m}/${y}`
      toast({
        title: qtd === 0 ? `Tarefas de ${dataFmt} já existem` : `${qtd} tarefa${qtd !== 1 ? 's' : ''} gerada${qtd !== 1 ? 's' : ''} para ${dataFmt}!`,
        description: qtd === 0
          ? 'Nenhuma tarefa nova criada — todas já existiam.'
          : diaEspecialDesc ? `Motivo: ${diaEspecialDesc}` : undefined,
      })
      setOpenDiaEspecial(false)
      setDiaEspecialData('')
      setDiaEspecialDesc('')
      load()
    }
    setGerandoEspecial(false)
  }

  // ── Abrir lista de conciliadores ─────────────────────────────────
  async function openGerenciarConciliadores() {
    setOpenConciliadores(true)
    setLoadingConc(true)

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
      const uid = r.usuario_id as string
      const nome = (r as any).posto?.nome as string | undefined
      if (!nome) continue
      if (!postosPorUser[uid]) postosPorUser[uid] = []
      if (!postosPorUser[uid].includes(nome)) postosPorUser[uid].push(nome)
    }

    setConciliadores(
      (users ?? []).map((u: any) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        empresa_id: u.empresa_id,
        postos: postosPorUser[u.id] ?? [],
      }))
    )
    setLoadingConc(false)
  }

  // ── Abrir modal de postos para um conciliador ────────────────────
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

    await supabase.from('tarefas_recorrentes').update({ ativo: false })
      .eq('usuario_id', selectedConc.id).is('posto_id', null)

    const { data: existentes } = await supabase
      .from('tarefas_recorrentes')
      .select('id, posto_id, conta_bancaria_id, ativo')
      .eq('usuario_id', selectedConc.id)
      .not('posto_id', 'is', null)

    const existentesMap = new Map<string, { id: string; ativo: boolean }>(
      (existentes ?? []).map(r => [
        `${r.posto_id}:${r.conta_bancaria_id ?? 'null'}`,
        { id: r.id, ativo: r.ativo },
      ])
    )

    const ops: Promise<unknown>[] = []

    for (const posto of postosEmpresa) {
      const postoMarcado = postosAtivos.has(posto.id)
      const contas = contasPorPosto[posto.id] ?? []

      if (contas.length === 0) {
        const key = `${posto.id}:null`
        const existe = existentesMap.get(key)
        if (postoMarcado && !existe) {
          ops.push(supabase.from('tarefas_recorrentes').insert({
            empresa_id: selectedConc.empresa_id, usuario_id: selectedConc.id,
            posto_id: posto.id,
            titulo: `Conciliação Bancária — ${posto.nome}`,
            descricao: `Conciliar os lançamentos bancários do posto ${posto.nome}.`,
            categoria: 'conciliacao_bancaria', prioridade: 'alta',
            carencia_dias: 4, tolerancia_dias: 1, ativo: true,
          }) as unknown as Promise<unknown>)
        } else if (postoMarcado && existe && !existe.ativo) {
          ops.push(supabase.from('tarefas_recorrentes').update({ ativo: true }).eq('id', existe.id) as unknown as Promise<unknown>)
        } else if (!postoMarcado && existe?.ativo) {
          ops.push(supabase.from('tarefas_recorrentes').update({ ativo: false }).eq('id', existe.id) as unknown as Promise<unknown>)
        }
      } else {
        for (const conta of contas) {
          const bancoKey = `${posto.id}:${conta.id}`
          const bancoMarcado = postoMarcado && bancosAtivos.has(bancoKey)
          const key = `${posto.id}:${conta.id}`
          const existe = existentesMap.get(key)
          if (bancoMarcado && !existe) {
            ops.push(supabase.from('tarefas_recorrentes').insert({
              empresa_id: selectedConc.empresa_id, usuario_id: selectedConc.id,
              posto_id: posto.id, conta_bancaria_id: conta.id, banco: conta.banco,
              titulo: `Conciliação ${conta.banco} — ${posto.nome}`,
              descricao: `Conciliar o extrato ${conta.banco} do posto ${posto.nome}.`,
              categoria: 'conciliacao_bancaria', prioridade: 'alta',
              carencia_dias: 4, tolerancia_dias: 1, ativo: true,
            }) as unknown as Promise<unknown>)
          } else if (bancoMarcado && existe && !existe.ativo) {
            ops.push(supabase.from('tarefas_recorrentes').update({ ativo: true }).eq('id', existe.id) as unknown as Promise<unknown>)
          } else if (!bancoMarcado && existe?.ativo) {
            ops.push(supabase.from('tarefas_recorrentes').update({ ativo: false }).eq('id', existe.id) as unknown as Promise<unknown>)
          }
        }
      }
    }

    await Promise.all(ops)
    await supabase.rpc('fix_tarefas_apos_troca_posto')

    const totalAtivos = bancosAtivos.size || postosAtivos.size
    toast({ title: 'Postos atualizados!', description: `${totalAtivos} tarefa(s) recorrente(s) ativa(s) para ${selectedConc.nome}.` })
    setSavingPostos(false)
    setOpenPostos(false)

    // Atualiza a lista de conciliadores no fundo
    const updatedPostos = postosEmpresa
      .filter(p => postosAtivos.has(p.id))
      .map(p => p.nome)
    setConciliadores(prev => prev.map(c =>
      c.id === selectedConc.id ? { ...c, postos: updatedPostos } : c
    ))
  }

  // ── Agrupar tarefas por data ─────────────────────────────────────
  const grupos = tarefas.reduce<Record<string, Tarefa[]>>((acc, t) => {
    const key = (t.data_inicio ?? '').split('T')[0]
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  const datasOrdenadas = Object.keys(grupos).sort((a, b) => b.localeCompare(a))

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title="Geração de Tarefas"
        description="Conciliação Bancária"
        actions={
          <div className="flex items-center gap-2">
            {isMasterAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openGerenciarConciliadores}
                  className="gap-1.5 border-cyan-200 text-cyan-700 hover:bg-cyan-50"
                >
                  <Users className="w-4 h-4" />
                  Conciliadores
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenDiaEspecial(true)}
                  className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  <Landmark className="w-4 h-4" />
                  Dia Especial
                </Button>
              </>
            )}
            <Button
              size="sm"
              onClick={handleGerarProximoDia}
              disabled={gerando}
              className="gap-1.5 bg-orange-500 hover:bg-orange-600"
            >
              {gerando
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
                : <><CalendarPlus className="w-4 h-4" /> Gerar Próximo Dia</>}
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando tarefas...</span>
          </div>
        ) : datasOrdenadas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <ScanSearch className="w-10 h-10 opacity-30" />
            <p className="text-sm">Nenhuma tarefa de conciliação encontrada.</p>
            <Button size="sm" onClick={handleGerarProximoDia} disabled={gerando} className="bg-orange-500 hover:bg-orange-600 mt-2">
              {gerando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CalendarPlus className="w-4 h-4 mr-1" />}
              Gerar tarefas do próximo dia
            </Button>
          </div>
        ) : (
          datasOrdenadas.map(data => {
            const items = grupos[data]
            const total      = items.length
            const concluidos = items.filter(t => t.status === 'concluido').length
            const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0

            return (
              <div key={data} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-50 bg-gray-50/60">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="font-semibold text-gray-800 text-[15px]">{fmtDate(data)}</span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[12px] text-gray-500">{concluidos}/{total} concluídos</span>
                    <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-orange-400')}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={cn('text-[11px] font-semibold', pct === 100 ? 'text-green-600' : 'text-orange-500')}>
                      {pct}%
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-gray-50">
                  {items.map(t => {
                    const cfg = STATUS_CONFIG[t.status]
                    const StatusIcon = cfg.icon
                    const postoNome   = (t as any).posto?.nome ?? '—'
                    const usuarioNome = (t as any).usuario?.nome ?? '—'

                    return (
                      <div key={t.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-center gap-1.5 text-[12px] text-gray-500 min-w-[140px]">
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{postoNome}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-800 truncate">{t.titulo}</p>
                          <p className="text-[11px] text-gray-400 truncate">{usuarioNome}</p>
                        </div>
                        <Badge variant="outline" className={cn('text-[11px] flex items-center gap-1 flex-shrink-0', cfg.className)}>
                          <StatusIcon className="w-3 h-3" />
                          {cfg.label}
                        </Badge>
                        {t.data_conclusao_prevista && (
                          <span className={cn(
                            'text-[11px] flex-shrink-0',
                            new Date(t.data_conclusao_prevista) < new Date() && t.status !== 'concluido' && t.status !== 'cancelado'
                              ? 'text-red-500 font-medium'
                              : 'text-gray-400',
                          )}>
                            Prazo: {fmtDate(t.data_conclusao_prevista)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Modal: Lista de conciliadores ── */}
      <Dialog open={openConciliadores} onOpenChange={setOpenConciliadores}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-cyan-600" />
              </div>
              <DialogTitle>Conciliadores</DialogTitle>
            </div>
          </DialogHeader>

          <div className="py-1">
            <p className="text-[12px] text-gray-500 mb-4">
              Configure quais postos e bancos cada conciliador é responsável. Uma tarefa diária é gerada automaticamente por posto/banco marcado.
            </p>

            {loadingConc ? (
              <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-[13px]">Carregando conciliadores...</span>
              </div>
            ) : conciliadores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
                <Users className="w-8 h-8 opacity-30" />
                <p className="text-[13px]">Nenhum conciliador cadastrado.</p>
                <p className="text-[11px] text-gray-400">Crie um usuário com o cargo "Operador Conciliador" em Usuários.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {conciliadores.map(conc => (
                  <button
                    key={conc.id}
                    onClick={() => openGerenciarPostos(conc)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-100 hover:border-cyan-200 hover:bg-cyan-50/50 transition-colors text-left group"
                  >
                    <div className="w-9 h-9 rounded-full bg-cyan-100 flex items-center justify-center flex-shrink-0 text-cyan-700 font-semibold text-[13px]">
                      {conc.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 truncate">{conc.nome}</p>
                      {conc.postos.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {conc.postos.slice(0, 3).map(p => (
                            <span key={p} className="inline-flex items-center gap-1 text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-100 rounded-full px-2 py-0.5">
                              <Building2 className="w-2.5 h-2.5" />
                              {p}
                            </span>
                          ))}
                          {conc.postos.length > 3 && (
                            <span className="text-[10px] text-gray-400">+{conc.postos.length - 3} mais</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-gray-400 mt-0.5">Nenhum posto configurado</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-cyan-500 flex-shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenConciliadores(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Postos do conciliador ── */}
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
              Selecione os postos que este conciliador é responsável. Uma tarefa diária será gerada automaticamente para cada posto/banco marcado.
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
                                  bancoChecked ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'hover:bg-gray-50 text-gray-500 border border-transparent'
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

      {/* ── Modal: Dia Especial ── */}
      <Dialog open={openDiaEspecial} onOpenChange={o => { if (!gerandoEspecial) setOpenDiaEspecial(o) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Landmark className="w-4 h-4 text-blue-600" />
              </div>
              <DialogTitle>Gerar Tarefas — Dia Especial</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <p className="text-[12px] text-blue-700 leading-relaxed">
                Use esta opção para gerar tarefas em datas que normalmente seriam puladas —
                como feriados com expediente bancário ou pontos facultativos.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-gray-700">Data <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={diaEspecialData}
                onChange={e => setDiaEspecialData(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-gray-700">Motivo <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input
                type="text"
                value={diaEspecialDesc}
                onChange={e => setDiaEspecialDesc(e.target.value)}
                placeholder="Ex: Feriado com expediente bancário"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDiaEspecial(false)} disabled={gerandoEspecial}>
              Cancelar
            </Button>
            <Button
              onClick={handleGerarDiaEspecial}
              disabled={gerandoEspecial || !diaEspecialData}
              className="bg-blue-600 hover:bg-blue-700 min-w-[120px]"
            >
              {gerandoEspecial
                ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Gerando...</>
                : <><Landmark className="w-4 h-4 mr-1" /> Gerar Tarefas</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
