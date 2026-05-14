import { NextRequest } from 'next/server'
import { groqClient, GROQ_MODEL } from '@/lib/groq'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarAnaliseVendasPorProduto } from '@/lib/autosystem'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

async function fetchPageContext(page: string): Promise<string> {
  const sb   = createAdminClient()
  const hoje = new Date()
  const dataHoje = hoje.toISOString().slice(0, 10)
  const p    = page.replace(/\?.*$/, '')

  const parts: string[] = []

  // ── Postos ─────────────────────────────────────────────────────────────────
  let empresaIds: number[] = []
  try {
    const { data } = await sb.from('postos').select('nome, codigo_empresa_externo').eq('ativo', true).order('nome')
    if (data?.length) {
      parts.push(`POSTOS ATIVOS (${data.length}): ${data.map(d => d.nome).join(' | ')}`)
      empresaIds = data.map(d => Number(d.codigo_empresa_externo)).filter(n => !isNaN(n) && n > 0)
    }
  } catch { /* ignore */ }

  // ── Vendas e Lucro (AutoSystem) ─────────────────────────────────────────────
  if (empresaIds.length > 0) {
    try {
      const hoje2  = new Date()
      const dataIni = `${hoje2.getFullYear()}-${String(hoje2.getMonth() + 1).padStart(2, '0')}-01`
      const dataFim = hoje2.toISOString().slice(0, 10)

      const { produtos } = await buscarAnaliseVendasPorProduto(empresaIds, dataIni, dataFim)

      if (produtos.length > 0) {
        const totalVenda  = produtos.reduce((s, p) => s + p.venda, 0)
        const totalCusto  = produtos.reduce((s, p) => s + p.custo, 0)
        const totalLucro  = totalVenda - totalCusto
        const margem      = totalVenda > 0 ? (totalLucro / totalVenda) * 100 : 0
        const totalDesc   = produtos.reduce((s, p) => s + (p.total_desconto || 0), 0)

        const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        parts.push(`VENDAS MÊS ATUAL (${dataIni} a ${dataFim}): faturamento ${fmt(totalVenda)} | custo ${fmt(totalCusto)} | LUCRO BRUTO ${fmt(totalLucro)} | margem ${margem.toFixed(2)}% | descontos ${fmt(totalDesc)}`)

        // Top 10 produtos por lucro
        const top = [...produtos]
          .sort((a, b) => (b.venda - b.custo) - (a.venda - a.custo))
          .slice(0, 10)
          .map(p => {
            const lucro = p.venda - p.custo
            const mg    = p.venda > 0 ? (lucro / p.venda * 100).toFixed(1) : '0'
            return `${p.produto_nome}: venda ${fmt(p.venda)} | lucro ${fmt(lucro)} (${mg}%)`
          })
        parts.push(`TOP 10 PRODUTOS POR LUCRO:\n${top.join('\n')}`)
      }
    } catch (e: any) {
      parts.push(`[Vendas AutoSystem: ${e.message}]`)
    }
  }

  // ── Tarefas de conciliação bancária (extrato) ───────────────────────────────
  try {
    const { data } = await sb
      .from('tarefas')
      .select('titulo, status, extrato_status, extrato_diferenca, usuario_id, usuarios(nome), postos(nome)')
      .in('status', ['aberta', 'em_andamento'])
      .not('extrato_arquivo_path', 'is', null)
      .order('extrato_diferenca', { ascending: true })
      .limit(200)

    if (data?.length) {
      const divergentes = data.filter((t: any) => t.extrato_status === 'divergente')
      const totalDiverg = divergentes.reduce((s: number, t: any) => s + Math.abs(Number(t.extrato_diferenca || 0)), 0)

      // Ranking por usuário
      const porUser: Record<string, number> = {}
      for (const t of data) {
        const n = (t as any).usuarios?.nome ?? 'Sem responsável'
        porUser[n] = (porUser[n] || 0) + 1
      }
      const ranking = Object.entries(porUser).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([n, c]) => `${n}: ${c}`).join(' | ')

      parts.push(`TAREFAS EXTRATO BANCÁRIO ABERTAS: ${data.length} | divergentes: ${divergentes.length} | soma divergência: R$ ${totalDiverg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
      parts.push(`EXTRATO POR RESPONSÁVEL: ${ranking}`)

      if (divergentes.length) {
        parts.push(`MAIORES DIVERGÊNCIAS: ${divergentes.slice(0, 5).map((t: any) => `${(t as any).postos?.nome ?? '?'} dif. R$${Number(t.extrato_diferenca).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`).join(' | ')}`)
      }
    }
  } catch { /* ignore */ }

  // ── Todas as tarefas abertas (avulsas + recorrentes) ───────────────────────
  try {
    const { data } = await sb
      .from('tarefas')
      .select('titulo, status, prioridade, data_conclusao_prevista, usuario_id, usuarios(nome), postos(nome)')
      .in('status', ['aberta', 'em_andamento', 'pausada'])
      .limit(500)

    if (data?.length) {
      const urgentes = data.filter((t: any) => t.prioridade === 'urgente')
      const altas    = data.filter((t: any) => t.prioridade === 'alta')
      const vencidas = data.filter((t: any) => t.data_conclusao_prevista && t.data_conclusao_prevista < dataHoje)

      const porUser: Record<string, number> = {}
      const porPosto: Record<string, number> = {}
      for (const t of data) {
        const u = (t as any).usuarios?.nome ?? 'Sem responsável'
        const p2 = (t as any).postos?.nome ?? 'Sem posto'
        porUser[u]   = (porUser[u] || 0) + 1
        porPosto[p2] = (porPosto[p2] || 0) + 1
      }

      const rankUser  = Object.entries(porUser).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}: ${c}`).join(' | ')
      const rankPosto = Object.entries(porPosto).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => `${n}: ${c}`).join(' | ')

      parts.push(`TOTAL TAREFAS ABERTAS: ${data.length} | urgentes: ${urgentes.length} | altas: ${altas.length} | vencidas: ${vencidas.length}`)
      parts.push(`TAREFAS POR RESPONSÁVEL: ${rankUser}`)
      parts.push(`TAREFAS POR POSTO: ${rankPosto}`)

      if (urgentes.length) parts.push(`URGENTES: ${urgentes.slice(0, 5).map((t: any) => `"${t.titulo}" (${(t as any).postos?.nome ?? '?'})`).join(' | ')}`)
      if (vencidas.length) parts.push(`VENCIDAS: ${vencidas.slice(0, 5).map((t: any) => `"${t.titulo}" prazo:${t.data_conclusao_prevista}`).join(' | ')}`)
    }
  } catch { /* ignore */ }

  // ── Medições de tanques ─────────────────────────────────────────────────────
  if (p === '/' || p.startsWith('/tanques') || p.startsWith('/transpombal')) {
    try {
      const { data } = await sb
        .from('medicoes_tanques')
        .select('posto_nome, medida_litros, data')
        .order('data', { ascending: false })
        .limit(200)

      if (data?.length) {
        const latest: Record<string, typeof data[0]> = {}
        for (const m of data) {
          if (!latest[m.posto_nome]) latest[m.posto_nome] = m
        }
        const medicoes = Object.values(latest)
        const totalLitros = medicoes.reduce((s, m) => s + Number(m.medida_litros || 0), 0)
        parts.push(`MEDIÇÕES DE TANQUES (última por posto, ${medicoes.length} postos): total ${totalLitros.toLocaleString('pt-BR')} L`)
        parts.push(`DETALHES: ${medicoes.slice(0, 10).map(m => `${m.posto_nome}: ${Number(m.medida_litros).toLocaleString('pt-BR')}L (${m.data})`).join(' | ')}`)
      }
    } catch { /* ignore */ }
  }

  // ── Fiscal ─────────────────────────────────────────────────────────────────
  if (p.startsWith('/fiscal') || p === '/') {
    try {
      const { data } = await sb
        .from('fiscal_tarefas')
        .select('status, boleto_vencimento, fornecedor_nome, valor_as, postos(nome)')
        .neq('status', 'concluida')
        .limit(100)

      if (data?.length) {
        const vencidas = data.filter((t: any) => t.boleto_vencimento && t.boleto_vencimento < dataHoje)
        const totalValor = data.reduce((s: number, t: any) => s + Number(t.valor_as || 0), 0)
        parts.push(`FISCAL PENDENTE: ${data.length} NF-e | ${vencidas.length} boletos vencidos | valor total AS: R$ ${totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
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
        const pagos     = data.filter((c: any) => c.status === 'pago')
        const atrasados = data.filter((c: any) => c.status !== 'pago' && c.vencimento && c.vencimento < dataHoje)
        const totalPrev = data.reduce((s: number, c: any) => s + Number(c.valor_previsto || 0), 0)
        const totalPago = pagos.reduce((s: number, c: any) => s + Number(c.valor_pago || c.valor_previsto || 0), 0)
        const totalAtr  = atrasados.reduce((s: number, c: any) => s + Number(c.valor_previsto || 0), 0)

        parts.push(`CONTAS A PAGAR ${anoMes}: previsto R$${totalPrev.toFixed(2)} | pago R$${totalPago.toFixed(2)} | em atraso: ${atrasados.length} (R$${totalAtr.toFixed(2)})`)
        if (atrasados.length)
          parts.push(`ATRASADAS: ${atrasados.slice(0, 5).map((c: any) => `"${c.descricao}" R$${c.valor_previsto} venc.${c.vencimento}`).join(' | ')}`)
      }
    } catch { /* ignore */ }
  }

  return parts.length > 0
    ? `\n\nDADOS REAIS DO SISTEMA (${hoje.toLocaleDateString('pt-BR')}):\n${parts.join('\n')}`
    : '\n\n[Nenhum dado disponível]'
}

function buildSystemPrompt(page: string, contextData: string): string {
  const paginaLabel: Record<string, string> = {
    '/': 'Dashboard', '/analitico': 'Análise de vendas', '/estoque': 'Estoque',
    '/contas-pagar': 'Contas a Pagar', '/tarefas': 'Tarefas',
    '/tarefas/avulsas': 'Tarefas avulsas', '/fiscal': 'Fiscal',
    '/marketing': 'Marketing', '/postos': 'Postos', '/tanques': 'Tanques',
  }
  const paginaNome = paginaLabel[page.replace(/\?.*$/, '')] ?? page

  return `Você é um assistente de BI de uma rede de postos de combustível.

REGRAS:
- Responda SEMPRE em português brasileiro
- Use SOMENTE os dados fornecidos abaixo — NUNCA invente números ou nomes
- Se um dado não estiver nos dados, responda: "dado não disponível"
- Respostas CURTAS: máximo 6 linhas, sem introdução e sem "próximos passos"
- Use bullet points para listas
- Faça cálculos usando os números exatos dos dados fornecidos
- Página atual: ${paginaNome}
${contextData}`
}

export async function POST(req: NextRequest) {
  try {
    const { messages, page } = await req.json() as { messages: ChatMessage[]; page: string }

    if (!process.env.GROQ_API_KEY) {
      return new Response('GROQ_API_KEY não configurada. Adicione sua chave em .env.local', { status: 503 })
    }
    if (!messages?.length) return new Response('Mensagens inválidas', { status: 400 })

    const [contextData, systemPrompt] = await (async () => {
      const ctx = await fetchPageContext(page ?? '/')
      return [ctx, buildSystemPrompt(page ?? '/', ctx)]
    })()

    const stream = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      stream: true,
      max_tokens: 500,
      temperature: 0.05,
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
