'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/layout/Header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AtivoInativoBadge, StatusMaquininhaBadge } from '@/components/shared/StatusBadge'
import { PasswordReveal } from '@/components/shared/PasswordReveal'
import { ArrowLeft, MapPin, Mail, Building2, Phone, Monitor, Server, KeyRound, Link2, Smartphone, Percent } from 'lucide-react'
import { formatCNPJ, formatDate, formatPercent } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils/cn'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import type { Posto, Maquininha, Taxa, AcessoAnydesk, AcessoUnificado, AcessoPosto, ServidorPosto, PostoContato, Role } from '@/types/database.types'

type Tab = 'info' | 'maquininhas' | 'taxas' | 'acessos' | 'anydesk' | 'servidores' | 'contatos'

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'info',        label: 'Informações',  icon: Building2 },
  { id: 'maquininhas', label: 'Maquininhas',  icon: Smartphone },
  { id: 'taxas',       label: 'Taxas',        icon: Percent },
  { id: 'acessos',     label: 'Acessos',      icon: KeyRound },
  { id: 'anydesk',     label: 'AnyDesk',      icon: Monitor },
  { id: 'servidores',  label: 'Servidores',   icon: Server },
  { id: 'contatos',    label: 'Contatos',     icon: Phone },
]

export default function PostoDetalhesPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { usuario } = useAuthContext()
  const supabase = createClient()
  const role = usuario?.role as Role | undefined

  const [posto, setPosto] = useState<Posto | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('info')
  const [loading, setLoading] = useState(true)

  const [maquininhas, setMaquininhas] = useState<Maquininha[]>([])
  const [taxas, setTaxas] = useState<Taxa[]>([])
  const [anydesks, setAnydesks] = useState<AcessoAnydesk[]>([])
  const [acessosUnif, setAcessosUnif] = useState<AcessoUnificado[]>([])
  const [acessosPostos, setAcessosPostos] = useState<AcessoPosto[]>([])
  const [servidores, setServidores] = useState<ServidorPosto[]>([])
  const [contatos, setContatos] = useState<PostoContato[]>([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('postos')
        .select('*, empresa:empresas(id, nome)')
        .eq('id', id)
        .single()
      if (data) setPosto(data as Posto)
      setLoading(false)
    }
    load()
  }, [id])

  useEffect(() => {
    if (!posto) return
    switch (activeTab) {
      case 'maquininhas':
        supabase.from('maquininhas').select('*, adquirente:adquirentes(id, nome)').eq('posto_id', id)
          .then(({ data }) => setMaquininhas((data ?? []) as Maquininha[]))
        break
      case 'taxas':
        supabase.from('taxas').select('*, adquirente:adquirentes(id, nome)').eq('posto_id', id)
          .then(({ data }) => setTaxas((data ?? []) as Taxa[]))
        break
      case 'anydesk':
        supabase.from('acessos_anydesk').select('*').eq('posto_id', id)
          .then(({ data }) => setAnydesks((data ?? []) as AcessoAnydesk[]))
        break
      case 'acessos':
        supabase.from('acessos_unificados').select('*, portal:portais(id, nome)').eq('posto_id', id)
          .then(({ data }) => setAcessosUnif((data ?? []) as AcessoUnificado[]))
        supabase.from('acessos_postos').select('*, portal:portais(id, nome)').eq('posto_id', id)
          .then(({ data }) => setAcessosPostos((data ?? []) as AcessoPosto[]))
        break
      case 'servidores':
        supabase.from('servidores_postos').select('*').eq('posto_id', id)
          .then(({ data }) => setServidores((data ?? []) as ServidorPosto[]))
        break
      case 'contatos':
        supabase.from('posto_contatos').select('*').eq('posto_id', id).order('principal', { ascending: false })
          .then(({ data }) => setContatos((data ?? []) as PostoContato[]))
        break
    }
  }, [activeTab, posto])

  if (loading) return (
    <div>
      <Header title="Carregando..." />
      <div className="p-3 md:p-6 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-lg" />)}
      </div>
    </div>
  )

  if (!posto) return (
    <div>
      <Header title="Posto não encontrado" />
      <div className="p-3 md:p-6"><Button variant="outline" onClick={() => router.back()}><ArrowLeft className="w-4 h-4" /> Voltar</Button></div>
    </div>
  )

  const canReveal = can(role ?? null, 'acessos.edit')

  return (
    <div>
      <Header
        title={posto.nome}
        description={(posto as Posto & { empresa?: { nome: string } }).empresa?.nome}
        actions={
          <Button variant="outline" size="sm" onClick={() => router.push('/postos')}>
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
        }
      />

      <div className="p-3 md:p-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab: Informações */}
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" /> Dados do Posto</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Row label="Nome" value={posto.nome} />
                <Row label="CNPJ" value={posto.cnpj ? formatCNPJ(posto.cnpj) : '—'} />
                <Row label="Endereço" value={posto.endereco ?? '—'} />
                <Row label="Status" value={<AtivoInativoBadge ativo={posto.ativo} />} />
                <Row label="Cadastrado em" value={formatDate(posto.criado_em)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mail className="w-4 h-4" /> Acesso ao Email</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Row label="Email" value={posto.email ?? '—'} />
                <Row label="Senha" value={<PasswordReveal value={posto.senha_email} canReveal={canReveal} />} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab: Maquininhas */}
        {activeTab === 'maquininhas' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Maquininhas ({maquininhas.length})</CardTitle></CardHeader>
            <CardContent>
              {maquininhas.length === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">Nenhuma maquininha cadastrada</p>
              ) : (
                <div className="space-y-2">
                  {maquininhas.map(m => (
                    <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div>
                        <p className="font-medium text-sm">{(m as Maquininha & { adquirente?: { nome: string } }).adquirente?.nome}</p>
                        <p className="text-xs text-gray-500">{m.modelo ?? 'Modelo não informado'} • {m.numero_serie ?? 'S/N não informado'}</p>
                      </div>
                      <StatusMaquininhaBadge status={m.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab: Taxas */}
        {activeTab === 'taxas' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Taxas por Adquirente ({taxas.length})</CardTitle></CardHeader>
            <CardContent>
              {taxas.length === 0 ? (
                <p className="text-gray-400 text-sm py-4 text-center">Nenhuma taxa cadastrada</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-gray-500">
                      <th className="text-left py-2 pr-4">Adquirente</th>
                      <th className="text-right py-2 px-4">Débito</th>
                      <th className="text-right py-2 px-4">Crédito</th>
                      <th className="text-right py-2 px-4">Créd. Parcelado</th>
                      <th className="text-left py-2 pl-4">Observações</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {taxas.map(t => (
                        <tr key={t.id}>
                          <td className="py-2 pr-4 font-medium">{(t as Taxa & { adquirente?: { nome: string } }).adquirente?.nome}</td>
                          <td className="py-2 px-4 text-right">{formatPercent(t.taxa_debito)}</td>
                          <td className="py-2 px-4 text-right">{formatPercent(t.taxa_credito)}</td>
                          <td className="py-2 px-4 text-right">{formatPercent(t.taxa_credito_parcelado)}</td>
                          <td className="py-2 pl-4 text-gray-500 text-xs">{t.observacoes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab: Acessos */}
        {activeTab === 'acessos' && (
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Acessos Unificados ({acessosUnif.length})</CardTitle></CardHeader>
              <CardContent>
                {acessosUnif.length === 0 ? <p className="text-gray-400 text-sm py-2 text-center">Nenhum acesso</p> : (
                  <div className="space-y-2">
                    {acessosUnif.map(a => (
                      <div key={a.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{(a as AcessoUnificado & { portal?: { nome: string } }).portal?.nome}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div><span className="text-xs text-gray-500">Login:</span> <span className="text-sm font-mono">{a.login}</span></div>
                          <div><span className="text-xs text-gray-500">Senha:</span> <PasswordReveal value={a.senha} canReveal={canReveal} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Acessos dos Postos ({acessosPostos.length})</CardTitle></CardHeader>
              <CardContent>
                {acessosPostos.length === 0 ? <p className="text-gray-400 text-sm py-2 text-center">Nenhum acesso</p> : (
                  <div className="space-y-2">
                    {acessosPostos.map(a => (
                      <div key={a.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                        <p className="font-medium text-sm">{(a as AcessoPosto & { portal?: { nome: string } }).portal?.nome}</p>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div><span className="text-xs text-gray-500">Login:</span> <span className="text-sm font-mono">{a.login}</span></div>
                          <div><span className="text-xs text-gray-500">Senha:</span> <PasswordReveal value={a.senha} canReveal={canReveal} /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Tab: AnyDesk */}
        {activeTab === 'anydesk' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Acessos AnyDesk ({anydesks.length})</CardTitle></CardHeader>
            <CardContent>
              {anydesks.length === 0 ? <p className="text-gray-400 text-sm py-4 text-center">Nenhum acesso AnyDesk</p> : (
                <div className="space-y-2">
                  {anydesks.map(a => (
                    <div key={a.id} className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500">Número AnyDesk</p>
                          <p className="font-mono font-medium text-lg">{a.numero_anydesk}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Senha</p>
                          <PasswordReveal value={a.senha} canReveal={can(role ?? null, 'anydesk.edit')} />
                        </div>
                        {a.observacoes && <div className="col-span-2"><p className="text-xs text-gray-500">Obs: {a.observacoes}</p></div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab: Servidores */}
        {activeTab === 'servidores' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Servidores ({servidores.length})</CardTitle></CardHeader>
            <CardContent>
              {servidores.length === 0 ? <p className="text-gray-400 text-sm py-4 text-center">Nenhum servidor</p> : (
                <div className="space-y-3">
                  {servidores.map(s => (
                    <div key={s.id} className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <Row label="Banco" value={s.nome_banco ?? '—'} />
                        <Row label="IP" value={<span className="font-mono">{s.ip}</span>} />
                        <Row label="Porta" value={String(s.porta ?? 5432)} />
                        <Row label="Usuário" value={s.usuario ?? '—'} />
                        <Row label="Senha" value={<PasswordReveal value={s.senha} canReveal={can(role ?? null, 'servidores.edit')} />} />
                      </div>
                      {s.observacoes && <p className="text-xs text-gray-500 mt-2">{s.observacoes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab: Contatos */}
        {activeTab === 'contatos' && (
          <Card>
            <CardHeader><CardTitle className="text-base">Contatos ({contatos.length})</CardTitle></CardHeader>
            <CardContent>
              {contatos.length === 0 ? <p className="text-gray-400 text-sm py-4 text-center">Nenhum contato</p> : (
                <div className="space-y-2">
                  {contatos.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{c.nome}</p>
                          {c.principal && <Badge variant="info" className="text-xs">Principal</Badge>}
                        </div>
                        <p className="text-xs text-gray-500">{c.cargo ?? ''} {c.telefone ? `• ${c.telefone}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-gray-900">{value}</div>
    </div>
  )
}
