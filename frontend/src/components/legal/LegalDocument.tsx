import { Fragment, type ReactNode } from 'react'

function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part}</Fragment>,
  )
}

export function LegalDocument({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <article className="flex flex-col gap-3 text-[14px] leading-relaxed text-[color:var(--app-text-color)]">
      {blocks.map((block, i) => {
        if (block.startsWith('# ')) {
          return <h1 key={i} className="text-[20px] font-bold leading-tight">{block.slice(2)}</h1>
        }
        if (block.startsWith('## ')) {
          return <h2 key={i} className="pt-2 text-[16px] font-semibold leading-snug">{block.slice(3)}</h2>
        }
        const lines = block.split('\n')
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}
            </ul>
          )
        }
        return <p key={i}>{inline(lines.join(' '))}</p>
      })}
    </article>
  )
}
