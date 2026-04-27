import { useEffect, useState, useMemo } from 'react';
import { BarChart3, CreditCard, TrendingDown, Clock, AlertCircle } from 'lucide-react';
import { getPostos, getProdutos, getTodosBicos, getCartoes } from '../services/api';

export default function Relatorios() {
  const [postos, setPostos] = useState<any[]>([]);
  const [produtos, setProdutos] = useState<any[]>([]);
  const [bicos, setBicos] = useState<any[]>([]);
  const [cartoes, setCartoes] = useState<any[]>([]);
  const [aba, setAba] = useState<'descontos' | 'cartoes'>('descontos');
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    Promise.all([getPostos(), getProdutos(), getTodosBicos(), getCartoes()]).then(
      ([ps, prs, bs, cs]) => {
        setPostos(ps);
        setProdutos(prs);
        setBicos(bs);
        setCartoes(cs);
      }
    );
  }, []);

  // Resumo de descontos por posto (usando desconto_nivel1 do bico)
  const resumoPosto = useMemo(() => {
    return postos.map((posto) => {
      const bicosPosto = bicos.filter((b) => b.posto_id === posto.id);
      const comDesconto = bicosPosto.filter((b) => Number(b.desconto_nivel1 ?? 0) > 0);
      const mediaDesconto = comDesconto.length > 0
        ? comDesconto.reduce((sum, b) => sum + Number(b.desconto_nivel1 ?? 0), 0) / comDesconto.length
        : 0;
      const cartoesPosto = cartoes.filter((c) => c.posto_id === posto.id);
      const ativos = cartoesPosto.filter((c) => c.ativo).length;

      return {
        posto,
        totalCombustiveis: comDesconto.length,
        mediaDesconto,
        maiorDesconto: comDesconto.length > 0 ? Math.max(...comDesconto.map((b) => Number(b.desconto_nivel1 ?? 0))) : 0,
        totalCartoes: cartoesPosto.length,
        cartoesAtivos: ativos,
        cartoesInativos: cartoesPosto.length - ativos,
        bicos: bicosPosto,
      };
    }).filter((r) => r.totalCartoes > 0 || r.totalCombustiveis > 0);
  }, [postos, bicos, cartoes]);

  // Uso de cartões
  const cartoesOrdenados = useMemo(() => {
    return [...cartoes]
      .sort((a, b) => {
        const usosA = a.total_usos ?? 0;
        const usosB = b.total_usos ?? 0;
        if (usosA !== usosB) return usosA - usosB; // menos usados primeiro
        return (a.nome_funcionario ?? '').localeCompare(b.nome_funcionario ?? '');
      })
      .filter((c) => c.nome_funcionario?.toLowerCase().includes(filtro.toLowerCase()) ||
        c.codigo?.toLowerCase().includes(filtro.toLowerCase()) ||
        c.postos?.nome?.toLowerCase().includes(filtro.toLowerCase())
      );
  }, [cartoes, filtro]);

  const semUso = cartoes.filter((c) => (c.total_usos ?? 0) === 0).length;
  const totalDesconto = bicos.reduce((sum: number, b: any) => sum + Number(b.desconto_nivel1 ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Relatórios</h1>
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Postos ativos</p>
          <p className="text-3xl font-bold text-white mt-1">{postos.filter((p) => p.online).length}</p>
          <p className="text-xs text-gray-500 mt-1">de {postos.length} total</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Cartões ativos</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">{cartoes.filter((c) => c.ativo).length}</p>
          <p className="text-xs text-gray-500 mt-1">de {cartoes.length} total</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Nunca usados</p>
          <p className="text-3xl font-bold text-yellow-400 mt-1">{semUso}</p>
          <p className="text-xs text-gray-500 mt-1">cartões sem registro de uso</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Desc. médio configurado</p>
          <p className="text-3xl font-bold text-green-400 mt-1">
            R$ {bicos.length > 0
              ? (totalDesconto / bicos.length).toFixed(3)
              : '0.000'}
          </p>
          <p className="text-xs text-gray-500 mt-1">média entre todos os postos</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setAba('descontos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            aba === 'descontos' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <TrendingDown className="w-4 h-4" /> Descontos por Posto
        </button>
        <button
          onClick={() => setAba('cartoes')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            aba === 'cartoes' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-4 h-4" /> Uso de Cartões
        </button>
      </div>

      {/* Aba descontos */}
      {aba === 'descontos' && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Posto</th>
                {produtos.map((p) => (
                  <th key={p.id} className="text-center py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">
                    {p.nome.replace('Gasolina ', 'Gs. ')}
                  </th>
                ))}
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Média</th>
                <th className="text-center py-3 px-3 text-xs font-medium text-gray-400 uppercase tracking-wide">Cartões</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {resumoPosto
                .sort((a, b) => b.mediaDesconto - a.mediaDesconto)
                .map(({ posto, bicos: bicosPosto, mediaDesconto, totalCartoes, cartoesAtivos }) => (
                  <tr key={posto.id} className="hover:bg-gray-800/30">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${posto.online ? 'bg-green-400' : 'bg-gray-600'}`} />
                        <span className="text-sm text-white font-medium">{posto.nome}</span>
                      </div>
                    </td>
                    {produtos.map((p) => {
                      const bico = bicosPosto.find((b: any) => b.produto_id === p.id);
                      const valor = bico ? Number(bico.desconto_nivel1 ?? 0) : 0;
                      return (
                        <td key={p.id} className="py-3 px-3 text-center">
                          {valor > 0
                            ? <span className="text-sm font-mono text-green-400">R$ {valor.toFixed(3)}</span>
                            : <span className="text-xs text-gray-600">—</span>
                          }
                        </td>
                      );
                    })}
                    <td className="py-3 px-3 text-center">
                      {mediaDesconto > 0
                        ? <span className="text-sm font-mono font-bold text-blue-400">R$ {mediaDesconto.toFixed(3)}</span>
                        : <span className="text-xs text-gray-600">—</span>
                      }
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-sm text-white">{cartoesAtivos}</span>
                      {totalCartoes > cartoesAtivos && (
                        <span className="text-xs text-gray-500">/{totalCartoes}</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Aba cartões */}
      {aba === 'cartoes' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-yellow-400 bg-yellow-900/20 border border-yellow-900/40 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4" />
              Cartões com 0 usos aparecem primeiro — podem não estar mais sendo utilizados.
            </div>
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar cartão ou posto..."
              className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Cartão</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Posto</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Código RFID</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Usos</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Último Uso</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {cartoesOrdenados.map((c) => {
                  const usos = c.total_usos ?? 0;
                  const ultimoUso = c.ultimo_uso ? new Date(c.ultimo_uso) : null;
                  const semUsoBadge = usos === 0;

                  return (
                    <tr key={c.id} className={`hover:bg-gray-800/30 ${semUsoBadge ? 'opacity-70' : ''}`}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <CreditCard className={`w-4 h-4 ${c.ativo ? 'text-blue-400' : 'text-gray-600'}`} />
                          <span className="text-sm text-white">{c.nome_funcionario}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-400">{c.postos?.nome ?? '—'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-mono text-gray-500">{c.codigo}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {usos > 0
                          ? <span className="text-sm font-bold text-white">{usos}</span>
                          : <span className="flex items-center justify-center gap-1 text-xs text-yellow-500">
                              <Clock className="w-3 h-3" /> Nunca
                            </span>
                        }
                      </td>
                      <td className="py-3 px-4 text-center">
                        {ultimoUso
                          ? <span className="text-xs text-gray-400">
                              {ultimoUso.toLocaleDateString('pt-BR')} {ultimoUso.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          : <span className="text-xs text-gray-600">—</span>
                        }
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          c.ativo ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'
                        }`}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
