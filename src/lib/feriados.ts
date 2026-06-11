// Feriados bancários nacionais (Brasil) e agregação de dias não-úteis.
//
// Bancos não liquidam em fins de semana e feriados — o movimento desses dias
// cai no próximo dia útil. Para a conciliação bater com o AUTOSYSTEM, ao
// conciliar um dia útil somamos também os dias não-úteis imediatamente
// anteriores (feriado/sábado/domingo).

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDias(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Domingo de Páscoa — algoritmo de Meeus/Butcher (Gregoriano)
function pascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

// Conjunto de feriados bancários nacionais do ano (YYYY-MM-DD)
export function feriadosNacionais(ano: number): Set<string> {
  const f = new Set<string>()
  // Fixos
  f.add(`${ano}-01-01`) // Confraternização Universal
  f.add(`${ano}-04-21`) // Tiradentes
  f.add(`${ano}-05-01`) // Dia do Trabalho
  f.add(`${ano}-09-07`) // Independência
  f.add(`${ano}-10-12`) // N. Sra. Aparecida
  f.add(`${ano}-11-02`) // Finados
  f.add(`${ano}-11-15`) // Proclamação da República
  f.add(`${ano}-11-20`) // Consciência Negra (nacional desde 2024)
  f.add(`${ano}-12-25`) // Natal
  // Móveis (baseados na Páscoa)
  const p = pascoa(ano)
  f.add(iso(addDias(p, -48))) // Carnaval (segunda)
  f.add(iso(addDias(p, -47))) // Carnaval (terça)
  f.add(iso(addDias(p, -2)))  // Sexta-feira Santa
  f.add(iso(addDias(p, 60)))  // Corpus Christi
  return f
}

export function ehDiaUtilBancario(d: Date, feriados: Set<string>): boolean {
  const dow = d.getDay() // 0 = domingo, 6 = sábado
  if (dow === 0 || dow === 6) return false
  return !feriados.has(iso(d))
}

// Datas a considerar ao conciliar `dataISO`: o próprio dia + os dias não-úteis
// imediatamente anteriores (feriado/fim de semana). Ex.: sexta após feriado de
// quinta → ['quinta', 'sexta']; segunda → ['sábado', 'domingo', 'segunda'].
export function datasConciliacao(dataISO: string): string[] {
  const [y, m, dd] = dataISO.split('-').map(Number)
  const target = new Date(y, m - 1, dd)
  const fer = new Set<string>([
    ...feriadosNacionais(target.getFullYear()),
    ...feriadosNacionais(target.getFullYear() - 1), // borda de janeiro
  ])

  const datas = [dataISO]
  let cur = addDias(target, -1)
  let guard = 0
  while (!ehDiaUtilBancario(cur, fer) && guard < 7) {
    datas.push(iso(cur))
    cur = addDias(cur, -1)
    guard++
  }
  return datas.sort()
}

// Todas as datas estritamente após `deISO` até `ateISO` (inclusive).
// Usado quando temos a data do saldo anterior (extrato Sicoob): o movimento do
// dia cobre o intervalo entre os dois saldos.
export function intervaloDatas(deISO: string, ateISO: string): string[] {
  const [y1, m1, d1] = deISO.split('-').map(Number)
  const [y2, m2, d2] = ateISO.split('-').map(Number)
  const de = new Date(y1, m1 - 1, d1)
  const ate = new Date(y2, m2 - 1, d2)
  const datas: string[] = []
  let cur = addDias(de, 1)
  let guard = 0
  while (cur <= ate && guard < 40) {
    datas.push(iso(cur))
    cur = addDias(cur, 1)
    guard++
  }
  return datas.length ? datas : [ateISO]
}
