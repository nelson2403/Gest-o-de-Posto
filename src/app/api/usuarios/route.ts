import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabaseUser = await createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: requester } = await supabaseUser
    .from('usuarios')
    .select('role, empresa_id')
    .eq('id', user.id)
    .single()

  if (!requester || requester.role !== 'master') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { nome, email, senha, role, empresa_id, posto_fechamento_id, postos_caixa } = await request.json()

  if (!nome || !email || !senha || !role) {
    return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Passo 1: tenta criar o usuário no Auth ───────────────────────────────
  let newUserId: string

  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })

  if (authError) {
    // E-mail já existe no Auth — busca o usuário existente por e-mail
    if (!authError.message.toLowerCase().includes('already')) {
      console.error('[usuarios POST] auth error:', authError.message)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Percorre páginas para encontrar o usuário pelo e-mail
    let foundId: string | null = null
    let page = 1
    while (!foundId) {
      const { data: pageData, error: listErr } = await adminSupabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (listErr || !pageData?.users?.length) break
      const match = pageData.users.find(u => u.email?.toLowerCase() === email.toLowerCase())
      if (match) { foundId = match.id; break }
      if (pageData.users.length < 1000) break
      page++
    }

    if (!foundId) {
      return NextResponse.json({ error: 'E-mail já registrado e não foi possível recuperar o usuário.' }, { status: 400 })
    }

    // Atualiza a senha do usuário existente
    const { error: updErr } = await adminSupabase.auth.admin.updateUserById(foundId, {
      password: senha,
      email_confirm: true,
    })
    if (updErr) {
      console.error('[usuarios POST] updateUserById error:', updErr.message)
      return NextResponse.json({ error: updErr.message }, { status: 400 })
    }
    newUserId = foundId
  } else {
    newUserId = authData.user.id
  }

  const resolvedEmpresaId = empresa_id || requester.empresa_id

  // ── Passo 2: remove registro antigo com mesmo e-mail (id diferente) ──────
  await adminSupabase.from('usuarios').delete().eq('email', email).neq('id', newUserId)

  // ── Passo 3: upsert do usuário na tabela interna ─────────────────────────
  const { error: insertError } = await adminSupabase.from('usuarios').upsert({
    id: newUserId,
    nome,
    email,
    role,
    empresa_id: resolvedEmpresaId,
    posto_fechamento_id: (role === 'operador_caixa' || role === 'gerente') ? (posto_fechamento_id || null) : null,
    ativo: true,
  }, { onConflict: 'id' })

  if (insertError) {
    console.error('[usuarios POST] insert error:', insertError.message)
    return NextResponse.json({ error: insertError.message }, { status: 400 })
  }

  // Operador caixa: insere postos na junction table
  if (role === 'operador_caixa' && Array.isArray(postos_caixa) && postos_caixa.length > 0) {
    await adminSupabase.from('usuario_postos_caixa').delete().eq('usuario_id', newUserId)
    const { error: junctionError } = await adminSupabase
      .from('usuario_postos_caixa')
      .insert(postos_caixa.map((pid: string) => ({ usuario_id: newUserId, posto_id: pid })))
    if (junctionError) console.error('[usuarios POST] junction error:', junctionError.message)
  }

  return NextResponse.json({ success: true, id: newUserId })
}

export async function PATCH(request: Request) {
  const supabaseUser = await createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: requester } = await supabaseUser
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()

  if (requester?.role !== 'master') {
    return NextResponse.json({ error: 'Apenas master pode redefinir senhas' }, { status: 403 })
  }

  const { userId, novaSenha } = await request.json()
  if (!userId || !novaSenha) {
    return NextResponse.json({ error: 'userId e novaSenha são obrigatórios' }, { status: 400 })
  }
  if (novaSenha.length < 6) {
    return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 })
  }

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await adminSupabase.auth.admin.updateUserById(userId, { password: novaSenha })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabaseUser = await createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: requester } = await supabaseUser
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()

  if (requester?.role !== 'master') {
    return NextResponse.json({ error: 'Apenas master pode excluir usuários' }, { status: 403 })
  }

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 })
  if (userId === user.id) return NextResponse.json({ error: 'Você não pode excluir a si mesmo' }, { status: 400 })

  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── Limpa referências que bloqueiam a exclusão (senão o Supabase retorna
  //    "Database error deleting user") ────────────────────────────────────────
  // Junções de postos (conciliador / operador de caixa)
  await adminSupabase.from('usuario_postos_fechamento').delete().eq('usuario_id', userId)
  await adminSupabase.from('usuario_postos_caixa').delete().eq('usuario_id', userId)
  // Reatribui ao master que está excluindo as tabelas com usuario_id NOT NULL
  // (tarefas / tarefas_recorrentes) — preserva o histórico.
  for (const tab of ['tarefas', 'tarefas_recorrentes']) {
    await adminSupabase.from(tab).update({ usuario_id: user.id }).eq('usuario_id', userId)
  }
  // Remove o registro interno. Se alguma outra tabela ainda referenciar o usuário
  // por usuario_id, reatribui ao master e tenta de novo (trata FKs desconhecidas).
  let usuariosErr: any = null
  for (let i = 0; i < 8; i++) {
    const { error } = await adminSupabase.from('usuarios').delete().eq('id', userId)
    if (!error) { usuariosErr = null; break }
    usuariosErr = error
    const tab = error.message.match(/on table "(\w+)"/)?.[1]
    if (!tab) break
    const { error: reErr } = await adminSupabase.from(tab).update({ usuario_id: user.id }).eq('usuario_id', userId)
    if (reErr) { usuariosErr = reErr; break }
  }
  if (usuariosErr) {
    return NextResponse.json({ error: `Ainda há dados vinculados ao usuário: ${usuariosErr.message}` }, { status: 400 })
  }

  const { error } = await adminSupabase.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
