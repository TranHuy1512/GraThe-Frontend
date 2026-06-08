"use client"

import { jsPDF } from "jspdf"
import { restoreCanvas } from "./image-utils"

export interface PdfPage {
  pageNumber: number
  originalUrl: string
  restoredUrl: string
  width: number
  height: number
}

let workerConfigured = false

function ensurePromiseTry() {
  if (typeof Promise.try === "function") return

  Promise.try = function promiseTry<T>(callback: () => T | PromiseLike<T>) {
    return new Promise<T>((resolve) => resolve(callback()))
  }
}

export async function getPdfjs() {
  ensurePromiseTry()

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  if (!workerConfigured) {
    if (typeof window !== "undefined" && "Worker" in window) {
      pdfjs.GlobalWorkerOptions.workerPort = new Worker(
        new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url),
        { type: "module" },
      )
    } else {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url,
      ).toString()
    }
    workerConfigured = true
  }
  return pdfjs
}

export async function renderPdfPreview(file: File, pageLimit = 2): Promise<{
  pageCount: number
  pages: string[]
}> {
  const pdfjs = await getPdfjs()
  const buffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buffer }).promise
  const pages: string[] = []
  const limit = Math.min(pageLimit, doc.numPages)

  for (let i = 1; i <= limit; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    pages.push(canvas.toDataURL("image/png"))
  }

  return { pageCount: doc.numPages, pages }
}

// Renders every page of a PDF to images, then produces a restored variant per page.
export async function renderPdf(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfPage[]> {
  const pdfjs = await getPdfjs()
  const buffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buffer }).promise
  const pages: PdfPage[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const originalUrl = canvas.toDataURL("image/png")

    // Build restored variant on a separate canvas.
    const restoredCanvas = document.createElement("canvas")
    restoredCanvas.width = canvas.width
    restoredCanvas.height = canvas.height
    const rctx = restoredCanvas.getContext("2d")!
    rctx.drawImage(canvas, 0, 0)
    restoreCanvas(restoredCanvas)

    pages.push({
      pageNumber: i,
      originalUrl,
      restoredUrl: restoredCanvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    })

    onProgress?.(i, doc.numPages)
  }

  return pages
}

// Builds a downloadable PDF from the restored page images.
export function buildPdf(pages: { restoredUrl: string; width: number; height: number }[], filename: string) {
  if (pages.length === 0) return
  const first = pages[0]
  const orientation = first.width >= first.height ? "landscape" : "portrait"
  const pdf = new jsPDF({ orientation, unit: "px", format: [first.width, first.height] })

  pages.forEach((page, index) => {
    if (index > 0) {
      const o = page.width >= page.height ? "landscape" : "portrait"
      pdf.addPage([page.width, page.height], o)
    }
    pdf.addImage(page.restoredUrl, "PNG", 0, 0, page.width, page.height)
  })

  pdf.save(filename)
}

/** Renders a single page of a PDF file to a data URL using pdf.js. */
export async function renderSinglePdfPage(
  file: File,
  pageNumber: number,
  scale = 2,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const pdfjs = await getPdfjs()
  const buffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buffer }).promise

  if (pageNumber < 1 || pageNumber > doc.numPages) {
    throw new Error(`Page ${pageNumber} is out of range (1–${doc.numPages})`)
  }

  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  }
}

/** Converts a data URL to a File object (for passing to soft-restore API). */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64Data] = dataUrl.split(",")
  const mimeMatch = header.match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : "image/png"
  const byteString = atob(base64Data)
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  return new File([ab], filename, { type: mime })
}

/**
 * Converts any URL (blob: or data:) to a data URL string.
 * Required because jsPDF.addImage only accepts data URLs, not blob URLs.
 */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Builds a downloadable PDF from a list of page records.
 * Pages with `deleted: true` are excluded.
 * Accepts blob URLs and data URLs — converts all to data URLs for jsPDF.
 */
export async function buildPdfFromPages(
  pages: Array<{ restoredUrl: string; width: number; height: number; deleted?: boolean }>,
  filename: string,
): Promise<void> {
  const active = pages.filter((p) => !p.deleted)
  if (active.length === 0) return

  const pageData = await Promise.all(
    active.map(async (page) => ({
      ...page,
      dataUrl: await toDataUrl(page.restoredUrl),
    })),
  )

  const first = pageData[0]
  const orientation = first.width >= first.height ? "landscape" : "portrait"
  const pdf = new jsPDF({ orientation, unit: "px", format: [first.width, first.height] })

  pageData.forEach((page, index) => {
    if (index > 0) {
      const o = page.width >= page.height ? "landscape" : "portrait"
      pdf.addPage([page.width, page.height], o)
    }
    pdf.addImage(page.dataUrl, "PNG", 0, 0, page.width, page.height)
  })

  pdf.save(filename)
}
