import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buscarEmpresasCompleto } from '@/lib/autosystem'

export async function GET() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('postos')
    .select('sincronizado_em')
    .order('sincronizado_em', { ascending: false })
    .limit(1)
    .single()
  return NextResponse.json({ sincronizado_em: data?.sincronizado_em ?? null })
}

export async function POST() {
  const supabase = createAdminClient()

  const [empresas, { data: postos, error: postoErr }] = await Promise.all([
    buscarEmpresasCompleto(),
    supabase.from('postos').select('id, codigo_empresa_externo').not('codigo_empresa_externo', 'is', null),
  ])

  if (postoErr) return NextResponse.json({ error: postoErr.message }, { status: 500 })

  // Build lookup: codigo_empresa_externo → posto id
  const lookup: Record<string, string> = {}
  for (const p of postos ?? []) {
    if (p.codigo_empresa_externo) lookup[p.codigo_empresa_externo] = p.id
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown>[] = []

  for (const e of empresas) {
    const postoId = lookup[String(e.grid)] ?? lookup[String(e.codigo)]
    if (!postoId) continue

    // Build full address string
    const parts = [e.logradouro, e.numero, e.bairro].filter(Boolean)
    const endereco = parts.length ? parts.join(', ') : null

    // Only include fields that Autosystem actually returned — never overwrite with null
    const fields: Record<string, unknown> = { sincronizado_em: now, atualizado_em: now }
    if (e.nome)           fields.nome             = e.nome
    if (e.cnpj)           fields.cnpj             = e.cnpj
    if (endereco)         fields.endereco         = endereco
    if (e.razao_social)   fields.razao_social     = e.razao_social
    if (e.telefone)       fields.telefone         = e.telefone
    if (e.celular)        fields.celular          = e.celular
    if (e.ie)             fields.ie               = e.ie
    if (e.cep)            fields.cep              = e.cep
    if (e.bairro)         fields.bairro           = e.bairro
    if (e.cidade)         fields.cidade           = e.cidade
    if (e.uf)             fields.uf               = e.uf
    if (e.ult_alteracao)  fields.as_ult_alteracao = e.ult_alteracao

    updates.push({ id: postoId, ...fields })
  }

  // Use individual updates — never insert new rows (empresa_id NOT NULL would fail on upsert)
  const errors: string[] = []
  for (const { id, ...fields } of updates) {
    const { error } = await supabase.from('postos').update(fields).eq('id', id as string)
    if (error) errors.push(`${id}: ${error.message}`)
  }
  if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })

  return NextResponse.json({
    synced:          updates.length,
    total_empresas:  empresas.length,
    sincronizado_em: now,
  })
}
