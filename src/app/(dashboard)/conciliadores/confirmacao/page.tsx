'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuthContext } from '@/contexts/AuthContext'
import { ConfirmacaoConciliacao } from '../_ConfirmacaoConciliacao'

type PostoRow = { id: string; nome: string }

export default function ConfirmacaoConciliacaoPage() {
  const { usuario } = useAuthContext()
  const [postos, setPostos] = useState<PostoRow[]>([])

  useEffect(() => {
    fetch('/api/postos-mapeamento')
      .then(r => r.json())
      .then(j => setPostos(j.data ?? []))
      .catch(() => {})
  }, [])

  if (usuario?.role !== 'master') {
    return (
      <div className="animate-fade-in">
        <Header title="Confirmação da Conciliação" description="Conciliação bancária — D-Para" />
        <div className="p-6 text-center text-gray-400 text-sm">Sem permissão para acessar esta página.</div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Confirmação da Conciliação"
        description="Extrato do banco × AUTOSYSTEM, linha a linha (D-Para)"
      />
      <ConfirmacaoConciliacao postos={postos} />
    </div>
  )
}
