import { Injectable, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class UsuariosService {
  constructor(private supabase: SupabaseService) {}

  async listar() {
    const { data, error } = await this.supabase.db
      .from('usuarios')
      .select('id, email, nome, role, posto_id, ativo, criado_em, postos(nome)')
      .order('nome');
    if (error) throw error;
    return data;
  }

  async criar(dto: { email: string; senha: string; nome: string; role: number; posto_id?: string }) {
    const { data: existente } = await this.supabase.db
      .from('usuarios').select('id').eq('email', dto.email).single();
    if (existente) throw new ConflictException('E-mail já cadastrado');

    const senha_hash = await bcrypt.hash(dto.senha, 12);

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .insert({ email: dto.email, senha_hash, nome: dto.nome, role: dto.role, posto_id: dto.posto_id || null })
      .select('id, email, nome, role, posto_id, ativo, criado_em')
      .single();
    if (error) throw error;
    return data;
  }

  async alterarSenha(id: string, senha: string) {
    const senha_hash = await bcrypt.hash(senha, 12);
    const { error } = await this.supabase.db
      .from('usuarios').update({ senha_hash }).eq('id', id);
    if (error) throw error;
    return { ok: true };
  }

  async alterarStatus(id: string, ativo: boolean) {
    const { error } = await this.supabase.db
      .from('usuarios').update({ ativo }).eq('id', id);
    if (error) throw error;
    return { ok: true };
  }
}
