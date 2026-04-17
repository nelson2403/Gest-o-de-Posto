'use client'

import { useEffect, useState, useCallback } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { useAuthContext } from '@/contexts/AuthContext'
import { can } from '@/lib/utils/permissions'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'
import {
  Plus, Loader2, Gift, CheckCircle2, XCircle, Clock,
  Upload, FileText, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Saldo {
  posto_id: string
  posto_nome: string
  limite_mensal: number
  limite_anual: number
  gasto_mensal_patrocinio: number
  gasto_anual_patrocinio: number
}

interface Patrocinio {
  id: string
  posto_id: string
  valor: number
  data_evento: string
  patrocinado: string
  descricao: string | null
  status: 'pendente' | 'aprovado' | 'reprovado'
  motivo_reprovacao: string | null
  documento_url: string | null
  created_at: string
  postos: { nome: string }
  aprovador: { nome: string } | null
  criador: { nome: string }
  marketing_comprovantes: { id: string; arquivo_url: string; arquivo_nome: string }[]
}

interface PostoOpt { id: string; nome: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

const STATUS_CFG = {
  pendente:  { label: 'Aguardando',  icon: Clock,         cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  aprovado:  { label: 'Aprovado',    icon: CheckCircle2,  cls: 'bg-green-100 text-green-700 border-green-200' },
  reprovado: { label: 'Reprovado',   icon: XCircle,       cls: 'bg-red-100 text-red-700 border-red-200' },
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function PatrocinioPage() {
  const { usuario } = useAuthContext()
  const podeAprovar  = can(usuario?.role, 'marketing.aprovar')
  const podeCriar    = can(usuario?.role, 'marketing.create_patrocinio')
  // gerente tem o posto fixo no campo posto_fechamento_id
  const isGerente    = usuario?.role === 'gerente'
  const postoFixoId  = usuario?.posto_fechamento_id ?? null

  const [patrocinios, setPatrocinios] = useState<Patrocinio[]>([])
  const [saldos, setSaldos]           = useState<Saldo[]>([])
  const [postos, setPostos]           = useState<PostoOpt[]>([])
  const [loading, setLoading]         = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [expandido, setExpandido]     = useState<string | null>(null)

  // Modal nova solicitação
  const [showModal, setShowModal]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState({
    // gerente já tem posto fixo; outros selecionam
    posto_id: postoFixoId ?? '', valor: '', data_evento: '', patrocinado: '', descricao: '',
  })
  const [arquivo, setArquivo]         = useState<File | null>(null)

  // Modal upload de documento (pós-criação)
  const [showUpload, setShowUpload]   = useState(false)
  const [uploadAlvo, setUploadAlvo]   = useState<string | null>(null)
  const [uploadArquivo, setUploadArquivo] = useState<File | null>(null)
  const [uploadando, setUploadando]   = useState(false)

  // Modal aprovar/reprovar
  const [showAprovar, setShowAprovar] = useState(false)
  const [acaoAprovar, setAcaoAprovar] = useState<'aprovar' | 'reprovar'>('aprovar')
  const [motivoReprov, setMotivoReprov] = useState('')
  const [patrocinioAlvo, setPatrocinioAlvo] = useState<string | null>(null)
  const [aprovando, setAprovando]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rPat, rSaldo] = await Promise.all([
        fetch('/api/marketing/patrocinios'),
        fetch('/api/marketing/saldo'),
      ])
      const [dPat, dSaldo] = await Promise.all([rPat.json(), rSaldo.json()])
      setPatrocinios(dPat.patrocinios ?? [])
      setSaldos(dSaldo.saldo ?? [])
    } catch {
      toast({ title: 'Erro ao carregar dados', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Gerente não precisa do select de postos
    if (!isGerente) {
      createClient()
        .from('postos')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome')
        .then(({ data }) => setPostos(data ?? []))
    }
    // Garante que o posto fixo do gerente já vem preenchido
    if (isGerente && postoFixoId) {
      setForm(f => ({ ...f, posto_id: postoFixoId }))
    }
  }, [load, isGerente, postoFixoId])

  async function salvar() {
    if (!form.posto_id || !form.valor || !form.data_evento || !form.patrocinado) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/marketing/patrocinios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, valor: Number(form.valor) }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: json.error, variant: 'destructive' })
        return
      }
      const patId = json.patrocinio.id

      // Upload do arquivo se houver
      if (arquivo) {
        const fd = new FormData()
        fd.append('arquivo', arquivo)
        await fetch(`/api/marketing/patrocinios/${patId}/comprovante`, { method: 'POST', body: fd })
      }

      toast({ title: 'Solicitação enviada com sucesso!' })
      setShowModal(false)
      setForm({ posto_id: '', valor: '', data_evento: '', patrocinado: '', descricao: '' })
      setArquivo(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function enviarDocumento() {
    if (!uploadAlvo || !uploadArquivo) return
    setUploadando(true)
    try {
      const fd = new FormData()
      fd.append('arquivo', uploadArquivo)
      const res = await fetch(`/api/marketing/patrocinios/${uploadAlvo}/comprovante`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { toast({ title: json.error, variant: 'destructive' }); return }
      toast({ title: 'Documento anexado com sucesso!' })
      setShowUpload(false)
      setUploadArquivo(null)
      load()
    } finally {
      setUploadando(false)
    }
  }

  async function executarAcao() {
    if (!patrocinioAlvo) return
    setAprovando(true)
    try {
      const res = await fetch(`/api/marketing/patrocinios/${patrocinioAlvo}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: acaoAprovar, motivo: motivoReprov }),
      })
      const json = await res.json()
      if (!res.ok) { toast({ title: json.error, variant: 'destructive' }); return }
      toast({ title: acaoAprovar === 'aprovar' ? 'Patrocínio aprovado!' : 'Patrocínio reprovado' })
      setShowAprovar(false)
      setMotivoReprov('')
      load()
    } finally {
      setAprovando(false)
    }
  }

  const lista = patrocinios.filter(p => filtroStatus === 'todos' || p.status === filtroStatus)

  // Saldo do posto selecionado
  const saldoSelecionado = saldos.find(s => s.posto_id === form.posto_id)
  const valorNum = Number(form.valor) || 0
  const excedeMensal = saldoSelecionado && (Number(saldoSelecionado.gasto_mensal_patrocinio) + valorNum) > Number(saldoSelecionado.limite_mensal)
  const excedeAnual  = saldoSelecionado && (Number(saldoSelecionado.gasto_anual_patrocinio)  + valorNum) > Number(saldoSelecionado.limite_anual)

  return (
    <div className="flex flex-col min-h-full">
      <Header title="Patrocínios" description="Solicitações e aprovações de patrocínio" />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-5">

        {/* Barra de ações */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-full sm:w-40 h-9 text-[13px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="pendente">Aguardando</SelectItem>
                <SelectItem value="aprovado">Aprovados</SelectItem>
                <SelectItem value="reprovado">Reprovados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {podeCriar && (
            <Button size="sm" onClick={() => setShowModal(true)} className="gap-1.5 text-[13px]">
              <Plus className="w-4 h-4" /> Nova Solicitação
            </Button>
          )}
        </div>

        {/* Saldos resumidos — gerente vê só o próprio posto */}
        {saldos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {saldos.filter(s => !isGerente || s.posto_id === postoFixoId).map(s => {
              const pctM = Number(s.limite_mensal) > 0 ? (Number(s.gasto_mensal_patrocinio) / Number(s.limite_mensal)) * 100 : 0
              return (
                <div key={s.posto_id} className="bg-white rounded-lg border border-gray-100 p-3 shadow-sm">
                  <p className="text-[11px] font-medium text-gray-600 truncate">{s.posto_nome}</p>
                  <p className={cn('text-[13px] font-bold mt-0.5', pctM >= 100 ? 'text-red-600' : pctM >= 80 ? 'text-orange-500' : 'text-gray-800')}>
                    {fmtBRL(Number(s.gasto_mensal_patrocinio))}
                    <span className="text-[10px] font-normal text-gray-400"> / {fmtBRL(Number(s.limite_mensal))}</span>
                  </p>
                  <div className="w-full bg-gray-100 rounded-full h-1 mt-1.5 overflow-hidden">
                    <div className={cn('h-full rounded-full', pctM >= 100 ? 'bg-red-500' : pctM >= 80 ? 'bg-orange-400' : 'bg-emerald-500')}
                      style={{ width: `${Math.min(pctM, 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : lista.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Gift className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-[13px]">Nenhuma solicitação encontrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {lista.map(p => {
              const cfg = STATUS_CFG[p.status]
              const aberto = expandido === p.id
              return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* Linha principal */}
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandido(aberto ? null : p.id)}
                  >
                    <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Posto</p>
                        <p className="text-[13px] font-medium text-gray-800 truncate">{p.postos?.nome}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Patrocinado</p>
                        <p className="text-[13px] text-gray-700 truncate">{p.patrocinado}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Valor</p>
                        <p className="text-[13px] font-semibold text-gray-800">{fmtBRL(p.valor)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Evento</p>
                        <p className="text-[13px] text-gray-700">{fmtDate(p.data_evento)}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('text-[11px] shrink-0', cfg.cls)}>
                      <cfg.icon className="w-3 h-3 mr-1" />
                      {cfg.label}
                    </Badge>
                    {aberto ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  </div>

                  {/* Detalhes expandidos */}
                  {aberto && (
                    <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
                      {p.descricao && <p className="text-[13px] text-gray-600"><strong>Descrição:</strong> {p.descricao}</p>}
                      {p.motivo_reprovacao && (
                        <p className="text-[13px] text-red-600"><strong>Motivo reprovação:</strong> {p.motivo_reprovacao}</p>
                      )}
                      {p.aprovador && (
                        <p className="text-[12px] text-gray-500">Avaliado por: <strong>{p.aprovador.nome}</strong></p>
                      )}
                      {/* Comprovantes anexados */}
                      {p.marketing_comprovantes?.length > 0 && (
                        <div>
                          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1.5">Documentos anexados</p>
                          <div className="flex flex-wrap gap-2">
                            {p.marketing_comprovantes.map(c => (
                              <a key={c.id} href={c.arquivo_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[12px] text-blue-600 hover:underline bg-blue-50 px-2.5 py-1 rounded-md"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                {c.arquivo_nome ?? 'Ver documento'}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Botão anexar documento — gerente pode adicionar enquanto pendente */}
                      {podeCriar && p.status === 'pendente' && (
                        <div className="pt-1">
                          <Button size="sm" variant="outline"
                            className="text-[12px] h-8 border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => { setUploadAlvo(p.id); setShowUpload(true) }}
                          >
                            <Upload className="w-3.5 h-3.5 mr-1" />
                            {p.marketing_comprovantes?.length > 0 ? 'Adicionar documento' : 'Anexar documento assinado'}
                          </Button>
                          {p.marketing_comprovantes?.length === 0 && (
                            <p className="text-[11px] text-orange-500 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Documento obrigatório para aprovação
                            </p>
                          )}
                        </div>
                      )}
                      {/* Botões aprovação */}
                      {podeAprovar && p.status === 'pendente' && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline"
                            className="text-[12px] h-8 border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => { setPatrocinioAlvo(p.id); setAcaoAprovar('aprovar'); setShowAprovar(true) }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                          </Button>
                          <Button size="sm" variant="outline"
                            className="text-[12px] h-8 border-red-300 text-red-700 hover:bg-red-50"
                            onClick={() => { setPatrocinioAlvo(p.id); setAcaoAprovar('reprovar'); setShowAprovar(true) }}
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" /> Reprovar
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal nova solicitação */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="w-4 h-4" /> Nova Solicitação de Patrocínio
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              {/* Gerente: posto fixo (exibe nome); outros: select */}
              {isGerente ? (
                <div className="col-span-2">
                  <Label className="text-[12px]">Posto</Label>
                  <div className="mt-1 h-9 px-3 flex items-center rounded-md border border-gray-200 bg-gray-50 text-[13px] text-gray-700">
                    {saldos.find(s => s.posto_id === postoFixoId)?.posto_nome ?? 'Seu posto'}
                  </div>
                </div>
              ) : (
                <div className="col-span-2">
                  <Label className="text-[12px]">Posto *</Label>
                  <Select value={form.posto_id} onValueChange={v => setForm(f => ({ ...f, posto_id: v }))}>
                    <SelectTrigger className="h-9 text-[13px] mt-1">
                      <SelectValue placeholder="Selecione o posto" />
                    </SelectTrigger>
                    <SelectContent>
                      {postos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {saldoSelecionado && (
                <div className="col-span-2 bg-gray-50 rounded-lg p-2.5 text-[12px] text-gray-600 flex gap-4">
                  <span>Saldo mês: <strong className={cn(excedeMensal ? 'text-red-600' : 'text-gray-800')}>
                    {fmtBRL(Number(saldoSelecionado.limite_mensal) - Number(saldoSelecionado.gasto_mensal_patrocinio))}
                  </strong></span>
                  <span>Saldo ano: <strong className={cn(excedeAnual ? 'text-red-600' : 'text-gray-800')}>
                    {fmtBRL(Number(saldoSelecionado.limite_anual) - Number(saldoSelecionado.gasto_anual_patrocinio))}
                  </strong></span>
                </div>
              )}
              <div>
                <Label className="text-[12px]">Valor (R$) *</Label>
                <Input type="number" step="0.01" className="h-9 text-[13px] mt-1"
                  value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
              </div>
              <div>
                <Label className="text-[12px]">Data do evento *</Label>
                <Input type="date" className="h-9 text-[13px] mt-1"
                  value={form.data_evento} onChange={e => setForm(f => ({ ...f, data_evento: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-[12px]">Patrocinado *</Label>
                <Input className="h-9 text-[13px] mt-1" placeholder="Nome da pessoa ou entidade"
                  value={form.patrocinado} onChange={e => setForm(f => ({ ...f, patrocinado: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-[12px]">Descrição</Label>
                <Input className="h-9 text-[13px] mt-1" placeholder="Descreva o patrocínio (opcional)"
                  value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-[12px]">Documento assinado</Label>
                <div className="mt-1 border-2 border-dashed border-gray-200 rounded-lg p-3 text-center cursor-pointer hover:border-blue-300 transition-colors"
                  onClick={() => document.getElementById('file-pat')?.click()}
                >
                  <Upload className="w-5 h-5 mx-auto text-gray-400 mb-1" />
                  <p className="text-[12px] text-gray-500">
                    {arquivo ? arquivo.name : 'Clique para selecionar PDF, JPG ou PNG'}
                  </p>
                  <input id="file-pat" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                    onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
                </div>
              </div>
              {(excedeMensal || excedeAnual) && (
                <div className="col-span-2 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5 text-[12px]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {excedeAnual ? 'Valor excede o limite anual disponível' : 'Valor excede o limite mensal disponível'}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={salvar} disabled={saving || !!(excedeMensal || excedeAnual)}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Enviar Solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal upload de documento */}
      <Dialog open={showUpload} onOpenChange={v => { setShowUpload(v); if (!v) setUploadArquivo(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> Anexar Documento
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <p className="text-[12px] text-gray-500 mb-3">
              Anexe o documento assinado pelo patrocinado (PDF, JPG ou PNG).
            </p>
            <div
              className="border-2 border-dashed border-gray-200 rounded-lg p-5 text-center cursor-pointer hover:border-blue-300 transition-colors"
              onClick={() => document.getElementById('file-upload-doc')?.click()}
            >
              <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
              <p className="text-[13px] text-gray-600 font-medium">
                {uploadArquivo ? uploadArquivo.name : 'Clique para selecionar arquivo'}
              </p>
              <p className="text-[11px] text-gray-400 mt-1">PDF, JPG ou PNG — máx. 10 MB</p>
              <input
                id="file-upload-doc"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={e => setUploadArquivo(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowUpload(false)}>Cancelar</Button>
            <Button size="sm" onClick={enviarDocumento} disabled={uploadando || !uploadArquivo}>
              {uploadando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Enviar Documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal aprovar/reprovar */}
      <Dialog open={showAprovar} onOpenChange={setShowAprovar}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{acaoAprovar === 'aprovar' ? 'Aprovar Patrocínio' : 'Reprovar Patrocínio'}</DialogTitle>
          </DialogHeader>
          {acaoAprovar === 'reprovar' && (
            <div className="py-2">
              <Label className="text-[12px]">Motivo da reprovação</Label>
              <Input className="mt-1 text-[13px]" placeholder="Informe o motivo"
                value={motivoReprov} onChange={e => setMotivoReprov(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAprovar(false)}>Cancelar</Button>
            <Button size="sm"
              className={acaoAprovar === 'reprovar' ? 'bg-red-600 hover:bg-red-700' : ''}
              onClick={executarAcao} disabled={aprovando}
            >
              {aprovando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {acaoAprovar === 'aprovar' ? 'Confirmar Aprovação' : 'Confirmar Reprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
