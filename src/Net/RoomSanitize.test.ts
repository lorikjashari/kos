import { describe, expect, it } from 'vitest'
import { parseRoomDirectoryPayload } from './RoomSanitize'

describe('parseRoomDirectoryPayload', () => {
  it('accepts a clean up message', () => {
    const now = Date.now()
    const msg = parseRoomDirectoryPayload(
      {
        op: 'up',
        room: {
          code: 'ABC123',
          name: "Ace's Room",
          host: 'Ace',
          players: 3,
          max: 10,
          ts: now,
          mapId: 'de_dust2',
        },
      },
      now
    )
    expect(msg?.op).toBe('up')
    if (msg?.op === 'up') {
      expect(msg.room.code).toBe('ABC123')
      expect(msg.room.mapId).toBe('de_dust2')
    }
  })

  it('rejects garbage, bad codes, and stale rooms', () => {
    const now = Date.now()
    expect(parseRoomDirectoryPayload(null, now)).toBeNull()
    expect(parseRoomDirectoryPayload({ op: 'up', room: { code: '!!', name: 'x' } }, now)).toBeNull()
    expect(
      parseRoomDirectoryPayload(
        {
          op: 'up',
          room: { code: 'ABC123', name: 'x', host: 'h', players: 1, max: 10, ts: now - 60000 },
        },
        now
      )
    ).toBeNull()
  })

  it('clamps players to max humans', () => {
    const now = Date.now()
    const msg = parseRoomDirectoryPayload(
      {
        op: 'up',
        room: { code: 'ZZZZ99', name: 'R', host: 'H', players: 99, max: 99, ts: now },
      },
      now
    )
    expect(msg?.op).toBe('up')
    if (msg?.op === 'up') {
      expect(msg.room.players).toBeLessThanOrEqual(msg.room.max)
      expect(msg.room.max).toBeLessThanOrEqual(10)
    }
  })

  it('parses close', () => {
    expect(parseRoomDirectoryPayload({ op: 'close', code: 'abc123' })).toEqual({
      op: 'close',
      code: 'ABC123',
    })
  })
})
