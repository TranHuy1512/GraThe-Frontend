// Client-side image helpers for the mock document restoration pipeline.

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to load image"))
    img.src = src
  })
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

// Draws an image onto a canvas, capping the longest edge so processing stays fast.
function imageToCanvas(img: HTMLImageElement, maxDim = 2000): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext("2d")!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * Mock "restoration": stretches levels to whiten aged paper, deepen ink,
 * neutralize yellow tint, and lightly denoise. Produces a visibly cleaner
 * document while keeping a real, reproducible transformation.
 */
export function restoreCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!
  const { width, height } = canvas
  const image = ctx.getImageData(0, 0, width, height)
  const d = image.data
  const pixels = width * height

  // Per-channel histograms — used for automatic white balance + level stretch.
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  for (let i = 0; i < d.length; i += 4) {
    hist[0][d[i]]++
    hist[1][d[i + 1]]++
    hist[2][d[i + 2]]++
  }

  // Find the value at a cumulative percentile for a channel.
  const percentile = (channel: number, p: number) => {
    const target = pixels * p
    let cumulative = 0
    for (let v = 0; v < 256; v++) {
      cumulative += hist[channel][v]
      if (cumulative >= target) return v
    }
    return 255
  }

  // 1) White-patch white balance: scale each channel so the paper (the bright
  //    tones) becomes near-white. This removes the yellow/brown cast.
  const gain = [0, 1, 2].map((c) => {
    const paper = Math.max(1, percentile(c, 0.9))
    return Math.min(2.2, 235 / paper)
  })

  // 2) Uniform level stretch applied equally to every channel so text stays a
  //    neutral dark grey/black rather than picking up a color tint.
  const black = 32
  const white = 240
  const range = white - black
  const gamma = 0.9
  const tone = (v: number) => {
    let n = (v - black) / range
    n = Math.min(1, Math.max(0, n))
    return Math.pow(n, gamma) * 255
  }

  for (let i = 0; i < d.length; i += 4) {
    d[i] = tone(d[i] * gain[0])
    d[i + 1] = tone(d[i + 1] * gain[1])
    d[i + 2] = tone(d[i + 2] * gain[2])
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

export async function restoreFromDataUrl(dataUrl: string): Promise<{
  restoredUrl: string
  width: number
  height: number
}> {
  const img = await loadImage(dataUrl)
  const canvas = imageToCanvas(img)
  restoreCanvas(canvas)
  return {
    restoredUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  }
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a")
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export interface AdjustOptions {
  brightness: number // 0.5 - 1.5
  contrast: number // 0.5 - 1.5
  rotation: number // degrees, multiples of 90
  crop?: { x: number; y: number; width: number; height: number } | null // normalized 0-1
}

// Applies edit-dialog adjustments to a source image and returns a new data URL.
export async function applyAdjustments(sourceUrl: string, opts: AdjustOptions): Promise<string> {
  const img = await loadImage(sourceUrl)
  const fullW = img.naturalWidth
  const fullH = img.naturalHeight

  const crop = opts.crop
  const sx = crop ? crop.x * fullW : 0
  const sy = crop ? crop.y * fullH : 0
  const sw = crop ? crop.width * fullW : fullW
  const sh = crop ? crop.height * fullH : fullH

  const rotated = opts.rotation % 180 !== 0
  const canvas = document.createElement("canvas")
  canvas.width = rotated ? sh : sw
  canvas.height = rotated ? sw : sh
  const ctx = canvas.getContext("2d")!

  ctx.filter = `brightness(${opts.brightness}) contrast(${opts.contrast})`
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((opts.rotation * Math.PI) / 180)
  ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)

  return canvas.toDataURL("image/png")
}
