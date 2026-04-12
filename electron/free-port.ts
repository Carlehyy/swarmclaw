import net from 'node:net'

export function findFreePort(preferred: number): Promise<number> {
  return tryPort(preferred).catch(() => tryPort(0))
}

function tryPort(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen({ port, host: '127.0.0.1' }, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        const assigned = addr.port
        server.close(() => resolve(assigned))
      } else {
        server.close(() => reject(new Error('could not resolve port')))
      }
    })
  })
}
