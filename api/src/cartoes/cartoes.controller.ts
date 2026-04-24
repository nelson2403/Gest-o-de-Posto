import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { UsuarioAtual } from '../common/decorators/usuario-atual.decorator';
import { CartoesService } from './cartoes.service';

@ApiTags('Cartões')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cartoes')
export class CartoesController {
  constructor(private service: CartoesService) {}

  @Get()
  listar(@UsuarioAtual() usuario: any) {
    return this.service.listar(usuario);
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscar(id);
  }

  @Post()
  criar(@Body() body: any, @UsuarioAtual() usuario: any) {
    return this.service.criar(body, usuario);
  }

  @Put(':id/nome')
  renomear(
    @Param('id') id: string,
    @Body() body: { nome_funcionario: string },
    @UsuarioAtual() usuario: any,
  ) {
    return this.service.renomear(id, body.nome_funcionario, usuario);
  }

  @Put(':id/status')
  alterarStatus(
    @Param('id') id: string,
    @Body() body: { ativo: boolean },
    @UsuarioAtual() usuario: any,
  ) {
    return this.service.alterarStatus(id, body.ativo, usuario);
  }

  @Put(':id/nivel')
  alterarNivel(
    @Param('id') id: string,
    @Body() body: { nivel: number },
    @UsuarioAtual() usuario: any,
  ) {
    return this.service.alterarNivel(id, body.nivel, usuario);
  }

  @Delete(':id')
  @AdminOnly()
  remover(@Param('id') id: string, @UsuarioAtual() usuario: any) {
    return this.service.remover(id, usuario);
  }

  @Get('sync/pendentes/:posto_id')
  pendentes(@Param('posto_id') posto_id: string) {
    return this.service.pendentes(posto_id);
  }

  @Put('sync/:id/sincronizado')
  marcarSincronizado(@Param('id') id: string) {
    return this.service.marcarSincronizado(id);
  }
}
