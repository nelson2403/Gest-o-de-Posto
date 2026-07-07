import { NextResponse } from 'next/server'
import { exigirRole } from '@/lib/auth-guard'
import { groqClient, GROQ_MODEL } from '@/lib/groq'

export const dynamic = 'force-dynamic'

type Linha = { id: string; data: string; descricao: string; valor: number }
export interface SugestaoIA { banco: string[]; sistema: string[]; motivo: string; confianca: 'alta' | 'media' | 'baixa' }

const LIM = 80 // teto de linhas por lado (controla custo/tokens)

// POST /api/caixa/conciliacao/ia — a IA sugere correspondências entre as linhas
// PENDENTES do banco e do sistema, inclusive com diferença explicável (tarifa,
// IOF, antecipação). NUNCA aplica nada: só devolve sugestões para o usuário confirmar.
export async function POST(req: Request) {
  const auth = await exigirRole(['master', 'adm_financeiro', 'operador_conciliador'])
  if (!auth.ok) return auth.resp

  const body = await req.json().catch(() => null)
  const banco: Linha[] = Array.isArray(body?.banco) ? body.banco : []
  const sistema: Linha[] = Array.isArray(body?.sistema) ? body.sistema : []
  if (!banco.length || !sistema.length) {
    return NextResponse.json({ sugestoes: [], observacao: 'Não há linhas pendentes suficientes dos dois lados para analisar.' })
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'IA não configurada (GROQ_API_KEY ausente).' }, { status: 503 })
  }

  const truncado = banco.length > LIM || sistema.length > LIM
  const b = banco.slice(0, LIM).map(l => ({ i: l.id, d: l.data, v: Number(l.valor.toFixed(2)), t: (l.descricao || '').slice(0, 60) }))
  const s = sistema.slice(0, LIM).map(l => ({ i: l.id, d: l.data, v: Number(l.valor.toFixed(2)), t: (l.descricao || '').slice(0, 60) }))
  const idsB = new Set(b.map(x => x.i)); const idsS = new Set(s.map(x => x.i))

  const system = `Você é um assistente de conciliação bancária brasileiro. Recebe linhas PENDENTES do extrato do BANCO e do SISTEMA (ERP), cada uma com id (i), data (d), valor (v) e descrição (t). Sua tarefa: sugerir quais linhas do banco correspondem a quais do sistema.
Regras:
- Use SOMENTE os ids fornecidos. NUNCA invente ids nem linhas.
- Cada id pode aparecer em NO MÁXIMO uma sugestão.
- Uma sugestão pode agrupar várias linhas (ex.: 1 do banco = 2 do sistema) quando a SOMA corresponde.
- Sugira também quando os valores NÃO são idênticos mas a diferença é explicável: tarifa de maquininha, IOF, taxa, antecipação de recebível, arredondamento. Explique no "motivo".
- Considere datas próximas (liquidação de cartão cai em dias diferentes da venda).
- confianca: "alta" (valor bate ou diferença claramente explicável + descrição compatível), "media", "baixa".
- Seja conservador: se não tiver correspondência plausível, NÃO sugira. É melhor deixar pendente do que sugerir errado.
Responda SOMENTE JSON no formato:
{"sugestoes":[{"banco":["id"],"sistema":["id"],"motivo":"curto e claro","confianca":"alta"}],"observacao":"resumo curto do que sobrou/observações"}`

  const user = `BANCO (pendentes):\n${JSON.stringify(b)}\n\nSISTEMA (pendentes):\n${JSON.stringify(s)}`

  let parsed: any = null
  try {
    const resp = await groqClient.chat.completions.create({
      model: GROQ_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    })
    parsed = JSON.parse(resp.choices[0]?.message?.content || '{}')
  } catch (e: any) {
    return NextResponse.json({ error: 'IA indisponível: ' + (e?.message ?? '') }, { status: 502 })
  }

  // Valida: só ids conhecidos, cada id uma vez, os dois lados presentes.
  const usados = new Set<string>()
  const sugestoes: SugestaoIA[] = []
  for (const sug of Array.isArray(parsed?.sugestoes) ? parsed.sugestoes : []) {
    const bIds = (Array.isArray(sug?.banco) ? sug.banco : []).map(String).filter((x: string) => idsB.has(x) && !usados.has(x))
    const sIds = (Array.isArray(sug?.sistema) ? sug.sistema : []).map(String).filter((x: string) => idsS.has(x) && !usados.has(x))
    if (!bIds.length || !sIds.length) continue
    for (const x of [...bIds, ...sIds]) usados.add(x)
    const conf = ['alta', 'media', 'baixa'].includes(sug?.confianca) ? sug.confianca : 'media'
    sugestoes.push({ banco: bIds, sistema: sIds, motivo: String(sug?.motivo ?? '').slice(0, 200), confianca: conf })
  }

  return NextResponse.json({
    sugestoes,
    observacao: String(parsed?.observacao ?? '').slice(0, 400),
    truncado,
  })
}
