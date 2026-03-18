import { NextResponse } from 'next/server'
import { getDaemonHealthSummarySnapshot } from '@/lib/server/daemon/controller'
import packageJson from '../../../../../package.json'

export async function GET() {
  const summary = await getDaemonHealthSummarySnapshot()
  return NextResponse.json({
    ...summary,
    version: packageJson.version,
  })
}
