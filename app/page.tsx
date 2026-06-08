"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Download, Pencil, FileText, ImageIcon, ScanLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Uploader } from "@/components/uploader"
import { CompareView } from "@/components/compare-view"
import { ContinueEditingDialog } from "@/components/continue-editing-dialog"
import { HistorySidebar, type HistoryEntry } from "@/components/history-sidebar"
import { PendingPreview } from "@/components/pending-preview"
import { ConfirmRestoreDialog } from "@/components/confirm-restore-dialog"
import { ProcessingView } from "@/components/processing-view"
import { fileToDataUrl, loadImage, downloadDataUrl } from "@/lib/image-utils"
import { classifyImage, type ClassificationResult } from "@/lib/classification-api"
import {
  deleteDocument,
  fetchDocuments,
  resolveBackendAssetUrl,
  restoreImage,
  restorePdf,
  updateDocument,
  type DocumentRecord,
} from "@/lib/restoration-api"

type Status = "idle" | "pending" | "confirming" | "processing" | "done"

interface ImageDoc {
  originalUrl: string
  restoredUrl: string
  width: number
  height: number
}

interface DocRecord extends HistoryEntry {
  imageDoc: ImageDoc | null
  outputPdfUrl: string | null
  /** Keep a reference to the original File so we can call soft-restore later. */
  originalFile: File | null
  /** Cached soft output to avoid redundant API calls. */
  softImageUrl: string | null
  softContentHash: string | null
}

const ACCEPTED = "image/png,image/jpeg,image/jpg,image/webp,application/pdf"

function upsertHistoryRecord(records: DocRecord[], record: DocRecord): DocRecord[] {
  const existing = records.find((item) => item.id === record.id)
  if (!existing) return [record, ...records]

  return [
    {
      ...existing,
      ...record,
      softImageUrl: record.softImageUrl ?? existing.softImageUrl,
      softContentHash: record.softContentHash ?? existing.softContentHash,
    },
    ...records.filter((item) => item.id !== record.id),
  ]
}

export default function Page() {
  const [status, setStatus] = useState<Status>("idle")
  const [processingName, setProcessingName] = useState("")
  const [processingLabel, setProcessingLabel] = useState("Restoring document…")

  const [history, setHistory] = useState<DocRecord[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [classification, setClassification] = useState<ClassificationResult | null>(null)
  const [classificationError, setClassificationError] = useState<string | null>(null)
  const [checkingClassification, setCheckingClassification] = useState(false)
  const [restorationError, setRestorationError] = useState<string | null>(null)

  const newInputRef = useRef<HTMLInputElement>(null)

  // Load persisted document history from the backend on first render
  useEffect(() => {
    fetchDocuments()
      .then(({ items }) => {
        const records: DocRecord[] = items.map((doc: DocumentRecord) => ({
          id: doc.id,
          mode: doc.mode,
          fileName: doc.file_name,
          thumbUrl: doc.restored_url ?? doc.output_pdf_url ?? "",
          pageCount: doc.page_count,
          createdAt: new Date(doc.created_at).getTime(),
          imageDoc:
            doc.mode === "image" && doc.original_url && doc.restored_url
              ? {
                  originalUrl: doc.original_url,
                  restoredUrl: doc.restored_url,
                  width: doc.width ?? 0,
                  height: doc.height ?? 0,
                }
              : null,
          outputPdfUrl: doc.output_pdf_url ?? null,
          originalFile: null,
          softImageUrl: doc.soft_image_url ?? null,
          softContentHash: doc.soft_content_hash ?? null,
        }))
        if (records.length > 0) {
          setHistory(records)
          setActiveId(records[0].id)
          setStatus("done")
        }
      })
      .catch((err) => {
        console.log("[v0] Failed to load documents:", err)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeRecord = useMemo(
    () => history.find((h) => h.id === activeId) ?? null,
    [history, activeId],
  )
  const baseName = (activeRecord?.fileName ?? "document").replace(/\.[^.]+$/, "") || "document"

  const handleFile = useCallback(async (file: File) => {
    setPendingFile(file)
    setShowConfirm(false)
    setClassification(null)
    setClassificationError(null)
    setCheckingClassification(false)
    setRestorationError(null)
    setStatus("pending")
  }, [])

  const handlePendingRestore = useCallback(async () => {
    if (!pendingFile) return

    if (pendingFile.type.startsWith("image/")) {
      setCheckingClassification(true)
      setClassification(null)
      setClassificationError(null)

      try {
        const result = await classifyImage(pendingFile)
        setClassification(result)
      } catch (err) {
        console.log("[v0] Image classification failed:", err)
        setClassificationError(err instanceof Error ? err.message : "Classification failed")
      } finally {
        setCheckingClassification(false)
      }
    }

    setShowConfirm(true)
    setStatus("confirming")
  }, [pendingFile])

  const handleConfirmRestore = useCallback(async () => {
    if (!pendingFile) return
    setShowConfirm(false)
    setStatus("processing")
    setProcessingName(pendingFile.name)
    setProcessingLabel("Restoring document…")
    setRestorationError(null)

    if (pendingFile.type === "application/pdf") {
      setProcessingLabel("Restoring PDF…")
      try {
        const result = await restorePdf(pendingFile)
        const record: DocRecord = {
          id: result.job_id,
          mode: "pdf",
          fileName: result.input_filename,
          thumbUrl: "",
          pageCount: result.total_pages ?? result.processed_pages,
          createdAt: new Date(result.created_at).getTime(),
          imageDoc: null,
          outputPdfUrl: result.output_pdf_url,
          originalFile: null,
          softImageUrl: null,
          softContentHash: null,
        }
        setHistory((prev) => upsertHistoryRecord(prev, record))
        setActiveId(result.job_id)
        setStatus("done")
        setPendingFile(null)
      } catch (err) {
        console.log("[v0] PDF processing failed:", err)
        setRestorationError(err instanceof Error ? err.message : "PDF restoration failed.")
        setStatus("pending")
      }
      return
    }

    try {
      const originalUrl = await fileToDataUrl(pendingFile)
      const originalImage = await loadImage(originalUrl)
      const result = await restoreImage(pendingFile)
      const restoredOutput = result.outputs[0]

      if (!restoredOutput) {
        throw new Error("Restoration response did not include a restored image.")
      }

      const id = result.document_id ?? crypto.randomUUID()
      const restoredUrl = resolveBackendAssetUrl(restoredOutput.url)
      const record: DocRecord = {
        id,
        mode: "image",
        fileName: pendingFile.name,
        thumbUrl: restoredUrl,
        pageCount: 1,
        createdAt: Date.now(),
        imageDoc: {
          originalUrl,
          restoredUrl,
          width: originalImage.naturalWidth,
          height: originalImage.naturalHeight,
        },
        outputPdfUrl: null,
        originalFile: pendingFile,
        softImageUrl: null,
        softContentHash: null,
      }
      setHistory((prev) => upsertHistoryRecord(prev, record))
      setActiveId(id)
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
    setEditing(false)
    setStatus("done")
  }, [])

  const handleRemove = useCallback(
    (id: string) => {
      setHistory((prev) => {
        const next = prev.filter((h) => h.id !== id)
        if (id === activeId) {
          if (next.length) {
            setActiveId(next[0].id)
            setStatus("done")
          } else {
            setActiveId(null)
            setStatus("idle")
          }
        }
        return next
      })
      deleteDocument(id).catch((err) => {
        console.log("[v0] Failed to delete document from DB:", err)
      })
    },
    [activeId],
  )

  const active: ImageDoc | null = activeRecord?.mode === "image" ? activeRecord.imageDoc : null
  const canContinueEditing = Boolean(activeRecord?.originalFile)

  useEffect(() => {
    if (!canContinueEditing) {
      setEditing(false)
    }
  }, [canContinueEditing])

  /** Called when user applies a threshold from the threshold tab. */
  const handleThresholdApply = useCallback(
    (newUrl: string) => {
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId) return rec
          if (rec.mode === "image" && rec.imageDoc) {
            return {
              ...rec,
              imageDoc: { ...rec.imageDoc, restoredUrl: newUrl },
              thumbUrl: newUrl,
            }
          }
          return rec
        }),
      )
      // Persist the new restored URL (R2 URL from confirm-threshold) to DB
      if (activeId) {
        updateDocument(activeId, { restored_url: newUrl }).catch((err) => {
          console.log("[v0] Failed to update document after threshold apply:", err)
        })
      }
    },
    [activeId],
  )

  /** Called when user applies adjustments (brightness/contrast/rotate/crop). */
  const handleAdjustmentApply = useCallback(
    (newUrl: string) => {
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId) return rec
          if (rec.mode === "image" && rec.imageDoc) {
            return {
              ...rec,
              imageDoc: { ...rec.imageDoc, restoredUrl: newUrl },
              thumbUrl: newUrl,
            }
          }
          return rec
        }),
      )
    },
    [activeId],
  )

  /** Cache the soft output URL + hash for this record after first load. */
  const handleSoftLoaded = useCallback(
    (softUrl: string, softContentHash: string) => {
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId) return rec
          return { ...rec, softImageUrl: softUrl, softContentHash }
        }),
      )
    },
    [activeId],
  )

  const handleDownload = () => {
    if (!active) return
    downloadDataUrl(active.restoredUrl, `${baseName}-restored.png`)
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
          {restorationError && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{restorationError}</p>
            </div>
          )}

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
            <PendingPreview
              file={pendingFile}
              onRestore={handlePendingRestore}
              isChecking={checkingClassification}
            />
          )}

          {status === "confirming" && pendingFile && (
            <>
              <PendingPreview
                file={pendingFile}
                onRestore={handlePendingRestore}
                isChecking={checkingClassification}
              />
              <ConfirmRestoreDialog
                open={showConfirm}
                fileName={pendingFile.name}
                classification={classification}
                classificationError={classificationError}
                onConfirm={handleConfirmRestore}
                onCancel={handleCancelRestore}
              />
            </>
          )}

          {status === "processing" && (
            <ProcessingView fileName={processingName} label={processingLabel} />
          )}

          {status === "done" && activeRecord?.mode === "pdf" && activeRecord.outputPdfUrl && (
            <div className="mx-auto flex max-w-xl flex-col items-center rounded-xl border border-border bg-card px-6 py-16 text-center">
              <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText className="size-7" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Your restored PDF is ready</h2>
              <p className="mb-6 mt-2 max-w-md truncate text-sm text-muted-foreground">
                {activeRecord.fileName} · {activeRecord.pageCount} page{activeRecord.pageCount !== 1 ? "s" : ""}
              </p>
              <Button asChild size="lg">
                <a href={activeRecord.outputPdfUrl} download={`${baseName}-restored.pdf`}>
                  <Download className="size-4" />
                  Download restored PDF
                </a>
              </Button>
            </div>
          )}

          {status === "done" && active && activeRecord?.mode === "image" && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_260px]">
              <div className="order-2 flex min-w-0 flex-col gap-6 xl:order-1">
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <ImageIcon className="size-5" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="truncate text-sm font-medium text-foreground">{activeRecord.fileName}</p>
                      <p className="text-xs text-muted-foreground">Restored</p>
                    </div>
                  </div>
	                  <div className="flex shrink-0 gap-2">
	                    {canContinueEditing && (
	                      <Button variant="outline" onClick={() => setEditing(true)}>
	                        <Pencil className="size-4" />
	                        Continue editing
	                      </Button>
	                    )}
	                    <Button onClick={handleDownload}>
	                      <Download className="size-4" />
	                      Download image
                    </Button>
                  </div>
                </div>

                <CompareView originalUrl={active.originalUrl} restoredUrl={active.restoredUrl} />
              </div>
            </div>
          )}
        </section>
      </div>

      {active && activeRecord && canContinueEditing && (
        <ContinueEditingDialog
          open={editing}
          onOpenChange={setEditing}
          sourceUrl={active.restoredUrl}
          originalFile={activeRecord.originalFile}
          onThresholdApply={handleThresholdApply}
          onAdjustmentApply={handleAdjustmentApply}
          cachedSoftUrl={activeRecord.softImageUrl}
          cachedSoftContentHash={activeRecord.softContentHash}
          onSoftLoaded={handleSoftLoaded}
        />
      )}
    </main>
  )
}
