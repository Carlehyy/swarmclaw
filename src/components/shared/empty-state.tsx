interface Props {
  icon: React.ReactNode
  title: string
  subtitle?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon, title, subtitle, action }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-text-3 p-8 text-center">
      <div className="w-12 h-12 rounded-[14px] bg-accent-soft flex items-center justify-center mb-1">
        {icon}
      </div>
      <p className="font-display text-[15px] font-600 text-text-2">{title}</p>
      {subtitle && <p className="text-[13px] text-text-3/50">{subtitle}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-3 px-8 py-3 rounded-[14px] border-none bg-accent-bright text-white
            text-[14px] font-600 cursor-pointer active:scale-95 transition-all duration-200
            shadow-[0_4px_16px_rgba(99,102,241,0.2)]"
          style={{ fontFamily: 'inherit' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
