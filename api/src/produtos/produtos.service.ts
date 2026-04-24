import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ProdutosService {
  constructor(private supabase: SupabaseService) {}

  async listar() {
    const { data, error } = await this.supabase.db
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    return data;
  }

  async criar(dto: { nome: string }) {
    const { data, error } = await this.supabase.db
      .from('produtos')
      .insert(dto)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async atualizar(id: string, dto: { nome?: string; ativo?: boolean }) {
    const { data, error } = await this.supabase.db
      .from('produtos')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}
