import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class PostosService {
  constructor(
    private supabase: SupabaseService,
    private auditoria: AuditoriaService,
  ) {}

  async listar(usuario: any) {
    let query = this.supabase.db.from('postos').select('*').order('nome');
    if (usuario.role < 2 && usuario.posto_id) {
      query = query.eq('id', usuario.posto_id);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async buscar(id: string) {
    const { data, error } = await this.supabase.db
      .from('postos')
      .select('*, bicos(*, produtos(nome)), descontos(*, produtos(nome))')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Posto não encontrado');
    return data;
  }

  async criar(dto: any, usuario: any) {
    const { data, error } = await this.supabase.db
      .from('postos')
      .insert(dto)
      .select()
      .single();
    if (error) throw error;
    await this.auditoria.registrar(usuario, 'POSTO_CRIADO', 'postos', data.id, null, data);
    return data;
  }

  async atualizar(id: string, dto: any, usuario: any) {
    const antes = await this.buscar(id);
    const { data, error } = await this.supabase.db
      .from('postos')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await this.auditoria.registrar(usuario, 'POSTO_ATUALIZADO', 'postos', id, antes, data);
    return data;
  }

  async atualizarStatus(id: string, online: boolean) {
    const { error } = await this.supabase.db
      .from('postos')
      .update({ online })
      .eq('id', id);
    if (error) throw error;
    return { ok: true };
  }

  async remover(id: string, usuario: any) {
    const antes = await this.buscar(id);
    const { error } = await this.supabase.db.from('postos').delete().eq('id', id);
    if (error) throw error;
    await this.auditoria.registrar(usuario, 'POSTO_REMOVIDO', 'postos', id, antes, null);
    return { ok: true };
  }
}
