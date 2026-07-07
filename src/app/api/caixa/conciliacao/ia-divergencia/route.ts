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
  const adquirente = Array.isArray(body?.adquirente) ? body.adquirente : []
  if (!cartoes.length && !banco.length) return NextResponse.json({ divergencias: [], observacao: 'Sem dados para analisar.' })
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: 'IA não configurada (GROQ_API_KEY ausente).' }, { status: 503 })

  const c = cartoes.slice(0, 120).map((x: any) => ({ liq: x.liquida, band: x.bandeira, venda: x.venda, v: Number(Number(x.valor).toFixed(2)) }))
  const b = banco.slice(0, 120).map((x: any) => ({ d: x.data, t: String(x.descricao || '').slice(0, 50), v: Number(Number(x.valor).toFixed(2)) }))
  const a = adquirente.slice(0, 120).map((x: any) => ({ liq: x.liquida, band: x.bandeira, venda: x.venda, bruto: Number(Number(x.bruto).toFixed(2)), taxa: x.taxa, liq_val: Number(Number(x.liquido).toFixed(2)) }))

  const system = `Você é auditor de conciliação de cartões (Brasil). Recebe TRÊS lados:
- RECEBIVEIS: vendas no cartão do ERP que LIQUIDAM (caem no banco): dia de liquidação (liq), bandeira (band), dia da venda, valor (v).
- ADQUIRENTE (Equals): o que a operadora diz que vai pagar: bruto, taxa (%) e liq_val (líquido = bruto − taxas). É a VERDADE sobre quanto deve cair no banco.
- BANCO: créditos que caíram de fato na conta: data (d), descrição (t), valor (v).
Tarefa: apontar DIVERGÊNCIAS por bandeira e dia. O esperado no banco = liq_val da adquirente. Se o banco creditou MENOS que o bruto, a diferença é a TAXA (compare com liq_val: se bate, é só tarifa normal). Se o banco creditou menos que liq_val, falta dinheiro (grave). Se um recebível/adquirente não caiu no banco = antecipação/atraso.
Regras: use os números da ADQUIRENTE como referência; seja específico e conservador; NÃO invente. gravidade: "alta" (falta além da taxa / crédito sem origem), "media" (só a taxa esperada), "baixa".
Responda SOMENTE JSON:
{"divergencias":[{"titulo":"curto (bandeira + dia)","banco":0,"sistema":0,"diferenca":0,"motivo":"explicação com bruto/taxa/líquido","gravidade":"media"}],"observacao":"resumo geral curto"}`

  const user = `ADQUIRENTE (Equals):\n${JSON.stringify(a)}\n\nBANCO (créditos):\n${JSON.stringify(b)}\n\nRECEBIVEIS (ERP):\n${JSON.stringify(c)}`

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
