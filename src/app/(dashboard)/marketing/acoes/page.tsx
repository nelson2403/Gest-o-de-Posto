'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'
import {
  Plus, Loader2, Megaphone, CheckCircle2, XCircle, Clock,
  Upload, ChevronDown, ChevronUp, Calendar, MapPin,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface AcaoPosto {
  id: string
  posto_id: string
  valor: number | null
  status: 'pendente' | 'enviado' | 'aprovado' | 'reprovado'
  aprovado_em: string | null
  postos: { id: string; nome: string }
  marketing_comprovantes: { id: string; arquivo_url: string; arquivo_nome: string; valor: number | null }[]
}

interface Acao {
  id: string
  titulo: string
  descricao: string | null
  valor_padrao: number
  data_acao: string
  prazo_envio: string
  status: 'aberta' | 'encerrada' | 'cancelada'
  criador: { nome: string }
  marketing_acao_postos: AcaoPosto[]
}

interface PostoOpt { id: string; nome: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') }

const STATUS_ACAO_CFG = {
  aberta:    { label: 'Aberta',    cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  encerrada: { label: 'Encerrada', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  cancelada: { label: 'Cancelada', cls: 'bg-red-100 text-red-700 border-red-200' },
}

const STATUS_POSTO_CFG = {
  pendente:  { label: 'Pendente',  icon: Clock,        cls: 'bg-yellow-100 text-yellow-700' },
  enviado:   { label: 'Enviado',   icon: CheckCircle2, cls: 'bg-blue-100 text-blue-700' },
  aprovado:  { label: 'Aprovado',  icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
  reprovado: { label: 'Reprovado', icon: XCircle,      cls: 'bg-red-100 text-red-700' },
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function AcoesPage() {
  const { usuario } = useAuthContext()
  const podeCriar   = can(usuario?.role, 'marketing.create_acao')
  const podeAprovar = can(usuario?.role, 'marketing.aprovar')
  const isGerente   = usuario?.role === 'gerente'
  const postoFixoId = usuario?.posto_fechamento_id ?? null

  const [acoes, setAcoes]         = useState<Acao[]>([])
  const [postos, setPostos]       = useState<PostoOpt[]>([])
  const [loading, setLoading]     = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  // Modal nova ação
  const [showModal, setShowModal]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState({
    titulo: '', descricao: '', valor_padrao: '150', data_acao: '', prazo_envio: '',
  })
  const [postosSelec, setPostosSelec] = useState<string[]>([])

  // Modal comprovante (gerente)
  const [showComp, setShowComp]       = useState(false)
  const [compAcaoId, setCompAcaoId]   = useState('')
  const [compPostoId, setCompPostoId] = useState('')
  const [compArquivo, setCompArquivo] = useState<File | null>(null)
  const [compValor, setCompValor]     = useState('')
  const [uploadando, setUploadando]   = useState(false)

  // Modal aprovar/reprovar posto
  const [showAprovarPosto, setShowAprovarPosto] = useState(false)
  const [acaoAlvoId, setAcaoAlvoId]   = useState('')
  const [postoAlvoId, setPosotAlvoId] = useState('')
  const [acaoTipo, setAcaoTipo]       = useState<'aprovar' | 'reprovar'>('aprovar')
  const [motivoRep, setMotivoRep]     = useState('')
  const [aprovandoPosto, setAprovandoPosto] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/marketing/acoes')
      const json = await res.json()
      setAcoes(json.acoes ?? [])
    } catch {
      toast({ title: 'Erro ao carregar ações', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    createClient()
      .from('postos')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setPostos(data ?? []))
  }, [load])

  function togglePosto(id: string) {
    setPostosSelec(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function salvarAcao() {
    if (!form.titulo || !form.data_acao || !form.prazo_envio || postosSelec.length === 0) {
      toast({ title: 'Preencha todos os campos e selecione ao menos um posto', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/marketing/acoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, valor_padrao: Number(form.valor_padrao), postos: postosSelec }),
      })
      const json = await res.json()
      if (!res.ok) { toast({ title: json.error, variant: 'destructive' }); return }
      toast({ title: 'Ação criada com sucesso!' })
      setShowModal(false)
      setForm({ titulo: '', descricao: '', valor_padrao: '150', data_acao: '', prazo_envio: '' })
      setPostosSelec([])
      load()
    } finally {
      setSaving(false)
    }
  }

  async function enviarComprovante() {
    if (!compArquivo) { toast({ title: 'Selecione um arquivo', variant: 'destructive' }); return }
    setUploadando(true)
    try {
      const fd = new FormData()
      fd.append('arquivo', compArquivo)
      fd.append('posto_id', compPostoId)
      if (compValor) fd.append('valor', compValor)
      const res = await fetch(`/api/marketing/acoes/${compAcaoId}/comprovante`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { toast({ title: json.error, variant: 'destructive' }); return }
      toast({ title: 'Comprovante enviado!' })
      setShowComp(false)
      setCompArquivo(null); setCompValor('')
      load()
    } finally {
      setUploadando(false)
    }
  }

  async function aprovarPosto() {
    setAprovandoPosto(true)
    try {
      const res = await fetch(`/api/marketing/acoes/${acaoAlvoId}/postos/${postoAlvoId}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: acaoTipo, motivo: motivoRep }),
      })
      const json = await res.json()
      if (!res.ok) { toast({ title: json.error, variant: 'destructive' }); return }
      toast({ title: acaoTipo === 'aprovar' ? 'Comprovante aprovado!' : 'Reprovado' })
      setShowAprovarPosto(false); setMotivoRep('')
      load()
    } finally {
      setAprovandoPosto(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Ações de Marketing" subtitle="Campanhas e comprovantes por posto" />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-gray-500">{acoes.length} ação(ões) encontrada(s)</p>
          {podeCriar && (
            <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5 text-[13px]">
              <Plus className="w-4 h-4" /> Nova Ação
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : acoes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Megaphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-[13px]">Nenhuma ação cadastrada</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Gerente vê apenas ações em que seu posto participa */}
            {acoes.filter(a =>
              !isGerente || a.marketing_acao_postos?.some(ap => ap.posto_id === postoFixoId)
            ).map(a => {
              const aberto = expandido === a.id
              const cfg    = STATUS_ACAO_CFG[a.status]
              const total    = a.marketing_acao_postos?.length ?? 0
              const enviados = a.marketing_acao_postos?.filter(p => ['enviado','aprovado'].includes(p.status)).length ?? 0
              const aprovados = a.marketing_acao_postos?.filter(p => p.status === 'aprovado').length ?? 0
              const pct = total > 0 ? (enviados / total) * 100 : 0
              const diasRestantes = Math.ceil((new Date(a.prazo_envio).getTime() - Date.now()) / 86400000)

              return (
                <div key={a.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Cabeçalho da ação */}
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandido(aberto ? null : a.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14px] font-semibold text-gray-800">{a.titulo}</p>
                        <Badge variant="outline" className={cn('text-[11px]', cfg.cls)}>{cfg.label}</Badge>
                        {diasRestantes >= 0 && diasRestantes <= 2 && a.status === 'aberta' && (
                          <Badge variant="outline" className="text-[11px] bg-orange-100 text-orange-700 border-orange-200">
                            Prazo em {diasRestantes}d
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(a.data_acao)}</span>
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{total} postos</span>
                        <span>{aprovados}/{total} aprovados</span>
                        <span className="font-medium">{fmtBRL(a.valor_padrao)}/posto</span>
                      </div>
                      {/* Barra de progresso */}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-emerald-500' : 'bg-blue-500')}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-gray-500 shrink-0">{enviados}/{total}</span>
                      </div>
                    </div>
                    {aberto ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  </div>

                  {/* Lista de postos */}
                  {aberto && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      {a.descricao && (
                        <div className="px-4 py-2 text-[12px] text-gray-500 border-b border-gray-100">{a.descricao}</div>
                      )}
                      <div className="divide-y divide-gray-100">
                        {/* Gerente vê apenas seu posto; outros veem todos */}
                        {a.marketing_acao_postos?.filter(ap => !isGerente || ap.posto_id === postoFixoId).map(ap => {
                          const spCfg = STATUS_POSTO_CFG[ap.status]
                          const valorAp = ap.valor ?? a.valor_padrao
                          return (
                            <div key={ap.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-gray-700">{ap.postos?.nome}</p>
                                {ap.marketing_comprovantes?.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mt-1">
                                    {ap.marketing_comprovantes.map(c => (
                                      <a key={c.id} href={c.arquivo_url} target="_blank" rel="noopener noreferrer"
                                        className="text-[11px] text-blue-600 hover:underline bg-blue-50 px-1.5 py-0.5 rounded"
                                      >
                                        {c.arquivo_nome ?? 'Comprovante'} {c.valor ? `(${fmtBRL(c.valor)})` : ''}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <span className="text-[12px] text-gray-600 shrink-0">{fmtBRL(valorAp)}</span>
                              <span className={cn('text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1', spCfg.cls)}>
                                <spCfg.icon className="w-3 h-3" />{spCfg.label}
                              </span>
                              {/* Botão gerente enviar/reenviar comprovante */}
                              {!podeAprovar && ['pendente','enviado'].includes(ap.status) && (
                                <Button size="sm" variant="outline"
                                  className={cn('text-[11px] h-7',
                                    ap.status === 'enviado'
                                      ? 'border-blue-300 text-blue-700 hover:bg-blue-50'
                                      : 'border-orange-300 text-orange-700 hover:bg-orange-50'
                                  )}
                                  onClick={() => {
                                    setCompAcaoId(a.id); setCompPostoId(ap.posto_id)
                                    setShowComp(true)
                                  }}
                                >
                                  <Upload className="w-3 h-3 mr-1" />
                                  {ap.status === 'enviado' ? 'Reenviar' : 'Enviar comprovante'}
                                </Button>
                              )}
                              {/* Botão marketing aprovar */}
                              {podeAprovar && ap.status === 'enviado' && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline"
                                    className="text-[11px] h-7 border-green-300 text-green-700 hover:bg-green-50"
                                    onClick={() => {
                                      setAcaoAlvoId(a.id); setPosotAlvoId(ap.posto_id)
                                      setAcaoTipo('aprovar'); setShowAprovarPosto(true)
                                    }}
                                  >
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Aprovar
                                  </Button>
                                  <Button size="sm" variant="outline"
                                    className="text-[11px] h-7 border-red-300 text-red-700 hover:bg-red-50"
                                    onClick={() => {
                                      setAcaoAlvoId(a.id); setPosotAlvoId(ap.posto_id)
                                      setAcaoTipo('reprovar'); setShowAprovarPosto(true)
                                    }}
                                  >
                                    <XCircle className="w-3 h-3 mr-1" /> Reprovar
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal nova ação */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-4 h-4" /> Nova Ação de Marketing
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-[12px]">Título *</Label>
              <Input className="h-9 text-[13px] mt-1" placeholder="Ex: Dia das Mães 2026"
                value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[12px]">Descrição</Label>
              <Input className="h-9 text-[13px] mt-1" placeholder="Detalhes da ação (opcional)"
                value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[12px]">Valor padrão (R$) *</Label>
                <Input type="number" step="0.01" className="h-9 text-[13px] mt-1"
                  value={form.valor_padrao} onChange={e => setForm(f => ({ ...f, valor_padrao: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Data da ação *</Label>
                <Input type="date" className="h-9 text-[13px] mt-1"
                  value={form.data_acao} onChange={e => setForm(f => ({ ...f, data_acao: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Prazo envio *</Label>
                <Input type="date" className="h-9 text-[13px] mt-1"
                  value={form.prazo_envio} onChange={e => setForm(f => ({ ...f, prazo_envio: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-[12px] mb-1 block">Postos participantes * ({postosSelec.length} selecionados)</Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border rounded-lg p-2">
                {postos.map(p => (
                  <label key={p.id} className={cn(
                    'flex items-center gap-2 rounded p-1.5 cursor-pointer text-[12px] transition-colors',
                    postosSelec.includes(p.id) ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                  )}>
                    <input type="checkbox" checked={postosSelec.includes(p.id)}
                      onChange={() => togglePosto(p.id)} className="rounded" />
                    {p.nome}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 mt-1.5">
                <button className="text-[11px] text-blue-600 hover:underline" onClick={() => setPostosSelec(postos.map(p => p.id))}>Selecionar todos</button>
                <button className="text-[11px] text-gray-400 hover:underline" onClick={() => setPostosSelec([])}>Limpar</button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={salvarAcao} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Criar Ação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal envio de comprovante */}
      <Dialog open={showComp} onOpenChange={setShowComp}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Enviar Comprovante</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-[12px]">Valor gasto (R$)</Label>
              <Input type="number" step="0.01" className="h-9 text-[13px] mt-1"
                placeholder="Deixe em branco para usar o valor padrão"
                value={compValor} onChange={e => setCompValor(e.target.value)} />
            </div>
            <div>
              <Label className="text-[12px]">Arquivo *</Label>
              <div className="mt-1 border-2 border-dashed border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:border-blue-300 transition-colors"
                onClick={() => document.getElementById('file-comp')?.click()}
              >
                <Upload className="w-5 h-5 mx-auto text-gray-400 mb-1" />
                <p className="text-[12px] text-gray-500">{compArquivo ? compArquivo.name : 'Selecione PDF, JPG ou PNG'}</p>
                <input id="file-comp" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={e => setCompArquivo(e.target.files?.[0] ?? null)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowComp(false)}>Cancelar</Button>
            <Button size="sm" onClick={enviarComprovante} disabled={uploadando}>
              {uploadando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal aprovar/reprovar posto */}
      <Dialog open={showAprovarPosto} onOpenChange={setShowAprovarPosto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{acaoTipo === 'aprovar' ? 'Aprovar comprovante' : 'Reprovar comprovante'}</DialogTitle>
          </DialogHeader>
          {acaoTipo === 'reprovar' && (
            <div className="py-2">
              <Label className="text-[12px]">Motivo</Label>
              <Input className="mt-1 text-[13px]" placeholder="Informe o motivo"
                value={motivoRep} onChange={e => setMotivoRep(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAprovarPosto(false)}>Cancelar</Button>
            <Button size="sm" className={acaoTipo === 'reprovar' ? 'bg-red-600 hover:bg-red-700' : ''}
              onClick={aprovarPosto} disabled={aprovandoPosto}
            >
              {aprovandoPosto ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
