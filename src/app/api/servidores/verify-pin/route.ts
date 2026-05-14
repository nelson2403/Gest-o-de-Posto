import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  const { pin } = await req.json()
  const correct = process.env.SERVIDORES_PIN

  if (!correct || pin !== correct) {
    return NextResponse.json({ ok: false }, { status: 403 })
  }

  return NextResponse.json({ ok: true })
}
