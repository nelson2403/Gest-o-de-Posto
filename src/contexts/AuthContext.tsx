'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { can, setPermissoesEfetivasGlobal, type Permission } from '@/lib/utils/permissions'
import type { Usuario, Role } from '@/types/database.types'

interface AuthContextType {
  usuario: Usuario | null
  loading: boolean
  permissoes_efetivas: string[] | null
  canUser: (permission: Permission) => boolean
  /** Recarrega as permissões do usuário atual do banco (use após alterar overrides de cargo) */
  refreshPermissions: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  usuario: null,
  loading: true,
  permissoes_efetivas: null,
  canUser: () => false,
  refreshPermissions: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [permissoes_efetivas, setPermissoesEfetivasState] = useState<string[] | null>(null)

  // Wrapper que atualiza o estado React E a variável global usada por can()
  const setPermissoesEfetivas = (p: string[] | null) => {
    setPermissoesEfetivasState(p)
    setPermissoesEfetivasGlobal(p)
  }
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Ref para acessar usuario atual dentro do refreshPermissions sem closure stale
  const usuarioRef = useRef<Usuario | null>(null)
  useEffect(() => { usuarioRef.current = usuario }, [usuario])

  /** Carrega apenas as permissões efetivas para o usuário/role atual */
  const loadPermissions = useCallback(async (role: Role, perfilId: string | null) => {
    if (perfilId) {
      // Perfil customizado individual
      const { data } = await supabase
        .from('perfis_permissoes')
        .select('permissoes')
        .eq('id', perfilId)
        .maybeSingle()
      setPermissoesEfetivas(data?.permissoes?.length > 0 ? data.permissoes : null)
    } else {
      // Verifica override do cargo no DB
      const { data } = await supabase
        .from('perfis_permissoes')
        .select('permissoes')
        .eq('is_role_override', true)
        .eq('role_override', role)
        .maybeSingle()
      setPermissoesEfetivas(data?.permissoes?.length > 0 ? data.permissoes : null)
    }
  }, [])

  /** Exposto no contexto — chame após alterar overrides de cargo/perfil */
  const refreshPermissions = useCallback(async () => {
    const u = usuarioRef.current
    if (!u) return
    await loadPermissions(u.role, u.perfil_id ?? null)
  }, [loadPermissions])

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setUsuario(null)
        setPermissoesEfetivas(null)
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('usuarios')
        .select('*, empresa:empresas(*), perfil:perfis_permissoes(id, nome, permissoes)')
        .eq('id', user.id)
        .single()

      if (data) {
        setUsuario(data as Usuario)
        await loadPermissions(data.role, data.perfil_id ?? null)
        setLoading(false)
        return
      }

      if (error) {
        const { data: { session } } = await supabase.auth.getSession()
        const claims = session?.access_token
          ? JSON.parse(atob(session.access_token.split('.')[1]))
          : null

        const roleFromClaim = claims?.user_role as Role | undefined
        const empresaIdFromClaim = claims?.user_empresa_id as string | undefined

        if (roleFromClaim) {
          const usuarioFallback: Usuario = {
            id:           user.id,
            nome:         user.user_metadata?.nome ?? user.email?.split('@')[0] ?? 'Usuário',
            email:        user.email ?? '',
            empresa_id:   empresaIdFromClaim ?? null,
            role:         roleFromClaim,
            perfil_id:    null,
            posto_fechamento_id: null,
            ativo:        true,
            criado_em:    user.created_at ?? new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          }
          setUsuario(usuarioFallback)
          await loadPermissions(roleFromClaim, null)
          setLoading(false)
          return
        }

        console.warn('[AuthContext] Usuário autenticado sem registro em public.usuarios.')
        const usuarioMinimo: Usuario = {
          id:           user.id,
          nome:         user.user_metadata?.nome ?? user.email?.split('@')[0] ?? 'Usuário',
          email:        user.email ?? '',
          empresa_id:   null,
          role:         'master',
          perfil_id:    null,
          posto_fechamento_id: null,
          ativo:        true,
          criado_em:    user.created_at ?? new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        }
        setUsuario(usuarioMinimo)
        setPermissoesEfetivas(null)
      }

      setLoading(false)
    }

    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUsuario(null)
        setPermissoesEfetivas(null)
      } else {
        loadUser()
      }
    })

    // Recarrega permissões quando o usuário volta para a aba (troca de aba)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshPermissions()
    }
    // Recarrega quando outro componente sinaliza que permissões mudaram
    const handlePermissionsChanged = () => { refreshPermissions() }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('permissions-changed', handlePermissionsChanged)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('permissions-changed', handlePermissionsChanged)
    }
  }, [])

  const canUser = useCallback((permission: Permission): boolean => {
    if (permissoes_efetivas != null) return permissoes_efetivas.includes(permission)
    return can(usuario?.role ?? null, permission)
  }, [usuario, permissoes_efetivas])

  async function signOut() {
    await supabase.auth.signOut()
    setUsuario(null)
    setPermissoesEfetivas(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ usuario, loading, permissoes_efetivas, canUser, refreshPermissions, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => useContext(AuthContext)
