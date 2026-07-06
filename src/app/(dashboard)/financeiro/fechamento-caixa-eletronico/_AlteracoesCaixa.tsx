'use client'

import { useMemo, useState } from 'react'
import { Loader2, Search, Plus, Pencil, Trash2, AlertTriangle, User, FileDown, CreditCard, HandCoins } from 'lucide-react'

type PostoRow = { id: string; nome: string }
type CampoDetalhe = { campo: string; antes: string | null; depois: string | null; mudou: boolean }
type Alteracao = {
  tipo: 'insercao' | 'exclusao' | 'alteracao'
  quando: string
  alterou: string
  alterou_login: string
  operador: string
  operador_login: string
  terceiro: boolean
  estacao: string
  documento: string | null
  valor: number | null
  forma: string | null
  pessoa: string | null
  fiado: boolean
  campos: CampoDetalhe[]
}
type LoginNome = { login: string; nome: string }
type Resumo = { total: number; insercoes: number; alteracoes: number; exclusoes: number; terceiros: number; fiados: number }
type Dados = {
  alteracoes: Alteracao[]
  total: number
  resumo: Resumo
  frentistas: LoginNome[]
  usuarios: LoginNome[]
  periodo: { ini: string; fim: string }
}
const HOJE = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const hora = (iso: string) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

// ── Detalhes descritivos ───────────────────────────────────────────────────
const campoVal = (a: Alteracao, campo: string, lado: 'antes' | 'depois') =>
  a.campos.find(c => c.campo === campo)?.[lado] ?? null

function Pilula({ children, cor }: { children: React.ReactNode; cor: 'red' | 'green' | 'gray' }) {
  const cls = cor === 'red' ? 'bg-red-50 text-red-700 border-red-200'
    : cor === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-gray-50 text-gray-600 border-gray-200'
  return <span className={`px-1.5 py-0.5 rounded border text-[12px] font-semibold ${cls}`}>{children}</span>
}

// alteração: identifica o cartão (bandeira + autorização) e mostra cada campo que
// mudou como  antes → depois
function DetalheAlteracao({ a }: { a: Alteracao }) {
  const mud = a.campos.filter(c => c.mudou)
  const forma = a.forma
  const doc   = a.documento
  return (
    <div className="space-y-1">
      {(forma || doc) && (
        <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
          <CreditCard className="w-3.5 h-3.5 text-gray-400" />
          {forma && <span className="font-semibold text-gray-700">{forma}</span>}
          {doc && <span className="text-gray-400">· autorização {doc}</span>}
        </div>
      )}
      {mud.length ? mud.map((c, i) => (
        <div key={i} className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] text-gray-500">{c.campo}:</span>
          <Pilula cor="red"><span className="line-through">{c.antes ?? '—'}</span></Pilula>
          <span className="text-gray-400 text-xs">→</span>
          <Pilula cor="green">{c.depois ?? '—'}</Pilula>
        </div>
      )) : <span className="text-gray-500 text-[12px]">alteração no lançamento</span>}
    </div>
  )
}

// inserção / exclusão: forma + valor + autorização destacados
function DetalheLinha({ a, lado }: { a: Alteracao; lado: 'antes' | 'depois' }) {
  const forma  = campoVal(a, 'Forma de pagamento', lado)
  const valor  = campoVal(a, 'Valor', lado)
  const doc    = campoVal(a, 'Documento', lado)
  const pessoa = campoVal(a, 'Pessoa', lado)
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      {forma && <Pilula cor="gray">{forma}</Pilula>}
      {valor && <span className="font-bold text-gray-800">{valor}</span>}
      {doc && <span className="text-[11px] text-gray-400">autorização {doc}</span>}
      {pessoa && <span className="text-[11px] text-gray-400">· {pessoa}</span>}
    </span>
  )
}

const TIPO_INFO = {
  insercao:  { label: 'Inserções', cls: 'text-emerald-700', dot: 'bg-emerald-500', icon: Plus },
  alteracao: { label: 'Alterações', cls: 'text-amber-700', dot: 'bg-amber-500', icon: Pencil },
  exclusao:  { label: 'Exclusões', cls: 'text-red-700', dot: 'bg-red-500', icon: Trash2 },
} as const

// ── Frases (texto puro, reusadas no PDF) ────────────────────────────────────
const money = (n: number | null) => n == null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
function linhaFrase(a: Alteracao): string {
  const parts = [a.forma || 'lançamento']
  if (a.valor != null) parts.push(money(a.valor))
  if (a.documento) parts.push(`autorização ${a.documento}`)
  if (a.pessoa) parts.push(a.pessoa)
  return parts.join(' · ')
}
function alteracaoFrase(a: Alteracao): string {
  const card = [a.forma, a.documento ? `autorização ${a.documento}` : ''].filter(Boolean).join(' · ')
  const mud = a.campos.filter(c => c.mudou).map(c => `${c.campo}: ${c.antes ?? '-'} -> ${c.depois ?? '-'}`).join('; ')
  return (card ? card + ' — ' : '') + (mud || 'alteração no lançamento')
}

export function AlteracoesCaixa({ postos }: { postos: PostoRow[] }) {
  const [postoId, setPostoId] = useState(postos[0]?.id ?? '')
  const [dataIni, setDataIni] = useState(HOJE)
  const [dataFim, setDataFim] = useState(HOJE)
  const [operador, setOperador] = useState('')
  const [alterou, setAlterou] = useState('')
  const [soTerceiros, setSoTerceiros] = useState(false)
  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function buscar(soTerceirosArg?: boolean) {
    if (!postoId) return
    const st = typeof soTerceirosArg === 'boolean' ? soTerceirosArg : soTerceiros
    setLoading(true); setErro(null)
    try {
      const p = new URLSearchParams({ posto_id: postoId })
      if (dataIni) p.set('data_ini', dataIni)
      if (dataFim) p.set('data_fim', dataFim)
      if (operador) p.set('operador', operador)
      if (alterou) p.set('alterou', alterou)
      if (st) p.set('so_terceiros', '1')
      const r = await fetch(`/api/caixa/alteracoes?${p}`, { cache: 'no-store' })
      const txt = await r.text()
      let d: any = null
      try { d = txt ? JSON.parse(txt) : null } catch { /* não-JSON */ }
      if (!r.ok) throw new Error(d?.error || `Erro ${r.status} ao buscar`)
      if (!d) throw new Error('Resposta vazia do servidor (tente um período menor).')
      setDados(d)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Agrupa por QUEM ALTEROU → e dentro, por tipo. Conversões para a prazo NÃO
  // entram aqui (quem conferiu) — só no relatório de conversões abaixo.
  const grupos = useMemo(() => {
    if (!dados) return []
    const m = new Map<string, { alterou: string; terceiro: boolean; alteracao: Alteracao[]; insercao: Alteracao[]; exclusao: Alteracao[] }>()
    for (const a of dados.alteracoes) {
      if (a.fiado) continue
      if (!m.has(a.alterou)) m.set(a.alterou, { alterou: a.alterou, terceiro: false, alteracao: [], insercao: [], exclusao: [] })
      const g = m.get(a.alterou)!
      g[a.tipo].push(a)
      if (a.terceiro) g.terceiro = true
    }
    return [...m.values()].sort((x, y) =>
      (y.alteracao.length + y.insercao.length + y.exclusao.length) - (x.alteracao.length + x.insercao.length + x.exclusao.length))
  }, [dados])

  // Conversões para fiado (a prazo) — indicador de risco
  const fiados = useMemo(() => dados ? dados.alteracoes.filter(a => a.fiado) : [], [dados])

  const postoNome = postos.find(p => p.id === postoId)?.nome ?? ''

  async function exportarPDF() {
    if (!dados) return
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const M = 14, MAX_Y = 285, WRAP = 180
    let y = 16
    const check = (h: number) => { if (y + h > MAX_Y) { doc.addPage(); y = 16 } }
    const write = (txt: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number } = {}) => {
      const { size = 9, bold = false, color = [40, 40, 40], indent = 0 } = opts
      doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
      const lines = doc.splitTextToSize(txt, WRAP - indent) as string[]
      for (const ln of lines) { check(size * 0.5); doc.text(ln, M + indent, y); y += size * 0.5 + 1.4 }
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(150, 20, 20)
    doc.text('Alterações no Caixa', M, y); y += 7
    write(`${postoNome}   ·   ${dados.periodo.ini}${dados.periodo.fim !== dados.periodo.ini ? ` a ${dados.periodo.fim}` : ''}`, { size: 11, color: [50, 50, 50] })
    write(`Gerado em ${new Date().toLocaleString('pt-BR')}`, { size: 8, color: [140, 140, 140] })
    y += 1
    write(`Alterações: ${dados.resumo.alteracoes}    Inserções: ${dados.resumo.insercoes}    Exclusões: ${dados.resumo.exclusoes}    Por terceiros: ${dados.resumo.terceiros}    Conversões p/ a prazo: ${dados.resumo.fiados}`, { size: 9, bold: true })
    y += 2

    if (fiados.length) {
      check(8); write('(!) Conversoes de nota para A PRAZO', { size: 11, bold: true, color: [150, 20, 20] })
      for (const a of fiados) {
        write(`• ${money(a.valor)} — cliente ${a.pessoa ?? '—'} · login que autorizou: ${a.alterou} · caixa de ${a.operador} · ${hora(a.quando)}`, { size: 9, indent: 3, color: [120, 20, 20] })
      }
      y += 3
    }

    for (const g of grupos) {
      check(10)
      write(`${g.alterou}${g.terceiro ? '  (mexeu no caixa de outros)' : ''}`, { size: 12, bold: true, color: g.terceiro ? [150, 20, 20] : [30, 30, 30] })
      const secs: [keyof typeof TIPO_INFO, Alteracao[]][] = [['alteracao', g.alteracao], ['insercao', g.insercao], ['exclusao', g.exclusao]]
      for (const [tipo, lista] of secs) {
        if (!lista.length) continue
        write(`${TIPO_INFO[tipo].label} (${lista.length})`, { size: 10, bold: true, indent: 2, color: [90, 90, 90] })
        for (const a of lista) {
          const corpo = tipo === 'alteracao' ? alteracaoFrase(a)
            : tipo === 'insercao' ? `Inseriu ${linhaFrase(a)}`
            : `Excluiu ${linhaFrase(a)}`
          write(`• ${corpo}`, { size: 9, indent: 5 })
          write(`caixa de ${a.operador} · ${hora(a.quando)}${a.estacao ? ` · ${a.estacao}` : ''}`, { size: 7.5, indent: 8, color: [150, 150, 150] })
        }
      }
      y += 3
    }

    doc.save(`alteracoes-caixa-${postoNome.replace(/[^\w]+/g, '_')}-${dados.periodo.ini}.pdf`)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl space-y-5">
      <p className="text-[13px] text-gray-500">
        Histórico detalhado de <b>quem mexeu no caixa dos frentistas</b> — alterações, inserções e exclusões feitas por
        terceiros (e todas as exclusões). Agrupado por quem alterou.
      </p>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Posto</label>
            <select value={postoId} onChange={e => setPostoId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 min-w-[220px]">
              {postos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">De</label>
            <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Até</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={() => buscar()} disabled={loading}
            className="px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Buscar
          </button>
        </div>
        {dados && (
          <div className="flex items-end gap-3 flex-wrap pt-2 border-t border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Frentista (caixa)</label>
              <select value={operador} onChange={e => setOperador(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
                <option value="">Todos os frentistas</option>
                {dados.frentistas.map(f => <option key={f.login} value={f.login}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Quem alterou</label>
              <select value={alterou} onChange={e => setAlterou(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[200px]">
                <option value="">Todos</option>
                {dados.usuarios.map(u => <option key={u.login} value={u.login}>{u.nome}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 pb-2 cursor-pointer">
              <input type="checkbox" checked={soTerceiros} onChange={e => setSoTerceiros(e.target.checked)} className="w-4 h-4" />
              Só quem não é o frentista
            </label>
            <button onClick={() => buscar()} disabled={loading}
              className="px-4 py-2 border border-orange-300 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-50">
              Aplicar filtros
            </button>
          </div>
        )}
      </div>

      {erro && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{erro}</div>}

      {/* Resumo */}
      {dados && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <ResumoCard label="Alterações" valor={dados.resumo.alteracoes} cls="text-amber-600" />
          <ResumoCard label="Inserções" valor={dados.resumo.insercoes} cls="text-emerald-600" />
          <ResumoCard label="Exclusões" valor={dados.resumo.exclusoes} cls="text-red-600" />
          <ResumoCard label="Por terceiros ⚠" valor={dados.resumo.terceiros} cls="text-red-600" />
          <ResumoCard label="Conv. p/ a prazo ⚠" valor={dados.resumo.fiados} cls="text-rose-700" />
        </div>
      )}

      {/* Botão exportar PDF */}
      {dados && grupos.length > 0 && (
        <div className="flex justify-end">
          <button onClick={exportarPDF}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-1.5">
            <FileDown className="w-4 h-4" /> Exportar PDF
          </button>
        </div>
      )}

      {/* Conversões de nota para A PRAZO — risco (só relatório, para ciência dos donos) */}
      {dados && fiados.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-rose-100 flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-rose-600" />
            <span className="text-[14px] font-bold text-rose-800">Conversões de nota para a prazo</span>
            <span className="text-[11px] text-rose-500">venda que foi transformada em nota a prazo — exige senha de autorização</span>
          </div>
          <ul className="divide-y divide-rose-100">
            {fiados.map((a, i) => (
              <li key={i} className="px-5 py-2.5 text-[13px] text-gray-700 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                <div>
                  <span className="font-bold text-gray-800">{money(a.valor)}</span>
                  {a.pessoa && <span className="text-gray-600"> · cliente {a.pessoa}</span>}
                  <span className="text-rose-700"> · login que autorizou: <b>{a.alterou}</b></span>
                  <div className="text-gray-400 text-[11px] mt-0.5">
                    caixa de <b className="text-gray-600">{a.operador}</b> · {hora(a.quando)}{a.estacao ? ` · ${a.estacao}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Narrativa agrupada por quem alterou */}
      {dados && (
        grupos.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
            Nenhuma alteração no caixa no período/filtro.
          </div>
        ) : (
          <div className="space-y-4">
            {grupos.map(g => (
              <div key={g.alterou} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className={`px-5 py-3 border-b flex items-center gap-2 ${g.terceiro ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-200'}`}>
                  <User className={`w-4 h-4 ${g.terceiro ? 'text-red-500' : 'text-gray-400'}`} />
                  <span className="text-[15px] font-bold text-gray-800">{g.alterou}</span>
                  {g.terceiro && <span className="text-[11px] font-semibold text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> mexeu no caixa de outros</span>}
                </div>
                <div className="p-5 space-y-4">
                  {(['alteracao', 'insercao', 'exclusao'] as const).map(tipo => {
                    const lista = g[tipo]
                    if (!lista.length) return null
                    const info = TIPO_INFO[tipo]
                    const Icon = info.icon
                    return (
                      <div key={tipo}>
                        <p className={`text-[13px] font-bold mb-1.5 flex items-center gap-1.5 ${info.cls}`}>
                          <Icon className="w-3.5 h-3.5" /> {info.label} ({lista.length})
                        </p>
                        <ul className="space-y-2">
                          {lista.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-[13px] text-gray-700 border-l-2 border-gray-100 pl-3 py-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${info.dot}`} />
                              <div className="min-w-0">
                                {tipo === 'alteracao' && <DetalheAlteracao a={a} />}
                                {tipo === 'insercao' && <span className="inline-flex items-center gap-1.5 flex-wrap"><span className="font-semibold text-emerald-700">Inseriu</span> <DetalheLinha a={a} lado="depois" /></span>}
                                {tipo === 'exclusao' && <span className="inline-flex items-center gap-1.5 flex-wrap"><span className="font-semibold text-red-700">Excluiu</span> <DetalheLinha a={a} lado="antes" /></span>}
                                <div className="text-gray-400 text-[11px] mt-0.5">
                                  caixa de <b className="text-gray-600">{a.operador}</b> · {hora(a.quando)}
                                  {a.estacao ? ` · ${a.estacao}` : ''}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {!dados && !loading && (
        <div className="bg-white rounded-xl border border-gray-200 py-12 text-center text-gray-400 text-sm">
          Selecione o posto e período e clique em Buscar.
        </div>
      )}
    </div>
  )
}

function ResumoCard({ label, valor, cls }: { label: string; valor: number; cls: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className={`text-[20px] font-bold mt-0.5 ${cls}`}>{valor}</p>
    </div>
  )
}
