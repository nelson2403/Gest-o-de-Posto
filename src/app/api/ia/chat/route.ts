import { NextRequest } from 'next/server'
import { groqClient, GROQ_MODEL } from '@/lib/groq'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarAnaliseVendasPorProduto } from '@/lib/autosystem'
import { exigirUsuario } from '@/lib/auth-guard'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ymd = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)

interface Filtros {
  dataIni: string
  dataFim: string
  label: string
  postoFiltro: string | null
}

// Interpreta período e posto a partir do texto do usuário
function parseFiltros(texto: string, postosNomes: string[]): Filtros {
  const t = (texto || '').toLowerCase()
  const hoje = new Date()
  let ini: Date, fim: Date, label: string

  if (/\bontem\b/.test(t)) { const y = addDays(hoje, -1); ini = y; fim = y; label = 'ontem' }
  else if (/\bhoje\b/.test(t)) { ini = hoje; fim = hoje; label = 'hoje' }
  else if (/m[êe]s passado|m[êe]s anterior/.test(t)) {
    ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
    fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
    label = 'mês passado'
  }
  else if (/semana passada/.test(t)) { ini = addDays(hoje, -13); fim = addDays(hoje, -7); label = 'semana passada' }
  else if (/(esta|essa) semana|semana atual|[úu]ltimos?\s*7|7 dias/.test(t)) { ini = addDays(hoje, -6); fim = hoje; label = 'últimos 7 dias' }
  else if (/[úu]ltimos?\s*15|15 dias|quinzena/.test(t)) { ini = addDays(hoje, -14); fim = hoje; label = 'últimos 15 dias' }
  else if (/[úu]ltimos?\s*30|30 dias/.test(t)) { ini = addDays(hoje, -29); fim = hoje; label = 'últimos 30 dias' }
  else { ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1); fim = hoje; label = 'mês atual' }

  let postoFiltro: string | null = null
  for (const nome of postosNomes) {
    if (nome && nome.length > 2 && t.includes(nome.toLowerCase())) { postoFiltro = nome; break }
  }
  return { dataIni: ymd(ini), dataFim: ymd(fim), label, postoFiltro }
}

async function fetchPageContext(page: string, userText: string): Promise<string> {
  const sb   = createAdminClient()
  const hoje = new Date()
  const dataHoje = ymd(hoje)
  const p    = page.replace(/\?.*$/, '')
  const parts: string[] = []

  // ── Postos ─────────────────────────────────────────────────────────────────
  let postosRows: any[] = []
  try {
    const { data } = await sb.from('postos').select('id, nome, codigo_empresa_externo').eq('ativo', true).order('nome')
    postosRows = data ?? []
  } catch { /* ignore */ }

  const postosNomes = postosRows.map(d => d.nome)
  const filtros = parseFiltros(userText, postosNomes)

  const postosUsados   = filtros.postoFiltro ? postosRows.filter(d => d.nome === filtros.postoFiltro) : postosRows
  const postoIdsFiltro = new Set(postosUsados.map(d => d.id))
  const empresaIds     = postosUsados.map(d => Number(d.codigo_empresa_externo)).filter(n => !isNaN(n) && n > 0)

  parts.push(`PERÍODO DE ANÁLISE: ${filtros.label} (${filtros.dataIni} a ${filtros.dataFim})`)
  if (filtros.postoFiltro) parts.push(`FILTRO DE POSTO: somente ${filtros.postoFiltro}`)
  if (postosRows.length) parts.push(`POSTOS ATIVOS (${postosRows.length}): ${postosRows.map(d => d.nome).join(' | ')}`)

  // ── Vendas e Lucro (período + comparativo com período anterior) ─────────────
  if (empresaIds.length > 0) {
    try {
      const diasPeriodo = Math.max(1, Math.round((new Date(filtros.dataFim).getTime() - new Date(filtros.dataIni).getTime()) / 86400000) + 1)
      const prevFim = ymd(addDays(new Date(filtros.dataIni), -1))
      const prevIni = ymd(addDays(new Date(filtros.dataIni), -diasPeriodo))

      const [cur, prev] = await Promise.all([
        buscarAnaliseVendasPorProduto(empresaIds, filtros.dataIni, filtros.dataFim),
        buscarAnaliseVendasPorProduto(empresaIds, prevIni, prevFim),
      ])

      if (cur.produtos.length > 0) {
        const tv = cur.produtos.reduce((s, x) => s + x.venda, 0)
        const tc = cur.produtos.reduce((s, x) => s + x.custo, 0)
        const tl = tv - tc
        const mg = tv > 0 ? (tl / tv) * 100 : 0
        const td = cur.produtos.reduce((s, x) => s + (x.total_desconto || 0), 0)
        parts.push(`VENDAS (${filtros.label}): faturamento ${fmtBRL(tv)} | custo ${fmtBRL(tc)} | LUCRO BRUTO ${fmtBRL(tl)} | margem ${mg.toFixed(2)}% | descontos ${fmtBRL(td)}`)

        const pv = prev.produtos.reduce((s, x) => s + x.venda, 0)
        const pl = prev.produtos.reduce((s, x) => s + (x.venda - x.custo), 0)
        if (pv > 0) {
          const varV = ((tv - pv) / pv) * 100
          const varL = pl !== 0 ? ((tl - pl) / Math.abs(pl)) * 100 : 0
          parts.push(`COMPARATIVO PERÍODO ANTERIOR (${prevIni} a ${prevFim}): faturamento ${fmtBRL(pv)} (variação ${varV >= 0 ? '+' : ''}${varV.toFixed(1)}%) | lucro ${fmtBRL(pl)} (variação ${varL >= 0 ? '+' : ''}${varL.toFixed(1)}%)`)
        }

        const top = [...cur.produtos]
          .sort((a, b) => (b.venda - b.custo) - (a.venda - a.custo)).slice(0, 10)
          .map(x => {
            const l = x.venda - x.custo
            const m = x.venda > 0 ? (l / x.venda * 100).toFixed(1) : '0'
            return `${x.produto_nome}: venda ${fmtBRL(x.venda)} | lucro ${fmtBRL(l)} (${m}%)`
          })
        parts.push(`TOP 10 PRODUTOS POR LUCRO:\n${top.join('\n')}`)
      }
    } catch (e: any) {
      parts.push(`[Vendas AutoSystem: ${e.message}]`)
    }
  }

  // ── Conciliação bancária (tarefas de extrato) ───────────────────────────────
  try {
    const { data } = await sb
      .from('tarefas')
      .select('titulo, status, extrato_status, extrato_diferenca, posto_id, usuarios(nome), postos(nome)')
      .in('status', ['aberta', 'em_andamento'])
      .not('extrato_arquivo_path', 'is', null)
      .order('extrato_diferenca', { ascending: true })
      .limit(300)

    let arr = (data ?? []) as any[]
    if (filtros.postoFiltro) arr = arr.filter(t => postoIdsFiltro.has(t.posto_id))

    if (arr.length) {
      const divergentes = arr.filter(t => t.extrato_status === 'divergente')
      const totalDiverg = divergentes.reduce((s, t) => s + Math.abs(Number(t.extrato_diferenca || 0)), 0)
      const porUser: Record<string, number> = {}
      for (const t of arr) { const n = t.usuarios?.nome ?? 'Sem responsável'; porUser[n] = (porUser[n] || 0) + 1 }
      const ranking = Object.entries(porUser).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}: ${c}`).join(' | ')

      parts.push(`CONCILIAÇÃO BANCÁRIA — TAREFAS ABERTAS: ${arr.length} | divergentes: ${divergentes.length} | soma divergência ${fmtBRL(totalDiverg)}`)
      parts.push(`CONCILIAÇÃO POR RESPONSÁVEL: ${ranking}`)
      if (divergentes.length) {
        parts.push(`MAIORES DIVERGÊNCIAS: ${divergentes.slice(0, 5).map(t => `${t.postos?.nome ?? '?'} ${fmtBRL(Number(t.extrato_diferenca))}`).join(' | ')}`)
      }
    }
  } catch { /* ignore */ }

  // ── Tarefas abertas (gerais) ────────────────────────────────────────────────
  try {
    const { data } = await sb
      .from('tarefas')
      .select('titulo, status, prioridade, data_conclusao_prevista, posto_id, usuarios(nome), postos(nome)')
      .in('status', ['aberta', 'em_andamento', 'pausada'])
      .limit(500)

    let arr = (data ?? []) as any[]
    if (filtros.postoFiltro) arr = arr.filter(t => postoIdsFiltro.has(t.posto_id))

    if (arr.length) {
      const urgentes = arr.filter(t => t.prioridade === 'urgente')
      const vencidas = arr.filter(t => t.data_conclusao_prevista && t.data_conclusao_prevista < dataHoje)
      const porUser: Record<string, number> = {}
      for (const t of arr) { const u = t.usuarios?.nome ?? 'Sem responsável'; porUser[u] = (porUser[u] || 0) + 1 }
      const rankUser = Object.entries(porUser).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}: ${c}`).join(' | ')

      parts.push(`TAREFAS ABERTAS (geral): ${arr.length} | urgentes: ${urgentes.length} | vencidas: ${vencidas.length}`)
      parts.push(`TAREFAS POR RESPONSÁVEL: ${rankUser}`)
      if (urgentes.length) parts.push(`URGENTES: ${urgentes.slice(0, 5).map(t => `"${t.titulo}" (${t.postos?.nome ?? '?'})`).join(' | ')}`)
    }
  } catch { /* ignore */ }

  // ── Caixas (fechamentos de frentista — período + posto) ─────────────────────
  try {
    const { data } = await sb
      .from('frentista_fechamentos')
      .select('frentista_nome, data_fechamento, total_as, total_frentista, total_diferenca, posto_id, postos(nome)')
      .gte('data_fechamento', filtros.dataIni)
      .lte('data_fechamento', filtros.dataFim)
      .order('data_fechamento', { ascending: false })
      .limit(800)

    let arr = (data ?? []) as any[]
    if (filtros.postoFiltro) arr = arr.filter(f => postoIdsFiltro.has(f.posto_id))

    if (arr.length) {
      const comDiverg  = arr.filter(f => Math.abs(Number(f.total_diferenca || 0)) > 0.02)
      const somaDiverg = comDiverg.reduce((s, f) => s + Math.abs(Number(f.total_diferenca || 0)), 0)
      const porFrent: Record<string, { qtd: number; diverg: number }> = {}
      for (const f of arr) {
        const n = f.frentista_nome ?? 'Sem nome'
        if (!porFrent[n]) porFrent[n] = { qtd: 0, diverg: 0 }
        porFrent[n].qtd++
        porFrent[n].diverg += Math.abs(Number(f.total_diferenca || 0))
      }
      const rankFrent = Object.entries(porFrent).sort((a, b) => b[1].diverg - a[1].diverg).slice(0, 10)
        .map(([n, v]) => `${n}: ${v.qtd} fechamento(s), divergência ${fmtBRL(v.diverg)}`).join(' | ')
      const maiores = [...arr]
        .sort((a, b) => Math.abs(Number(b.total_diferenca || 0)) - Math.abs(Number(a.total_diferenca || 0)))
        .slice(0, 6)
        .map(f => `${f.frentista_nome} (${f.postos?.nome ?? '?'}) ${f.data_fechamento}: dif ${fmtBRL(Number(f.total_diferenca || 0))}`).join(' | ')

      parts.push(`CAIXAS — FECHAMENTOS FRENTISTA (${filtros.label}): ${arr.length} fechamento(s) | ${comDiverg.length} com divergência | soma ${fmtBRL(somaDiverg)}`)
      parts.push(`CAIXAS POR FRENTISTA: ${rankFrent}`)
      if (maiores) parts.push(`MAIORES DIVERGÊNCIAS DE CAIXA: ${maiores}`)
    }
  } catch { /* ignore */ }

  // ── Comissionamento (posto opcional) ────────────────────────────────────────
  try {
    const [{ data: membros }, { data: esquemas }, { data: regras }] = await Promise.all([
      sb.from('comissio_membros').select('nome, role, ativo, posto_id, postos:posto_id(nome)'),
      sb.from('comissio_esquemas').select('id'),
      sb.from('comissio_regras').select('id'),
    ])
    if (membros?.length) {
      let ativos = (membros as any[]).filter(m => m.ativo)
      if (filtros.postoFiltro) ativos = ativos.filter(m => postoIdsFiltro.has(m.posto_id))
      const roleLabel: Record<string, string> = {
        supervisor: 'Supervisor', manager: 'Gerente', pit_boss: 'Líder de Pista',
        oil_changer: 'Trocador de Óleo', seller: 'Vendedor',
      }
      const porRole: Record<string, number> = {}
      const porPosto: Record<string, number> = {}
      for (const m of ativos) {
        porRole[m.role] = (porRole[m.role] || 0) + 1
        const pn = (m.postos as any)?.nome ?? 'Sem posto'
        porPosto[pn] = (porPosto[pn] || 0) + 1
      }
      const rolesStr  = Object.entries(porRole).map(([r, c]) => `${roleLabel[r] ?? r}: ${c}`).join(' | ')
      const postosStr = Object.entries(porPosto).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}: ${c}`).join(' | ')

      parts.push(`COMISSIONAMENTO: ${ativos.length} membro(s) ativo(s) | ${esquemas?.length ?? 0} esquema(s) | ${regras?.length ?? 0} regra(s)`)
      if (rolesStr)  parts.push(`MEMBROS POR FUNÇÃO: ${rolesStr}`)
      if (postosStr) parts.push(`MEMBROS POR POSTO: ${postosStr}`)
    }
  } catch { /* ignore */ }

  // ── Fiscal ─────────────────────────────────────────────────────────────────
  if (p.startsWith('/fiscal') || p === '/') {
    try {
      const { data } = await sb
        .from('fiscal_tarefas')
        .select('status, boleto_vencimento, valor_as')
        .neq('status', 'concluida')
        .limit(100)
      if (data?.length) {
        const vencidas = (data as any[]).filter(t => t.boleto_vencimento && t.boleto_vencimento < dataHoje)
        const totalValor = (data as any[]).reduce((s, t) => s + Number(t.valor_as || 0), 0)
        parts.push(`FISCAL PENDENTE: ${data.length} NF-e | ${vencidas.length} boletos vencidos | valor total ${fmtBRL(totalValor)}`)
      }
    } catch { /* ignore */ }
  }

  // ── Contas a Pagar ─────────────────────────────────────────────────────────
  if (p.startsWith('/contas-pagar') || p === '/') {
    try {
      const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
      const { data } = await sb
        .from('cp_competencias')
        .select('descricao, valor_previsto, valor_pago, status, vencimento')
        .eq('competencia', anoMes)
        .limit(200)
      if (data?.length) {
        const pagos     = (data as any[]).filter(c => c.status === 'pago')
        const atrasados = (data as any[]).filter(c => c.status !== 'pago' && c.vencimento && c.vencimento < dataHoje)
        const totalPrev = (data as any[]).reduce((s, c) => s + Number(c.valor_previsto || 0), 0)
        const totalPago = pagos.reduce((s, c) => s + Number(c.valor_pago || c.valor_previsto || 0), 0)
        parts.push(`CONTAS A PAGAR ${anoMes}: previsto ${fmtBRL(totalPrev)} | pago ${fmtBRL(totalPago)} | em atraso: ${atrasados.length}`)
      }
    } catch { /* ignore */ }
  }

  return parts.length > 0
    ? `\n\nDADOS REAIS DO SISTEMA (${hoje.toLocaleDateString('pt-BR')}):\n${parts.join('\n')}`
    : '\n\n[Nenhum dado disponível]'
}

// Detecta se o usuário está pedindo um RELATÓRIO/ANÁLISE detalhada
function pedeRelatorio(messages: ChatMessage[]): boolean {
  const ultima = [...messages].reverse().find(m => m.role === 'user')?.content?.toLowerCase() ?? ''
  return /(relat[óo]rio|an[áa]lise|analise|analisar|detalh|completo|panorama|diagn[óo]stico|consolidad)/.test(ultima)
}

function buildSystemPrompt(page: string, contextData: string, modoRelatorio: boolean): string {
  const paginaLabel: Record<string, string> = {
    '/': 'Dashboard', '/analitico': 'Análise de vendas', '/estoque': 'Estoque',
    '/contas-pagar': 'Contas a Pagar', '/tarefas': 'Tarefas',
    '/tarefas/avulsas': 'Tarefas avulsas', '/fiscal': 'Fiscal',
    '/marketing': 'Marketing', '/postos': 'Postos', '/tanques': 'Tanques',
  }
  const paginaNome = paginaLabel[page.replace(/\?.*$/, '')] ?? page

  const regrasBase = `Você é um analista de BI de uma rede de postos de combustível.

REGRAS GERAIS:
- Responda SEMPRE em português brasileiro
- Use SOMENTE os dados fornecidos abaixo — NUNCA invente números ou nomes
- Se um dado não estiver disponível, diga "dado não disponível"
- Faça cálculos usando os números exatos dos dados fornecidos
- Respeite o PERÍODO DE ANÁLISE e o FILTRO DE POSTO informados nos dados
- Página atual: ${paginaNome}`

  if (modoRelatorio) {
    return `${regrasBase}

MODO RELATÓRIO (o usuário pediu um relatório/análise):
- Gere um relatório COMPLETO e bem estruturado em markdown.
- Estrutura: título "## Relatório de ...", depois seções com "### ".
- Informe o período analisado e, se houver, o posto filtrado.
- Use listas com "- ", **negrito** para destacar números e nomes.
- Quando houver comparativo com período anterior, destaque a variação (% e se melhorou ou piorou).
- Inclua: situação geral, números/totais, rankings (responsáveis/postos/produtos), pontos de atenção e uma seção final "### Recomendações" com ações práticas.
- Pode ser longo e detalhado (sem limite de linhas). Baseie TUDO nos dados reais abaixo.
${contextData}`
  }

  return `${regrasBase}

REGRAS DE RESPOSTA RÁPIDA:
- Respostas CURTAS: máximo 6 linhas, sem introdução e sem "próximos passos"
- Use bullet points para listas
- Se o usuário quiser algo mais completo, sugira pedir um "relatório"
${contextData}`
}

export async function POST(req: NextRequest) {
  try {
    const auth = await exigirUsuario()
    if (!auth.ok) return auth.resp

    const { messages, page } = await req.json() as { messages: ChatMessage[]; page: string }

    if (!process.env.GROQ_API_KEY) {
      return new Response('GROQ_API_KEY não configurada. Adicione sua chave em .env.local', { status: 503 })
    }
    if (!messages?.length) return new Response('Mensagens inválidas', { status: 400 })

    const userText      = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const modoRelatorio = pedeRelatorio(messages)

    const ctx          = await fetchPageContext(page ?? '/', userText)
    const systemPrompt = buildSystemPrompt(page ?? '/', ctx, modoRelatorio)

    const stream = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      stream: true,
      max_tokens: modoRelatorio ? 2200 : 500,
      temperature: modoRelatorio ? 0.2 : 0.05,
    })

    const encoder = new TextEncoder()
    return new Response(
      new ReadableStream({
        async start(controller) {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content ?? ''
            if (text) controller.enqueue(encoder.encode(text))
          }
          controller.close()
        },
      }),
      { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } }
    )
  } catch (err: any) {
    console.error('[IA Chat]', err)
    return new Response(err?.message ?? 'Erro interno', { status: 500 })
  }
}
