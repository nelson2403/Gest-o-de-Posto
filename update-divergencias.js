const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://oxlnsstcbtzwmnmnhllx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94bG5zc3RjYnR6d21ubW5obGx4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjU3MTQ4MywiZXhwIjoyMDg4MTQ3NDgzfQ.RR1ghQcqWMUNfoSpy0DzuzPYeXTw8qfSIIHJGnQTe4c'
)

async function updateDivergencias() {
  // Buscar as tarefas do POSTO ALTEROSA com as datas específicas
  const { data: tarefas, error: errSearch } = await supabase
    .from('tarefas')
    .select('id, titulo, extrato_data, extrato_diferenca, extrato_status, posto:postos(nome)')
    .eq('categoria', 'conciliacao_bancaria')
    .in('extrato_status', ['divergente', 'ok'])
    .not('extrato_arquivo_path', 'is', null)

  if (errSearch) {
    console.error('Erro ao buscar:', errSearch)
    process.exit(1)
  }

  console.log('\n=== Tarefas encontradas ===')
  const alterosa = tarefas.filter(t => {
    const postoNome = t.posto?.nome || ''
    return postoNome.includes('ALTEROSA')
  })

  alterosa.forEach(t => {
    console.log(`ID: ${t.id}`)
    console.log(`Data: ${t.extrato_data}`)
    console.log(`Título: ${t.titulo}`)
    console.log(`Status: ${t.extrato_status}`)
    console.log(`Diferença: R$ ${t.extrato_diferenca}`)
    console.log('---')
  })

  // Atualizar as tarefas de 08/04 e 13/04
  const para08 = alterosa.find(t => t.extrato_data && t.extrato_data.includes('2025-04-08'))
  const para13 = alterosa.find(t => t.extrato_data && t.extrato_data.includes('2025-04-13'))

  if (para08) {
    console.log(`\n✓ Atualizando tarefa de 08/04 (ID: ${para08.id})`)
    const { error } = await supabase
      .from('tarefas')
      .update({ extrato_status: 'ok', extrato_diferenca: 0 })
      .eq('id', para08.id)
    if (error) console.error('Erro:', error)
    else console.log('Atualizada com sucesso!')
  }

  if (para13) {
    console.log(`\n✓ Atualizando tarefa de 13/04 (ID: ${para13.id})`)
    const { error } = await supabase
      .from('tarefas')
      .update({ extrato_status: 'ok', extrato_diferenca: 0 })
      .eq('id', para13.id)
    if (error) console.error('Erro:', error)
    else console.log('Atualizada com sucesso!')
  }

  console.log('\n✅ Pronto! Agora clique em "Atualizar" na página para a auto-conclusão funcionar')
  process.exit(0)
}

updateDivergencias().catch(e => {
  console.error('Erro:', e)
  process.exit(1)
})
