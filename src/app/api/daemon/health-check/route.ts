import { NextResponse } from 'next/server'
import { runDaemonHealthCheckViaAdmin } from '@/lib/server/daemon/controller'

export async function POST() {
  const snapshot = await runDaemonHealthCheckViaAdmin('api/daemon/health-check:post')
  return NextResponse.json({
    ok: true,
    status: snapshot.status,
  })
}
