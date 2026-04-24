import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthService {
  constructor(
    private supabase: SupabaseService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, senha: string) {
    const { data: usuario, error } = await this.supabase.db
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .eq('ativo', true)
      .single();

    if (error || !usuario) throw new UnauthorizedException('Credenciais inválidas');

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) throw new UnauthorizedException('Credenciais inválidas');

    const payload = {
      sub: usuario.id,
      email: usuario.email,
      role: usuario.role,
      posto_id: usuario.posto_id,
    };

    return {
      access_token: this.jwtService.sign(payload),
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role,
        posto_id: usuario.posto_id,
      },
    };
  }
}
