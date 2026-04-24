import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuditoriaService {
  constructor(private supabase: SupabaseService) {}

  async registrar(
    usuario: any,
    acao: string,
    entidade: string,
    entidade_id: string,
    dados_antes: any,
    dados_depois: any,
  ) {
    await this.supabase.db.from('auditoria').insert({
      usuario_id: usuario?.id,
      usuario_email: usuario?.email,
      acao,
      entidade,
      entidade_id,
      dados_antes,
      dados_depois,
    });
  }

  async listar(filtros: { entidade?: string; usuario_id?: string; limit?: number }) {
    let query = this.supabase.db
      .from('auditoria')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(filtros.limit || 100);

    if (filtros.entidade) query = query.eq('entidade', filtros.entidade);
    if (filtros.usuario_id) query = query.eq('usuario_id', filtros.usuario_id);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
}
