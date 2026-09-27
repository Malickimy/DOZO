const SIZE = 21

function seeded(seed: string) {
  let state = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    state = Math.imul(state ^ seed.charCodeAt(i), 16777619)
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507)
    state = Math.imul(state ^ (state >>> 13), 3266489909)
    return ((state ^= state >>> 16) >>> 0) / 4294967296
  }
}

function inFinder(x: number, y: number): boolean | null {
  const corners: ReadonlyArray<[number, number]> = [
    [0, 0],
    [SIZE - 7, 0],
    [0, SIZE - 7],
  ]
  for (const [cx, cy] of corners) {
    const dx = x - cx
    const dy = y - cy
    if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) {
      if (dx < 0 || dy < 0 || dx > 6 || dy > 6) return false
      const ring = Math.min(dx, dy, 6 - dx, 6 - dy)
      return ring !== 1
    }
  }
  return null
}

/** Decorative QR-like glyph for previews; it is not a scannable code. */
export function QrGlyph({ seed }: { seed: string }) {
  const random = seeded(seed)
  let path = ''
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const finder = inFinder(x, y)
      const on = finder ?? random() > 0.52
      if (on) path += `M${x} ${y}h1v1h-1z`
    }
  }
  return (
    <svg className="qr-glyph" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <path d={path} />
    </svg>
  )
}
