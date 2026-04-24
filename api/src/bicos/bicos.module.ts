import { Module } from '@nestjs/common';
import { BicosService } from './bicos.service';
import { BicosController } from './bicos.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [AuditoriaModule],
  providers: [BicosService],
  controllers: [BicosController],
  exports: [BicosService],
})
export class BicosModule {}
