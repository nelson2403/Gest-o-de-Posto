import { Module } from '@nestjs/common';
import { VendasService } from './vendas.service';
import { VendasController } from './vendas.controller';

@Module({
  providers: [VendasService],
  controllers: [VendasController],
})
export class VendasModule {}
