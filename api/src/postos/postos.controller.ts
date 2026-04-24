import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminOnly, GerenteOuAdmin } from '../common/decorators/roles.decorator';
import { UsuarioAtual } from '../common/decorators/usuario-atual.decorator';
import { PostosService } from './postos.service';

@ApiTags('Postos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('postos')
export class PostosController {
  constructor(private service: PostosService) {}

  @Get()
  listar(@UsuarioAtual() usuario: any) {
    return this.service.listar(usuario);
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscar(id);
  }

  @Post()
  @AdminOnly()
  criar(@Body() body: any, @UsuarioAtual() usuario: any) {
    return this.service.criar(body, usuario);
  }

  @Put(':id')
  @GerenteOuAdmin()
  atualizar(@Param('id') id: string, @Body() body: any, @UsuarioAtual() usuario: any) {
    return this.service.atualizar(id, body, usuario);
  }

  @Put(':id/status')
  atualizarStatus(@Param('id') id: string, @Body() body: { online: boolean }) {
    return this.service.atualizarStatus(id, body.online);
  }

  @Delete(':id')
  @AdminOnly()
  remover(@Param('id') id: string, @UsuarioAtual() usuario: any) {
    return this.service.remover(id, usuario);
  }
}
