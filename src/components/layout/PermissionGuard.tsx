'use client'

import { type Permission } from '@/lib/utils/permissions'
import { useAuthContext } from '@/contexts/AuthContext'

interface PermissionGuardProps {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function PermissionGuard({ permission, children, fallback = null }: PermissionGuardProps) {
  const { canUser } = useAuthContext()
  if (!canUser(permission)) return <>{fallback}</>
  return <>{children}</>
}
