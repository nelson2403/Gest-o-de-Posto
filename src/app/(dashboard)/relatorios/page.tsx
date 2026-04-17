'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { exportPDF, exportXLS, type ReportData, type ReportColumn } from '@/lib/utils/reports'
import { can, type Permission } from '@/lib/utils/permissions'
import {
  FileText, FileSpreadsheet, Loader2,
  Smartphone, Percent, MapPin, Link2,
  KeyRound, Monitor, Server, Building2,
  CheckCircle2, AlertTriangle, Clock, HelpCircle, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatPercent, formatDate, formatCurrency } from '@/lib/utils/formatters'
import type { Role } from '@/types/database.types'

// ── Demonstrativo de Conciliação Bancária por Posto ──────

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
  em_dia:       { label: 'Em Dia',       icon: CheckCircle2,   className: 'text-green-700 bg-green-100 border-green-200',  rowClass: '' },
  em_andamento: { label: 'Em Andamento', icon: Clock,          className: 'text-blue-700 bg-blue-100 border-blue-200',     rowClass: '' },
  atrasada:     { label: 'Atrasada',     icon: AlertTriangle,  className: 'text-red-700 bg-red-100 border-red-200',        rowClass: 'bg-red-50' },
  sem_registro: { label: 'Sem Registro', icon: HelpCircle,     className: 'text-gray-500 bg-gray-100 border-gray-200',     rowClass: '' },
}

function ConciliacaoDemonstrativo() {
  const supabase = createClient()
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
      // Usa RPC com LATERAL JOIN no banco para garantir a tarefa mais
      // recente por posto, independente de geração automática ou manual.
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
      console.error(err)
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
        { header: 'Posto',        key: 'posto_nome',     width: 32 },
        { header: 'Responsável',  key: 'usuario_nome',   width: 20 },
        { header: 'Situação',     key: 'situacao',       width: 16 },
        { header: 'Dia a Fazer',  key: 'dia_a_fazer',    width: 16 },
        { header: 'Concluídos',   key: 'data_conclusao', width: 18 },
      ]
      const exportRows = rows.map(r => ({
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
      toast({ title: 'Demonstrativo exportado!', description: `Arquivo ${format.toUpperCase()} gerado com sucesso.` })
    } catch (err) {
      console.error(err)
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
    <div className="space-y-3">
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          Demonstrativo — Conciliação Bancária por Posto
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filtro por usuário */}
          {usuariosUnicos.length > 0 && (
            <select
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              className="h-7 px-2 pr-6 text-[11px] border border-gray-200 rounded-md bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400"
            >
              <option value="">Todos os responsáveis</option>
              {usuariosUnicos.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-gray-500 hover:text-gray-700"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={cn('w-3 h-3 mr-1', loading && 'animate-spin')} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px] gap-1 border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => handleExport('pdf')}
            disabled={loading || exportingPDF || rows.length === 0}
          >
            {exportingPDF ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px] gap-1 border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => handleExport('xls')}
            disabled={loading || exportingXLS || rows.length === 0}
          >
            {exportingXLS ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
            Excel
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      {!loading && rowsFiltradas.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { key: 'em_dia',       label: 'Em Dia',       color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
            { key: 'atrasada',     label: 'Atrasadas',    color: 'text-red-700',   bg: 'bg-red-50 border-red-200' },
            { key: 'em_andamento', label: 'Em Andamento', color: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200' },
            { key: 'sem_registro', label: 'Sem Registro', color: 'text-gray-500',  bg: 'bg-gray-50 border-gray-200' },
          ] as const).map(s => (
            <div key={s.key} className={cn('rounded-xl border px-4 py-3 flex flex-col', s.bg)}>
              <span className={cn('text-2xl font-bold', s.color)}>{totais[s.key]}</span>
              <span className="text-[11px] text-gray-500 mt-0.5">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-[13px]">Carregando situação dos postos…</span>
          </div>
        ) : rowsFiltradas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[13px] text-gray-400">
            {filtroUsuario ? `Nenhum posto encontrado para "${filtroUsuario}".` : 'Nenhum posto encontrado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-[35%]">Posto</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-[16%]">Responsável</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-[16%]">Situação</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-[15%]">Dia a Fazer</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-[18%]">Concluídos</th>
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
                      'border-b border-gray-100 last:border-0',
                      cfg.rowClass,
                      i % 2 === 0 && !cfg.rowClass ? 'bg-white' : !cfg.rowClass ? 'bg-gray-50/50' : ''
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-800">{row.posto_nome}</td>
                    <td className="px-4 py-2.5 text-gray-600">{row.usuario_nome ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium', cfg.className)}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className={cn('px-4 py-2.5', row.status === 'atrasada' ? 'text-red-600 font-semibold' : 'text-gray-600')}>
                      {row.status !== 'em_dia' && row.prazo ? formatDate(row.prazo) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
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
  )
}

// ── Definição dos relatórios disponíveis ─────────────────
interface ReportDef {
  id: string
  title: string
  description: string
  icon: React.ElementType
  iconColor: string
  iconBg: string
  permission: Permission
  fetch: (supabase: ReturnType<typeof createClient>, role: Role | undefined) => Promise<ReportData>
}

const REPORTS: ReportDef[] = [
  // ── Postos ──────────────────────────────────────────────
  {
    id: 'postos',
    title: 'Postos de Combustível',
    description: 'Lista de todos os postos com endereço, CNPJ e status.',
    icon: MapPin,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-100',
    permission: 'postos.view',
    fetch: async (supabase) => {
      const { data } = await supabase
        .from('postos')
        .select('nome, cnpj, endereco, email, ativo, empresa:empresas(nome)')
        .order('nome')

      const columns: ReportColumn[] = [
        { header: 'Nome',     key: 'nome',    width: 28 },
        { header: 'CNPJ',     key: 'cnpj',    width: 18 },
        { header: 'Endereço', key: 'endereco', width: 40 },
        { header: 'Email',    key: 'email',    width: 28 },
        { header: 'Empresa',  key: 'empresa',  width: 24 },
        { header: 'Status',   key: 'status',   width: 12 },
      ]

      const rows = (data ?? []).map(r => ({
        nome:     r.nome,
        cnpj:     r.cnpj ?? '—',
        endereco: r.endereco ?? '—',
        email:    r.email ?? '—',
        empresa:  (r.empresa as { nome?: string } | null)?.nome ?? '—',
        status:   r.ativo ? 'Ativo' : 'Inativo',
      }))

      return { title: 'Postos de Combustível', columns, rows }
    },
  },

  // ── Maquininhas ─────────────────────────────────────────
  {
    id: 'maquininhas',
    title: 'Maquininhas',
    description: 'Terminais cadastrados com status, adquirente e número de série.',
    icon: Smartphone,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    permission: 'maquininhas.view',
    fetch: async (supabase) => {
      const { data } = await supabase
        .from('maquininhas')
        .select('numero_serie, modelo, status, motivo_status, valor_aluguel, posto:postos(nome), adquirente:adquirentes(nome)')
        .order('status')

      const STATUS_LABEL: Record<string, string> = {
        ativo: 'Ativa', inativo: 'Inativa', manutencao: 'Manutenção', extraviada: 'Extraviada',
      }

      const columns: ReportColumn[] = [
        { header: 'Posto',       key: 'posto',        width: 26 },
        { header: 'Adquirente',  key: 'adquirente',   width: 18 },
        { header: 'Modelo',      key: 'modelo',        width: 20 },
        { header: 'Nº Série',    key: 'numero_serie',  width: 18 },
        { header: 'Status',      key: 'status',        width: 14 },
        { header: 'Motivo',      key: 'motivo_status', width: 30 },
        { header: 'Aluguel',     key: 'valor_aluguel', width: 16 },
      ]

      const rows = (data ?? []).map(r => ({
        posto:        (r.posto as { nome?: string } | null)?.nome ?? '—',
        adquirente:   (r.adquirente as { nome?: string } | null)?.nome ?? '—',
        modelo:       r.modelo ?? '—',
        numero_serie: r.numero_serie ?? '—',
        status:       STATUS_LABEL[r.status] ?? r.status,
        motivo_status: r.motivo_status ?? '—',
        valor_aluguel: formatCurrency((r as { valor_aluguel?: number | null }).valor_aluguel ?? null),
      }))

      return { title: 'Maquininhas', columns, rows }
    },
  },

  // ── Taxas ───────────────────────────────────────────────
  {
    id: 'taxas',
    title: 'Taxas por Adquirente',
    description: 'Taxas de débito, crédito e parcelado por posto e adquirente.',
    icon: Percent,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    permission: 'taxas.view',
    fetch: async (supabase) => {
      const { data } = await supabase
        .from('taxas')
        .select('taxa_debito, taxa_credito, taxa_credito_parcelado, observacoes, posto:postos(nome), adquirente:adquirentes(nome)')
        .order('posto_id')

      const columns: ReportColumn[] = [
        { header: 'Posto',          key: 'posto',                  width: 28 },
        { header: 'Adquirente',     key: 'adquirente',             width: 18 },
        { header: 'Débito',         key: 'taxa_debito',            width: 12 },
        { header: 'Crédito',        key: 'taxa_credito',           width: 12 },
        { header: 'Créd. Parc.',    key: 'taxa_credito_parcelado', width: 14 },
        { header: 'Observações',    key: 'observacoes',            width: 32 },
      ]

      const rows = (data ?? []).map(r => ({
        posto:                  (r.posto as { nome?: string } | null)?.nome ?? '—',
        adquirente:             (r.adquirente as { nome?: string } | null)?.nome ?? '—',
        taxa_debito:            formatPercent(r.taxa_debito),
        taxa_credito:           formatPercent(r.taxa_credito),
        taxa_credito_parcelado: formatPercent(r.taxa_credito_parcelado),
        observacoes:            r.observacoes ?? '—',
      }))

      return { title: 'Taxas por Adquirente', columns, rows }
    },
  },

  // ── Acessos Unificados ──────────────────────────────────
  {
    id: 'acessos-unificados',
    title: 'Acessos Unificados',
    description: 'Logins dos portais por posto. Senhas visíveis apenas para admin/master.',
    icon: Link2,
    iconColor: 'text-teal-600',
    iconBg: 'bg-teal-100',
    permission: 'acessos.view',
    fetch: async (supabase, role) => {
      const { data } = await supabase
        .from('acessos_unificados')
        .select('login, senha, observacoes, posto:postos(nome), portal:portais(nome)')
        .order('posto_id')

      const showSenha = role === 'master' || role === 'admin'

      const columns: ReportColumn[] = [
        { header: 'Posto',       key: 'posto',       width: 28 },
        { header: 'Portal',      key: 'portal',      width: 22 },
        { header: 'Login',       key: 'login',       width: 26 },
        ...(showSenha ? [{ header: 'Senha', key: 'senha', width: 20 } as ReportColumn] : []),
        { header: 'Observações', key: 'observacoes', width: 30 },
      ]

      const rows = (data ?? []).map(r => ({
        posto:       (r.posto as { nome?: string } | null)?.nome ?? '—',
        portal:      (r.portal as { nome?: string } | null)?.nome ?? '—',
        login:       r.login,
        senha:       showSenha ? (r.senha ?? '—') : '••••••••',
        observacoes: r.observacoes ?? '—',
      }))

      return {
        title: 'Acessos Unificados',
        subtitle: showSenha ? undefined : 'Senhas ocultadas — acesso de operador',
        columns,
        rows,
      }
    },
  },

  // ── Acessos dos Postos ──────────────────────────────────
  {
    id: 'acessos-postos',
    title: 'Acessos dos Postos',
    description: 'Logins individuais por posto em cada portal.',
    icon: KeyRound,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-100',
    permission: 'acessos.view',
    fetch: async (supabase, role) => {
      const { data } = await supabase
        .from('acessos_postos')
        .select('login, senha, observacoes, posto:postos(nome), portal:portais(nome)')
        .order('posto_id')

      const showSenha = role === 'master' || role === 'admin'

      const columns: ReportColumn[] = [
        { header: 'Posto',       key: 'posto',       width: 28 },
        { header: 'Portal',      key: 'portal',      width: 22 },
        { header: 'Login',       key: 'login',       width: 26 },
        ...(showSenha ? [{ header: 'Senha', key: 'senha', width: 20 } as ReportColumn] : []),
        { header: 'Observações', key: 'observacoes', width: 30 },
      ]

      const rows = (data ?? []).map(r => ({
        posto:       (r.posto as { nome?: string } | null)?.nome ?? '—',
        portal:      (r.portal as { nome?: string } | null)?.nome ?? '—',
        login:       r.login,
        senha:       showSenha ? (r.senha ?? '—') : '••••••••',
        observacoes: r.observacoes ?? '—',
      }))

      return {
        title: 'Acessos dos Postos',
        subtitle: showSenha ? undefined : 'Senhas ocultadas — acesso de operador',
        columns,
        rows,
      }
    },
  },

  // ── AnyDesk ─────────────────────────────────────────────
  {
    id: 'anydesk',
    title: 'Acessos AnyDesk',
    description: 'Números AnyDesk por posto. Senhas visíveis apenas para admin/master.',
    icon: Monitor,
    iconColor: 'text-indigo-600',
    iconBg: 'bg-indigo-100',
    permission: 'anydesk.view',
    fetch: async (supabase, role) => {
      const { data } = await supabase
        .from('acessos_anydesk')
        .select('numero_anydesk, senha, observacoes, posto:postos(nome)')
        .order('posto_id')

      const showSenha = role === 'master' || role === 'admin'

      const columns: ReportColumn[] = [
        { header: 'Posto',         key: 'posto',          width: 30 },
        { header: 'Nº AnyDesk',    key: 'numero_anydesk', width: 20 },
        ...(showSenha ? [{ header: 'Senha', key: 'senha', width: 18 } as ReportColumn] : []),
        { header: 'Observações',   key: 'observacoes',    width: 34 },
      ]

      const rows = (data ?? []).map(r => ({
        posto:          (r.posto as { nome?: string } | null)?.nome ?? '—',
        numero_anydesk: r.numero_anydesk,
        senha:          showSenha ? (r.senha ?? '—') : '••••••••',
        observacoes:    r.observacoes ?? '—',
      }))

      return {
        title: 'Acessos AnyDesk',
        subtitle: showSenha ? undefined : 'Senhas ocultadas — acesso de operador',
        columns,
        rows,
      }
    },
  },

  // ── Servidores ──────────────────────────────────────────
  {
    id: 'servidores',
    title: 'Servidores dos Postos',
    description: 'IPs, portas e credenciais de banco de dados por posto.',
    icon: Server,
    iconColor: 'text-gray-600',
    iconBg: 'bg-gray-100',
    permission: 'servidores.view',
    fetch: async (supabase, role) => {
      const { data } = await supabase
        .from('servidores_postos')
        .select('nome_banco, ip, porta, usuario, senha, observacoes, posto:postos(nome)')
        .order('posto_id')

      const showSenha = role === 'master' || role === 'admin'

      const columns: ReportColumn[] = [
        { header: 'Posto',       key: 'posto',       width: 26 },
        { header: 'Banco',       key: 'nome_banco',  width: 16 },
        { header: 'IP / Host',   key: 'ip_porta',    width: 22 },
        { header: 'Usuário',     key: 'usuario',     width: 16 },
        ...(showSenha ? [{ header: 'Senha', key: 'senha', width: 16 } as ReportColumn] : []),
        { header: 'Observações', key: 'observacoes', width: 28 },
      ]

      const rows = (data ?? []).map(r => ({
        posto:       (r.posto as { nome?: string } | null)?.nome ?? '—',
        nome_banco:  r.nome_banco ?? '—',
        ip_porta:    `${r.ip}:${r.porta ?? 5432}`,
        usuario:     r.usuario ?? '—',
        senha:       showSenha ? (r.senha ?? '—') : '••••••••',
        observacoes: r.observacoes ?? '—',
      }))

      return {
        title: 'Servidores dos Postos',
        subtitle: showSenha ? undefined : 'Senhas ocultadas — acesso de operador',
        columns,
        rows,
      }
    },
  },

  // ── Empresas (apenas master/admin) ──────────────────────
  {
    id: 'empresas',
    title: 'Empresas',
    description: 'Cadastro completo de empresas do sistema.',
    icon: Building2,
    iconColor: 'text-purple-600',
    iconBg: 'bg-purple-100',
    permission: 'empresas.view',
    fetch: async (supabase) => {
      const { data } = await supabase
        .from('empresas')
        .select('nome, cnpj, email, status, criado_em')
        .order('nome')

      const STATUS_LABEL: Record<string, string> = {
        ativo: 'Ativo', inativo: 'Inativo', suspenso: 'Suspenso',
      }

      const columns: ReportColumn[] = [
        { header: 'Nome',      key: 'nome',      width: 32 },
        { header: 'CNPJ',      key: 'cnpj',      width: 20 },
        { header: 'Email',     key: 'email',      width: 30 },
        { header: 'Status',    key: 'status',     width: 14 },
        { header: 'Cadastro',  key: 'criado_em',  width: 18 },
      ]

      const rows = (data ?? []).map(r => ({
        nome:      r.nome,
        cnpj:      r.cnpj ?? '—',
        email:     r.email ?? '—',
        status:    STATUS_LABEL[r.status] ?? r.status,
        criado_em: formatDate(r.criado_em),
      }))

      return { title: 'Empresas', columns, rows }
    },
  },
]

// ── Componente de card de relatório ─────────────────────
function ReportCard({ report, role }: { report: ReportDef; role: Role | undefined }) {
  const supabase = createClient()
  const [loadingPDF, setLoadingPDF] = useState(false)
  const [loadingXLS, setLoadingXLS] = useState(false)

  async function handleExport(format: 'pdf' | 'xls') {
    const setLoading = format === 'pdf' ? setLoadingPDF : setLoadingXLS
    setLoading(true)
    try {
      const data = await report.fetch(supabase, role)
      data.generatedAt = new Date().toLocaleString('pt-BR')

      if (data.rows.length === 0) {
        toast({ title: 'Sem dados', description: 'Não há registros para exportar.' })
        return
      }

      if (format === 'pdf') {
        await exportPDF(data)
      } else {
        await exportXLS(data)
      }

      toast({ title: `${report.title} exportado!`, description: `Arquivo ${format.toUpperCase()} gerado com sucesso.` })
    } catch (err) {
      console.error(err)
      toast({ variant: 'destructive', title: 'Erro ao gerar relatório', description: String(err) })
    } finally {
      setLoading(false)
    }
  }

  const Icon = report.icon
  const isLoading = loadingPDF || loadingXLS

  return (
    <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', report.iconBg)}>
            <Icon className={cn('w-5 h-5', report.iconColor)} />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-[14px] font-semibold text-gray-900">{report.title}</CardTitle>
            <CardDescription className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
              {report.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2">
          {/* PDF */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 text-[12px] h-8 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            onClick={() => handleExport('pdf')}
            disabled={isLoading}
          >
            {loadingPDF
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FileText className="w-3.5 h-3.5" />
            }
            PDF
          </Button>

          {/* XLS */}
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 text-[12px] h-8 border-green-200 text-green-700 hover:bg-green-50 hover:border-green-300"
            onClick={() => handleExport('xls')}
            disabled={isLoading}
          >
            {loadingXLS
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FileSpreadsheet className="w-3.5 h-3.5" />
            }
            Excel
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Página principal ────────────────────────────────────
export default function RelatoriosPage() {
  const { usuario } = useAuthContext()
  const role = usuario?.role as Role | undefined
  const isOperador = role === 'operador'

  const visibleReports = REPORTS.filter(r => can(role ?? null, r.permission))

  return (
    <div className="animate-fade-in">
      <Header
        title="Relatórios"
        description="Exporte dados do sistema em PDF ou Excel"
      />

      <div className="p-3 md:p-6 space-y-6">
        {/* Aviso para operadores */}
        {isOperador && (
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-[13px] text-amber-800">
            <FileText className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
            <p>
              <strong>Modo operador:</strong> Nos relatórios que contêm senhas, elas serão exibidas como <code className="bg-amber-100 px-1 rounded">••••••••</code> por segurança.
            </p>
          </div>
        )}

        {/* Grid de relatórios */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Relatórios disponíveis
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleReports.map(report => (
              <ReportCard key={report.id} report={report} role={role} />
            ))}
          </div>
        </div>

        {/* Legenda */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[11px] text-gray-400 leading-relaxed">
            <strong className="text-gray-500">PDF</strong> — Ideal para impressão e compartilhamento formal.{' '}
            <strong className="text-gray-500">Excel</strong> — Ideal para análise, filtragem e manipulação dos dados.
            {isOperador && ' Senhas sensíveis são ocultadas para perfis de operador.'}
          </p>
        </div>
      </div>
    </div>
  )
}
