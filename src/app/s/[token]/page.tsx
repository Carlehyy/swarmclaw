import { notFound } from 'next/navigation'
import {
  isShareLinkActive,
  loadShareLinkByToken,
} from '@/lib/server/sharing/share-link-repository'
import { resolveSharedEntity, type SharedPayload } from '@/lib/server/sharing/share-resolver'

export const dynamic = 'force-dynamic'

export default async function SharedEntityPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const link = loadShareLinkByToken(token)
  if (!link || !isShareLinkActive(link)) notFound()
  const payload = resolveSharedEntity(link)
  if (!payload) notFound()

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 font-sans">
      <header className="mb-8">
        <div className="text-xs uppercase tracking-wider text-neutral-500">
          Shared {payload.kind}
        </div>
        {link.label ? (
          <h1 className="mt-1 text-2xl font-semibold">{link.label}</h1>
        ) : null}
      </header>
      {renderBody(payload)}
      <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        Public share link. Secrets and credentials are omitted.
      </footer>
    </div>
  )
}

function renderBody(payload: SharedPayload) {
  if (payload.kind === 'mission') {
    return (
      <section>
        <h2 className="text-xl font-semibold">{payload.title}</h2>
        <p className="mt-3 whitespace-pre-wrap text-neutral-800">{payload.goal}</p>
        {payload.successCriteria.length > 0 ? (
          <>
            <h3 className="mt-6 font-semibold">Success criteria</h3>
            <ul className="mt-2 list-disc pl-6 text-neutral-800">
              {payload.successCriteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </>
        ) : null}
        {payload.milestones.length > 0 ? (
          <>
            <h3 className="mt-6 font-semibold">Milestones</h3>
            <ol className="mt-2 space-y-1 text-sm text-neutral-800">
              {payload.milestones.map((m, i) => (
                <li key={i}>
                  <span className="text-neutral-500">{formatTime(m.at)}:</span> {m.note}
                </li>
              ))}
            </ol>
          </>
        ) : null}
        {payload.reports.length > 0 ? (
          <>
            <h3 className="mt-6 font-semibold">Reports</h3>
            <div className="mt-3 space-y-4">
              {payload.reports.map((r, i) => (
                <article key={i} className="rounded border border-neutral-200 p-4">
                  <div className="mb-2 text-xs text-neutral-500">
                    {formatTime(r.at)} · {r.format}
                  </div>
                  <pre className="whitespace-pre-wrap text-sm text-neutral-800">{r.content}</pre>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    )
  }

  if (payload.kind === 'skill') {
    return (
      <section>
        <h2 className="text-xl font-semibold">{payload.name}</h2>
        {payload.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {payload.tags.map((t) => (
              <span key={t} className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                {t}
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-4 text-neutral-800">{payload.description}</p>
        <pre className="mt-6 whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-800">
          {payload.content}
        </pre>
      </section>
    )
  }

  return (
    <section>
      <h2 className="text-xl font-semibold">{payload.name}</h2>
      {payload.agentName ? (
        <div className="mt-1 text-sm text-neutral-500">Agent: {payload.agentName}</div>
      ) : null}
      <div className="mt-6 space-y-4">
        {payload.messages.map((m, i) => (
          <article
            key={i}
            className="rounded border border-neutral-200 p-4"
          >
            <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
              <span className="uppercase">{m.role}</span>
              {m.at ? <span>{formatTime(m.at)}</span> : null}
            </div>
            <pre className="whitespace-pre-wrap text-sm text-neutral-800">{m.text}</pre>
          </article>
        ))}
      </div>
    </section>
  )
}

function formatTime(ts: number): string {
  if (!ts) return ''
  try {
    return new Date(ts).toISOString().replace('T', ' ').slice(0, 19)
  } catch {
    return ''
  }
}
