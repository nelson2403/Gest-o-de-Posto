import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { groqClient, GROQ_MODEL } from '@/lib/groq'

export const dynamic = 'force-dynamic'

export interface Divergencia { titulo: string; banco: number; sistema: number; diferenca: number; motivo: string; gravidade: 'alta' | 'media' | 'baixa' }

// POST /api/caixa/conciliacao/ia-divergencia
// Compara os recebíveis de cartão (que liquidam) com os créditos de cartão do
// banco e aponta divergências prováveis (tarifa, antecipação, recebível não
// baixado, valor a mais/menos). Não aplica nada — é diagnóstico.
export async function POST(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const body = await req.json().catch(() => null)
  const cartoes = Array.isArray(body?.cartoes) ? body.cartoes : []
  const banco = Array.isArray(body?.banco) ? body.banco : []
  if (!cartoes.length && !banco.length) return NextResponse.json({ divergencias: [], observacao: 'Sem dados para analisar.' })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'IA não configurada (GROQ_API_KEY ausente).' }, { status: 503 })

  const c = cartoes.slice(0, 120).map((x: any) => ({ liq: x.liquida, band: x.bandeira, venda: x.venda, v: Number(Number(x.valor).toFixed(2)) }))
  const b = banco.slice(0, 120).map((x: any) => ({ d: x.data, t: String(x.descricao || '').slice(0, 50), v: Number(Number(x.valor).toFixed(2)) }))

  const system = `Você é auditor de conciliação de cartões (Brasil). Recebe:
- RECEBIVEIS: vendas no cartão do ERP que LIQUIDAM (caem no banco), com dia de liquidação (liq), bandeira (band), dia da venda e valor (v).
- BANCO: créditos de cartão que caíram na conta, com data (d), descrição (t) e valor (v).
Tarefa: apontar DIVERGÊNCIAS entre o que caiu no banco e os recebíveis, por bandeira e dia de liquidação. Ex.: o banco creditou menos que os recebíveis (diferença = tarifa da maquininha); um recebível que não apareceu no banco (antecipação/atraso); um crédito no banco sem recebível correspondente.
Regras: seja conservador e específico; some por bandeira/dia; NÃO invente. gravidade: "alta" (falta dinheiro / crédito sem origem), "media" (tarifa/diferença pequena), "baixa".
Responda SOMENTE JSON:
{"divergencias":[{"titulo":"curto (bandeira + dia)","banco":0,"sistema":0,"diferenca":0,"motivo":"explicação curta","gravidade":"media"}],"observacao":"resumo geral curto"}`

  const user = `RECEBIVEIS:\n${JSON.stringify(c)}\n\nBANCO (créditos de cartão):\n${JSON.stringify(b)}`

  let parsed: any = null
  try {
    const resp = await groqClient.chat.completions.create({
      model: GROQ_MODEL, temperature: 0.1, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    })
    parsed = JSON.parse(resp.choices[0]?.message?.content || '{}')
  } catch (e: any) {
    return NextResponse.json({ error: 'IA indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  const divergencias: Divergencia[] = (Array.isArray(parsed?.divergencias) ? parsed.divergencias : []).slice(0, 30).map((d: any) => ({
    titulo: String(d?.titulo ?? '').slice(0, 120),
    banco: Number(d?.banco) || 0, sistema: Number(d?.sistema) || 0, diferenca: Number(d?.diferenca) || 0,
    motivo: String(d?.motivo ?? '').slice(0, 240),
    gravidade: ['alta', 'media', 'baixa'].includes(d?.gravidade) ? d.gravidade : 'media',
  }))
  return NextResponse.json({ divergencias, observacao: String(parsed?.observacao ?? '').slice(0, 400) })
}
