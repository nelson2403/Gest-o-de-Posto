import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsuarioAtual } from '../common/decorators/usuario-atual.decorator';
import { VendasService } from './vendas.service';

@ApiTags('Vendas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendas')
export class VendasController {
  constructor(private service: VendasService) {}

  @Get()
  listar(
    @UsuarioAtual() usuario: any,
    @Query('posto_id') posto_id?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
  ) {
    return this.service.listar(usuario, { posto_id, de, ate });
  }

  @Post()
  registrar(@Body() body: any) {
    return this.service.registrar(body);
  }
}
