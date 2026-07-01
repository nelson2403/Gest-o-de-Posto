-- Questionário do cartão de desconto ao lançar preço (Preços-Frotas).
-- tem_cartao_desconto: por POSTO (lembrado, pré-preenchido no próximo lançamento).
-- cartao_desconto_aplicado: por POSTO+COMBUSTÍVEL (se o cartão vale naquele produto).

alter table public.postos
  add column if not exists tem_cartao_desconto boolean;

alter table public.precos_combustivel
  add column if not exists cartao_desconto_aplicado boolean;
