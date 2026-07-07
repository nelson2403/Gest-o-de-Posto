// Rede de segurança do processo. Erros NATIVOS (ex.: tesseract/leptonica lendo um
// JPEG truncado) escapam do try/catch e viram uncaughtException, derrubando o
// servidor inteiro — e aí requisições sem relação (anexar extrato etc.) falham com
// "erro inesperado". Aqui a gente ignora só esses erros de imagem/OCR e deixa o
// servidor no ar; erros reais continuam derrubando (pm2 reinicia limpo).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const ehErroImagem = (msg: string) => /jpeg|jpg|\bpix\b|no pix|leptonica|tesseract|image file|internal jpeg|premature end/i.test(msg)

  process.on('uncaughtException', (err: unknown) => {
    const msg = (err as { message?: string })?.message ?? String(err)
    if (ehErroImagem(msg)) { console.error('[uncaughtException OCR/imagem ignorado]:', msg); return }
    console.error('[uncaughtException fatal]:', err)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = (reason as { message?: string })?.message ?? String(reason)
    console.error('[unhandledRejection]:', msg)
  })
}
