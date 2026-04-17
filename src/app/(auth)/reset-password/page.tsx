'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Fuel, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function ResetPasswordPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [loading,   setLoading]   = useState(false)
  const [showPass,  setShowPass]  = useState(false)
  const [showPass2, setShowPass2] = useState(false)
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (password.length < 6) {
      toast({ variant: 'destructive', title: 'Senha muito curta', description: 'A senha deve ter pelo menos 6 caracteres.' })
      return
    }
    if (password !== confirm) {
      toast({ variant: 'destructive', title: 'Senhas não coincidem', description: 'Confirme a senha corretamente.' })
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao redefinir', description: error.message })
    } else {
      toast({ title: 'Senha redefinida!', description: 'Sua senha foi atualizada com sucesso.' })
      router.push('/login')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(222,44%,8%)] p-6">
      <div className="w-full max-w-[360px] animate-fade-up">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <Fuel className="w-4 h-4 text-white" />
          </div>
          <p className="font-semibold text-white text-[14px]">Gestão de Postos</p>
        </div>

        <div className="mb-8">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6 text-orange-400" />
          </div>
          <h1 className="text-[22px] font-bold text-white">Nova senha</h1>
          <p className="text-[13px] text-white/35 mt-1">Escolha uma nova senha para sua conta.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-[12px] text-white/50 font-medium">Nova senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-10 bg-white/[0.05] border-white/10 text-white placeholder:text-white/20 focus-visible:border-orange-500 focus-visible:ring-orange-500/20 pr-10 text-[13px]"
                required
                autoFocus
                minLength={6}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-[12px] text-white/50 font-medium">Confirmar nova senha</Label>
            <div className="relative">
              <Input
                id="confirm"
                type={showPass2 ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="h-10 bg-white/[0.05] border-white/10 text-white placeholder:text-white/20 focus-visible:border-orange-500 focus-visible:ring-orange-500/20 pr-10 text-[13px]"
                required
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass2(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
              >
                {showPass2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[13px] shadow-lg shadow-orange-500/20 transition-all mt-2"
            disabled={loading}
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</>
              : 'Salvar nova senha'
            }
          </Button>
        </form>
      </div>
    </div>
  )
}
