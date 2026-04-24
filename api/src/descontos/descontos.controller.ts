import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNumber, IsUUID, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { GerenteOuAdmin } from '../common/decorators/roles.decorator';
import { UsuarioAtual } from '../common/decorators/usuario-atual.decorator';
import { DescontosService } from './descontos.service';

class DefinirDescontoDto {
  @IsUUID()
  produto_id: string;

  @IsNumber()
  @Min(0)
  valor: number;
}

@ApiTags('Descontos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('descontos')
export class DescontosController {
  constructor(private service: DescontosService) {}

  @Get()
  listarTodos(@UsuarioAtual() usuario: any) {
    return this.service.listarTodos(usuario);
  }

  @Get('posto/:posto_id')
  listarPorPosto(@Param('posto_id') posto_id: string) {
    return this.service.listarPorPosto(posto_id);
  }

  @Put('posto/:posto_id')
  @GerenteOuAdmin()
  definir(
    @Param('posto_id') posto_id: string,
    @Body() body: DefinirDescontoDto,
    @UsuarioAtual() usuario: any,
  ) {
    return this.service.definir(posto_id, body.produto_id, body.valor, usuario);
  }
}
