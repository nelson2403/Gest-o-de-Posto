import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class BicosService {
  constructor(
    private supabase: SupabaseService,
    private auditoria: AuditoriaService,
  ) {}

  async listar(usuario: any) {
    let query = this.supabase.db
      .from('bicos')
      .select('*, produtos(nome)')
      .order('posto_id')
      .order('bico_forecourt');
    if (usuario.role < 2 && usuario.posto_id) {
      query = query.eq('posto_id', usuario.posto_id);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async listarPorPosto(posto_id: string) {
    const { data, error } = await this.supabase.db
      .from('bicos')
      .select('*, produtos(nome)')
      .eq('posto_id', posto_id)
      .order('bico_forecourt');
    if (error) throw error;
    return data;
  }

  async criar(dto: any, usuario: any) {
    const { data, error } = await this.supabase.db
      .from('bicos')
      .insert(dto)
      .select()
      .single();
    if (error) throw error;
    await this.auditoria.registrar(usuario, 'BICO_CRIADO', 'bicos', data.id, null, data);
    return data;
  }

  async atualizarPrecoBase(id: string, preco_base: number, usuario: any) {
    const { data: antes, error: err } = await this.supabase.db
      .from('bicos').select('preco_base').eq('id', id).single();
    if (err) throw new NotFoundException('Bico não encontrado');

    const { data, error } = await this.supabase.db
      .from('bicos')
      .update({ preco_base })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    await this.auditoria.registrar(
      usuario, 'PRECO_BASE_ATUALIZADO', 'bicos', id,
      { preco_base: antes.preco_base }, { preco_base },
    );
    return data;
  }

  async atualizarDescontos(
    posto_id: string,
    produto_id: string,
    desconto_nivel1: number,
    desconto_nivel2: number,
    usuario: any,
  ) {
    const { data, error } = await this.supabase.db
      .from('bicos')
      .update({ desconto_nivel1, desconto_nivel2 })
      .eq('posto_id', posto_id)
      .eq('produto_id', produto_id)
      .select();
    if (error) throw error;

    await this.auditoria.registrar(
      usuario, 'DESCONTOS_ATUALIZADOS', 'bicos',
      `${posto_id}|${produto_id}`, null,
      { desconto_nivel1, desconto_nivel2, bicos_afetados: data?.length },
    );
    return data;
  }

  async remover(id: string, usuario: any) {
    const { data: antes } = await this.supabase.db.from('bicos').select('*').eq('id', id).single();
    const { error } = await this.supabase.db.from('bicos').delete().eq('id', id);
    if (error) throw error;
    await this.auditoria.registrar(usuario, 'BICO_REMOVIDO', 'bicos', id, antes, null);
    return { ok: true };
  }
}
