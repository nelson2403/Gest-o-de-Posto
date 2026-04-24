import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { PostosModule } from './postos/postos.module';
import { ProdutosModule } from './produtos/produtos.module';
import { BicosModule } from './bicos/bicos.module';
import { DescontosModule } from './descontos/descontos.module';
import { CartoesModule } from './cartoes/cartoes.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { VendasModule } from './vendas/vendas.module';
import { AuditoriaModule } from './auditoria/auditoria.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
    PostosModule,
    ProdutosModule,
    BicosModule,
    DescontosModule,
    CartoesModule,
    UsuariosModule,
    VendasModule,
    AuditoriaModule,
  ],
})
export class AppModule {}
