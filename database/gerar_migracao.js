/**
 * Gera migracao.sql a partir dos dados do sistema antigo (192.168.2.175:3001)
 * Executar: node database/gerar_migracao.js
 */

const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const OLD_API = '192.168.2.175';
const OLD_PORT = 3001;
const JWT_SECRET = 'REDEPEDRADOPOMBAL';

function makeJwt(secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: '1', email: 'admin@admin.com', role: 2,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: OLD_API, port: OLD_PORT, path, method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function esc(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function normalizarProduto(nomeAntigo) {
  const n = (nomeAntigo || '').toUpperCase().trim();
  if (n.includes('S500')) return 'Diesel S500';
  if (n.includes('S10')) return 'Diesel S10';
  if (n.includes('ETANOL') || n.includes('ALCOOL') || n.includes('ÁLCOOL')) return 'Etanol';
  if (n.includes('ADITI')) return 'Gasolina Aditivada';
  if (n.includes('GASOLINA') || n.includes('GC')) return 'Gasolina Comum';
  return null;
}

async function main() {
  const token = makeJwt(JWT_SECRET);
  console.log('Buscando dados do sistema antigo...');

  const [postos, produtos, bicos, identificadores] = await Promise.all([
    get('/postos', token),
    get('/produtos', token),
    get('/bicos', token),
    get('/identificadores', token),
  ]);

  console.log(`  Postos: ${postos.length}`);
  console.log(`  Produtos: ${produtos.length}`);
  console.log(`  Bicos: ${bicos.length}`);
  console.log(`  Identificadores: ${identificadores.length}`);

  const postoById = Object.fromEntries(postos.map(p => [p.id, p]));
  const produtoById = Object.fromEntries(produtos.map(p => [p.id, p]));

  const NOVOS_PRODUTOS = ['Diesel S500', 'Diesel S10', 'Etanol', 'Gasolina Comum', 'Gasolina Aditivada'];

  const lines = [];
  lines.push('-- ============================================================');
  lines.push('-- MIGRACAO: Sistema Antigo -> Novo (Supabase)');
  lines.push(`-- Gerado em: ${new Date().toISOString()}`);
  lines.push('-- ============================================================');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');
  lines.push('-- Limpar dados anteriores');
  lines.push('DELETE FROM descontos;');
  lines.push('DELETE FROM bicos;');
  lines.push('DELETE FROM cartoes;');
  lines.push('DELETE FROM postos;');
  lines.push('DELETE FROM produtos;');
  lines.push('');

  // Produtos — schema: id, nome, ativo, criado_em
  lines.push('-- Produtos');
  lines.push('INSERT INTO produtos (nome) VALUES');
  lines.push(NOVOS_PRODUTOS.map(n => `  (${esc(n)})`).join(',\n') + ';');
  lines.push('');

  // Postos — schema: id, nome, endereco, forecourt_ip, forecourt_port, online, criado_em, atualizado_em
  lines.push('-- Postos');
  lines.push('INSERT INTO postos (nome, forecourt_ip, forecourt_port, online) VALUES');
  const postoRows = postos.map(p => {
    const nome = p.nome || `Posto ${p.id}`;
    const ip = p.forecourtIp || '';
    const porta = p.forecourtPort || 3000;
    const online = p.forecourtStatus === 1 || p.forecourtStatus === true;
    return `  (${esc(nome)}, ${esc(ip)}, ${porta}, ${online})`;
  });
  lines.push(postoRows.join(',\n') + ';');
  lines.push('');

  // Bicos — schema: id, bico_forecourt, posto_id, produto_id, descricao, decimais, preco_base, criado_em, atualizado_em
  const bicosSeen = new Set();
  const bicosValidos = [];
  const descontoMap = {};

  for (const bico of bicos) {
    const posto = postoById[bico.postoId];
    const produto = produtoById[bico.produtoId];
    if (!posto || !produto) continue;

    const postoNome = posto.nome;
    const produtoNomeNovo = normalizarProduto(produto.nome);
    if (!produtoNomeNovo) {
      console.warn(`  AVISO: produto não mapeado: "${produto.nome}"`);
      continue;
    }

    const numero = bico.bicoForecourt;
    const key = `${bico.postoId}|${numero}`;
    if (!bicosSeen.has(key)) {
      bicosSeen.add(key);
      bicosValidos.push({
        postoNome, produtoNomeNovo, numero,
        preco_base: parseFloat(bico.valor1 || 0),
        descricao: bico.descricao || null,
      });
    }

    const valor2 = parseFloat(bico.valor2 || 0);
    if (valor2 > 0) {
      const descKey = `${postoNome}|${produtoNomeNovo}`;
      if (!descontoMap[descKey] || valor2 > descontoMap[descKey]) {
        descontoMap[descKey] = valor2;
      }
    }
  }

  if (bicosValidos.length > 0) {
    lines.push('-- Bicos');
    lines.push('INSERT INTO bicos (posto_id, produto_id, bico_forecourt, preco_base, descricao)');
    lines.push('SELECT p.id, pr.id, b.bico_forecourt, b.preco_base, b.descricao FROM (VALUES');
    lines.push(bicosValidos.map(b =>
      `  (${esc(b.postoNome)}, ${esc(b.produtoNomeNovo)}, ${b.numero}, ${b.preco_base.toFixed(3)}, ${esc(b.descricao)})`
    ).join(',\n'));
    lines.push(') AS b(posto_nome, produto_nome, bico_forecourt, preco_base, descricao)');
    lines.push('JOIN postos p ON p.nome = b.posto_nome');
    lines.push('JOIN produtos pr ON pr.nome = b.produto_nome;');
    lines.push('');
  }

  // Descontos — schema: id, posto_id, produto_id, valor, criado_em, atualizado_em
  const descontoEntries = Object.entries(descontoMap);
  if (descontoEntries.length > 0) {
    lines.push('-- Descontos');
    lines.push('INSERT INTO descontos (posto_id, produto_id, valor)');
    lines.push('SELECT p.id, pr.id, d.valor FROM (VALUES');
    lines.push(descontoEntries.map(([key, valor]) => {
      const [postoNome, produtoNome] = key.split('|');
      return `  (${esc(postoNome)}, ${esc(produtoNome)}, ${valor.toFixed(4)})`;
    }).join(',\n'));
    lines.push(') AS d(posto_nome, produto_nome, valor)');
    lines.push('JOIN postos p ON p.nome = d.posto_nome');
    lines.push('JOIN produtos pr ON pr.nome = d.produto_nome;');
    lines.push('');
  }

  // Cartoes — schema: id, codigo, nome_funcionario, ativo, sincronizado, posto_id, criado_em, atualizado_em
  if (identificadores.length > 0) {
    lines.push('-- Cartoes (identificadores RFID)');
    lines.push('INSERT INTO cartoes (posto_id, codigo, nome_funcionario, ativo, sincronizado)');
    lines.push('SELECT p.id, c.codigo, c.nome_funcionario, c.ativo, c.sincronizado FROM (VALUES');
    const cartaoRows = identificadores.map((idf, i) => {
      const posto = postoById[idf.postoId];
      const postoNome = posto ? posto.nome : 'DESCONHECIDO';
      const codigo = idf.codigo || `RFID${i + 1}`;
      const nome = idf.nome || idf.funcionario || `Cartão ${String(i + 1).padStart(2, '0')}`;
      return `  (${esc(postoNome)}, ${esc(codigo)}, ${esc(nome)}, true, false)`;
    });
    lines.push(cartaoRows.join(',\n'));
    lines.push(') AS c(posto_nome, codigo, nome_funcionario, ativo, sincronizado)');
    lines.push('JOIN postos p ON p.nome = c.posto_nome;');
    lines.push('');
  }

  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- Verificacao');
  lines.push("SELECT 'postos' AS tabela, COUNT(*) AS total FROM postos");
  lines.push("UNION ALL SELECT 'produtos', COUNT(*) FROM produtos");
  lines.push("UNION ALL SELECT 'bicos', COUNT(*) FROM bicos");
  lines.push("UNION ALL SELECT 'descontos', COUNT(*) FROM descontos");
  lines.push("UNION ALL SELECT 'cartoes', COUNT(*) FROM cartoes;");

  const sql = lines.join('\n');
  fs.writeFileSync(`${__dirname}/migracao.sql`, sql, 'utf8');
  console.log(`\nSQL gerado: database/migracao.sql`);
  console.log(`  ${postos.length} postos`);
  console.log(`  ${NOVOS_PRODUTOS.length} produtos`);
  console.log(`  ${bicosValidos.length} bicos`);
  console.log(`  ${descontoEntries.length} descontos`);
  console.log(`  ${identificadores.length} cartoes`);
}

main().catch((e) => { console.error(e); process.exit(1); });
