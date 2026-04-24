import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UsuarioAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
