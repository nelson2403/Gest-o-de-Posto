'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Fuel, Loader2, Eye, EyeOff, ShieldCheck, Zap, Database, ArrowLeft, MailCheck } from 'lucide-react'
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
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
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
    <div className="min-h-screen flex bg-[hsl(222,44%,8%)]">
      {/* Painel esquerdo — branding */}
      <div className="hidden lg:flex flex-col justify-between w-[460px] flex-shrink-0 p-12 bg-[hsl(222,44%,6%)] border-r border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg">
            <Fuel className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-semibold text-[14px] text-white leading-tight">Gestão de Postos</p>
            <p className="text-[11px] text-white/30">Sistema de Controle</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-[26px] font-bold text-white leading-tight">
              Gestão centralizada<br />de acessos e maquininhas
            </h2>
            <p className="text-[13px] text-white/40 mt-3 leading-relaxed">
              Controle completo de postos de combustível, adquirentes, maquininhas, taxas e acessos técnicos em uma única plataforma.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: ShieldCheck, title: 'Controle por nível de acesso', desc: 'Perfis Master, Administrador e Operador com permissões individuais' },
              { icon: Database,    title: 'Multi-empresa',                desc: 'Gerencie múltiplas redes de postos em uma única plataforma' },
              { icon: Zap,         title: 'Dados em tempo real',          desc: 'Maquininhas, taxas e acessos sempre atualizados' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-orange-400" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-white/75">{title}</p>
                  <p className="text-[12px] text-white/30 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-white/15">
          © {new Date().getFullYear()} Gestão de Postos. Todos os direitos reservados.
        </p>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[360px] animate-fade-up">
          {/* Logo mobile */}
          <div className="flex items-center gap-2.5 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <Fuel className="w-4 h-4 text-white" />
            </div>
            <p className="font-semibold text-white text-[14px]">Gestão de Postos</p>
          </div>

          {/* ── LOGIN ── */}
          {!resetMode && (
            <>
              <div className="mb-8">
                <h1 className="text-[22px] font-bold text-white">Bem-vindo de volta</h1>
                <p className="text-[13px] text-white/35 mt-1">Insira suas credenciais para acessar o painel</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[12px] text-white/50 font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    className="h-10 bg-white/[0.05] border-white/10 text-white placeholder:text-white/20 focus-visible:border-orange-500 focus-visible:ring-orange-500/20 text-[13px]"
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center">
                    <Label htmlFor="password" className="text-[12px] text-white/50 font-medium">Senha</Label>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      className="h-10 bg-white/[0.05] border-white/10 text-white placeholder:text-white/20 focus-visible:border-orange-500 focus-visible:ring-orange-500/20 pr-10 text-[13px]"
                      required
                      autoComplete="current-password"
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

                <Button
                  type="submit"
                  className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[13px] shadow-lg shadow-orange-500/20 transition-all mt-2"
                  disabled={loading}
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Entrando...</>
                    : 'Entrar'
                  }
                </Button>
              </form>
            </>
          )}

          {/* ── REDEFINIR SENHA ── */}
          {resetMode && (
            <>
              <button
                onClick={() => { setResetMode(false); setResetSent(false) }}
                className="flex items-center gap-1.5 text-[12px] text-white/40 hover:text-white/70 transition-colors mb-8"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar ao login
              </button>

              {!resetSent ? (
                <>
                  <div className="mb-8">
                    <h1 className="text-[22px] font-bold text-white">Redefinir senha</h1>
                    <p className="text-[13px] text-white/35 mt-1">
                      Informe seu email e enviaremos um link para redefinir sua senha.
                    </p>
                  </div>

                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-email" className="text-[12px] text-white/50 font-medium">Email</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={resetEmail}
                        onChange={e => setResetEmail(e.target.value)}
                        className="h-10 bg-white/[0.05] border-white/10 text-white placeholder:text-white/20 focus-visible:border-orange-500 focus-visible:ring-orange-500/20 text-[13px]"
                        required
                        autoFocus
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-10 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[13px] shadow-lg shadow-orange-500/20 transition-all"
                      disabled={loading}
                    >
                      {loading
                        ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
                        : 'Enviar link de redefinição'
                      }
                    </Button>
                  </form>
                </>
              ) : (
                <div className="text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto">
                    <MailCheck className="w-7 h-7 text-orange-400" />
                  </div>
                  <div>
                    <h1 className="text-[20px] font-bold text-white">Email enviado!</h1>
                    <p className="text-[13px] text-white/40 mt-2 leading-relaxed">
                      Verifique sua caixa de entrada em <span className="text-white/60 font-medium">{resetEmail}</span> e clique no link para redefinir sua senha.
                    </p>
                  </div>
                  <button
                    onClick={() => { setResetMode(false); setResetSent(false) }}
                    className="text-[12px] text-orange-400/70 hover:text-orange-400 transition-colors"
                  >
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
