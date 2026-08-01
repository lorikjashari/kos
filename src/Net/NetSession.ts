import { Peer, type DataConnection } from 'peerjs'
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
    const code = makeRoomCode()
    const id = peerIdForRoom(code)
    await this.openPeer(id)
    this.role = 'host'
    this.code = code
    this.hostPeerId = id
    this.localPeerId = id
    this.handlers.onReady({ role: 'host', code, peerId: id })
    return code
  }

  public async joinRoom(rawCode: string): Promise<void> {
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
    if (code.length < 4) throw new Error('Enter a valid room code')
    const hostId = peerIdForRoom(code)
    await this.openPeer()
    this.role = 'client'
    this.code = code
    this.hostPeerId = hostId
    this.localPeerId = this.peer!.id
    this.handlers.onReady({ role: 'client', code, peerId: this.localPeerId })
    await this.connectTo(hostId)
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
    try {
      this.peer?.destroy()
    } catch {
      /* ignore */
    }
    this.peer = null
    this.role = 'offline'
  }

  private openPeer(fixedId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = fixedId
        ? new Peer(fixedId, { debug: 0 })
        : new Peer({ debug: 0 })
      this.peer = peer
      const timer = window.setTimeout(() => {
        reject(new Error('Network timeout — try again'))
        peer.destroy()
      }, 12000)

      peer.on('open', (id) => {
        window.clearTimeout(timer)
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
          const msg = err?.type === 'unavailable-id'
            ? 'Room code already in use — create again'
            : err?.message || 'Network error'
          this.handlers.onError(msg)
        })
        resolve()
      })

      peer.on('error', (err) => {
        window.clearTimeout(timer)
        reject(new Error(err?.message || 'Failed to connect to lobby'))
      })
    })
  }

  private connectTo(remoteId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject(new Error('No peer'))
      const conn = this.peer.connect(remoteId, { reliable: true })
      const timer = window.setTimeout(() => {
        reject(new Error('Could not reach host — check code / host is online'))
        try {
          conn.close()
        } catch {
          /* ignore */
        }
      }, 12000)
      conn.on('open', () => {
        window.clearTimeout(timer)
        this.attachConn(conn, false)
        resolve()
      })
      conn.on('error', (err) => {
        window.clearTimeout(timer)
        reject(new Error(err?.message || 'Join failed'))
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
