'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus, Trash2, Layers, Loader2, X, Pencil } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import type { Mascara, TipoMascara } from '@/types/database.types'

interface Props {
  tipo: TipoMascara
  titulo: string
  descricao: string
  basePath: string  // ex: '/mascaras/dre'
}

interface MascaraComContagem extends Mascara {
  total_linhas: number
}

export function MascaraListPage({ tipo, titulo, descricao, basePath }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [mascaras, setMascaras] = useState<MascaraComContagem[]>([])
  const [loading, setLoading]   = useState(true)

  // Modal estado
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nome, setNome]           = useState('')
  const [desc, setDesc]           = useState('')
  const [saving, setSaving]       = useState(false)

  // Confirmação de exclusão
  const [excluindo, setExcluindo] = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('mascaras')
      .select('*, mascaras_linhas(count)')
      .eq('tipo', tipo)
      .order('criado_em', { ascending: false })

    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar máscaras', description: error.message })
      setLoading(false)
      return
    }

    type Row = Mascara & { mascaras_linhas: { count: number }[] }
    const rows = (data ?? []) as Row[]
    setMascaras(rows.map(r => ({ ...r, total_linhas: r.mascaras_linhas?.[0]?.count ?? 0 })))
    setLoading(false)
  }

  useEffect(() => { carregar() }, [tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  function abrirNovo() {
    setEditingId(null)
    setNome('')
    setDesc('')
    setShowModal(true)
  }

  function abrirEdicao(m: MascaraComContagem) {
    setEditingId(m.id)
    setNome(m.nome)
    setDesc(m.descricao ?? '')
    setShowModal(true)
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) {
      toast({ variant: 'destructive', title: 'Informe o nome da máscara' })
      return
    }
    setSaving(true)
    if (editingId) {
      const { error } = await supabase
        .from('mascaras')
        .update({ nome: nome.trim(), descricao: desc.trim() || null, atualizado_em: new Date().toISOString() })
        .eq('id', editingId)
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar', description: error.message })
        setSaving(false); return
      }
      toast({ title: 'Máscara atualizada' })
    } else {
      const { data, error } = await supabase
        .from('mascaras')
        .insert({ tipo, nome: nome.trim(), descricao: desc.trim() || null })
        .select('id')
        .single()
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao criar', description: error.message })
        setSaving(false); return
      }
      toast({ title: 'Máscara criada — abrindo editor' })
      setShowModal(false)
      setSaving(false)
      router.push(`${basePath}/${data.id}`)
      return
    }
    setShowModal(false)
    setSaving(false)
    carregar()
  }

  async function handleExcluir(id: string) {
    setExcluindo(null)
    const { error } = await supabase.from('mascaras').delete().eq('id', id)
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: error.message })
      return
    }
    toast({ title: 'Máscara excluída' })
    carregar()
  }

  return (
    <>
      <Header
        title={titulo}
        description={descricao}
        actions={
          <button
            onClick={abrirNovo}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[12.5px] font-semibold hover:bg-black dark:hover:bg-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova Máscara
          </button>
        }
      />

      <div className="p-4 md:p-6">
        {loading ? (
          <div className="flex justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : mascaras.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 py-16 text-center">
            <Layers className="w-8 h-8 text-gray-400 dark:text-gray-600" />
            <p className="text-[14px] font-medium text-gray-500 dark:text-gray-400">Nenhuma máscara cadastrada</p>
            <button
              onClick={abrirNovo}
              className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
            >
              + Criar a primeira
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {mascaras.map(m => (
              <div
                key={m.id}
                className="group relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
              >
                <button
                  onClick={() => router.push(`${basePath}/${m.id}`)}
                  className="w-full text-left px-4 py-4 pr-20 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-900 dark:text-gray-100 truncate">{m.nome}</p>
                    <p className="text-[11.5px] text-gray-400 dark:text-gray-500 truncate">
                      {m.total_linhas} linha{m.total_linhas === 1 ? '' : 's'}
                      {m.descricao && ` • ${m.descricao}`}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </button>

                {/* Ações flutuantes */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); abrirEdicao(m) }}
                    title="Renomear"
                    className="w-7 h-7 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setExcluindo(m.id) }}
                    title="Excluir"
                    className="w-7 h-7 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-[15px]">
                {editingId ? 'Renomear Máscara' : 'Nova Máscara'}
              </h2>
              <button onClick={() => setShowModal(false)} className="ml-auto text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSalvar} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  autoFocus
                  placeholder="Ex: Padrão postos - Webposto"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Descrição (opcional)
                </label>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                  placeholder="Observações sobre esta máscara"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white disabled:opacity-50 text-white dark:text-gray-900 rounded-lg text-[13px] font-semibold transition-colors"
                >
                  {saving ? 'Salvando…' : editingId ? 'Salvar' : 'Criar e abrir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {excluindo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-[15px] mb-2">Excluir máscara?</h3>
            <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-5">
              Todas as linhas e mapeamentos vinculados serão removidos. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setExcluindo(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-[13px] font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleExcluir(excluindo)}
                className={cn(
                  'flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[13px] font-semibold'
                )}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
