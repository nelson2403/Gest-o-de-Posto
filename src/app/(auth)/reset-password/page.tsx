'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff, ShieldCheck, CheckCircle2 } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function ResetPasswordPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [loading,   setLoading]   = useState(false)
  const [showPass,  setShowPass]  = useState(false)
  const [showPass2, setShowPass2] = useState(false)
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [pronto,    setPronto]    = useState(false)

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
      setPronto(true)
      setTimeout(() => { router.push('/login') }, 2200)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'linear-gradient(135deg, #1a0704 0%, #2d0c08 50%, #1a0704 100%)' }}>

      {/* glows decorativos */}
      <div className="fixed -bottom-32 -left-32 w-96 h-96 rounded-full opacity-[0.07] pointer-events-none"
        style={{ background: 'radial-gradient(circle, #ff6b5b 0%, transparent 70%)' }} />
      <div className="fixed -top-20 -right-20 w-80 h-80 rounded-full opacity-[0.07] pointer-events-none"
        style={{ background: 'radial-gradient(circle, #ff6b5b 0%, transparent 70%)' }} />

      <div className="w-full max-w-[400px] animate-fade-up relative z-10">

        {/* Logo + marca */}
        <div className="flex items-center justify-center gap-3 mb-7">
          <img src="/logo.png" alt="Grupo Pedra do Pombal" className="w-12 h-12 drop-shadow-lg" />
          <div className="leading-tight">
            <p className="text-white/50 text-[10px] font-semibold tracking-[0.25em] uppercase">Grupo</p>
            <p className="text-white text-[16px] font-extrabold leading-tight">Pedra do Pombal</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {!pronto ? (
            <>
              <div className="mb-7">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 bg-[#8b1a14]/10 border border-[#8b1a14]/20">
                  <ShieldCheck className="w-6 h-6 text-[#8b1a14]" />
                </div>
                <h1 className="text-[24px] font-black text-gray-900 leading-tight">Nova senha</h1>
                <p className="text-[13px] text-gray-500 mt-1.5">Escolha uma nova senha para a sua conta.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[12px] font-semibold text-gray-700">Nova senha</Label>
                  <div className="relative">
                    <Input id="password" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                      value={password} onChange={e => setPassword(e.target.value)}
                      className="h-11 pr-10 text-[13px] text-gray-900 placeholder:text-gray-400 bg-white border-gray-300 focus-visible:ring-[#8b1a14]/30 focus-visible:border-[#8b1a14]"
                      required autoFocus minLength={6} autoComplete="new-password" />
                    <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm" className="text-[12px] font-semibold text-gray-700">Confirmar nova senha</Label>
                  <div className="relative">
                    <Input id="confirm" type={showPass2 ? 'text' : 'password'} placeholder="••••••••"
                      value={confirm} onChange={e => setConfirm(e.target.value)}
                      className="h-11 pr-10 text-[13px] text-gray-900 placeholder:text-gray-400 bg-white border-gray-300 focus-visible:ring-[#8b1a14]/30 focus-visible:border-[#8b1a14]"
                      required autoComplete="new-password" />
                    <button type="button" tabIndex={-1} onClick={() => setShowPass2(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPass2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirm.length > 0 && confirm !== password && (
                    <p className="text-[11px] text-red-500">As senhas não coincidem.</p>
                  )}
                </div>

                <Button type="submit"
                  className="w-full h-11 font-bold text-[14px] text-white mt-1 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #a82520 0%, #8b1a14 100%)', boxShadow: '0 4px 24px rgba(139,26,20,0.35)' }}
                  disabled={loading}>
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</>
                    : 'Salvar nova senha'}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center py-4 space-y-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto bg-green-50 border border-green-200">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h1 className="text-[22px] font-black text-gray-900">Senha redefinida!</h1>
                <p className="text-[13px] mt-2 text-gray-500">Sua senha foi atualizada com sucesso. Redirecionando para o login…</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-white/25 mt-6">
          © {new Date().getFullYear()} Grupo Pedra do Pombal
        </p>
      </div>
    </div>
  )
}
