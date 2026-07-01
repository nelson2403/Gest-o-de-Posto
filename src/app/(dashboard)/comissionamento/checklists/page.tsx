'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  ArrowLeft, ClipboardList, Plus, Pencil, Trash2, Loader2, Save, Copy,
  Building2, CheckCircle2, Circle, ListChecks,
} from 'lucide-react'
import { PostoCombobox } from '../_components/PostoCombobox'

// ── Tipos ───────────────────────────────────────────────────────────────────

interface Posto { id: string; nome: string }

interface TemplateItem {
  id?:       string
  ordem:     number
  descricao: string
  pontos:    number
}
interface Template {
  id:        string
  nome:      string
  descricao: string
  ativo:     boolean
  itens:     TemplateItem[]
}
interface Aplicacao {
  id:            string
  template_id:   string
  posto_id:      string
  period_start:  string
  period_end:    string
  total_pontos:  number
  observacoes:   string
}
interface AplicacaoDetalhe {
  aplicacao: Aplicacao
  template:  Template
  respostas: Array<{ item_id: string; ok: boolean; motivo: string }>
}

const fmtData = (s: string) => {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export default function ChecklistsPage() {
  const [aba, setAba] = useState<'templates' | 'aplicacoes'>('templates')

  return (
    <div className="min-h-screen flex flex-col">
      <Header title="Checklists" />
      <div className="border-b border-gray-200 bg-white/95 backdrop-blur-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 md:px-6 pt-3 pb-2 flex items-center justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-orange-600" />
              Checklists
            </h1>
            <p className="text-[12px] text-gray-500">Templates e aplicações mensais que servem de base para regras de comissionamento.</p>
          </div>
          <Link href="/comissionamento" className="text-[12px] text-gray-500 hover:text-orange-600 inline-flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Comissionamento
          </Link>
        </div>
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex gap-1">
          <TabButton active={aba === 'templates'} onClick={() => setAba('templates')}>
            <ListChecks className="w-3.5 h-3.5" /> Templates
          </TabButton>
          <TabButton active={aba === 'aplicacoes'} onClick={() => setAba('aplicacoes')}>
            <ClipboardList className="w-3.5 h-3.5" /> Aplicações
          </TabButton>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-5">
        {aba === 'templates' ? <TemplatesTab /> : <AplicacoesTab />}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold border-b-2 transition-colors',
        active
          ? 'border-orange-600 text-orange-700'
          : 'border-transparent text-gray-500 hover:text-gray-800',
      )}
    >
      {children}
    </button>
  )
}

// ══════════════════════════ TAB: Templates ══════════════════════════

function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ open: boolean; edit: Template | null }>({ open: false, edit: null })
  const [excluir, setExcluir] = useState<Template | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/comissionamento/checklists/templates')
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setTemplates(j.templates ?? [])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function confirmarExcluir() {
    if (!excluir) return
    const r = await fetch(`/api/comissionamento/checklists/templates/${excluir.id}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: j.error })
      return
    }
    toast({ title: 'Template excluído' })
    setExcluir(null)
    await carregar()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] font-semibold text-gray-900">Templates cadastrados</p>
        <Button onClick={() => setDialog({ open: true, edit: null })} className="gap-1.5 text-[12.5px]">
          <Plus className="w-3.5 h-3.5" /> Novo template
        </Button>
      </div>

      {loading ? (
        <p className="text-[12.5px] text-gray-400 italic flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</p>
      ) : templates.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg py-10 text-center">
          <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-[12.5px] text-gray-500">Nenhum template cadastrado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:border-orange-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-gray-900 truncate">{t.nome}</p>
                  {t.descricao && <p className="text-[11.5px] text-gray-500 mt-0.5">{t.descricao}</p>}
                  <p className="text-[11px] text-gray-500 mt-1">
                    {t.itens.length} {t.itens.length === 1 ? 'item' : 'itens'} · {t.itens.reduce((s, i) => s + Number(i.pontos), 0)} pts totais
                    {!t.ativo && <span className="ml-2 text-rose-600 font-semibold">INATIVO</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setDialog({ open: true, edit: t })}
                    className="p-1.5 rounded hover:bg-blue-50 text-gray-500 hover:text-blue-600"
                    title="Editar"
                  ><Pencil className="w-3.5 h-3.5" /></button>
                  <button
                    onClick={() => setExcluir(t)}
                    className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
                    title="Excluir"
                  ><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog.open && (
        <DialogTemplate
          editar={dialog.edit}
          onClose={() => setDialog({ open: false, edit: null })}
          onSalvo={() => { setDialog({ open: false, edit: null }); carregar() }}
        />
      )}

      <Dialog open={!!excluir} onOpenChange={(o) => !o && setExcluir(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Excluir template?</DialogTitle></DialogHeader>
          <p className="text-[12.5px] text-gray-600">
            Tem certeza que quer excluir <b>{excluir?.nome}</b>? Se houver aplicações usando este template, a exclusão será bloqueada — desative-o em vez disso.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluir(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarExcluir}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface DialogTemplateProps {
  editar: Template | null
  onClose: () => void
  onSalvo: () => void
}
function DialogTemplate({ editar, onClose, onSalvo }: DialogTemplateProps) {
  const [nome, setNome] = useState(editar?.nome ?? '')
  const [descricao, setDescricao] = useState(editar?.descricao ?? '')
  const [ativo, setAtivo] = useState(editar?.ativo ?? true)
  const [itens, setItens] = useState<TemplateItem[]>(
    editar?.itens?.slice().sort((a, b) => a.ordem - b.ordem) ??
    [{ ordem: 0, descricao: '', pontos: 1 }],
  )
  const [salvando, setSalvando] = useState(false)

  const totalPts = itens.reduce((s, i) => s + Number(i.pontos || 0), 0)

  function addItem() {
    setItens(prev => [...prev, { ordem: prev.length, descricao: '', pontos: 1 }])
  }
  function removeItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, ordem: i })))
  }
  function upd(idx: number, patch: Partial<TemplateItem>) {
    setItens(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function moveUp(idx: number) {
    if (idx === 0) return
    setItens(prev => {
      const arr = [...prev]
      ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
      return arr.map((it, i) => ({ ...it, ordem: i }))
    })
  }
  function moveDown(idx: number) {
    setItens(prev => {
      if (idx >= prev.length - 1) return prev
      const arr = [...prev]
      ;[arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]]
      return arr.map((it, i) => ({ ...it, ordem: i }))
    })
  }

  async function salvar() {
    if (!nome.trim()) return toast({ variant: 'destructive', title: 'Nome é obrigatório' })
    const validos = itens.filter(it => it.descricao.trim() && it.pontos > 0)
    if (validos.length === 0) return toast({ variant: 'destructive', title: 'Adicione ao menos 1 item' })
    setSalvando(true)
    try {
      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim(),
        ativo,
        itens: validos.map((it, i) => ({ ordem: i, descricao: it.descricao.trim(), pontos: Number(it.pontos) })),
      }
      const r = editar
        ? await fetch(`/api/comissionamento/checklists/templates/${editar.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/comissionamento/checklists/templates', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error ?? 'erro')
      toast({ title: editar ? 'Template atualizado' : 'Template criado' })
      onSalvo()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-orange-600" />
            {editar ? 'Editar' : 'Novo'} template
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Nome</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Checklist Tática Posto" />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Status</Label>
              <div className="flex items-center gap-1 h-9">
                <button
                  type="button"
                  onClick={() => setAtivo(true)}
                  className={cn('h-8 px-3 rounded-md text-[12px] font-semibold border', ativo ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-gray-600 border-gray-200')}
                >Ativo</button>
                <button
                  type="button"
                  onClick={() => setAtivo(false)}
                  className={cn('h-8 px-3 rounded-md text-[12px] font-semibold border', !ativo ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-200')}
                >Inativo</button>
              </div>
            </div>
          </div>
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Descrição (opcional)</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={2} />
          </div>

          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
              <div>
                <p className="text-[12.5px] font-semibold text-gray-900">Itens do checklist</p>
                <p className="text-[10.5px] text-gray-500">Total: <b>{totalPts}</b> pts</p>
              </div>
              <Button size="sm" onClick={addItem} className="gap-1 text-[11.5px] h-7">
                <Plus className="w-3 h-3" /> Item
              </Button>
            </div>
            <div className="max-h-[45vh] overflow-y-auto divide-y divide-gray-100">
              {itens.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-white">
                  <span className="text-[11px] text-gray-400 w-6 text-right">{idx + 1}º</span>
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moveUp(idx)} disabled={idx === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-[10px] leading-none">▲</button>
                    <button type="button" onClick={() => moveDown(idx)} disabled={idx === itens.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-[10px] leading-none">▼</button>
                  </div>
                  <Input
                    className="flex-1 h-8 text-[12px]"
                    placeholder="Descrição do item"
                    value={it.descricao}
                    onChange={e => upd(idx, { descricao: e.target.value })}
                  />
                  <Input
                    className="w-20 h-8 text-[12px] text-right"
                    type="number" min={1} step="0.5"
                    value={it.pontos}
                    onChange={e => upd(idx, { pontos: Number(e.target.value) || 0 })}
                  />
                  <span className="text-[10.5px] text-gray-400">pts</span>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                  ><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-1.5">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {salvando ? 'Salvando...' : 'Salvar template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════ TAB: Aplicações ══════════════════════════

function AplicacoesTab() {
  const [postos, setPostos] = useState<Posto[]>([])
  const [postoId, setPostoId] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [aplicacoes, setAplicacoes] = useState<Aplicacao[]>([])
  const [loading, setLoading] = useState(false)
  const [nova, setNova] = useState(false)
  const [editorAplic, setEditorAplic] = useState<AplicacaoDetalhe | null>(null)

  useEffect(() => {
    fetch('/api/postos').then(r => r.json()).then(d => {
      const lista = (d.postos ?? []).map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome }))
      setPostos(lista)
      if (!postoId && lista.length > 0) setPostoId(lista[0].id)
    }).catch(() => {})
    fetch('/api/comissionamento/checklists/templates').then(r => r.json()).then(d => {
      setTemplates(d.templates ?? [])
    }).catch(() => {})
  }, [postoId])

  const carregar = useCallback(async () => {
    if (!postoId) return
    setLoading(true)
    try {
      const r = await fetch(`/api/comissionamento/checklists/aplicacoes?posto_id=${postoId}`)
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setAplicacoes(j.aplicacoes ?? [])
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    } finally { setLoading(false) }
  }, [postoId])
  useEffect(() => { carregar() }, [carregar])

  async function abrirAplicacao(id: string) {
    const r = await fetch(`/api/comissionamento/checklists/aplicacoes/${id}`)
    const j = await r.json()
    if (!r.ok || j.error) return toast({ variant: 'destructive', title: 'Erro', description: j.error })
    setEditorAplic(j)
  }

  async function excluirAplic(id: string) {
    if (!confirm('Excluir esta aplicação?')) return
    const r = await fetch(`/api/comissionamento/checklists/aplicacoes/${id}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) return toast({ variant: 'destructive', title: 'Erro', description: j.error })
    toast({ title: 'Aplicação excluída' })
    await carregar()
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <Building2 className="w-4 h-4 text-gray-400" />
        <PostoCombobox
          postos={postos}
          value={postoId}
          onChange={setPostoId}
          placeholder="Selecione um posto"
          className="min-w-[280px]"
        />
        <Button onClick={() => setNova(true)} disabled={!postoId || templates.length === 0} className="gap-1.5 text-[12.5px] ml-auto">
          <Plus className="w-3.5 h-3.5" /> Nova aplicação
        </Button>
      </div>

      {templates.length === 0 && (
        <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded mb-3">
          Cadastre pelo menos um template na aba <b>Templates</b> antes de aplicar.
        </p>
      )}

      {loading ? (
        <p className="text-[12.5px] text-gray-400 italic flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Carregando...</p>
      ) : aplicacoes.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg py-10 text-center">
          <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-[12.5px] text-gray-500">Nenhuma aplicação para este posto.</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-[12.5px]">
            <thead className="bg-gray-50">
              <tr className="text-[10.5px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="text-left px-3 py-2">Template</th>
                <th className="text-left px-3 py-2">Período</th>
                <th className="text-right px-3 py-2 w-24">Pontuação</th>
                <th className="text-right px-3 py-2 w-24">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aplicacoes.map(a => {
                const template = templates.find(t => t.id === a.template_id)
                return (
                  <tr key={a.id} className="hover:bg-orange-50/30">
                    <td className="px-3 py-2 text-gray-800">{template?.nome ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{fmtData(a.period_start)} → {fmtData(a.period_end)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-orange-700">{Number(a.total_pontos).toFixed(1)} pts</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => abrirAplicacao(a.id)} className="p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 mr-1" title="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => excluirAplic(a.id)} className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {nova && (
        <DialogNovaAplicacao
          postoId={postoId}
          templates={templates.filter(t => t.ativo)}
          onClose={() => setNova(false)}
          onCriada={(id) => { setNova(false); carregar(); abrirAplicacao(id) }}
        />
      )}
      {editorAplic && (
        <EditorAplicacao
          detalhe={editorAplic}
          onClose={() => setEditorAplic(null)}
          onSalvo={() => { setEditorAplic(null); carregar() }}
        />
      )}
    </>
  )
}

function DialogNovaAplicacao({ postoId, templates, onClose, onCriada }: {
  postoId: string; templates: Template[]; onClose: () => void; onCriada: (id: string) => void
}) {
  const hoje = new Date()
  const ini = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  const fimStr = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [periodIni, setPeriodIni] = useState(ini)
  const [periodFim, setPeriodFim] = useState(fimStr)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!templateId) return toast({ variant: 'destructive', title: 'Selecione um template' })
    setSalvando(true)
    try {
      const r = await fetch('/api/comissionamento/checklists/aplicacoes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId, posto_id: postoId, period_start: periodIni, period_end: periodFim }),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error ?? 'erro')
      toast({ title: 'Aplicação criada' })
      onCriada(j.aplicacao.id)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    } finally { setSalvando(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova aplicação</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Início</Label>
              <Input type="date" value={periodIni} onChange={e => setPeriodIni(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Fim</Label>
              <Input type="date" value={periodFim} onChange={e => setPeriodFim(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-1.5">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditorAplicacao({ detalhe, onClose, onSalvo }: {
  detalhe: AplicacaoDetalhe; onClose: () => void; onSalvo: () => void
}) {
  const { aplicacao, template } = detalhe
  const itensOrdenados = template.itens.slice().sort((a, b) => a.ordem - b.ordem)
  const respByItem = new Map(detalhe.respostas.map(r => [r.item_id, { ok: r.ok, motivo: r.motivo }]))

  const [respostas, setRespostas] = useState<Map<string, { ok: boolean; motivo: string }>>(() => {
    const m = new Map<string, { ok: boolean; motivo: string }>()
    for (const it of itensOrdenados) {
      const cur = respByItem.get(it.id!) ?? { ok: false, motivo: '' }
      m.set(it.id!, { ok: cur.ok, motivo: cur.motivo })
    }
    return m
  })
  const [observacoes, setObservacoes] = useState(aplicacao.observacoes)
  const [salvando, setSalvando] = useState(false)

  const totalObtido = itensOrdenados.reduce((s, it) => s + (respostas.get(it.id!)?.ok ? Number(it.pontos) : 0), 0)
  const totalMax    = itensOrdenados.reduce((s, it) => s + Number(it.pontos), 0)

  function toggle(itemId: string) {
    setRespostas(prev => {
      const cur = prev.get(itemId) ?? { ok: false, motivo: '' }
      const next = new Map(prev)
      next.set(itemId, { ...cur, ok: !cur.ok })
      return next
    })
  }
  function setMotivo(itemId: string, motivo: string) {
    setRespostas(prev => {
      const cur = prev.get(itemId) ?? { ok: false, motivo: '' }
      const next = new Map(prev)
      next.set(itemId, { ...cur, motivo })
      return next
    })
  }

  async function salvar() {
    setSalvando(true)
    try {
      const payload = {
        observacoes,
        respostas: itensOrdenados.map(it => ({
          item_id: it.id!,
          ok:      respostas.get(it.id!)?.ok ?? false,
          motivo:  respostas.get(it.id!)?.motivo ?? '',
        })),
      }
      const r = await fetch(`/api/comissionamento/checklists/aplicacoes/${aplicacao.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!r.ok || j.error) throw new Error(j.error ?? 'erro')
      toast({ title: 'Aplicação salva', description: `${totalObtido} de ${totalMax} pts` })
      onSalvo()
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro', description: e instanceof Error ? e.message : String(e) })
    } finally { setSalvando(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span>{template.nome}</span>
            <span className="text-[13px] text-gray-500 font-normal">
              {fmtData(aplicacao.period_start)} → {fmtData(aplicacao.period_end)}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mb-2">
          <p className="text-[12.5px] text-orange-900">
            Pontuação: <b className="text-[16px]">{totalObtido}</b> de {totalMax}
          </p>
          <p className="text-[11.5px] text-orange-800">
            Marque os itens conforme cumpridos. Trigger recalcula o total ao salvar.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {itensOrdenados.map((it, idx) => {
            const r = respostas.get(it.id!) ?? { ok: false, motivo: '' }
            return (
              <div key={it.id} className={cn('border rounded-md p-2 transition-colors', r.ok ? 'border-emerald-300 bg-emerald-50/40' : 'border-gray-200 bg-white')}>
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggle(it.id!)}
                    className={cn('flex-shrink-0 mt-0.5', r.ok ? 'text-emerald-600' : 'text-gray-300 hover:text-gray-500')}
                    title={r.ok ? 'Marcado como OK' : 'Marcar como OK'}
                  >
                    {r.ok ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                  <span className="text-[11px] text-gray-400 mt-1 w-6 text-right">{idx + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-gray-800">{it.descricao}</p>
                    <Input
                      className="mt-1 h-7 text-[12px]"
                      placeholder="Motivo / observação (opcional)"
                      value={r.motivo}
                      onChange={e => setMotivo(it.id!, e.target.value)}
                    />
                  </div>
                  <span className="text-[11.5px] font-semibold text-gray-700 flex-shrink-0 min-w-[50px] text-right">{it.pontos} pts</span>
                </div>
              </div>
            )
          })}
        </div>
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Observações gerais</Label>
          <Textarea rows={2} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-1.5">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
