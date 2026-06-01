"use client"

import type React from "react"

import { useCallback, useMemo, useRef, useState } from "react"
import { Download, Pencil, FileText, ImageIcon, ScanLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Uploader } from "@/components/uploader"
import { CompareView } from "@/components/compare-view"
import { PdfPages } from "@/components/pdf-pages"
import { EditDialog } from "@/components/edit-dialog"
import { HistorySidebar, type HistoryEntry } from "@/components/history-sidebar"
import { PendingPreview } from "@/components/pending-preview"
import { ConfirmRestoreDialog } from "@/components/confirm-restore-dialog"
import { ProcessingView } from "@/components/processing-view"
import { fileToDataUrl, restoreFromDataUrl, downloadDataUrl } from "@/lib/image-utils"
import { renderPdf, buildPdf, type PdfPage } from "@/lib/pdf-utils"

type Status = "idle" | "pending" | "confirming" | "processing" | "done"
type Mode = "image" | "pdf"

interface ImageDoc {
  originalUrl: string
  restoredUrl: string
  width: number
  height: number
}

interface DocRecord extends HistoryEntry {
  imageDoc: ImageDoc | null
  pages: PdfPage[]
}

const ACCEPTED = "image/png,image/jpeg,image/jpg,image/webp,application/pdf"

export default function Page() {
  const [status, setStatus] = useState<Status>("idle")
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState("Analyzing document…")
  const [processingName, setProcessingName] = useState("")

  const [history, setHistory] = useState<DocRecord[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [editing, setEditing] = useState(false)

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const newInputRef = useRef<HTMLInputElement>(null)

  const activeRecord = useMemo(
    () => history.find((h) => h.id === activeId) ?? null,
    [history, activeId],
  )
  const mode: Mode = activeRecord?.mode ?? "image"
  const pages = activeRecord?.pages ?? []
  const baseName = (activeRecord?.fileName ?? "document").replace(/\.[^.]+$/, "") || "document"

  const handleFile = useCallback(async (file: File) => {
    setPendingFile(file)
    setShowConfirm(false)
    setStatus("pending")
  }, [])

  const handlePendingRestore = useCallback(() => {
    setShowConfirm(true)
    setStatus("confirming")
  }, [])

  const handleConfirmRestore = useCallback(async () => {
    if (!pendingFile) return
    setShowConfirm(false)
    setStatus("processing")
    setProcessingName(pendingFile.name)
    setProgress(0)
    const id = crypto.randomUUID()

    await new Promise((resolve) => setTimeout(resolve, 5000))

    if (pendingFile.type === "application/pdf") {
      setProgressLabel("Rendering PDF pages…")
      try {
        const rendered = await renderPdf(pendingFile, (done, total) => {
          setProgress(Math.round((done / total) * 100))
          setProgressLabel(`Restoring page ${done} of ${total}…`)
        })
        const record: DocRecord = {
          id,
          mode: "pdf",
          fileName: pendingFile.name,
          thumbUrl: rendered[0]?.restoredUrl ?? "",
          pageCount: rendered.length,
          createdAt: Date.now(),
          imageDoc: null,
          pages: rendered,
        }
        setHistory((prev) => [record, ...prev])
        setActiveId(id)
        setActiveIndex(0)
        setStatus("done")
        setPendingFile(null)
      } catch (err) {
        console.log("[v0] PDF processing failed:", err)
        setStatus(history.length ? "done" : "idle")
        setPendingFile(null)
      }
      return
    }

    setProgressLabel("Restoring document…")
    try {
      const originalUrl = await fileToDataUrl(pendingFile)
      setProgress(40)
      const { restoredUrl, width, height } = await restoreFromDataUrl(originalUrl)
      setProgress(100)
      const record: DocRecord = {
        id,
        mode: "image",
        fileName: pendingFile.name,
        thumbUrl: restoredUrl,
        pageCount: 1,
        createdAt: Date.now(),
        imageDoc: { originalUrl, restoredUrl, width, height },
        pages: [],
      }
      setHistory((prev) => [record, ...prev])
      setActiveId(id)
      setActiveIndex(0)
      setStatus("done")
      setPendingFile(null)
    } catch (err) {
      console.log("[v0] Image processing failed:", err)
      setStatus(history.length ? "done" : "idle")
      setPendingFile(null)
    }
  }, [pendingFile, history.length])

  const handleCancelRestore = useCallback(() => {
    setShowConfirm(false)
    setStatus("pending")
  }, [])

  const handleUploadNew = useCallback(() => {
    newInputRef.current?.click()
  }, [])

  const onNewInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") return
      handleFile(file)
    },
    [handleFile],
  )

  const handleSelectHistory = useCallback((id: string) => {
    setActiveId(id)
    setActiveIndex(0)
    setStatus("done")
  }, [])

  const handleRemove = useCallback(
    (id: string) => {
      setHistory((prev) => {
        const next = prev.filter((h) => h.id !== id)
        if (id === activeId) {
          if (next.length) {
            setActiveId(next[0].id)
            setActiveIndex(0)
            setStatus("done")
          } else {
            setActiveId(null)
            setStatus("idle")
          }
        }
        return next
      })
    },
    [activeId],
  )

  const active: ImageDoc | null =
    mode === "image"
      ? activeRecord?.imageDoc ?? null
      : pages[activeIndex]
        ? {
            originalUrl: pages[activeIndex].originalUrl,
            restoredUrl: pages[activeIndex].restoredUrl,
            width: pages[activeIndex].width,
            height: pages[activeIndex].height,
          }
        : null

  const handleEditApply = (newUrl: string) => {
    setHistory((prev) =>
      prev.map((rec) => {
        if (rec.id !== activeId) return rec
        if (rec.mode === "image") {
          return rec.imageDoc
            ? { ...rec, imageDoc: { ...rec.imageDoc, restoredUrl: newUrl }, thumbUrl: newUrl }
            : rec
        }
        const updatedPages = rec.pages.map((p, i) => (i === activeIndex ? { ...p, restoredUrl: newUrl } : p))
        return {
          ...rec,
          pages: updatedPages,
          thumbUrl: activeIndex === 0 ? newUrl : rec.thumbUrl,
        }
      }),
    )
  }

  const handleDownload = () => {
    if (!active) return
    if (mode === "image") {
      downloadDataUrl(active.restoredUrl, `${baseName}-restored.png`)
    } else {
      buildPdf(pages, `${baseName}-restored.pdf`)
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ScanLine className="size-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight text-foreground">Reclaim</h1>
              <p className="text-xs leading-tight text-muted-foreground">Document image restoration</p>
            </div>
          </div>
        </div>
      </header>

      <input
        ref={newInputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={onNewInputChange}
        aria-hidden
      />

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_1fr] lg:gap-8 lg:py-8">
        <aside className="lg:sticky lg:top-6 lg:h-[calc(100vh-7rem)]">
          <HistorySidebar
            entries={history}
            activeId={activeId}
            onSelect={handleSelectHistory}
            onUploadNew={handleUploadNew}
            onRemove={handleRemove}
          />
        </aside>

        <section className="min-w-0">
          {status === "idle" && (
            <div className="flex flex-col items-center py-6 sm:py-10">
              <div className="mb-8 text-center">
                <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  Restore your scanned documents
                </h2>
                <p className="mx-auto mt-2 max-w-lg text-pretty text-sm leading-relaxed text-muted-foreground">
                  Clean up faded scans and aged paper. Upload an image or PDF, compare the result against the original,
                  and download a polished copy.
                </p>
              </div>
              <Uploader onFile={handleFile} />
            </div>
          )}

          {status === "pending" && pendingFile && (
            <PendingPreview file={pendingFile} onRestore={handlePendingRestore} />
          )}

          {status === "confirming" && pendingFile && (
            <>
              <PendingPreview file={pendingFile} onRestore={handlePendingRestore} />
              <ConfirmRestoreDialog
                open={showConfirm}
                fileName={pendingFile.name}
                onConfirm={handleConfirmRestore}
                onCancel={handleCancelRestore}
              />
            </>
          )}

          {status === "processing" && (
            <ProcessingView fileName={processingName} durationMs={5000} />
          )}

          {status === "done" && active && activeRecord && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_260px]">
              <div className="order-2 flex min-w-0 flex-col gap-6 xl:order-1">
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      {mode === "pdf" ? <FileText className="size-5" /> : <ImageIcon className="size-5" />}
                    </div>
                    <div className="overflow-hidden">
                      <p className="truncate text-sm font-medium text-foreground">{activeRecord.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {mode === "pdf" ? `${pages.length} page${pages.length > 1 ? "s" : ""} restored` : "Restored"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      <Pencil className="size-4" />
                      Continue editing
                    </Button>
                    <Button onClick={handleDownload}>
                      <Download className="size-4" />
                      {mode === "pdf" ? "Download PDF" : "Download image"}
                    </Button>
                  </div>
                </div>

                <CompareView originalUrl={active.originalUrl} restoredUrl={active.restoredUrl} />
              </div>

              {mode === "pdf" && (
                <aside className="order-1 xl:order-2">
                  <div className="rounded-xl border border-border bg-card p-4 xl:sticky xl:top-6">
                    <PdfPages pages={pages} activeIndex={activeIndex} onSelect={setActiveIndex} />
                  </div>
                </aside>
              )}
            </div>
          )}
        </section>
      </div>

      {active && (
        <EditDialog
          open={editing}
          onOpenChange={setEditing}
          sourceUrl={active.restoredUrl}
          onApply={handleEditApply}
        />
      )}
    </main>
  )
}
