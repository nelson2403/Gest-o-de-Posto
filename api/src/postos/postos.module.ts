import { Module } from '@nestjs/common';
import { PostosService } from './postos.service';
import { PostosController } from './postos.controller';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [AuditoriaModule],
  providers: [PostosService],
  controllers: [PostosController],
  exports: [PostosService],
})
export class PostosModule {}
