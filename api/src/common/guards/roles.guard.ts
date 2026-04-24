import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.get<number>('role', context.getHandler());
    if (requiredRole === undefined) return true;
    const { user } = context.switchToHttp().getRequest();
    return user?.role >= requiredRole;
  }
}
