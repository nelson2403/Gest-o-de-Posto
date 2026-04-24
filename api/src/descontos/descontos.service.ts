import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class DescontosService {
  constructor(
    private supabase: SupabaseService,
    private auditoria: AuditoriaService,
  ) {}

  async listarTodos(usuario: any) {
    let query = this.supabase.db
      .from('descontos')
      .select('*, postos(nome), produtos(nome)')
      .order('criado_em');
    if (usuario.role < 2 && usuario.posto_id) {
      query = query.eq('posto_id', usuario.posto_id);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async listarPorPosto(posto_id: string) {
    const { data, error } = await this.supabase.db
      .from('descontos')
      .select('*, produtos(nome)')
      .eq('posto_id', posto_id)
      .order('criado_em');
    if (error) throw error;
    return data;
  }

  async definir(posto_id: string, produto_id: string, valor: number, usuario: any) {
    const { data: existente } = await this.supabase.db
      .from('descontos')
      .select('*')
      .eq('posto_id', posto_id)
      .eq('produto_id', produto_id)
      .single();

    let resultado: any;

    if (existente) {
      const { data, error } = await this.supabase.db
        .from('descontos')
        .update({ valor })
        .eq('id', existente.id)
        .select()
        .single();
      if (error) throw error;
      resultado = data;
      await this.auditoria.registrar(
        usuario, 'DESCONTO_ATUALIZADO', 'descontos', existente.id,
        { valor: existente.valor }, { valor },
      );
    } else {
      const { data, error } = await this.supabase.db
        .from('descontos')
        .insert({ posto_id, produto_id, valor })
        .select()
        .single();
      if (error) throw error;
      resultado = data;
      await this.auditoria.registrar(usuario, 'DESCONTO_CRIADO', 'descontos', data.id, null, data);
    }

    // Marcar bicos do mesmo posto+produto para sincronização
    await this.supabase.db
      .from('cartoes')
      .update({ sincronizado: false })
      .eq('posto_id', posto_id);

    return resultado;
  }

  async buscarPorPostoEProduto(posto_id: string, produto_id: string) {
    const { data } = await this.supabase.db
      .from('descontos')
      .select('valor')
      .eq('posto_id', posto_id)
      .eq('produto_id', produto_id)
      .single();
    return data?.valor ?? 0;
  }
}
