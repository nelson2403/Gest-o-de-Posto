-- Add Autosystem sync fields to postos table
ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS razao_social    TEXT,
  ADD COLUMN IF NOT EXISTS telefone        TEXT,
  ADD COLUMN IF NOT EXISTS celular         TEXT,
  ADD COLUMN IF NOT EXISTS ie              TEXT,
  ADD COLUMN IF NOT EXISTS cep             TEXT,
  ADD COLUMN IF NOT EXISTS bairro          TEXT,
  ADD COLUMN IF NOT EXISTS cidade          TEXT,
  ADD COLUMN IF NOT EXISTS uf              CHAR(2),
  ADD COLUMN IF NOT EXISTS sincronizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS as_ult_alteracao TIMESTAMPTZ;
