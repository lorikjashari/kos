const view = new DataView(new ArrayBuffer(4))

export class MDLDataReader {
  static readFloat(data: Uint8Array, n: number): number {
    view.setUint8(0, data[n]!)
    view.setUint8(1, data[n + 1]!)
    view.setUint8(2, data[n + 2]!)
    view.setUint8(3, data[n + 3]!)
    return view.getFloat32(0, true)
  }

  static readInteger(data: Uint8Array, n: number): number {
    return (
      data[n]! + (data[n + 1]! << 8) + (data[n + 2]! << 16) + (data[n + 3]! << 24)
    )
  }

  static readSignedShort(data: Uint8Array, n: number): number {
    const k = data[n]! + (data[n + 1]! << 8)
    return k & 0x8000 ? k - 65536 : k
  }

  static readBinaryString(data: Uint8Array, n: number, length: number): string {
    let str = ''
    const end = n + length
    for (let i = n; i < end; i++) {
      const c = data[i]!
      if (c === 0) break
      str += String.fromCharCode(c)
    }
    return str
  }
}
