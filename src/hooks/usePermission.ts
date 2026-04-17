'use client'

import { can, type Permission } from '@/lib/utils/permissions'
import { useAuth } from './useAuth'

export function usePermission(permission: Permission): boolean {
  const { role } = useAuth()
  return can(role, permission)
}
