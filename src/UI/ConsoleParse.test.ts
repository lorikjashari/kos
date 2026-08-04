import { describe, expect, it } from 'vitest'
import { consoleToNum, tokenizeConsoleLine } from './ConsoleParse'

describe('tokenizeConsoleLine', () => {
  it('keeps quoted strings intact', () => {
    expect(tokenizeConsoleLine('echo "hello world" 2')).toEqual(['echo', 'hello world', '2'])
  })
})

describe('consoleToNum', () => {
  it('falls back on junk', () => {
    expect(consoleToNum(undefined, 7)).toBe(7)
    expect(consoleToNum('nope', 3)).toBe(3)
    expect(consoleToNum('12.5')).toBe(12.5)
  })
})
