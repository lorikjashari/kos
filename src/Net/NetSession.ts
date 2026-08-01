import { Peer, type DataConnection, type PeerJSOption } from 'peerjs'
import {
  makeRoomCode,
  peerIdForRoom,
  type NetMsg,
  type NetRole,
} from './NetTypes'

type SessionHandlers = {
  onReady: (info: { role: NetRole; code: string; peerId: string }) => void
  onError: (message: string) => void
  onPeerJoined: (peerId: string) => void
  onPeerLeft: (peerId: string) => void
  onMessage: (fromId: string, msg: NetMsg) => void
}

const PEER_OPTS: PeerJSOption = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
  },
}

const OPEN_TIMEOUT_MS = 20000
const JOIN_TIMEOUT_MS = 18000
const MAX_OPEN_ATTEMPTS = 3
const MAX_JOIN_ATTEMPTS = 3

/**
 * Free friends networking via PeerJS public brokers (no paid server).
 * Host opens a room code; clients connect in a star topology through the host.
 */
export class NetSession {
  public role: NetRole = 'offline'
  public code = ''
  public localPeerId = ''
  public hostPeerId = ''
  private peer: Peer | null = null
  private connections = new Map<string, DataConnection>()
  private handlers: SessionHandlers
  private closed = false

  constructor(handlers: SessionHandlers) {
    this.handlers = handlers
  }

  public async createRoom(): Promise<string> {
    let lastErr: Error = new Error('Network timeout — try again')
    for (let attempt = 0; attempt < MAX_OPEN_ATTEMPTS; attempt++) {
      if (this.closed) throw new Error('Cancelled')
      const code = makeRoomCode()
      const id = peerIdForRoom(code)
      try {
        await this.openPeerOnce(id)
        this.role = 'host'
        this.code = code
        this.hostPeerId = id
        this.localPeerId = id
        this.handlers.onReady({ role: 'host', code, peerId: id })
        return code
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error('Failed to open room')
        this.teardownPeer()
        if (attempt + 1 < MAX_OPEN_ATTEMPTS) {
          await sleep(350 + attempt * 400)
        }
      }
    }
    throw lastErr
  }

  public async joinRoom(rawCode: string): Promise<void> {
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    if (code.length < 4) throw new Error('Enter a valid room code')
    const hostId = peerIdForRoom(code)

    let lastErr: Error = new Error('Network timeout — try again')
    for (let attempt = 0; attempt < MAX_OPEN_ATTEMPTS; attempt++) {
      if (this.closed) throw new Error('Cancelled')
      try {
        await this.openPeerOnce()
        this.role = 'client'
        this.code = code
        this.hostPeerId = hostId
        this.localPeerId = this.peer!.id
        this.handlers.onReady({ role: 'client', code, peerId: this.localPeerId })
        await this.connectToWithRetry(hostId)
        return
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error('Join failed')
        this.teardownPeer()
        if (attempt + 1 < MAX_OPEN_ATTEMPTS) {
          await sleep(350 + attempt * 400)
        }
      }
    }
    throw lastErr
  }

  public send(toId: string, msg: NetMsg): void {
    const conn = this.connections.get(toId)
    if (!conn || !conn.open) return
    try {
      conn.send(msg)
    } catch {
      /* ignore */
    }
  }

  public broadcast(msg: NetMsg, exceptId?: string): void {
    for (const [id, conn] of this.connections) {
      if (exceptId && id === exceptId) continue
      if (!conn.open) continue
      try {
        conn.send(msg)
      } catch {
        /* ignore */
      }
    }
  }

  /** Clients always talk to host; host can relay. */
  public sendToHost(msg: NetMsg): void {
    if (this.role === 'host') {
      this.handlers.onMessage(this.localPeerId, msg)
      return
    }
    this.send(this.hostPeerId, msg)
  }

  public getPeerIds(): string[] {
    return [...this.connections.keys()]
  }

  public destroy(): void {
    this.closed = true
    for (const conn of this.connections.values()) {
      try {
        conn.close()
      } catch {
        /* ignore */
      }
    }
    this.connections.clear()
    this.teardownPeer()
    this.role = 'offline'
  }

  private teardownPeer(): void {
    const peer = this.peer
    this.peer = null
    if (!peer) return
    try {
      peer.destroy()
    } catch {
      /* ignore */
    }
  }

  private openPeerOnce(fixedId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const peer = fixedId ? new Peer(fixedId, PEER_OPTS) : new Peer(PEER_OPTS)
      this.peer = peer

      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (err) {
          try {
            peer.destroy()
          } catch {
            /* ignore */
          }
          if (this.peer === peer) this.peer = null
          reject(err)
        } else {
          resolve()
        }
      }

      const timer = window.setTimeout(() => {
        finish(new Error('Network timeout — try again'))
      }, OPEN_TIMEOUT_MS)

      peer.on('open', (id) => {
        this.localPeerId = id
        peer.on('connection', (conn) => this.attachConn(conn, true))
        peer.on('disconnected', () => {
          if (!this.closed) {
            try {
              peer.reconnect()
            } catch {
              /* ignore */
            }
          }
        })
        peer.on('error', (err) => {
          const msg =
            err?.type === 'unavailable-id'
              ? 'Room code already in use — create again'
              : err?.message || 'Network error'
          this.handlers.onError(msg)
        })
        finish()
      })

      peer.on('error', (err) => {
        const msg =
          err?.type === 'unavailable-id'
            ? 'Room code already in use — create again'
            : err?.message || 'Failed to connect to lobby'
        finish(new Error(msg))
      })
    })
  }

  private async connectToWithRetry(remoteId: string): Promise<void> {
    let lastErr: Error = new Error('Could not reach host — check code / host is online')
    for (let attempt = 0; attempt < MAX_JOIN_ATTEMPTS; attempt++) {
      if (this.closed) throw new Error('Cancelled')
      try {
        await this.connectToOnce(remoteId)
        return
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error('Join failed')
        if (attempt + 1 < MAX_JOIN_ATTEMPTS) {
          await sleep(300 + attempt * 350)
        }
      }
    }
    throw lastErr
  }

  private connectToOnce(remoteId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject(new Error('No peer'))
      let settled = false
      const conn = this.peer.connect(remoteId, { reliable: true })

      const finish = (err?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (err) {
          try {
            conn.close()
          } catch {
            /* ignore */
          }
          reject(err)
        } else {
          resolve()
        }
      }

      const timer = window.setTimeout(() => {
        finish(new Error('Could not reach host — check code / host is online'))
      }, JOIN_TIMEOUT_MS)

      conn.on('open', () => {
        this.attachConn(conn, false)
        finish()
      })
      conn.on('error', (err) => {
        finish(new Error(err?.message || 'Join failed'))
      })
    })
  }

  private attachConn(conn: DataConnection, inbound: boolean): void {
    const id = conn.peer
    this.connections.set(id, conn)
    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return
      this.handlers.onMessage(id, data as NetMsg)
    })
    conn.on('close', () => {
      this.connections.delete(id)
      this.handlers.onPeerLeft(id)
    })
    conn.on('error', () => {
      this.connections.delete(id)
      this.handlers.onPeerLeft(id)
    })
    if (inbound && conn.open) this.handlers.onPeerJoined(id)
    else if (inbound) {
      conn.on('open', () => this.handlers.onPeerJoined(id))
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms))
}
