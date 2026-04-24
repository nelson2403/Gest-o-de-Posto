import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminOnly } from '../common/decorators/roles.decorator';
import { ProdutosService } from './produtos.service';

@ApiTags('Produtos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('produtos')
export class ProdutosController {
  constructor(private service: ProdutosService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  @AdminOnly()
  criar(@Body() body: { nome: string }) {
    return this.service.criar(body);
  }

  @Put(':id')
  @AdminOnly()
  atualizar(@Param('id') id: string, @Body() body: { nome?: string; ativo?: boolean }) {
    return this.service.atualizar(id, body);
  }
}
