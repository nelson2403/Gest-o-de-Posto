import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_TABLES = ['acessos_anydesk', 'acessos_unificados', 'acessos_postos', 'servidores_postos', 'postos']

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

  const { tabela, registro_id, campo = 'senha' } = await req.json()

  if (!ALLOWED_TABLES.includes(tabela)) {
    return new Response(JSON.stringify({ error: 'Tabela não permitida' }), { status: 403 })
  }

  // Verifica role do usuário
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('role')
    .eq('id', user.id)
    .single()

  // Apenas master e admin revelam senha de servidores e anydesk
  if (['servidores_postos', 'acessos_anydesk'].includes(tabela) && usuario?.role === 'operador') {
    return new Response(JSON.stringify({ error: 'Sem permissão para revelar esta senha' }), { status: 403 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await admin
    .from(tabela)
    .select(campo)
    .eq('id', registro_id)
    .single()

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  // Registra no audit_log
  await admin.from('audit_logs').insert({
    tabela,
    registro_id,
    usuario_id: user.id,
    acao: 'VIEW_SECRET',
    dados_novos: { campo, acao: 'senha_revelada' }
  })

  return new Response(JSON.stringify({ valor: data[campo] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  })
})
