import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const ITERACOES = 100_000
const TAMANHO   = 64
const DIGEST    = 'sha512'
const SEPARADOR = ':'

export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(senha, salt, ITERACOES, TAMANHO, DIGEST).toString('hex')
  return `${salt}${SEPARADOR}${hash}`
}

export function verificarSenha(senha: string, armazenado: string): boolean {
  const idx  = armazenado.indexOf(SEPARADOR)
  if (idx < 0) return false
  const salt = armazenado.slice(0, idx)
  const hash = armazenado.slice(idx + 1)
  try {
    const verify = crypto.pbkdf2Sync(senha, salt, ITERACOES, TAMANHO, DIGEST).toString('hex')
    const a = Buffer.from(hash,   'hex')
    const b = Buffer.from(verify, 'hex')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const EXPIRACAO_HORAS = 12

export async function criarSessao(frentistaId: string): Promise<string> {
  const admin = createAdminClient()
  const token = crypto.randomUUID()
  const expira = new Date(Date.now() + EXPIRACAO_HORAS * 3600 * 1000).toISOString()

  const { error } = await admin
    .from('frentista_sessoes')
    .insert({ frentista_id: frentistaId, token, expira_em: expira })

  if (error) throw new Error('Erro ao criar sessão: ' + error.message)
  return token
}

export interface SessaoInfo {
  frentista_id:     string
  nome:             string
  codigo:           string
  posto_id:         string
  codigo_operador_as: string | null
}

export async function validarSessao(token: string): Promise<SessaoInfo | null> {
  if (!token) return null
  const admin = createAdminClient()

  const { data: sessao } = await admin
    .from('frentista_sessoes')
    .select('frentista_id, expira_em')
    .eq('token', token)
    .single()

  if (!sessao) return null
  if (new Date(sessao.expira_em) < new Date()) return null

  const { data: frentista } = await admin
    .from('frentistas')
    .select('id, nome, codigo, posto_id, codigo_operador_as, ativo')
    .eq('id', sessao.frentista_id)
    .single()

  if (!frentista || !frentista.ativo) return null

  return {
    frentista_id:       frentista.id,
    nome:               frentista.nome,
    codigo:             frentista.codigo,
    posto_id:           frentista.posto_id,
    codigo_operador_as: frentista.codigo_operador_as,
  }
}

export function extrairToken(req: Request): string {
  const auth = req.headers.get('authorization') ?? ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}
