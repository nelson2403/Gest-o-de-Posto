'use client'

import { useState } from 'react'
import { Eye, EyeOff, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { copyToClipboard as doCopy } from '@/lib/utils/clipboard'

interface PasswordRevealProps {
  value: string | null
  canReveal?: boolean
}

export function PasswordReveal({ value, canReveal = true }: PasswordRevealProps) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!value) return <span className="text-gray-400 text-sm">—</span>

  async function copyToClipboard() {
    await doCopy(value!)
    setCopied(true)
    toast({ title: 'Copiado!', description: 'Senha copiada para a área de transferência.' })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">
        {revealed ? value : '••••••••'}
      </span>
      {canReveal && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setRevealed(p => !p)}
            title={revealed ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </Button>
          {revealed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={copyToClipboard}
              title="Copiar senha"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
