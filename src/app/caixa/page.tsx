'use client'

import { useEffect, useRef, useState } from 'react'
import {
  qzDisponivel, listarImpressoras, imprimirHtmlTermica,
  getImpressoraSalva, setImpressoraSalva,
} from '@/lib/qz-printer'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CampoConfig {
  tipo:   string
  label:  string
  ordem:  number
  ativo:  boolean
}

interface ItemForm {
  tipo:            string
  label:           string
  valor_as:        number | null
  valor_frentista: string  // string para o input
  diferenca:       number | null
}

interface FrenistaInfo {
  id:                 string
  nome:               string
  codigo:             string
  posto_id:           string
  posto_nome:         string
  empresa_grid:       string | null
  codigo_operador_as: string | null
}


// ── Formatadores ──────────────────────────────────────────────────────────────

function fmt(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDif(v: number | null): { text: string; cls: string } {
  if (v === null) return { text: '—', cls: 'text-gray-400' }
  if (Math.abs(v) < 0.01) return { text: 'R$ 0,00', cls: 'text-emerald-600 font-semibold' }
  const text = v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return { text: (v > 0 ? '+' : '') + text, cls: v < 0 ? 'text-red-600 font-semibold' : 'text-amber-600 font-semibold' }
}

function dataHoje(): string {
  // Hoje no fuso do Brasil (YYYY-MM-DD)
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function fmtData(iso: string): string {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

// ── Componente de Assinatura ──────────────────────────────────────────────────

function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const [hasLines, setHasLines] = useState(false)

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'

    function start(e: MouseEvent | TouchEvent) {
      e.preventDefault()
      drawing.current = true
      const p = getPos(e, canvas!)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
    }
    function move(e: MouseEvent | TouchEvent) {
      if (!drawing.current) return
      e.preventDefault()
      const p = getPos(e, canvas!)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      setHasLines(true)
    }
    function end() { drawing.current = false }

    canvas.addEventListener('mousedown',  start)
    canvas.addEventListener('mousemove',  move)
    canvas.addEventListener('mouseup',    end)
    canvas.addEventListener('touchstart', start, { passive: false })
    canvas.addEventListener('touchmove',  move,  { passive: false })
    canvas.addEventListener('touchend',   end)

    return () => {
      canvas.removeEventListener('mousedown',  start)
      canvas.removeEventListener('mousemove',  move)
      canvas.removeEventListener('mouseup',    end)
      canvas.removeEventListener('touchstart', start)
      canvas.removeEventListener('touchmove',  move)
      canvas.removeEventListener('touchend',   end)
    }
  }, [])

  function limpar() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasLines(false)
    onCapture('')
  }

  function capturar() {
    const canvas = canvasRef.current
    if (!canvas) return
    onCapture(canvas.toDataURL('image/png'))
  }

  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-gray-300 rounded-xl bg-white overflow-hidden touch-none">
        <canvas
          ref={canvasRef}
          width={700}
          height={180}
          className="w-full block cursor-crosshair"
          style={{ touchAction: 'none' }}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={limpar}
          className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-50"
        >
          Limpar
        </button>
        <button
          onClick={capturar}
          disabled={!hasLines}
          className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Confirmar Assinatura
        </button>
      </div>
    </div>
  )
}

// ── Modal de configuração da impressora térmica ───────────────────────────────

function ConfigImpressoraModal({
  impressora, impressoras, carregando, erro,
  onSelecionar, onRecarregar, onFechar, onTestar,
}: {
  impressora: string
  impressoras: string[]
  carregando: boolean
  erro: string
  onSelecionar: (nome: string) => void
  onRecarregar: () => void
  onFechar: () => void
  onTestar: (nome: string) => void
}) {
  const [escolhida, setEscolhida] = useState(impressora)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Impressora Térmica (QZ Tray)</h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          {carregando ? (
            <p className="text-sm text-gray-500 text-center py-6">Procurando impressoras…</p>
          ) : erro ? (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                {erro}
              </div>
              <button onClick={onRecarregar}
                className="w-full py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-gray-700">
                    Selecione a impressora deste PDV
                  </label>
                  <button
                    onClick={onRecarregar}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium"
                  >
                    ↻ Recarregar lista
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-60 overflow-y-auto">
                  {impressoras.length === 0 ? (
                    <p className="text-sm text-gray-400 px-3 py-3">Nenhuma impressora encontrada.</p>
                  ) : impressoras.map(nome => (
                    <button
                      key={nome}
                      onClick={() => setEscolhida(nome)}
                      className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 ${
                        escolhida === nome ? 'bg-orange-50 text-orange-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${escolhida === nome ? 'bg-orange-500' : 'bg-gray-300'}`} />
                      {nome}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => escolhida && onTestar(escolhida)}
                  disabled={!escolhida}
                  className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Testar
                </button>
                <button
                  onClick={() => escolhida && onSelecionar(escolhida)}
                  disabled={!escolhida}
                  className="flex-1 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>

              <p className="text-[11px] text-gray-400 text-center">
                Na 1ª impressão o QZ Tray pedirá permissão — marque "Remember" e "Allow".
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tela principal ────────────────────────────────────────────────────────────

type Fase = 'codigo' | 'pin' | 'setup_pin' | 'form' | 'conferencia' | 'concluido' | 'bloqueado'

export default function CaixaPage() {
  const [fase,      setFase]      = useState<Fase>('codigo')
  const [token,     setToken]     = useState('')
  const [frentista, setFrentista] = useState<FrenistaInfo | null>(null)
  const [data,      setData]      = useState(dataHoje())
  const [turno,     setTurno]     = useState('')
  const [campos,    setCampos]    = useState<CampoConfig[]>([])
  const [itens,     setItens]     = useState<ItemForm[]>([])
  const [assinatura, setAssinatura] = useState('')
  const [observacao, setObservacao] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [erro,      setErro]      = useState('')
  const [fechamentoId, setFechamentoId] = useState('')
  const [conferenciaAS, setConferenciaAS] = useState<{ total_entradas: number; total_formas: number; diferenca: number } | null>(null)

  // ── Login ──────────────────────────────────────────────────────────────────

  const [loginCodigo,     setLoginCodigo]     = useState('')
  const [loginPin,        setLoginPin]        = useState('')
  const [loginPinConfirm, setLoginPinConfirm] = useState('')
  const [employeeNome,    setEmployeeNome]    = useState('')

  // ── Impressora térmica (QZ Tray) ────────────────────────────────────────────
  const [impressora,        setImpressora]        = useState('')
  const [showImpressora,    setShowImpressora]    = useState(false)
  const [impressoras,       setImpressoras]       = useState<string[]>([])
  const [carregandoImpr,    setCarregandoImpr]    = useState(false)
  const [erroImpr,          setErroImpr]          = useState('')

  useEffect(() => {
    setImpressora(getImpressoraSalva())
  }, [])

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // Monta o HTML do cupom para a impressora térmica (80mm)
  function buildCupomHtml(): string {
    // formato compacto sem "R$" para caber as colunas no cupom
    const m = (v: number | null) => (v == null ? '-' : fmt(v).replace('R$', '').trim())
    const totFormas = itens.reduce((s, i) => s + (i.valor_as ?? 0), 0)
    const totFr = itens.reduce((s, i) => s + (parseFloat(i.valor_frentista.replace(',', '.')) || 0), 0)
    const naoLanc = conferenciaAS ? parseFloat((conferenciaAS.total_entradas - totFormas).toFixed(2)) : 0
    const totAS  = conferenciaAS ? conferenciaAS.total_entradas : totFormas
    const totDif = totFr - totAS
    let linhas = itens.map(item => {
      const vf = parseFloat(item.valor_frentista.replace(',', '.')) || 0
      return `<tr>
        <td>${escapeHtml(item.label)}</td>
        <td class="r">${m(item.valor_as)}</td>
        <td class="r">${m(vf)}</td>
        <td class="r">${m(item.diferenca)}</td>
      </tr>`
    }).join('')
    if (Math.abs(naoLanc) > 0.02) {
      linhas += `<tr><td>Nao lancado</td><td class="r">${m(naoLanc)}</td><td class="r">-</td><td class="r">${m(-naoLanc)}</td></tr>`
    }
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      * { font-family:'Courier New',monospace; font-size:12px; font-weight:bold; color:#000; }
      html,body { width:100%; margin:0; padding:0; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; }
      td,th { padding:1px 1px; vertical-align:top; overflow:hidden; }
      td:first-child,th:first-child { width:36%; word-break:break-word; }
      h1 { font-size:15px; margin:0 0 2px; }
      .hdr { border-bottom:2px solid #000; padding-bottom:3px; margin-bottom:3px; }
      .tot td { border-top:2px solid #000; }
      .r { text-align:right; white-space:nowrap; font-size:11px; }
      th.l { text-align:left; }
    </style></head><body>
      <div class="hdr">
        <h1>Conferencia de Caixa</h1>
        <div>${escapeHtml(frentista?.posto_nome ?? '')}</div>
        <div>${fmtData(data)}${turno ? ' - ' + escapeHtml(turno) : ''}</div>
        <div>Operador: ${escapeHtml(frentista?.nome ?? '')}</div>
      </div>
      ${conferenciaAS && conferenciaAS.total_entradas > 0 ? (() => {
        const entradas = conferenciaAS.total_entradas
        const difV = parseFloat((totFr - entradas).toFixed(2))
        const ok = Math.abs(difV) < 0.02
        const veredito = ok ? 'CAIXA CERTO' : difV < 0 ? `FALTANDO ${m(Math.abs(difV))}` : `SOBRANDO ${m(Math.abs(difV))}`
        return `<div style="text-align:center;border:1px solid #000;padding:4px;margin-bottom:4px">
          <div style="font-size:14px"><strong>${veredito}</strong></div>
          <div style="font-size:10px">Entradas: ${m(entradas)} | Declarado: ${m(totFr)}</div>
        </div>`
      })() : ''}
      <table>
        <thead><tr><th class="l">Forma</th><th class="r">Sist.</th><th class="r">Frent.</th><th class="r">Dif.</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr class="tot"><td>Total</td><td class="r">${m(totAS)}</td><td class="r">${m(totFr)}</td><td class="r">${m(totDif)}</td></tr></tfoot>
      </table>
      ${observacao ? `<div style="margin-top:5px">Obs: ${escapeHtml(observacao)}</div>` : ''}
      ${assinatura ? `<div style="margin-top:6px;border-top:1px dashed #000;padding-top:3px">Assinatura:<br><img src="${assinatura}" style="max-width:50mm"/><br><span>${new Date().toLocaleString('pt-BR')}</span></div>` : ''}
    </body></html>`
  }

  // Imprime: se tiver impressora térmica configurada (QZ), usa ela; senão, diálogo do navegador
  async function imprimirCupom() {
    if (impressora) {
      try {
        await imprimirHtmlTermica(impressora, buildCupomHtml(), 80)
        return
      } catch (e) {
        console.error('[QZ] Falha ao imprimir na térmica, usando diálogo:', e)
      }
    }
    window.print()
  }

  async function abrirConfigImpressora() {
    setShowImpressora(true)
    setErroImpr('')
    setCarregandoImpr(true)
    try {
      const ok = await qzDisponivel()
      if (!ok) {
        setErroImpr('QZ Tray não detectado. Instale e abra o QZ Tray neste computador (qz.io/download).')
        setImpressoras([])
        return
      }
      setImpressoras(await listarImpressoras())
    } catch (e: any) {
      setErroImpr('Erro ao acessar o QZ Tray: ' + (e?.message ?? e))
    } finally {
      setCarregandoImpr(false)
    }
  }

  function salvarImpressora(nome: string) {
    setImpressora(nome)
    setImpressoraSalva(nome)
    setShowImpressora(false)
  }

  async function testarImpressora(nome: string) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{font-family:'Courier New',monospace;font-size:12px;color:#000}
      body{width:72mm;margin:0;padding:0;text-align:center}
    </style></head><body>
      <div style="border-bottom:1px dashed #000;padding:4px 0;margin-bottom:6px">
        <strong style="font-size:14px">TESTE DE IMPRESSAO</strong>
      </div>
      <div>Impressora OK!</div>
      <div>${new Date().toLocaleString('pt-BR')}</div>
      <div style="margin-top:8px">.</div>
    </body></html>`
    try {
      await imprimirHtmlTermica(nome, html, 80)
      setErroImpr('')
    } catch (e: any) {
      setErroImpr('Falha ao testar: ' + (e?.message ?? e))
    }
  }

  async function carregarDados(tk: string): Promise<boolean> {
    const dadosRes = await fetch(`/api/caixa/dados?data=${data}`, {
      headers: { Authorization: `Bearer ${tk}` },
    })
    const dadosJson = await dadosRes.json()
    if (!dadosRes.ok) { setErro(dadosJson.error ?? 'Erro ao carregar dados'); return false }
    // Regra: só um fechamento por dia — se já fez hoje, bloqueia
    if (dadosJson.ja_fechado) { setFase('bloqueado'); return false }
    setCampos(dadosJson.campos)
    setConferenciaAS(dadosJson.conferencia_as ?? null)
    const valAS: Record<string, number | null> = dadosJson.valores_as ?? {}
    setItens(dadosJson.campos.map((c: CampoConfig) => ({
      tipo: c.tipo, label: c.label,
      valor_as: valAS[c.tipo] ?? null, valor_frentista: '', diferenca: null,
    })))
    return true
  }

  async function handleVerificarCodigo(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const res  = await fetch('/api/caixa/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ login: loginCodigo }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error ?? 'Código não encontrado'); return }
      setEmployeeNome(json.nome ?? loginCodigo)
      setFase(json.first_login ? 'setup_pin' : 'pin')
    } finally {
      setLoading(false)
    }
  }

  async function handleLoginComPin(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    try {
      const res  = await fetch('/api/caixa/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ login: loginCodigo, pin: loginPin }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error ?? 'PIN incorreto'); return }
      const tk = json.token as string
      setToken(tk)
      setFrentista(json.frentista)
      if (await carregarDados(tk)) setFase('form')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetupPin(e: React.FormEvent) {
    e.preventDefault()
    if (loginPin !== loginPinConfirm) { setErro('Os PINs não coincidem'); return }
    setErro('')
    setLoading(true)
    try {
      const res  = await fetch('/api/caixa/setup-pin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ login: loginCodigo, pin: loginPin }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error ?? 'Erro ao configurar PIN'); return }
      const tk = json.token as string
      setToken(tk)
      setFrentista(json.frentista)
      if (await carregarDados(tk)) setFase('form')
    } finally {
      setLoading(false)
    }
  }

  // ── Concluir preenchimento → revelar AS ────────────────────────────────────

  function handleConcluir() {
    const atualizados = itens.map(item => {
      const vf = parseFloat(item.valor_frentista.replace(',', '.')) || 0
      const va = item.valor_as
      return {
        ...item,
        valor_frentista: item.valor_frentista,
        diferenca:       va !== null ? parseFloat((vf - va).toFixed(2)) : null,
      }
    })
    setItens(atualizados)
    setFase('conferencia')
  }

  // ── Enviar e imprimir ──────────────────────────────────────────────────────

  async function handleEnviar() {
    if (!assinatura) { setErro('Assine antes de enviar'); return }
    // A regra de "lançar a sangria/depósito antes de fechar" é validada NO SERVIDOR
    // (consulta o AUTOSYSTEM ao vivo na hora de finalizar). Assim, se o frentista
    // lançar o cofre/sangria depois de abrir a tela, é detectado sem recarregar —
    // e não bloqueia à toa quando a `valor_as` do cliente está desatualizada.
    setErro('')
    setLoading(true)
    try {
      const itensSalvar = itens.map(i => ({
        tipo:            i.tipo,
        label:           i.label,
        valor_as:        i.valor_as,
        valor_frentista: parseFloat(i.valor_frentista.replace(',', '.')) || 0,
        diferenca:       i.diferenca,
      }))

      // Reconciliação: entradas que não foram lançadas em nenhuma forma.
      // Persistir esta linha faz o snapshot do financeiro bater com o que o
      // frentista vê (Total Sistema = total de entradas do AUTOSYSTEM).
      const totFormasAS = itens.reduce((s, i) => s + (i.valor_as ?? 0), 0)
      const entradasReais = conferenciaAS?.total_entradas ?? totFormasAS
      const naoLanc = parseFloat((entradasReais - totFormasAS).toFixed(2))
      if (Math.abs(naoLanc) > 0.02) {
        itensSalvar.push({
          tipo:            'nao_lancado',
          label:           'Não lançado (AUTOSYSTEM)',
          valor_as:        naoLanc,
          valor_frentista: 0,
          diferenca:       -naoLanc,
        })
      }

      const res  = await fetch('/api/caixa/salvar', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({
          data,
          turno:          turno || undefined,
          itens:          itensSalvar,
          assinatura_img: assinatura,
          observacao:     observacao || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error ?? 'Erro ao salvar'); return }

      setFechamentoId(json.fechamento?.id ?? '')
      setFase('concluido')

      // Imprime após breve delay para renderizar
      setTimeout(() => { imprimirCupom() }, 500)
    } finally {
      setLoading(false)
    }
  }

  // ── Renders por fase ───────────────────────────────────────────────────────

  function reiniciar() {
    setFase('codigo')
    setToken('')
    setFrentista(null)
    setItens([])
    setAssinatura('')
    setData(dataHoje())
    setLoginCodigo('')
    setLoginPin('')
    setLoginPinConfirm('')
    setEmployeeNome('')
    setErro('')
  }

  // ── FASE: Bloqueado (já fez o fechamento de hoje) ──────────────────────────────
  if (fase === 'bloqueado') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Fechamento já realizado</h2>
            <p className="text-sm text-gray-500 mt-2">
              {employeeNome ? `${employeeNome.split(' ')[0]}, você` : 'Você'} já enviou o
              fechamento de hoje ({fmtData(data)}). Só é permitido um fechamento por dia.
            </p>
            <button
              onClick={reiniciar}
              className="w-full mt-6 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── FASE: Código ──────────────────────────────────────────────────────────────
  if (fase === 'codigo') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Fechamento de Caixa</h1>
              <p className="text-sm text-gray-500 mt-1">Digite seu código de operador</p>
            </div>

            <form onSubmit={handleVerificarCodigo} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Código do Operador</label>
                <input
                  value={loginCodigo}
                  onChange={e => setLoginCodigo(e.target.value)}
                  placeholder="Ex: 57831"
                  autoComplete="username"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data do fechamento</label>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700 flex items-center justify-between">
                  <span>{fmtData(data)}</span>
                  <span className="text-xs text-gray-400">hoje</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">O fechamento é sempre do dia atual.</p>
              </div>
              {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
              <button
                type="submit"
                disabled={loading || !loginCodigo}
                className="w-full py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Verificando…' : 'Continuar'}
              </button>
            </form>

            <button
              type="button"
              onClick={abrirConfigImpressora}
              className="w-full mt-4 text-xs text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {impressora ? `Impressora: ${impressora}` : 'Configurar impressora térmica'}
            </button>
          </div>
        </div>

        {showImpressora && (
          <ConfigImpressoraModal
            impressora={impressora}
            impressoras={impressoras}
            carregando={carregandoImpr}
            erro={erroImpr}
            onSelecionar={salvarImpressora}
            onRecarregar={abrirConfigImpressora}
            onFechar={() => setShowImpressora(false)}
            onTestar={testarImpressora}
          />
        )}
      </div>
    )
  }

  // ── FASE: PIN ─────────────────────────────────────────────────────────────────
  if (fase === 'pin') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                Olá, {employeeNome.split(' ')[0]}!
              </h1>
              <p className="text-sm text-gray-500 mt-1">Digite seu PIN de acesso</p>
            </div>

            <form onSubmit={handleLoginComPin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={loginPin}
                  onChange={e => setLoginPin(e.target.value)}
                  placeholder="••••"
                  autoComplete="current-password"
                  autoFocus
                  maxLength={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
              <button
                type="submit"
                disabled={loading || !loginPin}
                className="w-full py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
              <button
                type="button"
                onClick={() => { setFase('codigo'); setErro(''); setLoginPin('') }}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                ← Voltar
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── FASE: Setup PIN (primeiro acesso) ──────────────────────────────────────────
  if (fase === 'setup_pin') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                Bem-vindo(a), {employeeNome.split(' ')[0]}!
              </h1>
              <p className="text-sm text-gray-500 mt-1">Crie um PIN de acesso (4–8 dígitos)</p>
            </div>

            <form onSubmit={handleSetupPin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Novo PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={loginPin}
                  onChange={e => setLoginPin(e.target.value)}
                  placeholder="Digite seu PIN"
                  autoFocus
                  maxLength={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Confirmar PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={loginPinConfirm}
                  onChange={e => setLoginPinConfirm(e.target.value)}
                  placeholder="Repita o PIN"
                  maxLength={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}
              <button
                type="submit"
                disabled={loading || !loginPin || !loginPinConfirm}
                className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Criando PIN…' : 'Criar PIN e Entrar'}
              </button>
              <button
                type="button"
                onClick={() => { setFase('codigo'); setErro(''); setLoginPin(''); setLoginPinConfirm('') }}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                ← Voltar
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── FASE: Preenchimento ────────────────────────────────────────────────────

  if (fase === 'form') {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-orange-500 text-white px-6 py-5">
              <h1 className="text-lg font-bold">Fechamento de Caixa</h1>
              <p className="text-orange-100 text-sm mt-0.5">
                {frentista?.posto_nome} — {fmtData(data)}
              </p>
              <p className="text-orange-100 text-sm">
                Operador: <span className="font-semibold text-white">{frentista?.nome}</span>
              </p>
            </div>

            <div className="p-6 space-y-5">
              {/* Turno */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Turno (opcional)</label>
                <select
                  value={turno}
                  onChange={e => setTurno(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-orange-400"
                >
                  <option value="">— sem turno —</option>
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                </select>
              </div>

              {/* Instrução */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
                Preencha os valores que você tem em caixa para cada forma de pagamento.
                Os valores do sistema serão revelados apenas após você concluir.
              </div>

              {/* Tabela */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Forma de Pagamento</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Sistema</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Seu Valor (R$)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item, idx) => (
                      <tr key={item.tipo} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                        <td className="px-4 py-3 font-medium text-gray-800">{item.label}</td>
                        <td className="px-4 py-3 text-center text-gray-400 select-none">
                          <span className="inline-flex gap-0.5">
                            {[1,2,3,4,5].map(i => <span key={i} className="w-2 h-2 rounded-full bg-gray-300 inline-block" />)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0,00"
                            value={item.valor_frentista}
                            onChange={e => setItens(prev => prev.map((it, i) =>
                              i === idx ? { ...it, valor_frentista: e.target.value } : it
                            ))}
                            className="w-full text-right border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="px-4 py-3 text-gray-700">Total</td>
                      <td className="px-4 py-3 text-center text-gray-400">—</td>
                      <td className="px-4 py-3 text-right text-gray-800">
                        {fmt(itens.reduce((s, i) => s + (parseFloat(i.valor_frentista.replace(',', '.')) || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Observação */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Observação (opcional)</label>
                <textarea
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Alguma observação sobre este fechamento..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

              <button
                onClick={handleConcluir}
                className="w-full py-3.5 bg-orange-500 text-white font-bold text-base rounded-xl hover:bg-orange-600 transition-colors shadow-sm"
              >
                Concluir e Ver Conferência
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── FASE: Conferência + Assinatura ─────────────────────────────────────────

  const totalAS        = itens.reduce((s, i) => s + (i.valor_as ?? 0), 0)
  const totalFrentista = itens.reduce((s, i) => s + (parseFloat(i.valor_frentista.replace(',', '.')) || 0), 0)
  // Coluna SISTEMA reconcilia com as ENTRADAS: a diferença (entradas - formas) entra
  // como "Não lançado", e o total da coluna passa a ser o total de entradas.
  const entradasAS     = conferenciaAS?.total_entradas ?? totalAS
  const naoLancado     = parseFloat((entradasAS - totalAS).toFixed(2))
  const totalSistema   = conferenciaAS ? entradasAS : totalAS
  const totalDif       = totalFrentista - totalSistema

  if (fase === 'conferencia') {
    return (
      <div className="min-h-screen bg-gray-100 p-4 print:p-0 print:bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden print:shadow-none print:rounded-none">
            {/* Header */}
            <div className="bg-orange-500 text-white px-6 py-5 print:py-3">
              <h1 className="text-lg font-bold">Conferência de Caixa</h1>
              <p className="text-orange-100 text-sm">
                {frentista?.posto_nome} — {fmtData(data)}
                {turno ? ` — Turno: ${turno}` : ''}
              </p>
              <p className="text-orange-100 text-sm">
                Operador: <span className="font-semibold text-white">{frentista?.nome}</span>
              </p>
            </div>

            <div className="p-6 space-y-5 print:p-4">
              {/* Veredito: o frentista presta contas de TODAS as entradas do caixa */}
              {conferenciaAS && conferenciaAS.total_entradas > 0 && (() => {
                const entradas = conferenciaAS.total_entradas
                const difV     = parseFloat((totalFrentista - entradas).toFixed(2))
                const ok       = Math.abs(difV) < 0.02
                const faltou   = difV < 0
                return (
                  <div className={`rounded-xl border-2 px-5 py-4 text-center ${
                    ok ? 'bg-emerald-50 border-emerald-300' : faltou ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'
                  }`}>
                    <p className={`text-2xl font-extrabold ${ok ? 'text-emerald-700' : faltou ? 'text-red-700' : 'text-amber-700'}`}>
                      {ok ? '✓ CAIXA CERTO' : faltou ? `FALTANDO ${fmt(Math.abs(difV))}` : `SOBRANDO ${fmt(Math.abs(difV))}`}
                    </p>
                    <div className="flex justify-center gap-5 mt-2 text-sm text-gray-600 flex-wrap">
                      <span>Total de Entradas: <span className="font-bold text-gray-800">{fmt(entradas)}</span></span>
                      <span>Você declarou: <span className="font-bold text-gray-800">{fmt(totalFrentista)}</span></span>
                    </div>
                  </div>
                )
              })()}

              {/* Tabela conferência */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 print:border-gray-400">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-semibold text-gray-700">Forma de Pagamento</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">Sistema</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">Frentista</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-700">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((item, idx) => {
                      const vf  = parseFloat(item.valor_frentista.replace(',', '.')) || 0
                      const dif = fmtDif(item.diferenca)
                      return (
                        <tr key={item.tipo} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                          <td className="px-4 py-3 font-medium text-gray-800">{item.label}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(item.valor_as)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(vf)}</td>
                          <td className={`px-4 py-3 text-right ${dif.cls}`}>{dif.text}</td>
                        </tr>
                      )
                    })}
                    {/* Reconciliação: entradas que não foram lançadas em nenhuma forma */}
                    {Math.abs(naoLancado) > 0.02 && (
                      <tr className="bg-amber-50/60">
                        <td className="px-4 py-3 font-medium text-amber-800">Não lançado <span className="text-[11px] text-amber-600">(AUTOSYSTEM)</span></td>
                        <td className="px-4 py-3 text-right text-amber-800">{fmt(naoLancado)}</td>
                        <td className="px-4 py-3 text-right text-gray-400">—</td>
                        <td className={`px-4 py-3 text-right ${fmtDif(-naoLancado).cls}`}>{fmtDif(-naoLancado).text}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                      <td className="px-4 py-3 text-gray-800">Total</td>
                      <td className="px-4 py-3 text-right text-gray-800">{fmt(totalSistema)}</td>
                      <td className="px-4 py-3 text-right text-gray-800">{fmt(totalFrentista)}</td>
                      <td className={`px-4 py-3 text-right ${fmtDif(totalDif).cls}`}>
                        {fmtDif(totalDif).text}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Observação */}
              <div className="print:hidden">
                <label className="block text-xs font-medium text-gray-700 mb-1">Observação (opcional)</label>
                <textarea
                  value={observacao}
                  onChange={e => setObservacao(e.target.value)}
                  rows={2}
                  placeholder="Alguma observação sobre este fechamento..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              {observacao && (
                <div className="hidden print:block bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <span className="font-medium">Observação:</span> {observacao}
                </div>
              )}

              {/* Assinatura */}
              <div className="print:hidden">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Assinatura do Frentista</h2>
                <SignaturePad onCapture={setAssinatura} />
                {assinatura && (
                  <p className="text-xs text-emerald-600 mt-1">Assinatura capturada</p>
                )}
              </div>

              {/* Assinatura na impressão */}
              {assinatura && (
                <div className="hidden print:block mt-4 border-t border-gray-300 pt-4">
                  <p className="text-xs text-gray-500 mb-1">Assinatura do operador:</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assinatura} alt="Assinatura" className="h-16 object-contain" />
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date().toLocaleString('pt-BR')} — {frentista?.nome}
                  </p>
                </div>
              )}

              {erro && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 print:hidden">{erro}</p>}

              <div className="print:hidden">
                <button
                  onClick={handleEnviar}
                  disabled={loading || !assinatura}
                  className="w-full py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {loading ? 'Enviando…' : 'Enviar e Imprimir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── FASE: Concluído ────────────────────────────────────────────────────────

  return (
    <>
      {/* Tela de sucesso — apenas na tela (oculta na impressão) */}
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 print:hidden">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">Fechamento Enviado!</h2>
            <p className="text-sm text-gray-500 mt-2">
              Fechamento registrado com sucesso.
              {fechamentoId && <span className="block text-xs text-gray-400 mt-1">ID: {fechamentoId.slice(0, 8)}…</span>}
            </p>
            <div className="mt-6 space-y-2">
              <button
                onClick={imprimirCupom}
                className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
              >
                Reimprimir
              </button>
              <button
                onClick={() => {
                  setFase('codigo')
                  setToken('')
                  setFrentista(null)
                  setItens([])
                  setAssinatura('')
                  setData(dataHoje())
                  setLoginCodigo('')
                  setLoginPin('')
                  setLoginPinConfirm('')
                  setEmployeeNome('')
                }}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600"
              >
                Novo Fechamento
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Comprovante — apenas na impressão */}
      <div className="hidden print:block p-4 cupom-print">
        <div className="mb-4 border-b border-gray-300 pb-3">
          <h1 className="text-lg font-bold">Conferência de Caixa</h1>
          <p className="text-sm">
            {frentista?.posto_nome} — {fmtData(data)}{turno ? ` — Turno: ${turno}` : ''}
          </p>
          <p className="text-sm">Operador: {frentista?.nome}</p>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-400">
              <th className="text-left py-2 font-semibold">Forma de Pagamento</th>
              <th className="text-right py-2 font-semibold">Sistema</th>
              <th className="text-right py-2 font-semibold">Frentista</th>
              <th className="text-right py-2 font-semibold">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {itens.map(item => {
              const vf  = parseFloat(item.valor_frentista.replace(',', '.')) || 0
              const dif = fmtDif(item.diferenca)
              return (
                <tr key={item.tipo} className="border-b border-gray-200">
                  <td className="py-1.5 font-medium">{item.label}</td>
                  <td className="py-1.5 text-right">{fmt(item.valor_as)}</td>
                  <td className="py-1.5 text-right">{fmt(vf)}</td>
                  <td className={`py-1.5 text-right ${dif.cls}`}>{dif.text}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-400 font-bold">
              <td className="py-2">Total</td>
              <td className="py-2 text-right">{fmt(totalAS)}</td>
              <td className="py-2 text-right">{fmt(totalFrentista)}</td>
              <td className={`py-2 text-right ${fmtDif(totalDif).cls}`}>{fmtDif(totalDif).text}</td>
            </tr>
          </tfoot>
        </table>

        {observacao && (
          <p className="mt-4 text-sm"><span className="font-medium">Observação:</span> {observacao}</p>
        )}

        {assinatura && (
          <div className="mt-6 border-t border-gray-300 pt-3">
            <p className="text-xs text-gray-500 mb-1">Assinatura do operador:</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assinatura} alt="Assinatura" className="h-16 object-contain" />
            <p className="text-xs text-gray-400 mt-1">
              {new Date().toLocaleString('pt-BR')} — {frentista?.nome}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
