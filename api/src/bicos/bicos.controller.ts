import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminOnly, GerenteOuAdmin } from '../common/decorators/roles.decorator';
import { UsuarioAtual } from '../common/decorators/usuario-atual.decorator';
import { BicosService } from './bicos.service';

@ApiTags('Bicos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bicos')
export class BicosController {
  constructor(private service: BicosService) {}

  @Get()
  listar(@UsuarioAtual() usuario: any) {
    return this.service.listar(usuario);
  }

  @Get('posto/:posto_id')
  listarPorPosto(@Param('posto_id') posto_id: string) {
    return this.service.listarPorPosto(posto_id);
  }

  @Post()
  @AdminOnly()
  criar(@Body() body: any, @UsuarioAtual() usuario: any) {
    return this.service.criar(body, usuario);
  }

  @Put(':id/preco')
  @GerenteOuAdmin()
  atualizarPreco(
    @Param('id') id: string,
    @Body() body: { preco_base: number },
    @UsuarioAtual() usuario: any,
  ) {
    return this.service.atualizarPrecoBase(id, body.preco_base, usuario);
  }

  @Put('descontos/posto')
  @GerenteOuAdmin()
  atualizarDescontos(
    @Body() body: { posto_id: string; produto_id: string; desconto_nivel1: number; desconto_nivel2: number },
    @UsuarioAtual() usuario: any,
  ) {
    return this.service.atualizarDescontos(
      body.posto_id, body.produto_id,
      body.desconto_nivel1, body.desconto_nivel2,
      usuario,
    );
  }

  @Delete(':id')
  @AdminOnly()
  remover(@Param('id') id: string, @UsuarioAtual() usuario: any) {
    return this.service.remover(id, usuario);
  }
}
