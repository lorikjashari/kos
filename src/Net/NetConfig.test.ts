import { describe, expect, it } from 'vitest'
import { DEFAULT_ICE_SERVERS, parseIceServers } from './NetConfig'

describe('parseIceServers', () => {
  it('returns defaults for empty/invalid', () => {
    expect(parseIceServers(undefined)).toEqual(DEFAULT_ICE_SERVERS)
    expect(parseIceServers('not-json')).toEqual(DEFAULT_ICE_SERVERS)
    expect(parseIceServers('[]')).toEqual(DEFAULT_ICE_SERVERS)
  })

  it('parses a STUN entry', () => {
    const ice = parseIceServers(JSON.stringify([{ urls: 'stun:example.com:3478' }]))
    expect(ice).toEqual([{ urls: 'stun:example.com:3478' }])
  })

  it('keeps TURN credentials', () => {
    const ice = parseIceServers(
      JSON.stringify([
        { urls: 'turn:t.example:3478', username: 'u', credential: 'c' },
      ])
    )
    expect(ice[0]).toMatchObject({
      urls: 'turn:t.example:3478',
      username: 'u',
      credential: 'c',
    })
  })
})
