import { NextResponse } from 'next/server'
import { loadDocuments, loadDocumentRevisions } from '@/lib/server/storage'
import type { DocumentRevision } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const docs = loadDocuments()
  if (!docs[id]) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 50))

  const allRevisions = loadDocumentRevisions() as Record<string, DocumentRevision>
  const revisions = Object.values(allRevisions)
    .filter((r) => r.documentId === id)
    .sort((a, b) => b.version - a.version)
    .slice(0, limit)

  return NextResponse.json(revisions)
}
