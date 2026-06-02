import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { queryAS } from '@/lib/autosystem'

function decode(b: Buffer | null | undefined): string {
  if (!b) return ''
  return Buffer.isBuffer(b) ? b.toString('latin1') : String(b)
}

export interface MaquininhaAS {
  serial:      string
  porta:       number | null
  conta:       string | null
  empresa_grid: number
  empresa_nome: string
  posto_id:    string | null
  posto_nome:  string | null
  ip:          string | null
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const admin = createAdminClient()

    // Busca postos e servidores do Supabase
    const [{ data: postos }, { data: servidores }] = await Promise.all([
      admin.from('postos').select('id, nome, codigo_empresa_externo').not('codigo_empresa_externo', 'is', null),
      admin.from('servidores_postos').select('posto_id, ip, porta'),
    ])

    const postoByEmpresa = new Map<number, { id: string; nome: string }>(
      (postos ?? []).map((p: any) => [Number(p.codigo_empresa_externo), { id: String(p.id), nome: String(p.nome) }])
    )
    const servidorByPosto = new Map<string, { ip: string | null; porta: number | null }>(
      (servidores ?? []).map((s: any) => [String(s.posto_id), { ip: s.ip as string | null, porta: s.porta as number | null }])
    )

    // Busca maquininhas do AUTOSYSTEM
    const rows = await queryAS<{
      empresa: number
      serial_b: Buffer | null
      porta: number | null
      conta: string | null
      nome_b: Buffer | null
    }>(
      `SELECT sc.empresa::bigint,
              sc.serial::bytea  AS serial_b,
              sc.porta::int,
              sc.conta::text,
              e.nome::bytea     AS nome_b
       FROM smartpostef_config sc
       LEFT JOIN empresa e ON e.grid = sc.empresa
       WHERE (sc.inativo = false OR sc.inativo IS NULL)
         AND sc.serial IS NOT NULL AND sc.serial <> ''
       ORDER BY e.nome, sc.porta`,
      [],
    )

    const maquininhas: MaquininhaAS[] = rows.map(r => {
      const serial       = decode(r.serial_b as Buffer | null).trim()
      const empresa_nome = decode(r.nome_b as Buffer | null).trim()
      const posto       = postoByEmpresa.get(Number(r.empresa))
      const servidor    = posto ? servidorByPosto.get(posto.id) : null

      return {
        serial,
        porta:        r.porta,
        conta:        r.conta,
        empresa_grid: Number(r.empresa),
        empresa_nome,
        posto_id:     posto?.id ?? null,
        posto_nome:   posto?.nome ?? empresa_nome,
        ip:           servidor?.ip ?? null,
      }
    })

    return NextResponse.json({ maquininhas })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
