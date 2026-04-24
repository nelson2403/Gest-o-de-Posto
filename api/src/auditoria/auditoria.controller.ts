import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GerenteOuAdmin } from '../common/decorators/roles.decorator';
import { AuditoriaService } from './auditoria.service';

@ApiTags('Auditoria')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@GerenteOuAdmin()
@Controller('auditoria')
export class AuditoriaController {
  constructor(private service: AuditoriaService) {}

  @Get()
  listar(
    @Query('entidade') entidade?: string,
    @Query('usuario_id') usuario_id?: string,
    @Query('limit') limit?: number,
  ) {
    return this.service.listar({ entidade, usuario_id, limit });
  }
}
