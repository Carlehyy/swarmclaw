export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/server/scheduler')
    const { resumeQueue } = await import('./lib/server/queue')
    const { initWsServer, closeWsServer } = await import('./lib/server/ws-hub')
    const { stopDaemon } = await import('./lib/server/daemon-state')
    startScheduler()
    resumeQueue()
    initWsServer()

    // Graceful shutdown: stop background services and close WS connections
    let shuttingDown = false
    const shutdown = async (signal: string) => {
      if (shuttingDown) return
      shuttingDown = true
      console.log(`[server] ${signal} received, shutting down gracefully...`)
      stopDaemon({ source: signal })
      await closeWsServer()
      process.exit(0)
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }
}
