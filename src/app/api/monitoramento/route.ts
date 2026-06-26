import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

export const dynamic = 'force-dynamic'

// Minutos sem rodar a partir dos quais consideramos a sincronização "atrasada".
// Os crons rodam a cada 30 min; damos folga de 3x.
const LIMITE_ATRASO_MIN: Record<string, number> = {
  'fiscal-sync':        90,
  'verificar-extratos': 90,
}

async function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ])
}

async function ultimoHeartbeat(admin: ReturnType<typeof createAdminClient>, servico: string) {
  const { data } = await admin
    .from('integracao_heartbeat')
    .select('status, detalhe, duracao_ms, executado_em')
    .eq('servico', servico)
    .order('executado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return { ultima: null, status: null, detalhe: null, duracao_ms: null, atrasado: false, minutos: null }
  const minutos = Math.round((Date.now() - new Date(data.executado_em).getTime()) / 60000)
  const limite  = LIMITE_ATRASO_MIN[servico] ?? 90
  return {
    ultima:     data.executado_em,
    status:     data.status as string,
    detalhe:    data.detalhe,
    duracao_ms: data.duracao_ms as number | null,
    minutos,
    atrasado:   minutos > limite,
  }
}

// GET /api/monitoramento — somente master
export async function GET() {
  const auth = await exigirRole(['master'])
  if (!auth.ok) return auth.resp

  const admin = createAdminClient()

  // ── AUTOSYSTEM (banco externo) — ping vivo ────────────────────────────────
  let autosystem: { online: boolean; latencia_ms: number | null; erro: string | null }
  {
    const t0 = Date.now()
    try {
      await comTimeout(queryAS('SELECT 1 AS ok'), 6000)
      autosystem = { online: true, latencia_ms: Date.now() - t0, erro: null }
    } catch (e: any) {
      autosystem = { online: false, latencia_ms: null, erro: e?.message ?? 'falha' }
    }
  }

  // ── Heartbeats dos crons ──────────────────────────────────────────────────
  const [fiscal, extratos, pendCount] = await Promise.all([
    ultimoHeartbeat(admin, 'fiscal-sync'),
    ultimoHeartbeat(admin, 'verificar-extratos'),
    admin.from('fiscal_tarefas').select('*', { count: 'exact', head: true }).eq('status', 'pendente_gerente'),
  ])

  // ── Link público (Cloudflare Tunnel) ──────────────────────────────────────
  const url = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sistema.gestaopombal.com') + '/login'
  let linkPublico: { online: boolean; status_http: number | null; url: string }
  try {
    const r = await comTimeout(fetch(url, { redirect: 'manual' }), 6000)
    linkPublico = { online: r.status > 0 && r.status < 500, status_http: r.status, url }
  } catch {
    linkPublico = { online: false, status_http: null, url }
  }

  return NextResponse.json({
    gerado_em: new Date().toISOString(),
    autosystem,
    fiscal_sync:        { ...fiscal, pendentes: pendCount.count ?? null },
    verificar_extratos: extratos,
    link_publico:       linkPublico,
  })
}
