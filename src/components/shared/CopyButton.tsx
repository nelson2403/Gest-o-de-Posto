'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { copyToClipboard } from '@/lib/utils/clipboard'

interface CopyButtonProps {
  text: string
  title?: string
  successMessage?: string
  className?: string
  size?: 'sm' | 'default'
}

export function CopyButton({
  text,
  title = 'Copiar',
  successMessage = 'Copiado!',
  className,
  size = 'sm',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await copyToClipboard(text)
    setCopied(true)
    toast({ title: successMessage })
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className ?? (size === 'sm' ? 'h-6 w-6' : 'h-8 w-8') + ' text-gray-400 hover:text-green-600 hover:bg-green-50'}
      onClick={handleCopy}
      title={title}
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-500" />
        : <Copy className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
    </Button>
  )
}
