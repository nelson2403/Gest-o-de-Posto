import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarPessoasFuncionariosPorEmpresa } from '@/lib/autosystem'

// Lista pessoas/funcionários do AUTOSYSTEM para serem adicionadas como membros.
// Filtra pelo posto (resolve para codigo_empresa_externo) e, opcionalmente,
// por busca textual no nome. Retorna até 500 registros.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const sp     = new URL(req.url).searchParams
  const postoId = sp.get('posto_id')
  const busca   = sp.get('busca') ?? undefined

  if (!postoId) return NextResponse.json({ error: 'posto_id é obrigatório' }, { status: 400 })

  const admin = createAdminClient()
  const { data: posto, error } = await admin
    .from('postos')
    .select('codigo_empresa_externo, nome')
    .eq('id', postoId)
    .single()
  if (error || !posto) {
    return NextResponse.json({ error: 'Posto não encontrado' }, { status: 404 })
  }
  if (!posto.codigo_empresa_externo) {
    return NextResponse.json({
      error: 'Posto sem código de empresa AUTOSYSTEM configurado',
    }, { status: 400 })
  }

  const empresaId = parseInt(posto.codigo_empresa_externo)
  if (Number.isNaN(empresaId)) {
    return NextResponse.json({ error: 'codigo_empresa_externo inválido' }, { status: 400 })
  }

  try {
    const pessoas = await buscarPessoasFuncionariosPorEmpresa(empresaId, busca)
    return NextResponse.json({ pessoas, posto_nome: posto.nome })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao consultar AUTOSYSTEM'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
