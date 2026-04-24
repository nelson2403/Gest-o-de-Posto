import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class CartoesService {
  constructor(
    private supabase: SupabaseService,
    private auditoria: AuditoriaService,
  ) {}

  async listar(usuario: any) {
    let query = this.supabase.db
      .from('cartoes')
      .select('*, postos(nome)')
      .order('nome_funcionario');

    if (usuario.role < 2 && usuario.posto_id) {
      query = query.eq('posto_id', usuario.posto_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async buscar(id: string) {
    const { data, error } = await this.supabase.db
      .from('cartoes')
      .select('*, postos(nome)')
      .eq('id', id)
      .single();
    if (error || !data) throw new NotFoundException('Cartão não encontrado');
    return data;
  }

  async criar(
    dto: { codigo: string; nome_funcionario: string; posto_id: string; nivel?: number },
    usuario: any,
  ) {
    const { data: existente } = await this.supabase.db
      .from('cartoes')
      .select('id')
      .eq('codigo', dto.codigo)
      .eq('posto_id', dto.posto_id)
      .single();

    if (existente) throw new ConflictException('Código RFID já cadastrado neste posto');

    const { data, error } = await this.supabase.db
      .from('cartoes')
      .insert({ ...dto, nivel: dto.nivel ?? 1, ativo: true, sincronizado: false })
      .select()
      .single();

    if (error) throw error;
    await this.auditoria.registrar(usuario, 'CARTAO_CRIADO', 'cartoes', data.id, null, data);
    return data;
  }

  async alterarStatus(id: string, ativo: boolean, usuario: any) {
    const antes = await this.buscar(id);
    const { data, error } = await this.supabase.db
      .from('cartoes')
      .update({ ativo, sincronizado: false })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    const acao = ativo ? 'CARTAO_ATIVADO' : 'CARTAO_DESATIVADO';
    await this.auditoria.registrar(usuario, acao, 'cartoes', id, antes, data);
    return data;
  }

  async alterarNivel(id: string, nivel: number, usuario: any) {
    const antes = await this.buscar(id);
    const { data, error } = await this.supabase.db
      .from('cartoes')
      .update({ nivel, sincronizado: false })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    await this.auditoria.registrar(usuario, 'CARTAO_NIVEL_ALTERADO', 'cartoes', id,
      { nivel: antes.nivel }, { nivel });
    return data;
  }

  async remover(id: string, usuario: any) {
    const antes = await this.buscar(id);
    const { error } = await this.supabase.db.from('cartoes').delete().eq('id', id);
    if (error) throw error;
    await this.auditoria.registrar(usuario, 'CARTAO_REMOVIDO', 'cartoes', id, antes, null);
    return { ok: true };
  }

  async pendentes(posto_id: string) {
    const { data, error } = await this.supabase.db
      .from('cartoes')
      .select('*')
      .eq('posto_id', posto_id)
      .eq('sincronizado', false);
    if (error) throw error;
    return data;
  }

  async renomear(id: string, nome_funcionario: string, usuario: any) {
    const antes = await this.buscar(id);
    const { data, error } = await this.supabase.db
      .from('cartoes')
      .update({ nome_funcionario })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await this.auditoria.registrar(usuario, 'CARTAO_RENOMEADO', 'cartoes', id,
      { nome_funcionario: antes.nome_funcionario }, { nome_funcionario });
    return data;
  }

  async marcarSincronizado(id: string) {
    const { error } = await this.supabase.db
      .from('cartoes')
      .update({ sincronizado: true })
      .eq('id', id);
    if (error) throw error;
    return { ok: true };
  }
}
