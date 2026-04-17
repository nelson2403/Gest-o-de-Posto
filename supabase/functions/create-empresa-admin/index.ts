import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // Verifica se é master
  const { data: requester } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()

  if (requester?.role !== 'master') {
    return new Response(JSON.stringify({ error: 'Apenas master pode criar empresas' }), { status: 403 })
  }

  const { empresa, adminUser } = await req.json()

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // 1. Criar empresa
  const { data: novaEmpresa, error: empresaError } = await admin
    .from('empresas')
    .insert({
      nome: empresa.nome,
      cnpj: empresa.cnpj || null,
      email: empresa.email || null,
      status: 'ativo',
    })
    .select()
    .single()

  if (empresaError) {
    return new Response(JSON.stringify({ error: empresaError.message }), { status: 400 })
  }

  // 2. Criar usuário admin no Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: adminUser.email,
    password: adminUser.senha,
    email_confirm: true,
  })

  if (authError) {
    // Rollback: deletar empresa criada
    await admin.from('empresas').delete().eq('id', novaEmpresa.id)
    return new Response(JSON.stringify({ error: authError.message }), { status: 400 })
  }

  // 3. Criar registro de usuário
  await admin.from('usuarios').insert({
    id: authData.user.id,
    nome: adminUser.nome,
    email: adminUser.email,
    role: 'admin',
    empresa_id: novaEmpresa.id,
    ativo: true,
  })

  return new Response(JSON.stringify({ empresa: novaEmpresa, usuario: { id: authData.user.id } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})
