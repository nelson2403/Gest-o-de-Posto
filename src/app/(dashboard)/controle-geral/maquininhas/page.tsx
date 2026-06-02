'use client'

import { useEffect, useState, useCallback } from 'react'
import { Smartphone, Copy, Check, Server, RefreshCw, AlertCircle } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { MaquininhaAS } from '@/app/api/controle-geral/maquininhas/route'

type PostoGroup = {
  posto_id:    string | null
  posto_nome:  string
  ip:          string | null
  maquininhas: MaquininhaAS[]
}

export default function PainelMaquininhasASPage() {
  const [postos,  setPostos]  = useState<PostoGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState('')
  const [copied,  setCopied]  = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const r = await fetch('/api/controle-geral/maquininhas')
      const json = await r.json()
      if (!r.ok) { setErro(json.error ?? 'Erro ao carregar'); return }

      const map = new Map<string, PostoGroup>()
      for (const m of json.maquininhas as MaquininhaAS[]) {
        const key = m.posto_nome ?? m.empresa_nome ?? String(m.empresa_grid)
        if (!map.has(key)) {
          map.set(key, { posto_id: m.posto_id, posto_nome: key, ip: m.ip, maquininhas: [] })
        }
        map.get(key)!.maquininhas.push(m)
      }
      setPostos([...map.values()].sort((a, b) => a.posto_nome.localeCompare(b.posto_nome)))
    } catch {
      setErro('Não foi possível conectar ao AUTOSYSTEM')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function copiarComFallback(texto: string) {
    try {
      // Tenta API moderna
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto)
        return true
      }
    } catch {}

    // Fallback: cria textarea e copia via execCommand
    try {
      const textarea = document.createElement('textarea')
      textarea.value = texto
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      textarea.style.top = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const sucesso = document.execCommand('copy')
      document.body.removeChild(textarea)
      return sucesso
    } catch {
      return false
    }
  }

  function copiarPosto(p: PostoGroup) {
    const linhas = [
      p.posto_nome,
      `IP: ${p.ip ?? 'não cadastrado'}`,
      '',
      ...p.maquininhas.map(m =>
        `  • Série: ${m.serial}  |  Porta: ${m.porta ?? '—'}  |  PDV: ${m.conta ?? '—'}`
      ),
    ]
    copiarComFallback(linhas.join('\n')).then(sucesso => {
      if (sucesso) {
        setCopied(p.posto_nome)
        setTimeout(() => setCopied(null), 2000)
        toast({ title: '✓ Copiado!', description: p.posto_nome })
      } else {
        toast({ variant: 'destructive', title: 'Erro ao copiar', description: 'Tente novamente' })
      }
    })
  }

  function copiarTudo() {
    const blocos = postos.map(p => {
      const linhas = [
        p.posto_nome,
        `IP: ${p.ip ?? 'não cadastrado'}`,
        ...p.maquininhas.map(m =>
          `  • Série: ${m.serial}  |  Porta: ${m.porta ?? '—'}  |  PDV: ${m.conta ?? '—'}`
        ),
      ]
      return linhas.join('\n')
    })
    copiarComFallback(blocos.join('\n\n')).then(sucesso => {
      if (sucesso) {
        setCopied('__all__')
        setTimeout(() => setCopied(null), 2000)
        toast({ title: '✓ Tudo copiado!', description: `${postos.length} postos` })
      } else {
        toast({ variant: 'destructive', title: 'Erro ao copiar', description: 'Tente novamente' })
      }
    })
  }

  const totalMaqs = postos.reduce((s, p) => s + p.maquininhas.length, 0)

  return (
    <div className="p-4 md:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <Smartphone className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h1 className="text-[15px] md:text-[17px] font-bold text-gray-900 leading-tight">Maquininhas — AUTOSYSTEM</h1>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {loading ? 'Carregando...' : `${totalMaqs} maquininhas em ${postos.length} postos`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            disabled={loading}
            className="flex items-center gap-1.5 h-9 px-3 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          {postos.length > 0 && (
            <button
              onClick={copiarTudo}
              className="flex items-center gap-1.5 h-9 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[13px] font-medium transition-colors"
            >
              {copied === '__all__' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              Copiar tudo
            </button>
          )}
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {erro}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Consultando AUTOSYSTEM...
        </div>
      )}

      {/* Cards por posto */}
      {!loading && !erro && (
        <div className="space-y-4">
          {postos.map(p => (
            <div key={p.posto_nome} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">

              {/* Header do posto */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[13px] font-bold text-gray-800">{p.posto_nome}</span>
                  <span className="flex items-center gap-1 text-[12px] text-gray-600 bg-white border border-gray-200 rounded-md px-2 py-0.5">
                    <Server className="w-3 h-3 text-gray-400" />
                    {p.ip ?? <span className="text-gray-400 italic">IP não cadastrado</span>}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {p.maquininhas.length} maquininha{p.maquininhas.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => copiarPosto(p)}
                  className="flex items-center gap-1.5 h-8 px-3 border border-gray-300 rounded-lg text-[12px] text-gray-600 hover:bg-gray-100 transition-colors ml-2 flex-shrink-0"
                >
                  {copied === p.posto_nome
                    ? <><Check className="w-3 h-3 text-green-500" /> Copiado</>
                    : <><Copy className="w-3 h-3" /> Copiar</>
                  }
                </button>
              </div>

              {/* Tabela */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-2 font-medium">Nº Série</th>
                    <th className="text-left px-4 py-2 font-medium">Porta TEF</th>
                    <th className="text-left px-4 py-2 font-medium">PDV (Conta)</th>
                    <th className="text-left px-4 py-2 font-medium">IP Servidor</th>
                  </tr>
                </thead>
                <tbody>
                  {p.maquininhas.map((m, i) => (
                    <tr key={m.serial + m.porta} className={i % 2 === 0 ? '' : 'bg-gray-50/60'}>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-[12px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded select-all">
                          {m.serial}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {m.porta != null
                          ? <span className="font-mono text-[13px] font-semibold text-gray-800">{m.porta}</span>
                          : <span className="text-gray-300 text-[12px]">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-gray-600 font-mono">
                        {m.conta ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {p.ip
                          ? <span className="font-mono text-[12px] text-gray-700">{p.ip}</span>
                          : <span className="text-gray-300 text-[12px]">não cadastrado</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
