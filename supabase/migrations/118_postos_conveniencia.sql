-- Marca postos que são apenas loja de conveniência (sem combustível).
-- Usado para identificação (badge) e para filtrar áreas específicas de
-- combustível (tanques, sugestão de pedido de combustível, painéis de venda).

ALTER TABLE postos ADD COLUMN IF NOT EXISTS conveniencia boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
