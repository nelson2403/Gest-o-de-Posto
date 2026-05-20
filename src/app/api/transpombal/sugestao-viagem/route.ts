import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Converte litros → m³
const toM3 = (litros: number) => Math.round((litros / 1000) * 10) / 10

// Algoritmo greedy best-fit: distribui entregas nos compartimentos do caminhão.
// Cada compartimento recebe no máximo 1 entrega (posto+produto).
// Retorna os índices dos compartimentos que foram usados e o que levam.
function alocarCompartimentos(
  compartimentos: number[],
  entregas: { posto_nome: string; posto_id: string | null; produto: string; volume_m3: number }[],
) {
  const livre = compartimentos.map((cap, idx) => ({ idx, cap, usado: false }))
  const resultado: {
    compartimento_idx: number
    capacidade_m3: number
    posto_nome: string
    posto_id: string | null
    produto: string
    volume_m3: number
  }[] = []
  const naoAlocadas: typeof entregas = []

  // Ordena entregas maiores primeiro (best-fit decreasing)
  const sorted = [...entregas].sort((a, b) => b.volume_m3 - a.volume_m3)

  for (const entrega of sorted) {
    // Encontra o menor compartimento que ainda comporta o volume
    const candidatos = livre
      .filter(c => !c.usado && c.cap >= entrega.volume_m3)
      .sort((a, b) => a.cap - b.cap) // menor que serve

    if (candidatos.length > 0) {
      const comp = candidatos[0]
      comp.usado = true
      resultado.push({
        compartimento_idx: comp.idx,
        capacidade_m3:     comp.cap,
        posto_nome:        entrega.posto_nome,
        posto_id:          entrega.posto_id,
        produto:           entrega.produto,
        volume_m3:         entrega.volume_m3,
      })
    } else {
      // Nenhum compartimento serve: usa o maior disponível e entrega parcial
      const maiores = livre.filter(c => !c.usado).sort((a, b) => b.cap - a.cap)
      if (maiores.length > 0) {
        const comp = maiores[0]
        comp.usado = true
        resultado.push({
          compartimento_idx: comp.idx,
          capacidade_m3:     comp.cap,
          posto_nome:        entrega.posto_nome,
          posto_id:          entrega.posto_id,
          produto:           entrega.produto,
          volume_m3:         Math.min(entrega.volume_m3, comp.cap), // entrega parcial
        })
      } else {
        naoAlocadas.push(entrega)
      }
    }
  }

  return { resultado, naoAlocadas }
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const admin = createAdminClient()
    const hoje  = new Date().toISOString().slice(0, 10)

    // 1. Tanques e medições de hoje
    const [{ data: tanques }, { data: medicoes }, { data: veiculos }, { data: motoristas }] =
      await Promise.all([
        admin.from('tanques_postos').select('id, posto_nome, posto_id, produto, capacidade_litros').eq('ativo', true),
        admin.from('medicoes_tanques').select('tanque_id, medida_litros').eq('data', hoje),
        admin.from('transpombal_veiculos').select('id, placa, tipo, compartimentos').eq('ativo', true).order('tipo'),
        admin.from('transpombal_motoristas').select('id, nome').eq('ativo', true).order('nome'),
      ])

    const medicaoMap = new Map((medicoes ?? []).map(m => [m.tanque_id, m.medida_litros]))

    // 2. Calcula urgência e volume necessário por tanque
    const LIMITE_PCT = 0.40 // abaixo de 40% entra na sugestão

    interface NecessidadeTanque {
      posto_nome:      string
      posto_id:        string | null
      produto:         string
      capacidade_l:    number
      medida_l:        number | null
      pct_atual:       number | null
      volume_needed_l: number
      volume_needed_m3: number
      urgencia:        'critico' | 'baixo' | 'normal'
    }

    const necessidades: NecessidadeTanque[] = []

    for (const t of tanques ?? []) {
      const medida = medicaoMap.get(t.id) ?? null
      const pct    = medida !== null && t.capacidade_litros > 0
        ? medida / t.capacidade_litros
        : null

      // Inclui se: sem medição hoje OU abaixo do limite
      if (pct !== null && pct >= LIMITE_PCT) continue

      const needed_l  = t.capacidade_litros - (medida ?? 0)
      const needed_m3 = toM3(needed_l)
      if (needed_m3 <= 0) continue

      const urgencia: NecessidadeTanque['urgencia'] =
        pct === null ? 'baixo' :
        pct < 0.20   ? 'critico' : 'baixo'

      necessidades.push({
        posto_nome:       t.posto_nome,
        posto_id:         t.posto_id,
        produto:          t.produto,
        capacidade_l:     t.capacidade_litros,
        medida_l:         medida,
        pct_atual:        pct !== null ? Math.round(pct * 100) : null,
        volume_needed_l:  needed_l,
        volume_needed_m3: needed_m3,
        urgencia,
      })
    }

    // Ordena: críticos primeiro, depois por % crescente
    necessidades.sort((a, b) => {
      if (a.urgencia !== b.urgencia) return a.urgencia === 'critico' ? -1 : 1
      return (a.pct_atual ?? -1) - (b.pct_atual ?? -1)
    })

    // 3. Distribui entregas por caminhão
    // Cada caminhão recebe o maior conjunto de entregas que couber
    interface SugestaoViagem {
      veiculo:       { id: string; placa: string; tipo: string; compartimentos: number[] }
      motorista?:    { id: string; nome: string }
      itens:         ReturnType<typeof alocarCompartimentos>['resultado']
      volume_total_m3:     number
      capacidade_total_m3: number
      postos_atendidos:    string[]
    }

    const sugestoes: SugestaoViagem[] = []
    let pendentes = [...necessidades]
    let motoristaIdx = 0

    // Ordena veículos: maiores capacidades primeiro (carretas antes de cavalinhos)
    const veiculosOrdenados = [...(veiculos ?? [])].sort(
      (a, b) => b.compartimentos.reduce((s: number, c: number) => s + c, 0) -
                a.compartimentos.reduce((s: number, c: number) => s + c, 0)
    )

    for (const v of veiculosOrdenados) {
      if (pendentes.length === 0) break

      const entregas = pendentes.map(n => ({
        posto_nome: n.posto_nome,
        posto_id:   n.posto_id,
        produto:    n.produto,
        volume_m3:  n.volume_needed_m3,
      }))

      const { resultado, naoAlocadas } = alocarCompartimentos(v.compartimentos, entregas)

      if (resultado.length === 0) continue

      const motorista = (motoristas ?? [])[motoristaIdx % Math.max(1, (motoristas ?? []).length)]
      motoristaIdx++

      const postos_atendidos = [...new Set(resultado.map(r => r.posto_nome))]

      sugestoes.push({
        veiculo: {
          id:            v.id,
          placa:         v.placa,
          tipo:          v.tipo,
          compartimentos: v.compartimentos,
        },
        motorista: motorista ? { id: motorista.id, nome: motorista.nome } : undefined,
        itens:     resultado,
        volume_total_m3:     Math.round(resultado.reduce((s, r) => s + r.volume_m3, 0) * 10) / 10,
        capacidade_total_m3: v.compartimentos.reduce((s: number, c: number) => s + c, 0),
        postos_atendidos,
      })

      // Remove itens alocados dos pendentes
      const alocadosKey = new Set(resultado.map(r => `${r.posto_nome}|${r.produto}`))
      pendentes = naoAlocadas.map(e =>
        necessidades.find(n => n.posto_nome === e.posto_nome && n.produto === e.produto)!
      ).filter(Boolean)
      pendentes = pendentes.filter(p => !alocadosKey.has(`${p.posto_nome}|${p.produto}`))
    }

    return NextResponse.json({
      data:         hoje,
      necessidades,
      sugestoes,
      sem_caminhao: pendentes, // postos que ficaram de fora por falta de caminhões
      total_postos_urgentes: [...new Set(necessidades.map(n => n.posto_nome))].length,
      veiculos:     veiculos ?? [],
      motoristas:   motoristas ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
