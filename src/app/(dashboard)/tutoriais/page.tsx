'use client'

import { useEffect, useState, useCallback } from 'react'
import { PlayCircle, Plus, Trash2, Loader2, Upload, X, GraduationCap } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'

type Tutorial = {
  id: string; titulo: string; descricao: string | null
  arquivo_nome: string | null; url: string; criado_em: string
}

export default function TutoriaisPage() {
  const { usuario } = useAuthContext()
  const podeGerenciar = can(usuario?.role, 'tutoriais.manage')

  const [tutoriais, setTutoriais] = useState<Tutorial[]>([])
  const [loading,   setLoading]   = useState(true)
  const [assistir,  setAssistir]  = useState<Tutorial | null>(null)

  // form de upload (master)
  const [showForm, setShowForm] = useState(false)
  const [titulo,    setTitulo]    = useState('')
  const [descricao, setDescricao] = useState('')
  const [file,      setFile]      = useState<File | null>(null)
  const [enviando,  setEnviando]  = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/tutoriais')
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setTutoriais(d.tutoriais ?? [])
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function enviar() {
    if (!titulo.trim()) { toast({ variant: 'destructive', title: 'Informe o título' }); return }
    if (!file) { toast({ variant: 'destructive', title: 'Selecione o vídeo' }); return }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('titulo', titulo)
      fd.append('descricao', descricao)
      fd.append('file', file)
      const r = await fetch('/api/tutoriais', { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      toast({ title: 'Vídeo adicionado!' })
      setShowForm(false); setTitulo(''); setDescricao(''); setFile(null)
      carregar()
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao enviar', description: e.message })
    } finally {
      setEnviando(false)
    }
  }

  async function excluir(t: Tutorial) {
    if (!confirm(`Excluir o tutorial "${t.titulo}"?`)) return
    try {
      const r = await fetch(`/api/tutoriais?id=${t.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setTutoriais(prev => prev.filter(x => x.id !== t.id))
      toast({ title: 'Tutorial excluído' })
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: e.message })
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h1 className="text-[16px] md:text-[18px] font-bold text-gray-900">Tutoriais</h1>
            <p className="text-[12px] text-gray-400">Vídeos de como usar o sistema</p>
          </div>
        </div>
        {podeGerenciar && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 h-9 px-4 bg-rose-500 hover:bg-rose-600 text-white rounded-lg text-[13px] font-medium">
            <Plus className="w-4 h-4" /> Adicionar vídeo
          </button>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : tutoriais.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center text-gray-400 text-sm">
          Nenhum tutorial cadastrado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tutoriais.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col">
              <button onClick={() => setAssistir(t)}
                className="relative aspect-video bg-gray-900 flex items-center justify-center group">
                <PlayCircle className="w-12 h-12 text-white/80 group-hover:text-white group-hover:scale-110 transition-all" />
              </button>
              <div className="p-3 flex-1 flex flex-col gap-1">
                <p className="text-[14px] font-semibold text-gray-800 leading-tight">{t.titulo}</p>
                {t.descricao && <p className="text-[12px] text-gray-500 line-clamp-2">{t.descricao}</p>}
                <div className="flex items-center justify-between mt-auto pt-2">
                  <button onClick={() => setAssistir(t)} className="text-[12px] text-rose-600 font-medium hover:underline flex items-center gap-1">
                    <PlayCircle className="w-3.5 h-3.5" /> Assistir
                  </button>
                  {podeGerenciar && (
                    <button onClick={() => excluir(t)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Player modal */}
      {assistir && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setAssistir(null)}>
          <div className="bg-black rounded-2xl overflow-hidden w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 bg-gray-900">
              <span className="text-white text-[14px] font-medium truncate">{assistir.titulo}</span>
              <button onClick={() => setAssistir(null)} className="text-white/60 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={assistir.url} controls autoPlay className="w-full max-h-[75vh] bg-black" />
          </div>
        </div>
      )}

      {/* Form de upload (master) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !enviando && setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center"><Upload className="w-4 h-4 text-rose-600" /></div>
              <h2 className="font-semibold text-gray-900 text-[15px]">Adicionar vídeo tutorial</h2>
              <button onClick={() => !enviando && setShowForm(false)} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Título</label>
                <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex.: Como fazer o fechamento de caixa"
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-[14px] focus:outline-none focus:ring-2 focus:ring-rose-400/30" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Descrição (opcional)</label>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} placeholder="Breve descrição"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-rose-400/30" />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-600 mb-1">Vídeo (mp4)</label>
                <input type="file" accept="video/mp4,video/webm,video/quicktime"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  className="w-full text-[13px] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-rose-50 file:text-rose-600 file:font-medium hover:file:bg-rose-100" />
                {file && <p className="text-[11px] text-gray-400 mt-1">{file.name} — {(file.size / 1048576).toFixed(1)} MB</p>}
              </div>
              <button onClick={enviar} disabled={enviando || !titulo.trim() || !file}
                className="w-full h-11 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-[14px] font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <><Upload className="w-4 h-4" /> Enviar vídeo</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
