'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Camera, RefreshCw, Loader2, ImageIcon } from 'lucide-react'

interface Props {
  onScanned: (codigo: string) => void
  onClose: () => void
}

// Detecta se getUserMedia está disponível (HTTPS ou localhost)
function podeUsarCamera(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  )
}

// ── Modo ao vivo (HTTPS) ──────────────────────────────────────────────────────
function ScannerAoVivo({ onScanned, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const [cameras, setCameras]  = useState<MediaDeviceInfo[]>([])
  const [camIdx,  setCamIdx]   = useState(0)
  const [erro,    setErro]     = useState('')
  const [lido,    setLido]     = useState('')
  const readerRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        const devs = await BrowserMultiFormatReader.listVideoInputDevices()
        if (cancelled) return
        if (!devs.length) { setErro('Nenhuma câmera encontrada'); return }
        const backIdx = devs.findIndex(d =>
          /back|traseira|rear|environment/i.test(d.label)
        )
        setCameras(devs)
        setCamIdx(backIdx >= 0 ? backIdx : 0)
      } catch {
        if (!cancelled) setErro('Sem permissão para acessar a câmera')
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!cameras.length || !videoRef.current) return
    let reader: any
    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        reader = new BrowserMultiFormatReader()
        readerRef.current = reader
        await reader.decodeFromVideoDevice(
          cameras[camIdx]?.deviceId ?? undefined,
          videoRef.current!,
          (result: any, err: any) => {
            if (result) {
              setLido(result.getText())
              onScanned(result.getText())
              setTimeout(onClose, 500)
            }
          },
        )
      } catch {
        setErro('Não foi possível acessar a câmera')
      }
    }
    start()
    return () => {
      try { readerRef.current?.reset?.() } catch {}
      import('@zxing/browser').then(m => {
        try { m.BrowserMultiFormatReader.releaseAllStreams() } catch {}
      })
    }
  }, [cameras, camIdx])

  return (
    <>
      <div className="relative bg-black aspect-video">
        {erro ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 text-[13px]">
            <Camera className="w-8 h-8 opacity-50" />
            <p className="text-center px-4 opacity-75">{erro}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-24 border-2 border-white/50 rounded-lg relative">
                <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-indigo-400 rounded-tl" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-indigo-400 rounded-tr" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-indigo-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-indigo-400 rounded-br" />
                <div className="absolute inset-x-2 h-px bg-indigo-400/80 animate-scan-line" />
              </div>
            </div>
          </>
        )}
        {lido && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/80">
            <div className="text-white text-center">
              <p className="text-lg font-bold">✓ Lido!</p>
              <p className="text-sm font-mono mt-1">{lido}</p>
            </div>
          </div>
        )}
      </div>
      {cameras.length > 1 && (
        <div className="px-4 py-2.5 flex justify-between items-center">
          <p className="text-[11px] text-gray-400 truncate max-w-[60%]">
            {cameras[camIdx]?.label?.split('(')[0]?.trim() || 'Câmera'}
          </p>
          <button
            onClick={() => {
              import('@zxing/browser').then(m => {
                try { m.BrowserMultiFormatReader.releaseAllStreams() } catch {}
              })
              setCamIdx(i => (i + 1) % cameras.length)
            }}
            className="flex items-center gap-1.5 text-[12px] text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Trocar câmera
          </button>
        </div>
      )}
    </>
  )
}

// ── Modo foto (HTTP — câmera nativa do celular) ───────────────────────────────
function ScannerFoto({ onScanned, onClose }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null)
  const imgRef    = useRef<HTMLImageElement>(null)
  const [status,  setStatus]  = useState<'aguardando' | 'lendo' | 'erro' | 'ok'>('aguardando')
  const [msg,     setMsg]     = useState('')

  async function processarImagem(file: File) {
    setStatus('lendo')
    setMsg('')
    try {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.src = url
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej })

      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      const result = await reader.decodeFromImageElement(img)
      URL.revokeObjectURL(url)

      setStatus('ok')
      setMsg(result.getText())
      onScanned(result.getText())
      setTimeout(onClose, 700)
    } catch {
      setStatus('erro')
      setMsg('Código não encontrado. Tente tirar uma foto mais nítida e centralizada.')
    }
  }

  return (
    <div className="p-5 space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-indigo-200 rounded-xl p-8 flex flex-col items-center gap-3 text-center cursor-pointer hover:bg-indigo-50/50 transition-colors"
      >
        {status === 'lendo' ? (
          <>
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-[13px] text-gray-500">Lendo código de barras...</p>
          </>
        ) : status === 'ok' ? (
          <>
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-600 text-lg">✓</span>
            </div>
            <p className="text-[13px] font-semibold text-green-700">Lido: {msg}</p>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
              <Camera className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <p className="text-[14px] font-semibold text-gray-800">Fotografar código de barras</p>
              <p className="text-[12px] text-gray-400 mt-1">Toque aqui para abrir a câmera</p>
            </div>
          </>
        )}
      </div>

      {status === 'erro' && (
        <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <ImageIcon className="w-4 h-4 shrink-0 mt-0.5" />
          {msg}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) processarImagem(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function BarcodeScannerCamera({ onScanned, onClose }: Props) {
  const [modo] = useState<'live' | 'foto'>(() => podeUsarCamera() ? 'live' : 'foto')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-indigo-500" />
            <p className="text-[14px] font-semibold text-gray-800">Escanear código de barras</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {modo === 'live'
          ? <ScannerAoVivo onScanned={onScanned} onClose={onClose} />
          : <ScannerFoto   onScanned={onScanned} onClose={onClose} />
        }
      </div>
    </div>
  )
}
