'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  MapPin, Smartphone, Users, TrendingUp, AlertCircle,
  Wrench, CreditCard, Globe, ArrowRight, Monitor, Server, Link2, ClipboardList,
} from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import type { DashboardEmpresa, Role } from '@/types/database.types'
import type { Permission } from '@/lib/utils/permissions'

function StatCard({
  title, value, icon: Icon, iconColor, iconBg, href, sub,
}: {
  title: string; value: number | string; icon: React.ElementType
  iconColor: string; iconBg: string; href?: string; sub?: string
}) {
  const inner = (
    <Card className={cn(
      'border-gray-200 shadow-sm transition-all duration-200 group',
      href && 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
    )}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
            <p className="text-[30px] font-bold text-gray-900 mt-1 leading-none tabular-nums">{value}</p>
            {sub && <p className="text-[11px] text-gray-400 mt-1.5">{sub}</p>}
          </div>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', iconBg)}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
        </div>
        {href && (
          <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-400 group-hover:text-orange-500 transition-colors">
            <span>Ver detalhes</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        )}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function StatSkeleton() {
  return (
    <Card className="border-gray-200 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-8 w-10 rounded" />
            <div className="skeleton h-3 w-24 rounded" />
          </div>
          <div className="skeleton w-10 h-10 rounded-xl flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  )
}

// Itens de acesso rápido com permissão associada
const QUICK_ACCESS = [
  { href: '/acessos-anydesk',    label: 'AnyDesk',        icon: Monitor,    iconColor: 'text-indigo-500',  iconBg: 'bg-indigo-50/80',  permission: 'anydesk.view' as Permission },
  { href: '/acessos-unificados', label: 'Ac. Unificados', icon: Link2,      iconColor: 'text-teal-600',    iconBg: 'bg-teal-50/80',    permission: 'acessos.view' as Permission },
  { href: '/acessos-postos',     label: 'Ac. Postos',     icon: MapPin,     iconColor: 'text-orange-600',  iconBg: 'bg-orange-50/80',  permission: 'acessos.view' as Permission },
  { href: '/tarefas',            label: 'Tarefas',        icon: ClipboardList, iconColor: 'text-amber-600', iconBg: 'bg-amber-50/80', permission: 'tarefas.view' as Permission },
  { href: '/servidores',         label: 'Servidores',     icon: Server,     iconColor: 'text-gray-600',    iconBg: 'bg-gray-100/80',   permission: 'servidores.view' as Permission },
  { href: '/taxas',              label: 'Taxas',          icon: TrendingUp, iconColor: 'text-green-600',   iconBg: 'bg-green-50/80',   permission: 'taxas.view' as Permission },
  { href: '/portais',            label: 'Portais',        icon: Globe,      iconColor: 'text-blue-600',    iconBg: 'bg-blue-50/80',    permission: 'portais.view' as Permission },
]

export default function DashboardPage() {
  const { usuario, canUser } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined
  // Sem dashboard.view = só vê acesso rápido (admin, operador, conciliador)
  const isRestrito = !canUser('dashboard.view')

  const [data, setData]     = useState<DashboardEmpresa | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!usuario || isRestrito) { setLoading(false); return }
      let query = supabase.from('vw_dashboard_empresa').select('*')
      if (usuario.role !== 'master') query = query.eq('empresa_id', usuario.empresa_id)
      const { data: rows } = await query
      if (rows && rows.length > 0) {
        if (usuario.role === 'master') {
          const agg: DashboardEmpresa = rows.reduce((acc, row) => ({
            empresa_id:             'all',
            empresa_nome:           'Todas as Empresas',
            total_postos:           (acc.total_postos           || 0) + row.total_postos,
            total_maquininhas:      (acc.total_maquininhas      || 0) + row.total_maquininhas,
            maquininhas_ativas:     (acc.maquininhas_ativas     || 0) + row.maquininhas_ativas,
            maquininhas_inativas:   (acc.maquininhas_inativas   || 0) + row.maquininhas_inativas,
            maquininhas_manutencao: (acc.maquininhas_manutencao || 0) + row.maquininhas_manutencao,
            total_usuarios:         (acc.total_usuarios         || 0) + row.total_usuarios,
            total_adquirentes:      (acc.total_adquirentes      || 0) + row.total_adquirentes,
          }), {} as DashboardEmpresa)
          setData(agg)
        } else {
          setData(rows[0])
        }
      }
      setLoading(false)
    }
    load()
  }, [usuario])

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  // Filtra acesso rápido pelas permissões do usuário atual (respeita perfil customizado)
  const quickAccessVisivel = QUICK_ACCESS.filter(item => canUser(item.permission))

  return (
    <div className="animate-fade-in">
      <Header
        title="Dashboard"
        description={`${saudacao}, ${usuario?.nome?.split(' ')[0] ?? ''}!`}
      />

      <div className="p-3 md:p-6 space-y-8">

        {/* ── Visão geral + Maquininhas — somente admin/master ── */}
        {!isRestrito && (
          <>
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Visão Geral</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {loading ? Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />) : (
                  <>
                    <StatCard title="Postos"      value={data?.total_postos      ?? 0} icon={MapPin}    iconColor="text-orange-600" iconBg="bg-orange-100" href="/postos"      sub="Unidades cadastradas" />
                    <StatCard title="Maquininhas" value={data?.total_maquininhas ?? 0} icon={Smartphone} iconColor="text-blue-600"   iconBg="bg-blue-100"   href="/maquininhas" sub="Terminais registrados" />
                    <StatCard title="Usuários"    value={data?.total_usuarios    ?? 0} icon={Users}      iconColor="text-purple-600" iconBg="bg-purple-100" href="/usuarios"    sub="Acessos ativos" />
                    <StatCard title="Adquirentes" value={data?.total_adquirentes ?? 0} icon={CreditCard} iconColor="text-green-600"  iconBg="bg-green-100"  href="/adquirentes" sub="Operadoras cadastradas" />
                  </>
                )}
              </div>
            </section>

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Status das Maquininhas</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {loading ? Array.from({ length: 3 }).map((_, i) => <StatSkeleton key={i} />) : (
                  <>
                    <StatCard title="Ativas"     value={data?.maquininhas_ativas    ?? 0} icon={TrendingUp}  iconColor="text-emerald-600" iconBg="bg-emerald-100" sub="Operando normalmente" />
                    <StatCard title="Inativas"   value={data?.maquininhas_inativas  ?? 0} icon={AlertCircle} iconColor="text-red-600"     iconBg="bg-red-100"     sub="Requerem atenção" />
                    <StatCard title="Manutenção" value={data?.maquininhas_manutencao?? 0} icon={Wrench}      iconColor="text-amber-600"   iconBg="bg-amber-100"   sub="Em reparo" />
                  </>
                )}
              </div>
            </section>
          </>
        )}

        {/* ── Acesso Rápido — filtrado por permissão ── */}
        {quickAccessVisivel.length > 0 && (
          <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Acesso Rápido</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
              {quickAccessVisivel.map(({ href, label, icon: Icon, iconColor, iconBg }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-gray-200 bg-white hover:border-orange-200 hover:shadow-sm transition-all duration-150 group"
                >
                  <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', iconBg)}>
                    <Icon className={cn('w-4 h-4', iconColor)} />
                  </div>
                  <span className="text-[11px] font-medium text-gray-600 group-hover:text-gray-900 transition-colors text-center leading-tight">{label}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Informações do contexto — somente admin/master ── */}
        {!isRestrito && !loading && (
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-2 pt-5">
              <CardTitle className="text-[13px] font-semibold text-gray-600">Informações do Contexto</CardTitle>
            </CardHeader>
            <CardContent className="pb-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: 'Empresa',     value: data?.empresa_nome ?? usuario?.empresa?.nome ?? '—' },
                  { label: 'Seu Perfil',  value: usuario?.role ? ({ master: 'Master', admin: 'Administrador', operador: 'Operador', conciliador: 'Conciliador', fechador: 'Fechador', marketing: 'Marketing', gerente: 'Gerente' } as Record<string, string>)[usuario.role] : '—' },
                  { label: 'Status',      value: 'Ativo' },
                  { label: 'Adquirentes', value: String(data?.total_adquirentes ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">{label}</p>
                    <p className="text-[14px] font-semibold text-gray-800 mt-1">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}
