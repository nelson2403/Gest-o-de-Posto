'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Bot, X, Send, Loader2, Sparkles, ChevronDown, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useAuthContext } from '@/contexts/AuthContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const QUICK_ACTIONS: Record<string, { label: string; message: string }[]> = {
  '/': [
    { label: 'Resumo do dia', message: 'Faça um resumo dos principais indicadores e alertas de hoje.' },
    { label: 'Tarefas urgentes', message: 'Quais tarefas urgentes precisam de atenção imediata?' },
    { label: 'Tanques baixos', message: 'Algum tanque está com nível crítico ou preocupante?' },
  ],
  '/contas-pagar': [
    { label: 'Contas em atraso', message: 'Quais contas estão em atraso e qual é o impacto financeiro?' },
    { label: 'Previsão do mês', message: 'Qual é a previsão de gastos para o mês e quanto já foi pago?' },
    { label: 'Boletos pendentes', message: 'Há boletos ou solicitações aguardando análise?' },
  ],
  '/tarefas': [
    { label: 'Prioridades', message: 'Quais são as tarefas de maior prioridade abertas agora?' },
    { label: 'Por posto', message: 'Como estão distribuídas as tarefas abertas por posto?' },
    { label: 'Vencendo hoje', message: 'Quais tarefas vencem hoje ou já estão atrasadas?' },
  ],
  '/estoque': [
    { label: 'Estoque crítico', message: 'Quais itens estão com estoque abaixo do mínimo e precisam de reposição?' },
    { label: 'Resumo geral', message: 'Faça um resumo da situação atual do estoque de conveniência.' },
  ],
  '/fiscal': [
    { label: 'Pendências fiscais', message: 'Quais são as principais pendências fiscais abertas?' },
    { label: 'Tarefas vencidas', message: 'Há tarefas fiscais com vencimento ultrapassado?' },
  ],
  '/marketing': [
    { label: 'Ações ativas', message: 'Quais ações de marketing estão ativas e qual o investimento total?' },
    { label: 'Boletos enviados', message: 'Há solicitações de pagamento de marketing aguardando?' },
  ],
  '/postos': [
    { label: 'Visão geral', message: 'Faça um overview dos postos ativos da rede.' },
    { label: 'Comparar postos', message: 'Como posso comparar o desempenho entre os postos?' },
  ],
}

const DEFAULT_ACTIONS = [
  { label: 'O que você pode fazer?', message: 'O que você pode me ajudar nesta área do sistema?' },
  { label: 'Resumo geral', message: 'Faça um resumo geral da situação atual do sistema.' },
]

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={cn('flex gap-2 mb-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-indigo-600 text-white rounded-tr-sm'
            : 'bg-gray-100 text-gray-800 rounded-tl-sm'
        )}
      >
        {msg.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-2 mb-3 justify-start">
      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3.5 py-3 flex gap-1 items-center">
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  )
}

export function IAAssistente() {
  const pathname = usePathname()
  const { usuario } = useAuthContext()
  const role = usuario?.role ?? ''

  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const podeVerIA = role === 'master' || role.startsWith('adm_')

  const quickActions = QUICK_ACTIONS[pathname] ?? DEFAULT_ACTIONS

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setStreaming('')

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, page: pathname }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.text()
        setMessages(prev => [...prev, { role: 'assistant', content: `Erro: ${err}` }])
        return
      }

      if (!res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      setLoading(false)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setStreaming(accumulated)
      }

      setMessages(prev => [...prev, { role: 'assistant', content: accumulated }])
      setStreaming('')
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Não foi possível conectar à IA. Verifique se a GROQ_API_KEY está configurada.' }])
      }
    } finally {
      setLoading(false)
      setStreaming('')
    }
  }, [messages, loading, pathname])

  if (!podeVerIA) return null

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function reset() {
    abortRef.current?.abort()
    setMessages([])
    setInput('')
    setStreaming('')
    setLoading(false)
  }

  const showingMessages = messages.length > 0 || streaming || loading

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed bottom-5 right-5 z-50 w-13 h-13 rounded-full shadow-lg flex items-center justify-center transition-all duration-200',
          open
            ? 'bg-gray-700 rotate-90'
            : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105'
        )}
        style={{ width: 52, height: 52 }}
        title="Assistente IA"
      >
        {open ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Sparkles className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[360px] max-w-[calc(100vw-20px)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
          style={{ height: 520, maxHeight: 'calc(100vh - 100px)' }}>

          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-indigo-600 text-white flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold leading-none">Assistente IA</p>
              <p className="text-[11px] text-indigo-200 mt-0.5">Powered by Groq · Llama 3.3</p>
            </div>
            {showingMessages && (
              <button onClick={reset} title="Limpar conversa" className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                <RotateCcw className="w-3.5 h-3.5 text-white" />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
              <ChevronDown className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-3">
            {!showingMessages && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mb-3">
                  <Sparkles className="w-6 h-6 text-indigo-500" />
                </div>
                <p className="text-[13px] font-semibold text-gray-700">Como posso ajudar?</p>
                <p className="text-[12px] text-gray-400 mt-1 mb-4">
                  Analiso os dados do sistema e gero insights em tempo real.
                </p>
                <div className="w-full flex flex-col gap-2">
                  {quickActions.map(qa => (
                    <button
                      key={qa.label}
                      onClick={() => sendMessage(qa.message)}
                      className="w-full text-left px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-[12px] text-indigo-700 font-medium transition-colors border border-indigo-100"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showingMessages && (
              <>
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} />
                ))}
                {loading && !streaming && <TypingIndicator />}
                {streaming && (
                  <MessageBubble msg={{ role: 'assistant', content: streaming }} />
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Quick actions (compact) when there are messages */}
          {showingMessages && (
            <div className="px-3 pb-1 flex gap-1.5 flex-wrap flex-shrink-0">
              {quickActions.slice(0, 2).map(qa => (
                <button
                  key={qa.label}
                  onClick={() => sendMessage(qa.message)}
                  disabled={loading}
                  className="px-2.5 py-1 text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition-colors disabled:opacity-40"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex-shrink-0 px-3 pb-3 pt-1">
            <div className="flex items-end gap-2 bg-gray-100 rounded-xl px-3 py-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua pergunta... (Enter para enviar)"
                rows={1}
                disabled={loading}
                className="flex-1 bg-transparent text-[13px] text-gray-800 placeholder-gray-400 resize-none outline-none max-h-28 leading-relaxed disabled:opacity-50"
                style={{ minHeight: 22 }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 flex items-center justify-center flex-shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
