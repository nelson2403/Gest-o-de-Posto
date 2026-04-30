'use client'

interface HeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function Header({ title, description, actions }: HeaderProps) {
  return (
    <div className="flex items-center min-h-[52px] px-4 md:px-6 py-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200/80 dark:border-gray-800 gap-3 flex-shrink-0 flex-wrap">
      <div className="flex-1 min-w-0">
        <h1 className="text-[14px] md:text-[15px] font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate">{title}</h1>
        {description && <p className="hidden sm:block text-[11px] text-gray-400 dark:text-gray-500 leading-tight truncate">{description}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  )
}
