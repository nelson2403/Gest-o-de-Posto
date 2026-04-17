import { getSupabase } from './supabase'

export async function marcarInicio(tabela: string) {
  await getSupabase().from('sync_controle').upsert({
    tabela,
    status:        'executando',
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'tabela' })
}

export async function marcarOk(tabela: string, registros: number) {
  const agora = new Date().toISOString()
  await getSupabase().from('sync_controle').upsert({
    tabela,
    status:                  'ok',
    ultima_sync:             agora,
    ultima_sync_completa:    agora,
    registros_ultima_sync:   registros,
    erro:                    null,
    atualizado_em:           agora,
  }, { onConflict: 'tabela' })
}

export async function marcarErro(tabela: string, erro: string) {
  await getSupabase().from('sync_controle').upsert({
    tabela,
    status:        'erro',
    erro:          erro.slice(0, 500),
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'tabela' })
}
