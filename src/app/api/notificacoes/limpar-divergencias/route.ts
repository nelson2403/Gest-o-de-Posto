import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST — limpa todas as notificações de divergências
export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient()

    // Deleta todas as notificações de divergência
    const { data, error } = await admin
      .from('notificacoes')
      .delete()
      .in('tipo', ['divergencia_extrato', 'divergencia_resolvida'])
      .select()

    if (error) throw error

    return NextResponse.json({
      removidas: data?.length ?? 0,
      mensagem: 'Notificações de divergência removidas com sucesso'
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
