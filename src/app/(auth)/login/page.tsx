'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, EyeOff, ArrowLeft, MailCheck, Fuel, TrendingUp, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()
  const [loading,    setLoading]    = useState(false)
  const [showPass,   setShowPass]   = useState(false)
  const [form,       setForm]       = useState({ email: '', password: '' })
  const [resetMode,  setResetMode]  = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent,  setResetSent]  = useState(false)

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
    if (error) {
      toast({ variant: 'destructive', title: 'Acesso negado', description: 'Email ou senha incorretos.' })
    } else {
      router.push('/')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo })
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao enviar', description: error.message })
    } else {
      setResetSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'linear-gradient(135deg, #1a0704 0%, #2d0c08 50%, #1a0704 100%)' }}>

      {/* ── Painel esquerdo — branding ──────────────────── */}
      <div className="hidden lg:flex flex-col w-[480px] flex-shrink-0 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #8b1a14 0%, #5a1110 60%, #2d0806 100%)' }}>

        {/* Padrão geométrico de fundo */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }} />

        {/* Círculo decorativo */}
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #ff6b5b 0%, transparent 70%)' }} />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #ff6b5b 0%, transparent 70%)' }} />

        <div className="relative z-10 flex flex-col h-full p-12">

          {/* Logo */}
          <div className="flex items-center gap-4">
            <img src="/logo.svg" alt="Grupo Pedra do Pombal" className="w-14 h-14 drop-shadow-lg" />
            <div>
              <p className="text-white/60 text-[11px] font-semibold tracking-[0.2em] uppercase">Grupo</p>
              <p className="text-white text-[20px] font-extrabold leading-tight tracking-tight">Pedra do Pombal</p>
            </div>
          </div>

          {/* Headline central */}
          <div className="flex-1 flex flex-col justify-center space-y-6">
            <div>
              <h2 className="text-[32px] font-black text-white leading-tight">
                Gestão inteligente<br />
                <span style={{ color: 'rgba(255,180,170,0.9)' }}>da sua rede</span><br />
                de postos
              </h2>
              <p className="text-white/40 text-[14px] mt-4 leading-relaxed max-w-[320px]">
                Controle completo de combustíveis, financeiro, maquininhas e logística em uma plataforma unificada.
              </p>
            </div>

            <div className="space-y-4">
              {[
                { icon: Fuel,        title: 'Medição de tanques em tempo real',    desc: 'Monitore o estoque de combustível de todos os postos' },
                { icon: TrendingUp,  title: 'Controle financeiro integrado',       desc: 'Conciliação bancária, caixas e contas a pagar' },
                { icon: ShieldCheck, title: 'Acesso por perfil e posto',           desc: 'Permissões individuais para cada colaborador' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <Icon className="w-4 h-4 text-white/80" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-white/80 leading-tight">{title}</p>
                    <p className="text-[12px] text-white/35 mt-0.5 leading-snug">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-white/20">
            © {new Date().getFullYear()} Grupo Pedra do Pombal. Todos os direitos reservados.
          </p>
        </div>
      </div>

      {/* ── Painel direito — formulário ─────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[380px] animate-fade-up">

          {/* Logo mobile */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <img src="/logo.svg" alt="Logo" className="w-10 h-10" />
            <div>
              <p className="text-white/50 text-[10px] tracking-widest uppercase">Grupo</p>
              <p className="text-white font-extrabold text-[16px] leading-tight">Pedra do Pombal</p>
            </div>
          </div>

          {/* LOGIN */}
          {!resetMode && (
            <>
              <div className="mb-8">
                <h1 className="text-[26px] font-black text-white leading-tight">Bem-vindo de volta</h1>
                <p className="text-[13px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Insira suas credenciais para acessar o painel
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="h-11 text-[13px] text-white placeholder:text-white/20"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Senha
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      className="h-11 pr-10 text-[13px] text-white placeholder:text-white/20"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                      required
                      autoComplete="current-password"
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <button type="button" onClick={() => setResetMode(true)}
                    className="text-[12px] transition-colors"
                    style={{ color: 'rgba(255,180,170,0.6)' }}>
                    Esqueceu a senha?
                  </button>
                </div>

                <Button type="submit"
                  className="w-full h-11 font-bold text-[14px] text-white shadow-lg mt-1 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #a82520 0%, #8b1a14 100%)', boxShadow: '0 4px 24px rgba(139,26,20,0.4)' }}
                  disabled={loading}>
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Entrando...</>
                    : 'Entrar no sistema'
                  }
                </Button>
              </form>
            </>
          )}

          {/* REDEFINIR SENHA */}
          {resetMode && (
            <>
              <button onClick={() => { setResetMode(false); setResetSent(false) }}
                className="flex items-center gap-1.5 text-[12px] mb-8 transition-colors"
                style={{ color: 'rgba(255,255,255,0.4)' }}>
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar ao login
              </button>

              {!resetSent ? (
                <>
                  <div className="mb-8">
                    <h1 className="text-[24px] font-black text-white">Redefinir senha</h1>
                    <p className="text-[13px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Enviaremos um link para redefinir sua senha.
                    </p>
                  </div>
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-email" className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Email
                      </Label>
                      <Input id="reset-email" type="email" placeholder="seu@email.com"
                        value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                        className="h-11 text-[13px] text-white placeholder:text-white/20"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                        required autoFocus />
                    </div>
                    <Button type="submit"
                      className="w-full h-11 font-bold text-[14px] text-white"
                      style={{ background: 'linear-gradient(135deg, #a82520 0%, #8b1a14 100%)', boxShadow: '0 4px 24px rgba(139,26,20,0.4)' }}
                      disabled={loading}>
                      {loading
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
                        : 'Enviar link de redefinição'
                      }
                    </Button>
                  </form>
                </>
              ) : (
                <div className="text-center space-y-5">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                    style={{ background: 'rgba(139,26,20,0.2)', border: '1px solid rgba(139,26,20,0.4)' }}>
                    <MailCheck className="w-8 h-8" style={{ color: '#ff9a8f' }} />
                  </div>
                  <div>
                    <h1 className="text-[22px] font-black text-white">Email enviado!</h1>
                    <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Verifique sua caixa de entrada em{' '}
                      <span className="text-white/70 font-medium">{resetEmail}</span>
                    </p>
                  </div>
                  <button onClick={() => { setResetMode(false); setResetSent(false) }}
                    className="text-[12px] transition-colors" style={{ color: 'rgba(255,170,160,0.7)' }}>
                    Voltar ao login
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
