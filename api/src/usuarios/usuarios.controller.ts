import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { UsuariosService } from './usuarios.service';

@ApiTags('Usuários')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AdminOnly()
@Controller('usuarios')
export class UsuariosController {
  constructor(private service: UsuariosService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  criar(@Body() body: any) {
    return this.service.criar(body);
  }

  @Put(':id/senha')
  alterarSenha(@Param('id') id: string, @Body() body: { senha: string }) {
    return this.service.alterarSenha(id, body.senha);
  }

  @Put(':id/status')
  alterarStatus(@Param('id') id: string, @Body() body: { ativo: boolean }) {
    return this.service.alterarStatus(id, body.ativo);
  }
}
