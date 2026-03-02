'use client'

interface Props {
  senderName: string
  text: string
  onClick?: () => void
}

export function ReplyQuote({ senderName, text, onClick }: Props) {
  const truncated = text.length > 120 ? text.slice(0, 120) + '...' : text
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-2 mb-1.5 text-left w-full bg-transparent border-none p-0 cursor-pointer group/reply"
    >
      <div className="w-0.5 shrink-0 self-stretch rounded-full bg-accent-bright/50" />
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-600 text-accent-bright">{senderName}</span>
        <p className="text-[12px] text-text-3 leading-[1.4] break-words m-0 group-hover/reply:text-text-2 transition-colors">
          {truncated}
        </p>
      </div>
    </button>
  )
}
