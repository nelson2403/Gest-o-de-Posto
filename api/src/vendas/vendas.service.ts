import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class VendasService {
  constructor(private supabase: SupabaseService) {}

  async listar(usuario: any, filtros: { posto_id?: string; de?: string; ate?: string }) {
    let query = this.supabase.db
      .from('vendas')
      .select('*, postos(nome)')
      .order('realizado_em', { ascending: false })
      .limit(500);

    if (usuario.role < 2 && usuario.posto_id) {
      query = query.eq('posto_id', usuario.posto_id);
    } else if (filtros.posto_id) {
      query = query.eq('posto_id', filtros.posto_id);
    }

    if (filtros.de) query = query.gte('realizado_em', filtros.de);
    if (filtros.ate) query = query.lte('realizado_em', filtros.ate);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async registrar(dto: any) {
    const { data, error } = await this.supabase.db
      .from('vendas')
      .insert(dto)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
