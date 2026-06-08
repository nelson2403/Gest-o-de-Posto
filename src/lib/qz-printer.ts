// ─── Integração com QZ Tray ─────────────────────────────────────────────────
// QZ Tray é um agente local (instalado no PDV) que permite ao navegador
// imprimir numa impressora específica PELO NOME, ignorando a impressora padrão
// do Windows. Download/instalação: https://qz.io/download/
//
// Modo "sem assinatura": na primeira impressão o QZ Tray mostra um aviso de
// permissão. Basta marcar "Remember this decision" + "Allow" e não pergunta
// mais naquele PDV.

/* eslint-disable @typescript-eslint/no-explicit-any */

let qzModule: any = null
let initDone = false

async function getQz(): Promise<any> {
  if (qzModule) return qzModule
  const mod = await import('qz-tray')
  const qz = (mod as any).default ?? mod
  if (!initDone) {
    const { sha256 } = await import('js-sha256')
    qz.api.setSha256Type((data: string) => sha256(data))
    qz.api.setPromiseType((resolver: any) => new Promise(resolver))
    // Sem certificado/assinatura — QZ pedirá permissão na 1ª vez.
    qz.security.setCertificatePromise((resolve: any) => resolve(null))
    qz.security.setSignaturePromise(() => (resolve: any) => resolve())
    initDone = true
  }
  qzModule = qz
  return qz
}

/** Garante conexão com o QZ Tray local. Lança erro se o agente não estiver rodando. */
export async function conectarQz(): Promise<any> {
  const qz = await getQz()
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 2, delay: 1 })
  }
  return qz
}

/** Verifica se o QZ Tray está instalado e acessível. */
export async function qzDisponivel(): Promise<boolean> {
  try {
    await conectarQz()
    return true
  } catch {
    return false
  }
}

/** Lista as impressoras instaladas no Windows (via QZ Tray). */
export async function listarImpressoras(): Promise<string[]> {
  const qz = await conectarQz()
  const lista = await qz.printers.find()
  return Array.isArray(lista) ? lista : [lista]
}

/** Nome da impressora padrão do sistema (via QZ Tray). */
export async function impressoraPadrao(): Promise<string | null> {
  try {
    const qz = await conectarQz()
    return await qz.printers.getDefault()
  } catch {
    return null
  }
}

/**
 * Imprime um HTML diretamente numa impressora específica (pelo nome),
 * em formato de cupom térmico. Ignora a impressora padrão do Windows.
 */
export async function imprimirHtmlTermica(
  nomeImpressora: string,
  html: string,
  larguraMm = 80,
): Promise<void> {
  const qz = await conectarQz()
  const config = qz.configs.create(nomeImpressora, {
    margins: 0,
    units: 'mm',
    size: { width: larguraMm, height: null },
    colorType: 'grayscale',
    rasterize: true,
    scaleContent: false,
  })
  const data = [{
    type: 'pixel',
    format: 'html',
    flavor: 'plain',
    data: html,
  }]
  await qz.print(config, data)
}

// ─── Persistência do nome da impressora por PDV ──────────────────────────────

const STORAGE_KEY = 'pdv_impressora_termica'

export function getImpressoraSalva(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY) ?? ''
}

export function setImpressoraSalva(nome: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, nome)
}
