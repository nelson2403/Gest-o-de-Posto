'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { ConfirmacaoConciliacao } from '../_ConfirmacaoConciliacao'

type PostoRow = { id: string; nome: string }

const PERMITIDO = ['master', 'adm_financeiro', 'operador_conciliador']

export default function ConciliacaoIAPage() {
  const { usuario } = useAuthContext()
  const [postos, setPostos] = useState<PostoRow[]>([])

  useEffect(() => {
    fetch('/api/postos-mapeamento')
      .then(r => r.json())
      .then(j => setPostos(j.data ?? []))
      .catch(() => {})
  }, [])

  if (!PERMITIDO.includes(usuario?.role ?? '')) {
    return (
      <div className="animate-fade-in">
        <Header title="Conciliação com IA" description="Assistente de conciliação bancária" />
        <div className="p-6 text-center text-gray-400 text-sm">Sem permissão para acessar esta página.</div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Conciliação com IA"
        description="Extrato do banco × AUTOSYSTEM com auto-conciliação e sugestões da IA"
      />
      <ConfirmacaoConciliacao postos={postos} comIA />
    </div>
  )
}
