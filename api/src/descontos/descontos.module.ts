import { Module } from '@nestjs/common';
import { DescontosService } from './descontos.service';
import { DescontosController } from './descontos.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [AuditoriaModule],
  providers: [DescontosService],
  controllers: [DescontosController],
  exports: [DescontosService],
})
export class DescontosModule {}
