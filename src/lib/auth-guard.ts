import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Ok   = { ok: true;  user: { id: string }; role: string | null }
type Fail = { ok: false; resp: NextResponse }

// Exige usuário autenticado. Defesa em profundidade junto ao middleware:
// garante que a própria rota rejeite acesso sem sessão.
export async function exigirUsuario(): Promise<Ok | Fail> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, resp: NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) }
  const { data: u } = await supabase.from('usuarios').select('role').eq('id', user.id).single()
  return { ok: true, user: { id: user.id }, role: (u?.role ?? null) as string | null }
}

// Exige usuário autenticado COM uma das funções permitidas.
export async function exigirRole(roles: string[]): Promise<Ok | Fail> {
  const r = await exigirUsuario()
  if (!r.ok) return r
  if (!r.role || !roles.includes(r.role)) {
    return { ok: false, resp: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  }
  return r
}

// Conjuntos de funções comuns.
export const ADMINS = ['master', 'adm_financeiro', 'adm_fiscal', 'adm_transpombal', 'adm_contas_pagar', 'adm_marketing', 'adm_gerente']
