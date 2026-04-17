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
  MapPin, Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Tarefa, StatusTarefa } from '@/types/database.types'

const STATUS_CONFIG: Record<StatusTarefa, { label: string; icon: React.ElementType; className: string }> = {
  pendente:     { label: 'Pendente',     icon: Clock,         className: 'bg-gray-100 text-gray-700 border-gray-200' },
  em_andamento: { label: 'Em andamento', icon: AlertTriangle, className: 'bg-blue-100 text-blue-700 border-blue-200' },
  concluido:    { label: 'Concluído',    icon: CheckCircle2,  className: 'bg-green-100 text-green-700 border-green-200' },
  cancelado:    { label: 'Cancelado',    icon: XCircle,       className: 'bg-red-100 text-red-700 border-red-200' },
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

  // Gerar próximo dia
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

  // Gerar dia especial
  const [openDiaEspecial, setOpenDiaEspecial] = useState(false)
  const [diaEspecialData, setDiaEspecialData] = useState('')
  const [diaEspecialDesc, setDiaEspecialDesc] = useState('')
  const [gerandoEspecial, setGerandoEspecial] = useState(false)

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

  // Agrupar por data_inicio
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenDiaEspecial(true)}
                className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <Landmark className="w-4 h-4" />
                Dia Especial
              </Button>
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

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
            const total    = items.length
            const concluidos = items.filter(t => t.status === 'concluido').length
            const pct = total > 0 ? Math.round((concluidos / total) * 100) : 0

            return (
              <div key={data} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Cabeçalho do dia */}
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

                {/* Lista de tarefas */}
                <div className="divide-y divide-gray-50">
                  {items.map(t => {
                    const cfg = STATUS_CONFIG[t.status]
                    const StatusIcon = cfg.icon
                    const postoNome = (t as any).posto?.nome ?? '—'
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

      {/* Modal Dia Especial */}
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
