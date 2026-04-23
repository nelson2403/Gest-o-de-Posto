'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import {
  MapPin, Smartphone, Users, TrendingUp, AlertCircle,
  Wrench, CreditCard, Globe, ArrowRight, Monitor, Server, Link2, ClipboardList,
  CheckCircle2, Clock, XCircle, Building2, RefreshCw,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import type { DashboardEmpresa, Role } from '@/types/database.types'
import type { Permission } from '@/lib/utils/permissions'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

// ─── Quick Access ──────────────────────────────────────────────────────────────

const QUICK_ACCESS = [
  { href: '/acessos-anydesk',    label: 'AnyDesk',        icon: Monitor,       iconColor: 'text-indigo-500',  iconBg: 'bg-indigo-50',  permission: 'anydesk.view' as Permission },
  { href: '/acessos-unificados', label: 'Ac. Unificados', icon: Link2,         iconColor: 'text-teal-600',    iconBg: 'bg-teal-50',    permission: 'acessos.view' as Permission },
  { href: '/acessos-postos',     label: 'Ac. Postos',     icon: MapPin,        iconColor: 'text-orange-600',  iconBg: 'bg-orange-50',  permission: 'acessos.view' as Permission },
  { href: '/tarefas',            label: 'Tarefas',        icon: ClipboardList, iconColor: 'text-amber-600',   iconBg: 'bg-amber-50',   permission: 'tarefas.view' as Permission },
  { href: '/servidores',         label: 'Servidores',     icon: Server,        iconColor: 'text-gray-600',    iconBg: 'bg-gray-100',   permission: 'servidores.view' as Permission },
  { href: '/taxas',              label: 'Taxas',          icon: TrendingUp,    iconColor: 'text-green-600',   iconBg: 'bg-green-50',   permission: 'taxas.view' as Permission },
  { href: '/portais',            label: 'Portais',        icon: Globe,         iconColor: 'text-blue-600',    iconBg: 'bg-blue-50',    permission: 'portais.view' as Permission },
]

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon: Icon, color, href }: {
  label: string; value: number | string; sub?: string
  icon: React.ElementType; color: string; href?: string
}) {
  const inner = (
    <div className={cn(
      'bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 group transition-all duration-200',
      href && 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
    )}>
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-[28px] font-bold text-gray-900 leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {href && <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function KpiSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
      <div className="skeleton w-12 h-12 rounded-xl flex-shrink-0" />
      <div className="space-y-2 flex-1">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-7 w-12 rounded" />
        <div className="skeleton h-3 w-28 rounded" />
      </div>
    </div>
  )
}

// ─── Tooltip customizado ───────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-[12px]">
      {label && <p className="font-semibold text-gray-700 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.fill }} className="font-medium">
          {p.name}: <span className="text-gray-800">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

interface CaixaRow { grid: string; nome: string; ultimo_caixa_fechado: string | null }
interface TarefaResumida { id: string; titulo: string; descricao: string | null; status: string; prioridade: string; data_conclusao_prevista: string | null; posto: { nome: string } | null }

function diffDias(iso: string) {
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const ref  = new Date(iso + 'T12:00:00'); ref.setHours(0,0,0,0)
  return Math.floor((hoje.getTime() - ref.getTime()) / 86_400_000)
}

export default function DashboardPage() {
  const { usuario, canUser } = useAuthContext()
  const supabase = createClient()
  const router   = useRouter()
  const role     = usuario?.role as Role | undefined
  const isRestrito = !canUser('dashboard.view')

  useEffect(() => {
    if (!usuario) return
    if (role === 'transpombal') { router.replace('/transpombal'); return }
    if (role === 'gerente')     { router.replace('/tanques');     return }
  }, [usuario, role])

  const [data,    setData]    = useState<DashboardEmpresa | null>(null)
  const [caixas,  setCaixas]  = useState<CaixaRow[]>([])
  const [tarefas, setTarefas] = useState<TarefaResumida[]>([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!usuario || isRestrito) { setLoading(false); return }

      const [viewRes, caixaRes, tarefasRes] = await Promise.all([
        (() => {
          let q = supabase.from('vw_dashboard_empresa').select('*')
          if (usuario.role !== 'master') q = q.eq('empresa_id', usuario.empresa_id)
          return q
        })(),
        fetch('/api/caixa-externo'),
        supabase.from('tarefas').select('id, titulo, descricao, status, prioridade, data_conclusao_prevista, posto:postos(nome)')
          .or('categoria.neq.conciliacao_bancaria,categoria.is.null')
          .in('status', ['pendente', 'em_andamento'])
          .order('data_conclusao_prevista', { ascending: true, nullsFirst: false })
          .limit(6),
      ])

      const { data: rows } = viewRes
      if (rows && rows.length > 0) {
        if (usuario.role === 'master') {
          setData(rows.reduce((acc, row) => ({
            empresa_id: 'all', empresa_nome: 'Todas as Empresas',
            total_postos:           (acc.total_postos           || 0) + row.total_postos,
            total_maquininhas:      (acc.total_maquininhas      || 0) + row.total_maquininhas,
            maquininhas_ativas:     (acc.maquininhas_ativas     || 0) + row.maquininhas_ativas,
            maquininhas_inativas:   (acc.maquininhas_inativas   || 0) + row.maquininhas_inativas,
            maquininhas_manutencao: (acc.maquininhas_manutencao || 0) + row.maquininhas_manutencao,
            total_usuarios:         (acc.total_usuarios         || 0) + row.total_usuarios,
            total_adquirentes:      (acc.total_adquirentes      || 0) + row.total_adquirentes,
          }), {} as DashboardEmpresa))
        } else {
          setData(rows[0])
        }
      }

      try {
        const cj = await caixaRes.json()
        setCaixas(cj.data ?? [])
      } catch {}

      if (tarefasRes.data) setTarefas(tarefasRes.data as unknown as TarefaResumida[])

      setLastSync(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      setLoading(false)
    }
    load()
  }, [usuario])

  const hora      = new Date().getHours()
  const saudacao  = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const quickAccessVisivel = QUICK_ACCESS.filter(item => canUser(item.permission))

  // ── Dados calculados dos caixas ──────────────────────────────────
  const caixaStats = (() => {
    if (!caixas.length) return null
    let emDia = 0, atencao = 0, atrasado = 0, semDados = 0
    for (const c of caixas) {
      if (!c.ultimo_caixa_fechado) { semDados++; continue }
      const d = diffDias(c.ultimo_caixa_fechado)
      if (d <= 1) emDia++
      else if (d <= 3) atencao++
      else atrasado++
    }
    return { emDia, atencao, atrasado, semDados }
  })()

  const caixaPieData = caixaStats ? [
    { name: 'Em dia',   value: caixaStats.emDia,    fill: '#10b981' },
    { name: 'Atenção',  value: caixaStats.atencao,  fill: '#f59e0b' },
    { name: 'Atrasado', value: caixaStats.atrasado, fill: '#ef4444' },
    { name: 'Sem dados',value: caixaStats.semDados, fill: '#d1d5db' },
  ].filter(d => d.value > 0) : []

  const maqBarData = data ? [
    { name: 'Ativas',     value: data.maquininhas_ativas,     fill: '#10b981' },
    { name: 'Inativas',   value: data.maquininhas_inativas,   fill: '#ef4444' },
    { name: 'Manutenção', value: data.maquininhas_manutencao, fill: '#f59e0b' },
  ] : []

  // Últimos postos com caixa atrasado
  const caixasAtrasadas = caixas
    .filter(c => c.ultimo_caixa_fechado && diffDias(c.ultimo_caixa_fechado) > 1)
    .sort((a, b) => (b.ultimo_caixa_fechado ?? '') < (a.ultimo_caixa_fechado ?? '') ? -1 : 1)
    .slice(0, 5)

  return (
    <div className="animate-fade-in">
      <Header
        title={`${saudacao}, ${usuario?.nome?.split(' ')[0] ?? ''}!`}
        description="Visão geral do sistema"
        actions={lastSync ? (
          <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <RefreshCw className="w-3 h-3" /> Atualizado às {lastSync}
          </span>
        ) : undefined}
      />

      <div className="p-3 md:p-6 space-y-6">

        {/* ── KPIs principais ── */}
        {!isRestrito && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {loading ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />) : (<>
              <KpiCard label="Postos"      value={data?.total_postos      ?? 0} icon={MapPin}    color="bg-[#8B1A14]"     href="/postos"      sub="Unidades cadastradas" />
              <KpiCard label="Maquininhas" value={data?.total_maquininhas ?? 0} icon={Smartphone} color="bg-blue-500"     href="/maquininhas" sub="Terminais registrados" />
              <KpiCard label="Usuários"    value={data?.total_usuarios    ?? 0} icon={Users}      color="bg-purple-500"   href="/usuarios"    sub="Acessos ativos" />
              <KpiCard label="Adquirentes" value={data?.total_adquirentes ?? 0} icon={CreditCard} color="bg-emerald-500"  href="/adquirentes" sub="Operadoras cadastradas" />
            </>)}
          </div>
        )}

        {/* ── Gráficos ── */}
        {!isRestrito && !loading && (caixaStats || data) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Gráfico: Status dos Caixas */}
            {caixaStats && caixaPieData.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-[#8B1A14]/10 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-[#8B1A14]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Fechamento de Caixas</p>
                    <p className="text-[11px] text-gray-400">{caixas.length} postos monitorados</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={140}>
                    <PieChart>
                      <Pie data={caixaPieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                        {caixaPieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 flex-1">
                    {caixaPieData.map(d => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                          <span className="text-[12px] text-gray-600">{d.name}</span>
                        </div>
                        <span className="text-[13px] font-bold text-gray-800">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Em dia',   v: caixaStats.emDia,    cls: 'bg-emerald-50 text-emerald-700' },
                    { label: 'Atenção',  v: caixaStats.atencao,  cls: 'bg-amber-50 text-amber-700' },
                    { label: 'Atrasado', v: caixaStats.atrasado, cls: 'bg-red-50 text-red-700' },
                  ].map(({ label, v, cls }) => (
                    <div key={label} className={cn('rounded-xl p-2.5 text-center', cls)}>
                      <p className="text-[20px] font-bold leading-tight">{v}</p>
                      <p className="text-[10px] font-medium mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gráfico: Maquininhas */}
            {data && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800">Status das Maquininhas</p>
                    <p className="text-[11px] text-gray-400">{data.total_maquininhas} terminais no total</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={maqBarData} barSize={36}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
                    <Bar dataKey="value" name="Qtd" radius={[6, 6, 0, 0]}>
                      {maqBarData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: 'Ativas',     v: data.maquininhas_ativas,     cls: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
                    { label: 'Inativas',   v: data.maquininhas_inativas,   cls: 'bg-red-50 text-red-700',         icon: XCircle },
                    { label: 'Manutenção', v: data.maquininhas_manutencao, cls: 'bg-amber-50 text-amber-700',     icon: Wrench },
                  ].map(({ label, v, cls, icon: Icon }) => (
                    <div key={label} className={cn('rounded-xl p-2.5 text-center', cls)}>
                      <p className="text-[20px] font-bold leading-tight">{v}</p>
                      <p className="text-[10px] font-medium mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Postos com caixa em atraso ── */}
        {!isRestrito && !loading && caixasAtrasadas.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-gray-800">Postos com Caixa em Atraso</p>
                  <p className="text-[11px] text-gray-400">Requerem atenção</p>
                </div>
              </div>
              <Link href="/controle-caixas" className="text-[11px] text-[#8B1A14] font-medium hover:underline flex items-center gap-1">
                Ver todos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {caixasAtrasadas.map(c => {
                const dias = c.ultimo_caixa_fechado ? diffDias(c.ultimo_caixa_fechado) : null
                const [y, m, d] = (c.ultimo_caixa_fechado ?? '').split('-')
                return (
                  <div key={c.grid} className="flex items-center justify-between py-2 px-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-[#8B1A14]/10 flex items-center justify-center">
                        <MapPin className="w-3.5 h-3.5 text-[#8B1A14]" />
                      </div>
                      <span className="text-[13px] font-medium text-gray-800">{c.nome}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-gray-500">{c.ultimo_caixa_fechado ? `${d}/${m}/${y}` : '—'}</span>
                      <span className={cn(
                        'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                        dias && dias > 3 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      )}>
                        {dias !== null ? `${dias}d atrás` : 'sem dados'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Tarefas pendentes ── */}
        {!isRestrito && !loading && tarefas.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <ClipboardList className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-gray-800">Tarefas em Aberto</p>
                  <p className="text-[11px] text-gray-400">{tarefas.length} pendentes</p>
                </div>
              </div>
              <Link href="/tarefas/avulsas" className="text-[11px] text-[#8B1A14] font-medium hover:underline flex items-center gap-1">
                Ver todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {tarefas.map(t => {
                const isOverdueDash = t.data_conclusao_prevista
                  ? new Date(t.data_conclusao_prevista) < new Date(new Date().toDateString())
                  : false
                const prioColors: Record<string, string> = {
                  urgente: 'bg-red-500', alta: 'bg-orange-500', media: 'bg-yellow-400', baixa: 'bg-slate-300'
                }
                return (
                  <div key={t.id} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                    <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', prioColors[t.prioridade] ?? 'bg-gray-300')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-800 leading-tight">{t.titulo}</p>
                      {t.descricao && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{t.descricao}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {t.posto && (
                          <span className="flex items-center gap-1 text-[10px] text-[#8B1A14] font-medium">
                            <MapPin className="w-3 h-3" />{(t.posto as any).nome}
                          </span>
                        )}
                        {t.data_conclusao_prevista && (
                          <span className={cn('flex items-center gap-1 text-[10px]', isOverdueDash ? 'text-red-600 font-semibold' : 'text-gray-400')}>
                            <Clock className="w-3 h-3" />
                            {isOverdueDash ? 'Atrasada — ' : ''}Prazo: {(() => { const [y,m,d] = t.data_conclusao_prevista!.split('-'); return `${d}/${m}/${y}` })()}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0',
                      t.status === 'em_andamento' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                    )}>
                      {t.status === 'em_andamento' ? 'Em andamento' : 'Pendente'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Acesso Rápido ── */}
        {quickAccessVisivel.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Acesso Rápido</p>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
              {quickAccessVisivel.map(({ href, label, icon: Icon, iconColor, iconBg }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-[#8B1A14]/30 hover:bg-[#8B1A14]/5 transition-all duration-150 group"
                >
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconBg)}>
                    <Icon className={cn('w-4 h-4', iconColor)} />
                  </div>
                  <span className="text-[11px] font-medium text-gray-600 group-hover:text-gray-900 text-center leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Contexto ── */}
        {!isRestrito && !loading && data && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-4">Informações</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Empresa',     value: data.empresa_nome ?? '—', icon: Building2 },
                { label: 'Perfil',      value: ({ master: 'Master', admin: 'Administrador', operador: 'Operador', conciliador: 'Conciliador', fechador: 'Fechador', marketing: 'Marketing', gerente: 'Gerente' } as Record<string, string>)[role ?? ''] ?? '—', icon: Users },
                { label: 'Status',      value: 'Ativo',                  icon: CheckCircle2 },
                { label: 'Adquirentes', value: String(data.total_adquirentes ?? 0), icon: CreditCard },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
                    <p className="text-[13px] font-semibold text-gray-800">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
