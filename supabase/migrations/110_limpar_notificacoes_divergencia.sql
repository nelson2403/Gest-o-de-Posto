-- Limpa todas as notificações de divergência antigas
DELETE FROM public.notificacoes
WHERE tipo IN ('divergencia_extrato', 'divergencia_resolvida');

-- Verifica quantas foram deletadas
SELECT COUNT(*) as notificacoes_removidas FROM public.notificacoes
WHERE tipo IN ('divergencia_extrato', 'divergencia_resolvida');
