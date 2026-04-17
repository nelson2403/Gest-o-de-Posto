'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Usuario } from '@/types/database.types'

export function useAuth() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data } = await supabase
        .from('usuarios')
        .select('*, empresa:empresas(*)')
        .eq('id', user.id)
        .single()

      setUsuario(data as Usuario)
      setLoading(false)
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUser()
    })

    return () => subscription.unsubscribe()
  }, [])

  return { usuario, role: usuario?.role ?? null, loading }
}
