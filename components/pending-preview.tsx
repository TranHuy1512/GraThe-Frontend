"use client"

import { useEffect, useState } from "react"
import { ImageIcon, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fileToDataUrl } from "@/lib/image-utils"

interface PendingPreviewProps {
  file: File
  onRestore: () => void
}

export function PendingPreview({ file, onRestore }: PendingPreviewProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const [pageCount, setPageCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadPreview = async () => {
      setLoading(true)
      try {
        if (file.type === "application/pdf") {
          // Preview first 1-2 pages of PDF
          const pdfjs = await import("pdfjs-dist")
          const buffer = await file.arrayBuffer()
          const doc = await pdfjs.getDocument({ data: buffer }).promise
          setPageCount(doc.numPages)

          const pages: string[] = []
          const pageLimit = Math.min(2, doc.numPages)

          for (let i = 1; i <= pageLimit; i++) {
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

          setPdfPages(pages)
        } else {
          // Show image preview
          const dataUrl = await fileToDataUrl(file)
          setPreview(dataUrl)
        }
      } catch (error) {
        console.log("[v0] Preview loading failed:", error)
      } finally {
        setLoading(false)
      }
    }

    loadPreview()
  }, [file])

  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Ready to restore</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {file.type === "application/pdf" ? (
              <>
                <FileText className="size-4" />
                PDF • {pageCount} page{pageCount !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <ImageIcon className="size-4" />
                Image
              </>
            )}
            • {file.name}
          </p>
        </div>
      </div>

      {/* Preview Section */}
      <div className="mb-8 rounded-lg border border-border bg-card p-6">
        {loading ? (
          <div className="flex h-96 items-center justify-center bg-secondary">
            <div className="text-center">
              <div className="mx-auto mb-2 size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              <p className="text-sm text-muted-foreground">Loading preview…</p>
            </div>
          </div>
        ) : file.type === "application/pdf" && pdfPages.length > 0 ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pdfPages.map((pageUrl, idx) => (
              <div
                key={idx}
                className="flex-shrink-0 rounded border border-border overflow-hidden bg-secondary"
              >
                <img
                  src={pageUrl}
                  alt={`Page ${idx + 1}`}
                  className="max-h-96 w-auto"
                  crossOrigin="anonymous"
                />
                <p className="px-3 py-1 text-xs text-muted-foreground text-center">
                  Page {idx + 1}
                </p>
              </div>
            ))}
          </div>
        ) : preview ? (
          <div className="flex justify-center bg-secondary rounded">
            <img
              src={preview}
              alt="Preview"
              className="max-h-96 w-auto"
              crossOrigin="anonymous"
            />
          </div>
        ) : null}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button onClick={onRestore} size="lg" className="flex-1">
          Restore document
        </Button>
      </div>
    </div>
  )
}
