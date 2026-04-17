'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { exportPDF, exportXLS, type ReportData, type ReportColumn } from '@/lib/utils/reports'
import {
  FileText, FileSpreadsheet, Loader2,
  CheckCircle2, AlertTriangle, Clock, HelpCircle, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate } from '@/lib/utils/formatters'
import type { Role } from '@/types/database.types'

type ConciliacaoStatus = 'em_dia' | 'em_andamento' | 'atrasada' | 'sem_registro'

interface PostoConciliacao {
  posto_id: string
  posto_nome: string
  status: ConciliacaoStatus
  data_referencia: string | null
  prazo: string | null
  data_conclusao: string | null
  usuario_nome: string | null
}

function calcStatus(
  tarefa: { status: string; data_conclusao_prevista: string | null } | undefined,
  ultimaConclusao: string | null
): ConciliacaoStatus {
  if (!tarefa) return ultimaConclusao ? 'em_dia' : 'sem_registro'
  if (tarefa.status === 'em_andamento' || tarefa.status === 'pendente') {
    if (tarefa.data_conclusao_prevista) {
      const prazo = new Date(tarefa.data_conclusao_prevista + 'T23:59:59')
      if (prazo < new Date()) return 'atrasada'
    }
    return 'em_andamento'
  }
  return 'sem_registro'
}

const STATUS_CONFIG: Record<ConciliacaoStatus, { label: string; icon: React.ElementType; className: string; rowClass: string }> = {
  em_dia:       { label: 'Em Dia',       icon: CheckCircle2,  className: 'text-green-700 bg-green-100 border-green-200',  rowClass: '' },
  em_andamento: { label: 'Em Andamento', icon: Clock,         className: 'text-blue-700 bg-blue-100 border-blue-200',     rowClass: '' },
  atrasada:     { label: 'Atrasada',     icon: AlertTriangle, className: 'text-red-700 bg-red-100 border-red-200',        rowClass: 'bg-red-50' },
  sem_registro: { label: 'Sem Registro', icon: HelpCircle,    className: 'text-gray-500 bg-gray-100 border-gray-200',     rowClass: '' },
}

export default function DemonstrativoConciliacaoPage() {
  const supabase = createClient()
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined

  const [rows, setRows] = useState<PostoConciliacao[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingPDF, setExportingPDF] = useState(false)
  const [exportingXLS, setExportingXLS] = useState(false)
  const [filtroUsuario, setFiltroUsuario] = useState('')

  const usuariosUnicos = Array.from(
    new Set(rows.map(r => r.usuario_nome).filter(Boolean))
  ).sort() as string[]

  const rowsFiltradas = filtroUsuario
    ? rows.filter(r => r.usuario_nome === filtroUsuario)
    : rows

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_conciliacao_por_posto')
      if (error) throw error

      const result: PostoConciliacao[] = (data ?? []).map((row: {
        posto_id: string
        posto_nome: string
        status_tarefa: string | null
        data_inicio: string | null
        data_conclusao_prevista: string | null
        data_conclusao_real: string | null
        ultima_conclusao: string | null
        usuario_nome: string | null
      }) => ({
        posto_id: row.posto_id,
        posto_nome: row.posto_nome,
        status: calcStatus(
          row.status_tarefa
            ? { status: row.status_tarefa, data_conclusao_prevista: row.data_conclusao_prevista }
            : undefined,
          row.ultima_conclusao
        ),
        data_referencia: row.data_inicio ?? null,
        prazo: row.data_conclusao_prevista ?? null,
        data_conclusao: row.ultima_conclusao ?? null,
        usuario_nome: row.usuario_nome ?? null,
      }))

      setRows(result)
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao carregar demonstrativo', description: String(err) })
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleExport(format: 'pdf' | 'xls') {
    const setExporting = format === 'pdf' ? setExportingPDF : setExportingXLS
    setExporting(true)
    try {
      const columns: ReportColumn[] = [
        { header: 'Posto',       key: 'posto_nome',     width: 32 },
        { header: 'Responsável', key: 'usuario_nome',   width: 20 },
        { header: 'Situação',    key: 'situacao',       width: 16 },
        { header: 'Dia a Fazer', key: 'dia_a_fazer',    width: 16 },
        { header: 'Concluídos',  key: 'data_conclusao', width: 18 },
      ]
      const exportRows = rowsFiltradas.map(r => ({
        posto_nome:     r.posto_nome,
        usuario_nome:   r.usuario_nome ?? '—',
        situacao:       STATUS_CONFIG[r.status].label,
        dia_a_fazer:    r.status !== 'em_dia' && r.prazo ? formatDate(r.prazo) : '—',
        data_conclusao: r.data_conclusao ? formatDate(r.data_conclusao) : '—',
      }))
      const data: ReportData = {
        title: 'Demonstrativo de Conciliação Bancária',
        subtitle: 'Situação atual da conciliação por posto',
        columns,
        rows: exportRows,
        generatedAt: new Date().toLocaleString('pt-BR'),
      }
      if (format === 'pdf') await exportPDF(data)
      else await exportXLS(data)
      toast({ title: 'Demonstrativo exportado!' })
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao exportar', description: String(err) })
    } finally {
      setExporting(false)
    }
  }

  const totais = {
    em_dia:       rowsFiltradas.filter(r => r.status === 'em_dia').length,
    atrasada:     rowsFiltradas.filter(r => r.status === 'atrasada').length,
    em_andamento: rowsFiltradas.filter(r => r.status === 'em_andamento').length,
    sem_registro: rowsFiltradas.filter(r => r.status === 'sem_registro').length,
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header
        title="Demonstrativo"
        description="Conciliação Bancária por Posto"
        actions={
          <div className="flex items-center gap-2">
            {usuariosUnicos.length > 0 && (
              <select
                value={filtroUsuario}
                onChange={e => setFiltroUsuario(e.target.value)}
                className="h-8 px-2 pr-6 text-[12px] border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400"
              >
                <option value="">Todos os responsáveis</option>
                {usuariosUnicos.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
            <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              Atualizar
            </Button>
            <Button variant="outline" size="sm"
              className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => handleExport('pdf')}
              disabled={loading || exportingPDF || rows.length === 0}
            >
              {exportingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              PDF
            </Button>
            <Button variant="outline" size="sm"
              className="gap-1.5 border-green-200 text-green-700 hover:bg-green-50"
              onClick={() => handleExport('xls')}
              disabled={loading || exportingXLS || rows.length === 0}
            >
              {exportingXLS ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Excel
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4">
        {/* Cards de resumo */}
        {!loading && rowsFiltradas.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { key: 'em_dia',       label: 'Em Dia',       color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
              { key: 'atrasada',     label: 'Atrasadas',    color: 'text-red-700',   bg: 'bg-red-50 border-red-200' },
              { key: 'em_andamento', label: 'Em Andamento', color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200' },
              { key: 'sem_registro', label: 'Sem Registro', color: 'text-gray-500',  bg: 'bg-gray-50 border-gray-200' },
            ] as const).map(s => (
              <div key={s.key} className={cn('rounded-xl border px-5 py-4 flex flex-col', s.bg)}>
                <span className={cn('text-3xl font-bold', s.color)}>{totais[s.key]}</span>
                <span className="text-[12px] text-gray-500 mt-1">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tabela */}
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-[13px]">Carregando situação dos postos…</span>
            </div>
          ) : rowsFiltradas.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[13px] text-gray-400">
              {filtroUsuario ? `Nenhum posto encontrado para "${filtroUsuario}".` : 'Nenhum posto encontrado.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[35%]">Posto</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[16%]">Responsável</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[16%]">Situação</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[15%]">Dia a Fazer</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600 w-[18%]">Concluídos</th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.map((row, i) => {
                  const cfg = STATUS_CONFIG[row.status]
                  const Icon = cfg.icon
                  return (
                    <tr
                      key={row.posto_id}
                      className={cn(
                        'border-b border-gray-100 last:border-0 transition-colors hover:bg-gray-50/60',
                        cfg.rowClass,
                        i % 2 === 0 && !cfg.rowClass ? 'bg-white' : !cfg.rowClass ? 'bg-gray-50/40' : '',
                      )}
                    >
                      <td className="px-5 py-3 font-medium text-gray-800">{row.posto_nome}</td>
                      <td className="px-5 py-3 text-gray-600">{row.usuario_nome ?? '—'}</td>
                      <td className="px-5 py-3">
                        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold', cfg.className)}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className={cn('px-5 py-3', row.status === 'atrasada' ? 'text-red-600 font-semibold' : 'text-gray-600')}>
                        {row.status !== 'em_dia' && row.prazo ? formatDate(row.prazo) : '—'}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {row.data_conclusao ? formatDate(row.data_conclusao) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
