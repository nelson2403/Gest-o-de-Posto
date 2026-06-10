import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'
import { verificarSenha, criarSessao } from '@/lib/caixa-auth'

async function buscarFuncionarioAS(codigo: string) {
  try {
    const rows = await queryAS<any>(`
      SELECT grid::bigint, nome::text, empresa::bigint
      FROM funcionario WHERE codigo::text = $1 LIMIT 1
    `, [codigo])
    return rows[0] ?? null
  } catch { return null }
}

async function resolverPosto(empresaGrid: number | null) {
  const admin = createAdminClient()
  if (empresaGrid) {
    const { data } = await admin
      .from('postos').select('id, nome')
      .eq('codigo_empresa_externo', String(empresaGrid)).single()
    if (data) return { admin, posto_id: data.id as string, posto_nome: data.nome as string }
  }
  const { data } = await admin.from('postos').select('id, nome').limit(1).single()
  return { admin, posto_id: (data?.id ?? null) as string | null, posto_nome: (data?.nome ?? '') as string }
}

async function buscarFrentista(admin: ReturnType<typeof createAdminClient>, posto_id: string, login: string) {
  const { data } = await admin
    .from('frentistas')
    .select('id, nome, senha_hash, codigo_operador_as')
    .eq('posto_id', posto_id)
    .or(`codigo_operador_as.eq.${login},codigo.eq.${login}`)
    .limit(1)
  return (data as any[])?.[0] ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { login?: string; pin?: string }
    const login = body.login?.trim()
    if (!login) return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 })

    const func = await buscarFuncionarioAS(login)
    if (!func) return NextResponse.json({ error: 'Código não encontrado no sistema' }, { status: 401 })

    const nome = String(func.nome ?? login)
    const empresaGrid = func.empresa ? Number(func.empresa) : null

    const { admin, posto_id, posto_nome } = await resolverPosto(empresaGrid)

    // Sem PIN: só verifica se código existe e informa se é primeiro acesso
    if (!body.pin) {
      let first_login = true
      if (posto_id) {
        const fr = await buscarFrentista(admin, posto_id, login)
        first_login = !fr || !fr.senha_hash || fr.senha_hash === 'autosystem'
      }
      return NextResponse.json({ nome, first_login })
    }

    // Com PIN: autentica
    const pin = body.pin
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN deve ter 4 a 8 dígitos' }, { status: 400 })
    }

    if (!posto_id) return NextResponse.json({ error: 'Posto não configurado no sistema' }, { status: 500 })

    const frentista = await buscarFrentista(admin, posto_id, login)

    if (!frentista || !frentista.senha_hash || frentista.senha_hash === 'autosystem') {
      return NextResponse.json({ error: 'PIN não configurado. Faça seu primeiro acesso.' }, { status: 401 })
    }

    if (!verificarSenha(pin, frentista.senha_hash)) {
      return NextResponse.json({ error: 'PIN incorreto' }, { status: 401 })
    }

    if (frentista.nome !== nome) {
      await admin.from('frentistas')
        .update({ nome, atualizado_em: new Date().toISOString() })
        .eq('id', frentista.id)
    }

    // ── Anti-fraude: 1 acesso por fechamento ────────────────────────────────
    // (1) Já enviou o fechamento de hoje? bloqueia.
    const hojeBrasil = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const { data: jaFez } = await admin
      .from('frentista_fechamentos')
      .select('id')
      .eq('frentista_id', frentista.id)
      .eq('data_fechamento', hojeBrasil)
      .maybeSingle()

    if (jaFez) {
      return NextResponse.json({
        error: 'Você já fez o fechamento de hoje. Procure o responsável se precisar refazer.',
      }, { status: 409 })
    }

    // (2) Já existe sessão ativa? significa que já iniciou (e recarregou a
    // página). Bloqueia o re-login para não voltar à tela de valores e refazer.
    // (A sessão é apagada ao enviar o fechamento; expira sozinha em 12h.)
    const { data: sessaoAtiva } = await admin
      .from('frentista_sessoes')
      .select('id')
      .eq('frentista_id', frentista.id)
      .gt('expira_em', new Date().toISOString())
      .limit(1)

    if (sessaoAtiva && sessaoAtiva.length > 0) {
      return NextResponse.json({
        error: 'Você já iniciou o fechamento. Não é possível acessar novamente. Procure o responsável se precisar refazer.',
      }, { status: 409 })
    }

    const token = await criarSessao(frentista.id)
    return NextResponse.json({
      token,
      frentista: {
        id:                 frentista.id,
        nome,
        codigo:             login,
        posto_id,
        posto_nome,
        empresa_grid:       empresaGrid ? String(empresaGrid) : null,
        codigo_operador_as: frentista.codigo_operador_as ?? login,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
