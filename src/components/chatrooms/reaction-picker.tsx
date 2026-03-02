'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

const CATEGORIES: Array<{ id: string; label: string; icon: string; emojis: string[] }> = [
  {
    id: 'frequent',
    label: 'Frequently Used',
    icon: '🕐',
    emojis: ['👍', '❤️', '😂', '🔥', '🎉', '👀', '🚀', '✅', '💯', '🤔'],
  },
  {
    id: 'smileys',
    label: 'Smileys & People',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊',
      '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋',
      '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🫢', '🤫', '🤔',
      '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄',
      '😬', '🤥', '🫨', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒',
      '🤕', '🤢', '🤮', '🥴', '😵', '🤯', '🥳', '🥸', '😎', '🤓',
      '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺',
      '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖',
      '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬',
      '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽',
      '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
      '🙈', '🙉', '🙊', '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲',
      '🫳', '🫴', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘',
      '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎',
      '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝',
      '🙏', '✍️', '💪', '🦾', '🧠', '👀', '👁️', '👅', '👄', '🫦',
    ],
  },
  {
    id: 'nature',
    label: 'Animals & Nature',
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨',
      '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤',
      '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱',
      '🐛', '🦋', '🐌', '🐞', '🐜', '🪲', '🪳', '🕷️', '🦂', '🐢',
      '🐍', '🦎', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟',
      '🐬', '🐳', '🐋', '🦈', '🪸', '🐊', '🐅', '🐆', '🦓', '🦍',
      '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂',
      '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩',
      '🌵', '🎄', '🌲', '🌳', '🌴', '🪵', '🌱', '🌿', '☘️', '🍀',
      '🍁', '🍂', '🍃', '🪹', '🪺', '🌺', '🌻', '🌹', '🥀', '🌷',
      '🌼', '🌸', '💐', '🍄', '🌰', '🎃', '🌍', '🌙', '⭐', '🌟',
      '💫', '✨', '⚡', '☀️', '🌤️', '🌈', '☁️', '🌧️', '❄️', '🔥',
    ],
  },
  {
    id: 'food',
    label: 'Food & Drink',
    icon: '🍕',
    emojis: [
      '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈',
      '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍆', '🥦',
      '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🧄', '🧅', '🥔', '🍠',
      '🥐', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🥞', '🧇', '🥓',
      '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙',
      '🧆', '🌮', '🌯', '🫔', '🥗', '🍝', '🍜', '🍲', '🍛', '🍣',
      '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍡',
      '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬',
      '🍫', '🍿', '🧈', '🥤', '☕', '🍵', '🧃', '🧉', '🍶', '🍺',
      '🍻', '🥂', '🍷', '🍸', '🍹', '🍾', '🧊', '🥄', '🍴', '🥢',
    ],
  },
  {
    id: 'activity',
    label: 'Activities',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🏓', '🏸', '🏒', '🥊', '🥋', '🥅', '⛳', '⛸️', '🎣', '🤿',
      '🎿', '🛷', '🥌', '🎯', '🪀', '🪁', '🎮', '🕹️', '🎰', '🧩',
      '♟️', '🎲', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁',
      '🎷', '🎺', '🪗', '🎸', '🎻', '🎪', '🎫', '🎟️', '🏆', '🥇',
      '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎁', '🎀', '🎈', '🎊',
    ],
  },
  {
    id: 'travel',
    label: 'Travel & Places',
    icon: '✈️',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛺', '🚔',
      '🚍', '🚘', '🚖', '✈️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚢',
      '🏠', '🏡', '🏘️', '🏢', '🏣', '🏥', '🏦', '🏪', '🏫', '🏩',
      '💒', '🏛️', '⛪', '🕌', '🛕', '🕍', '⛩️', '🏰', '🏯', '🗼',
      '🗽', '🗿', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️',
      '🏔️', '🗻', '🌋', '🏕️', '🛤️', '🛣️', '🌅', '🌄', '🌃', '🌉',
    ],
  },
  {
    id: 'objects',
    label: 'Objects',
    icon: '💡',
    emojis: [
      '⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '💽', '💾',
      '💿', '📀', '🎥', '📷', '📸', '📹', '📼', '🔍', '🔎', '🕯️',
      '💡', '🔦', '🏮', '🪔', '📔', '📕', '📖', '📗', '📘', '📙',
      '📚', '📓', '📒', '📃', '📜', '📄', '📰', '📑', '🔖', '💰',
      '🪙', '💴', '💵', '💶', '💷', '💸', '💳', '✉️', '📧', '📨',
      '📩', '📤', '📥', '📦', '📫', '📪', '📬', '📭', '📮', '🗳️',
      '✏️', '✒️', '🖋️', '🖊️', '🖌️', '🖍️', '📝', '📁', '📂', '🗂️',
      '📅', '📆', '📇', '📈', '📉', '📊', '📋', '📌', '📍', '📎',
      '🔐', '🔑', '🗝️', '🔨', '🪓', '⛏️', '⚒️', '🛠️', '🗡️', '⚔️',
      '🔧', '🪛', '🔩', '⚙️', '🗜️', '⚖️', '🦯', '🔗', '⛓️', '🪝',
    ],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️',
      '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑',
      '♒', '♓', '⛎', '🔀', '🔁', '🔂', '▶️', '⏩', '⏭️', '⏯️',
      '◀️', '⏪', '⏮️', '🔼', '⏫', '🔽', '⏬', '⏸️', '⏹️', '⏺️',
      '⏏️', '🎦', '🔅', '🔆', '📶', '🛜', '📳', '📴', '♀️', '♂️',
      '⚧️', '✖️', '➕', '➖', '➗', '🟰', '♾️', '‼️', '⁉️', '❓',
      '❔', '❕', '❗', '〰️', '💱', '💲', '⚕️', '♻️', '⚜️', '🔱',
      '✔️', '☑️', '✅', '❌', '❎', '➰', '➿', '〽️', '✳️', '✴️',
      '❇️', '©️', '®️', '™️', '#️⃣', '*️⃣', '0️⃣', '1️⃣', '2️⃣', '3️⃣',
      '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶',
      '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳', '🔲', '🏁',
      '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇺🇸', '🇬🇧', '🇯🇵',
    ],
  },
]

interface Props {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export function ReactionPicker({ onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('frequent')

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Auto-focus search on open
  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [])

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    // Simple search: match against category names or just return all emojis that are visible
    const results: string[] = []
    const seen = new Set<string>()
    for (const cat of CATEGORIES) {
      if (cat.id === 'frequent') continue
      for (const emoji of cat.emojis) {
        if (!seen.has(emoji)) {
          seen.add(emoji)
          results.push(emoji)
        }
      }
    }
    // For basic emoji search, filter by category label matching
    // Since emoji don't have text names in this simple implementation,
    // we filter categories that match and show all their emojis
    const matchingCats = CATEGORIES.filter(
      (c) => c.id !== 'frequent' && c.label.toLowerCase().includes(q)
    )
    if (matchingCats.length > 0) {
      const catResults: string[] = []
      const catSeen = new Set<string>()
      for (const cat of matchingCats) {
        for (const emoji of cat.emojis) {
          if (!catSeen.has(emoji)) {
            catSeen.add(emoji)
            catResults.push(emoji)
          }
        }
      }
      return catResults
    }
    // If no category match, just return all emojis (user can visually scan)
    return results
  }, [search])

  return (
    <div
      ref={ref}
      className="absolute right-0 bottom-8 z-50 bg-[#13131e] border border-white/[0.1] rounded-[12px] shadow-[0_8px_40px_rgba(0,0,0,0.6)] w-[320px] flex flex-col overflow-hidden"
      style={{ animation: 'msg-in 0.15s ease-out both' }}
    >
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emoji..."
          className="w-full px-2.5 py-1.5 rounded-[8px] bg-white/[0.06] border border-white/[0.08] text-[12px] text-text placeholder:text-text-3 focus:outline-none focus:border-accent-bright/40"
        />
      </div>

      {/* Category tabs */}
      {!search.trim() && (
        <div className="flex px-2 gap-0.5 pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              title={cat.label}
              className={`flex-1 py-1 flex items-center justify-center rounded-[6px] text-[14px] cursor-pointer transition-all ${
                activeCategory === cat.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'
              }`}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="px-2 pb-2 max-h-[220px] overflow-y-auto">
        {search.trim() ? (
          <div className="grid grid-cols-8 gap-0.5">
            {filteredEmojis?.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => onSelect(emoji)}
                className="w-[34px] h-[34px] flex items-center justify-center rounded-[6px] hover:bg-white/[0.08] transition-all cursor-pointer text-[18px]"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : (
          CATEGORIES.filter((c) => c.id === activeCategory).map((cat) => (
            <div key={cat.id}>
              <div className="text-[10px] font-600 text-text-3 uppercase tracking-wider px-1 py-1.5">{cat.label}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {cat.emojis.map((emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    onClick={() => onSelect(emoji)}
                    className="w-[34px] h-[34px] flex items-center justify-center rounded-[6px] hover:bg-white/[0.08] transition-all cursor-pointer text-[18px]"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
