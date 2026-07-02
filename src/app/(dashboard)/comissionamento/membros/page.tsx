'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils/cn'
import {
  ArrowLeft, UserPlus, Search, Loader2, Shield, UserCog, User,
  Trash2, Pencil, Building2, Users as UsersIcon, Check, CheckCircle2,
  XCircle, AlertCircle,
} from 'lucide-react'
import type { ComissioMembro, ComissioRole } from '@/app/api/comissionamento/membros/route'
import { PostoCombobox } from '../_components/PostoCombobox'

// ── Tipos auxiliares (locais) ──────────────────────────────────────────────────

interface Posto {
  id:                       string
  nome:                     string
  codigo_empresa_externo:   string | null
}

interface PessoaAutosystem {
  grid:    number
  codigo:  string | null
  nome:    string
  cargo:   string | null
  email:   string | null
}

// ── Mapeamentos de role ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<ComissioRole, string> = {
  supervisor:   'Supervisor',
  manager:      'Gerente',
  pit_boss:     'Chefe de Pista',
  oil_changer:  'Trocador de Óleo',
  seller:       'Vendedor',
}

const ROLE_ICONS: Record<ComissioRole, React.ElementType> = {
  supervisor:   Shield,
  manager:      UserCog,
  pit_boss:     User,
  oil_changer:  User,
  seller:       User,
}

const ROLE_CORES: Record<ComissioRole, string> = {
  supervisor:   'bg-purple-100 text-purple-700 border-purple-200',
  manager:      'bg-blue-100 text-blue-700 border-blue-200',
  pit_boss:     'bg-amber-100 text-amber-700 border-amber-200',
  oil_changer:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  seller:       'bg-gray-100 text-gray-700 border-gray-200',
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ComissionamentoMembrosPage() {
  // Filtros
  const [postos,        setPostos]        = useState<Posto[]>([])
  const [postoFiltro,   setPostoFiltro]   = useState<string>('todos')
  const [busca,         setBusca]         = useState('')

  // Estado dos membros
  const [membros,       setMembros]       = useState<ComissioMembro[]>([])
  const [loading,       setLoading]       = useState(true)
  const [erro,          setErro]          = useState<string | null>(null)

  // Diálogo de adicionar membro
  const [adicionarOpen,  setAdicionarOpen]  = useState(false)
  const [pessoasAS,      setPessoasAS]      = useState<PessoaAutosystem[]>([])
  const [carregandoAS,   setCarregandoAS]   = useState(false)
  const [erroAS,         setErroAS]         = useState<string | null>(null)
  const [postoAddId,     setPostoAddId]     = useState<string>('')
  const [roleAdd,        setRoleAdd]        = useState<ComissioRole>('seller')
  // Multi-seleção — o usuário marca N pessoas do AUTOSYSTEM na mesma
  // caixa e todas são cadastradas como membros do mesmo posto+role em
  // um único submit (uma chamada da API por pessoa, em paralelo).
  const [pessoasSelecionadas, setPessoasSelecionadas] = useState<Set<number>>(new Set())
  const [buscaPessoa,    setBuscaPessoa]    = useState('')
  const [salvandoAdd,    setSalvandoAdd]    = useState(false)

  // Diálogo de editar membro
  const [editando,      setEditando]      = useState<ComissioMembro | null>(null)
  const [editRole,      setEditRole]      = useState<ComissioRole>('seller')
  const [editPostoId,   setEditPostoId]   = useState<string>('')
  const [salvandoEdit,  setSalvandoEdit]  = useState(false)

  // Confirmação de exclusão
  const [excluindo,     setExcluindo]     = useState<ComissioMembro | null>(null)
  const [confirmDel,    setConfirmDel]    = useState(false)

  // ── Carrega postos uma vez ───────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/postos')
      .then(r => r.json())
      .then(json => {
        const lista = (json.postos ?? []) as Posto[]
        setPostos(lista)
      })
      .catch(() => toast({ variant: 'destructive', title: 'Erro ao carregar postos' }))
  }, [])

  // ── Carrega membros (filtra por posto se selecionado) ────────────────────
  const carregarMembros = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams()
      if (postoFiltro && postoFiltro !== 'todos') params.set('posto_id', postoFiltro)
      const r = await fetch(`/api/comissionamento/membros?${params}`)
      const json = await r.json()
      if (!r.ok || json.error) {
        setErro(json.error ?? `Erro HTTP ${r.status}`)
        setMembros([])
        return
      }
      setMembros(json.membros ?? [])
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setMembros([])
    } finally {
      setLoading(false)
    }
  }, [postoFiltro])

  useEffect(() => { carregarMembros() }, [carregarMembros])

  // ── Lista filtrada por busca local ────────────────────────────────────────
  const membrosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return membros
    return membros.filter(m => m.nome.toLowerCase().includes(termo)
      || (m.email ?? '').toLowerCase().includes(termo)
      || (m.posto_nome ?? '').toLowerCase().includes(termo))
  }, [membros, busca])

  // Set de pessoa-ids já cadastradas pra impedir duplicação no diálogo de adicionar
  const externalIdsCadastrados = useMemo(() => {
    if (!postoAddId) return new Set<string>()
    return new Set(
      membros
        .filter(m => m.posto_id === postoAddId && m.external_person_id)
        .map(m => m.external_person_id!),
    )
  }, [membros, postoAddId])

  // ── Abrir diálogo de adicionar ────────────────────────────────────────────
  function abrirAdicionar() {
    const postoInicial = postoFiltro !== 'todos' ? postoFiltro : (postos[0]?.id ?? '')
    setAdicionarOpen(true)
    setRoleAdd('seller')
    setPessoasSelecionadas(new Set())
    setBuscaPessoa('')
    setPostoAddId(postoInicial)
  }

  // Recarrega pessoas do AUTOSYSTEM quando o posto do diálogo muda
  useEffect(() => {
    if (!adicionarOpen || !postoAddId) {
      setPessoasAS([])
      return
    }
    setCarregandoAS(true)
    setErroAS(null)
    const params = new URLSearchParams({ posto_id: postoAddId })
    if (buscaPessoa.trim()) params.set('busca', buscaPessoa.trim())
    fetch(`/api/comissionamento/pessoas-as?${params}`)
      .then(r => r.json())
      .then(json => {
        if (json.error) {
          setErroAS(json.error)
          setPessoasAS([])
        } else {
          setPessoasAS(json.pessoas ?? [])
        }
      })
      .catch(e => setErroAS(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregandoAS(false))
  }, [adicionarOpen, postoAddId, buscaPessoa])

  // Pessoas ainda disponíveis (não cadastradas no posto)
  const pessoasDisponiveis = useMemo(() =>
    pessoasAS.filter(p => !externalIdsCadastrados.has(String(p.grid))),
    [pessoasAS, externalIdsCadastrados],
  )

  // ── Confirma adicionar (multi) ────────────────────────────────────────────
  // Roda 1 POST por pessoa selecionada em paralelo. Falhas individuais viram
  // um resumo no toast final — não interrompem os cadastros que deram certo.
  async function confirmarAdicionar() {
    if (pessoasSelecionadas.size === 0 || !postoAddId) return
    const alvos = pessoasAS.filter(p => pessoasSelecionadas.has(p.grid))
    if (alvos.length === 0) return
    setSalvandoAdd(true)
    try {
      const resultados = await Promise.all(alvos.map(async p => {
        try {
          const r = await fetch('/api/comissionamento/membros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              posto_id:           postoAddId,
              external_person_id: String(p.grid),
              nome:               p.nome,
              email:              p.email,
              role:               roleAdd,
            }),
          })
          const json = await r.json().catch(() => ({}))
          if (!r.ok || json.error) return { p, erro: String(json.error ?? 'erro') }
          return { p, erro: null as string | null }
        } catch (e) {
          return { p, erro: e instanceof Error ? e.message : String(e) }
        }
      }))
      const ok  = resultados.filter(r => !r.erro).length
      const err = resultados.filter(r =>  r.erro).length
      if (ok > 0 && err === 0) {
        toast({
          title: `${ok} membro${ok === 1 ? '' : 's'} adicionado${ok === 1 ? '' : 's'}`,
          description: `Todos como ${ROLE_LABELS[roleAdd]}.`,
        })
        setAdicionarOpen(false)
      } else if (ok > 0 && err > 0) {
        toast({
          variant: 'destructive',
          title: `${ok} adicionado${ok === 1 ? '' : 's'}, ${err} falhou${err === 1 ? '' : 'ram'}`,
          description: resultados.filter(r => r.erro).map(r => `${r.p.nome}: ${r.erro}`).slice(0, 3).join(' · '),
        })
      } else {
        toast({
          variant: 'destructive',
          title: 'Nenhum membro foi adicionado',
          description: resultados[0]?.erro ?? 'Erro desconhecido',
        })
      }
      await carregarMembros()
    } finally {
      setSalvandoAdd(false)
    }
  }

  // ── Abrir / confirmar edição ──────────────────────────────────────────────
  function abrirEditar(m: ComissioMembro) {
    setEditando(m)
    setEditRole(m.role)
    setEditPostoId(m.posto_id)
  }

  async function confirmarEditar() {
    if (!editando) return
    setSalvandoEdit(true)
    try {
      const r = await fetch(`/api/comissionamento/membros/${editando.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole, posto_id: editPostoId }),
      })
      const json = await r.json()
      if (!r.ok || json.error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar', description: json.error })
        return
      }
      toast({ title: 'Membro atualizado', description: editando.nome })
      setEditando(null)
      await carregarMembros()
    } finally {
      setSalvandoEdit(false)
    }
  }

  // ── Toggle ativo ──────────────────────────────────────────────────────────
  async function toggleAtivo(m: ComissioMembro) {
    const r = await fetch(`/api/comissionamento/membros/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !m.ativo }),
    })
    if (!r.ok) {
      const json = await r.json().catch(() => ({}))
      toast({ variant: 'destructive', title: 'Erro', description: json.error })
      return
    }
    setMembros(prev => prev.map(x => x.id === m.id ? { ...x, ativo: !m.ativo } : x))
  }

  // ── Excluir ───────────────────────────────────────────────────────────────
  function abrirExcluir(m: ComissioMembro) {
    setExcluindo(m)
    setConfirmDel(true)
  }

  async function confirmarExcluir() {
    if (!excluindo) return
    const r = await fetch(`/api/comissionamento/membros/${excluindo.id}`, { method: 'DELETE' })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || json.error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: json.error })
      return
    }
    toast({ title: 'Membro excluído', description: excluindo.nome })
    setConfirmDel(false)
    setExcluindo(null)
    await carregarMembros()
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total      = membros.length
    const ativos     = membros.filter(m => m.ativo).length
    const inativos   = total - ativos
    const porRole    = membros.reduce<Record<string, number>>((acc, m) => {
      acc[m.role] = (acc[m.role] ?? 0) + 1
      return acc
    }, {})
    return { total, ativos, inativos, porRole }
  }, [membros])

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Membros do Comissionamento"
        description="Cadastro de vendedores, gerentes e demais papéis do time"
        actions={
          <Link
            href="/comissionamento"
            className="flex items-center gap-1.5 px-3 h-8 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12.5px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiPill titulo="Total"       valor={stats.total}    icone={UsersIcon}     cor="indigo" />
          <KpiPill titulo="Ativos"      valor={stats.ativos}   icone={CheckCircle2}  cor="emerald" />
          <KpiPill titulo="Inativos"    valor={stats.inativos} icone={XCircle}       cor="gray" />
          <KpiPill titulo="Vendedores"  valor={stats.porRole.seller   ?? 0} icone={User}     cor="blue" />
          <KpiPill titulo="Gerentes"    valor={stats.porRole.manager  ?? 0} icone={UserCog}  cor="purple" />
        </div>

        {/* ── Filtros + ação ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Posto</Label>
              <Select value={postoFiltro} onValueChange={setPostoFiltro}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Todos os postos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os postos</SelectItem>
                  {postos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[220px] flex-1">
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Nome, e-mail ou posto..."
                  className="h-9 pl-8 text-[13px]"
                />
              </div>
            </div>

            <Button
              onClick={abrirAdicionar}
              disabled={!postos.length}
              className="h-9 gap-1.5 bg-gray-900 hover:bg-black text-white text-[13px]"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Adicionar membro
            </Button>
          </div>
        </div>

        {/* ── Erro ── */}
        {erro && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[13px]">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Erro ao carregar</p>
              <p className="text-[12px] opacity-80">{erro}</p>
            </div>
            <button onClick={carregarMembros} className="text-[12px] font-medium underline">Tentar novamente</button>
          </div>
        )}

        {/* ── Tabela ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : membrosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <UsersIcon className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-[13px] font-medium text-gray-700">Nenhum membro encontrado</p>
              <p className="text-[12px] text-gray-500 mt-1">
                {busca ? `Tente uma busca diferente.` : `Clique em "Adicionar membro" para começar.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="text-left  px-4 py-2.5">Nome</th>
                    <th className="text-left  px-4 py-2.5">Posto</th>
                    <th className="text-left  px-4 py-2.5">Função</th>
                    <th className="text-center px-4 py-2.5 w-24">Status</th>
                    <th className="text-right px-4 py-2.5 w-28">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {membrosFiltrados.map(m => {
                    const RoleIcon = ROLE_ICONS[m.role]
                    return (
                      <tr key={m.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <Avatar nome={m.nome} />
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-gray-800 truncate">{m.nome}</p>
                              {m.email && <p className="text-[11px] text-gray-500 truncate">{m.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 text-[12.5px] text-gray-700">
                            <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{m.posto_nome || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className={cn('gap-1 text-[11px]', ROLE_CORES[m.role])}>
                            <RoleIcon className="w-3 h-3" />
                            {ROLE_LABELS[m.role]}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => toggleAtivo(m)}
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border transition-colors cursor-pointer',
                              m.ativo
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200',
                            )}
                            title="Clique para alternar"
                          >
                            {m.ativo ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                            {m.ativo ? 'Ativo' : 'Inativo'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1 justify-end">
                            <button
                              onClick={() => abrirEditar(m)}
                              className="p-1.5 rounded-md text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => abrirExcluir(m)}
                              className="p-1.5 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── Diálogo: adicionar ───────────────────────────────────────────── */}
      <Dialog open={adicionarOpen} onOpenChange={setAdicionarOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-orange-500" />
              Adicionar membro
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">

            {/* Posto */}
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Posto</Label>
              <PostoCombobox
                postos={postos}
                value={postoAddId}
                onChange={setPostoAddId}
                placeholder="Selecione o posto"
                className="w-full"
              />
            </div>

            {/* Função */}
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Função</Label>
              <Select value={roleAdd} onValueChange={(v) => setRoleAdd(v as ComissioRole)}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as ComissioRole[]).map(r => {
                    const Icon = ROLE_ICONS[r]
                    return (
                      <SelectItem key={r} value={r}>
                        <span className="flex items-center gap-2">
                          <Icon className="w-3.5 h-3.5" />
                          {ROLE_LABELS[r]}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Busca pessoa */}
            <div>
              <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">
                Buscar funcionário no AUTOSYSTEM
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <Input
                  value={buscaPessoa}
                  onChange={e => setBuscaPessoa(e.target.value)}
                  placeholder="Digite o nome do funcionário..."
                  className="h-9 pl-8 text-[13px]"
                  disabled={!postoAddId}
                />
              </div>
            </div>

            {/* Lista */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 text-[11px]">
                <span className="text-gray-500 truncate">
                  {carregandoAS
                    ? 'Carregando...'
                    : `${pessoasDisponiveis.length} funcionário${pessoasDisponiveis.length === 1 ? '' : 's'} disponível${pessoasDisponiveis.length === 1 ? '' : 'is'}${pessoasSelecionadas.size > 0 ? ` · ${pessoasSelecionadas.size} selecionado${pessoasSelecionadas.size === 1 ? '' : 's'}` : ''}`}
                </span>
                {pessoasDisponiveis.length > 0 && (() => {
                  const visiveis = pessoasDisponiveis.slice(0, 50)
                  const todosVisiveisSelecionados = visiveis.every(p => pessoasSelecionadas.has(p.grid))
                  return (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPessoasSelecionadas(prev => {
                            const next = new Set(prev)
                            if (todosVisiveisSelecionados) visiveis.forEach(p => next.delete(p.grid))
                            else visiveis.forEach(p => next.add(p.grid))
                            return next
                          })
                        }}
                        className="text-[10.5px] text-orange-700 hover:underline whitespace-nowrap"
                      >
                        {todosVisiveisSelecionados ? 'Desmarcar visíveis' : 'Marcar todos visíveis'}
                      </button>
                      {pessoasSelecionadas.size > 0 && (
                        <>
                          <span className="text-gray-300">·</span>
                          <button
                            type="button"
                            onClick={() => setPessoasSelecionadas(new Set())}
                            className="text-[10.5px] text-gray-500 hover:underline whitespace-nowrap"
                          >
                            Limpar
                          </button>
                        </>
                      )}
                    </div>
                  )
                })()}
              </div>
              {erroAS && (
                <div className="px-3 py-3 text-[12px] text-red-700 bg-red-50">
                  {erroAS}
                </div>
              )}
              <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                {carregandoAS ? (
                  <div className="flex items-center justify-center py-8 text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                ) : pessoasDisponiveis.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
                    <Search className="w-7 h-7 opacity-40 mb-1" />
                    <p className="text-[12.5px]">
                      {pessoasAS.length === 0
                        ? 'Nenhum funcionário encontrado no AUTOSYSTEM'
                        : 'Todos os funcionários já foram cadastrados'}
                    </p>
                  </div>
                ) : (
                  pessoasDisponiveis.slice(0, 50).map(p => {
                    const selecionada = pessoasSelecionadas.has(p.grid)
                    return (
                      <button
                        key={p.grid}
                        type="button"
                        onClick={() => {
                          setPessoasSelecionadas(prev => {
                            const next = new Set(prev)
                            if (next.has(p.grid)) next.delete(p.grid)
                            else next.add(p.grid)
                            return next
                          })
                        }}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-2',
                          selecionada
                            ? 'bg-orange-50 border-l-orange-500'
                            : 'hover:bg-gray-50 border-l-transparent',
                        )}
                      >
                        <div
                          className={cn(
                            'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                            selecionada
                              ? 'bg-orange-500 border-orange-500'
                              : 'border-gray-300 bg-white',
                          )}
                        >
                          {selecionada && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                        </div>
                        <Avatar nome={p.nome} />
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-[13px] truncate', selecionada ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>
                            {p.nome}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate">
                            {p.cargo || 'Sem cargo'}{p.codigo ? ` · Cód. ${p.codigo}` : ''}
                          </p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-gray-200 mt-2">
            <Button variant="outline" onClick={() => setAdicionarOpen(false)} disabled={salvandoAdd}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarAdicionar}
              disabled={pessoasSelecionadas.size === 0 || !postoAddId || salvandoAdd}
              className="gap-2 bg-gray-900 hover:bg-black text-white"
            >
              {salvandoAdd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {pessoasSelecionadas.size <= 1
                ? 'Adicionar membro'
                : `Adicionar ${pessoasSelecionadas.size} membros`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Diálogo: editar ──────────────────────────────────────────────── */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-blue-500" />
              Editar membro
            </DialogTitle>
          </DialogHeader>

          {editando && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <Avatar nome={editando.nome} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{editando.nome}</p>
                  {editando.email && <p className="text-[11px] text-gray-500 truncate">{editando.email}</p>}
                </div>
              </div>

              <div>
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Função</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as ComissioRole)}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABELS) as ComissioRole[]).map(r => {
                      const Icon = ROLE_ICONS[r]
                      return (
                        <SelectItem key={r} value={r}>
                          <span className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5" />
                            {ROLE_LABELS[r]}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[11px] uppercase tracking-wide text-gray-500 mb-1.5 block">Posto</Label>
                <Select value={editPostoId} onValueChange={setEditPostoId}>
                  <SelectTrigger className="h-9 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {postos.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={salvandoEdit}>
              Cancelar
            </Button>
            <Button onClick={confirmarEditar} disabled={salvandoEdit} className="gap-2">
              {salvandoEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Diálogo: confirmar exclusão ──────────────────────────────────── */}
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-4 h-4" />
              Excluir membro
            </DialogTitle>
          </DialogHeader>
          {excluindo && (
            <div className="py-2">
              <p className="text-[13.5px] text-gray-700">
                Tem certeza que deseja excluir <strong>{excluindo.nome}</strong>?
              </p>
              <p className="text-[12px] text-gray-500 mt-1">
                Esta ação é permanente. O histórico de comissões associado a esse membro pode ficar órfão.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(false)}>Cancelar</Button>
            <Button
              onClick={confirmarExcluir}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function Avatar({ nome }: { nome: string }) {
  const iniciais = nome.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600 flex-shrink-0">
      {iniciais || '?'}
    </div>
  )
}

function KpiPill({ titulo, valor, icone: Icone, cor }: {
  titulo: string
  valor:  number
  icone:  React.ElementType
  cor:    'indigo' | 'emerald' | 'gray' | 'blue' | 'purple'
}) {
  const cores: Record<typeof cor, { bg: string; texto: string }> = {
    indigo:  { bg: 'bg-indigo-50',  texto: 'text-indigo-700' },
    emerald: { bg: 'bg-emerald-50', texto: 'text-emerald-700' },
    gray:    { bg: 'bg-gray-50',    texto: 'text-gray-700' },
    blue:    { bg: 'bg-blue-50',    texto: 'text-blue-700' },
    purple:  { bg: 'bg-purple-50',  texto: 'text-purple-700' },
  }
  const c = cores[cor]
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', c.bg)}>
        <Icone className={cn('w-4 h-4', c.texto)} />
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] uppercase tracking-wide text-gray-500 font-medium">{titulo}</p>
        <p className="text-[17px] font-bold text-gray-900 tabular-nums leading-none mt-0.5">{valor}</p>
      </div>
    </div>
  )
}
