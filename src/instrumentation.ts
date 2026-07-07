// Rede de segurança do processo. Erros NATIVOS (ex.: tesseract/leptonica lendo um
// JPEG truncado) escapam do try/catch e viram uncaughtException, derrubando o
// servidor inteiro — e aí requisições sem relação (anexar extrato etc.) falham com
// "erro inesperado". Aqui a gente ignora só esses erros de imagem/OCR e deixa o
// servidor no ar; erros reais continuam derrubando (pm2 reinicia limpo).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // NÃO derruba o processo por erro não tratado. Esses erros vêm quase sempre de
  // código nativo/assíncrono isolado (ex.: tesseract lendo JPEG corrompido) e, como
  // cada request do Next é independente, é melhor logar e seguir do que matar o
  // servidor e fazer requisições sem relação (anexar extrato) falharem por minutos.
  process.on('uncaughtException', (err: unknown) => {
    console.error('[uncaughtException ignorado — servidor mantido no ar]:', (err as { message?: string })?.message ?? err)
  })
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[unhandledRejection ignorado]:', (reason as { message?: string })?.message ?? reason)
  })
}
