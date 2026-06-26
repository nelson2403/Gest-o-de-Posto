'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Database, Globe, Loader2, RefreshCw, Receipt, XCircle } from 'lucide-react'

type Heartbeat = {
  ultima: string | null
  status: string | null
  detalhe: Record<string, unknown> | null
  duracao_ms: number | null
  minutos: number | null
  atrasado: boolean
}
type Dados = {
  gerado_em: string
  autosystem: { online: boolean; latencia_ms: number | null; erro: string | null }
  fiscal_sync: Heartbeat & { pendentes: number | null }
  verificar_extratos: Heartbeat
  link_publico: { online: boolean; status_http: number | null; url: string }
}

function tempoRelativo(min: number | null): string {
  if (min == null) return 'nunca'
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h${min % 60 ? ' ' + (min % 60) + 'min' : ''}`
  return `há ${Math.floor(h / 24)}d`
}

function StatusPill({ ok, alerta, texto }: { ok: boolean; alerta?: boolean; texto: string }) {
  const cls = ok && !alerta ? 'bg-green-100 text-green-700'
    : alerta ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-700'
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{texto}</span>
}

function Card({ icon: Icon, cor, titulo, children, pill }: {
  icon: React.ElementType; cor: string; titulo: string; children: React.ReactNode; pill: React.ReactNode
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-gray-900 truncate">{titulo}</p>
        </div>
        {pill}
      </div>
      <div className="space-y-1 text-[12px] text-gray-600">{children}</div>
    </div>
  )
}

function Linha({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{k}</span>
      <span className="font-medium text-gray-700 font-mono">{v}</span>
    </div>
  )
}

export default function MonitoramentoPage() {
  const [dados, setDados]     = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro]       = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/monitoramento', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Falha ao carregar')
      setDados(d); setErro(null)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 60000) // auto-refresh a cada 60s
    return () => clearInterval(t)
  }, [carregar])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Activity className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-[15px] md:text-[17px] font-bold text-gray-900">Monitoramento de Integrações</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {dados ? `Atualizado ${new Date(dados.gerado_em).toLocaleTimeString('pt-BR')}` : ''} · auto a cada 60s
            </p>
          </div>
        </div>
        <button onClick={carregar} className="flex items-center gap-1.5 h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[13px] text-red-700">{erro}</div>
      )}

      {dados && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* AUTOSYSTEM */}
          <Card icon={Database} cor="bg-purple-100 text-purple-600" titulo="AUTOSYSTEM (banco externo)"
            pill={<StatusPill ok={dados.autosystem.online} texto={dados.autosystem.online ? 'Online' : 'Offline'} />}>
            {dados.autosystem.online ? (
              <Linha k="Latência" v={`${dados.autosystem.latencia_ms} ms`} />
            ) : (
              <p className="text-red-600">{dados.autosystem.erro || 'Sem resposta do banco'}</p>
            )}
            <p className="text-[11px] text-gray-400 pt-1">Fonte das conciliações e manifestos fiscais.</p>
          </Card>

          {/* SYNC FISCAL */}
          <Card icon={RefreshCw} cor="bg-blue-100 text-blue-600" titulo="Sync Fiscal (manifestos)"
            pill={
              dados.fiscal_sync.ultima == null ? <StatusPill ok={false} texto="Sem dados" />
              : dados.fiscal_sync.atrasado ? <StatusPill ok={false} alerta texto="Atrasado" />
              : dados.fiscal_sync.status === 'erro' ? <StatusPill ok={false} texto="Erro" />
              : <StatusPill ok texto="OK" />
            }>
            <Linha k="Última sincronização" v={tempoRelativo(dados.fiscal_sync.minutos)} />
            <Linha k="Pendentes (gerente)" v={dados.fiscal_sync.pendentes ?? '—'} />
            {dados.fiscal_sync.detalhe && (
              <Linha k="Última: import / concluí." v={`${(dados.fiscal_sync.detalhe as any).importadas ?? 0} / ${(dados.fiscal_sync.detalhe as any).concluidas ?? 0}`} />
            )}
            {dados.fiscal_sync.atrasado && (
              <p className="text-[11px] text-amber-600 pt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Não sincroniza há mais de 90 min — o worker pode ter parado.
              </p>
            )}
          </Card>

          {/* VERIFICAR EXTRATOS */}
          <Card icon={Receipt} cor="bg-emerald-100 text-emerald-600" titulo="Verificação de extratos"
            pill={
              dados.verificar_extratos.ultima == null ? <StatusPill ok={false} texto="Sem dados" />
              : dados.verificar_extratos.atrasado ? <StatusPill ok={false} alerta texto="Atrasado" />
              : dados.verificar_extratos.status === 'erro' ? <StatusPill ok={false} texto="Erro" />
              : <StatusPill ok texto="OK" />
            }>
            <Linha k="Última execução" v={tempoRelativo(dados.verificar_extratos.minutos)} />
            {dados.verificar_extratos.detalhe && (
              <Linha k="Verificadas / diverg." v={`${(dados.verificar_extratos.detalhe as any).verificadas ?? 0} / ${(dados.verificar_extratos.detalhe as any).divergentes ?? 0}`} />
            )}
            {dados.verificar_extratos.ultima == null && (
              <p className="text-[11px] text-gray-400 pt-1">Ainda não registrou execução (roda a cada 30 min).</p>
            )}
          </Card>

          {/* LINK PÚBLICO */}
          <Card icon={Globe} cor="bg-orange-100 text-orange-600" titulo="Link público (Cloudflare)"
            pill={<StatusPill ok={dados.link_publico.online} texto={dados.link_publico.online ? 'No ar' : 'Fora'} />}>
            <Linha k="Endereço" v={dados.link_publico.url.replace(/^https?:\/\//, '').replace('/login', '')} />
            <Linha k="HTTP" v={dados.link_publico.status_http ?? '—'} />
            <p className="text-[11px] text-gray-400 pt-1 flex items-center gap-1">
              {dados.link_publico.online
                ? <><CheckCircle2 className="w-3 h-3 text-green-500" /> Acesso externo respondendo.</>
                : <><XCircle className="w-3 h-3 text-red-500" /> O túnel pode ter caído.</>}
            </p>
          </Card>

        </div>
      )}
    </div>
  )
}
