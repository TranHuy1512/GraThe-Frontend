"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  Download,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  LogOut,
  Pencil,
  ScanLine,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Uploader } from "@/components/uploader"
import { CompareView } from "@/components/compare-view"
import { ContinueEditingDialog } from "@/components/continue-editing-dialog"
import { HistorySidebar, type HistoryEntry } from "@/components/history-sidebar"
import { PendingPreview } from "@/components/pending-preview"
import { ConfirmRestoreDialog } from "@/components/confirm-restore-dialog"
import { ProcessingView } from "@/components/processing-view"
import { PdfPreviewView, type PdfPageRecord } from "@/components/pdf-preview-view"
import { useAuth } from "@/components/auth-provider"
import { fileToDataUrl, loadImage, downloadDataUrl } from "@/lib/image-utils"
import { classifyImage, type ClassificationResult } from "@/lib/classification-api"
import {
  deleteDocument,
  fetchCachedImageBlobUrl,
  fetchDocuments,
  fetchPdfJobPages,
  fetchPdfPageBlobUrl,
  resolveBackendAssetUrl,
  restoreImage,
  restorePdf,
  updateDocument,
  type DocumentRecord,
} from "@/lib/restoration-api"
import { buildPdfFromPages, dataUrlToFile, renderSinglePdfPage } from "@/lib/pdf-utils"

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
  /** Original image File (images only) — enables "Continue editing". */
  originalFile: File | null
  /** Cached soft output for single-image threshold editing. */
  softImageUrl: string | null
  softContentHash: string | null
  /** Original PDF File (PDFs only) — enables comparison + page editing. */
  originalPdfFile: File | null
  /** Per-page restored URLs received directly from the API response. */
  pdfRestoredPages: Array<{ pageNumber: number; url: string }>
  /** Fully-loaded per-page records (populated lazily when "Preview" is clicked). */
  pdfPages: PdfPageRecord[] | null
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
      // Preserve lazily-loaded PDF pages across history upserts
      pdfPages: record.pdfPages ?? existing.pdfPages,
      pdfRestoredPages:
        record.pdfRestoredPages.length > 0
          ? record.pdfRestoredPages
          : existing.pdfRestoredPages,
    },
    ...records.filter((item) => item.id !== record.id),
  ]
}

export default function Page() {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login")
    }
  }, [authLoading, user, router])

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

  // ── PDF preview state ──────────────────────────────────────────────────
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [loadingPdfPreview, setLoadingPdfPreview] = useState(false)
  const [buildingPdf, setBuildingPdf] = useState(false)
  /**
   * When the user clicks "Continue editing" for a specific PDF page we
   * render that page from the original PDF file, wrap it in a File, and
   * store it here so the ContinueEditingDialog can call soft-restore.
   */
  const [editingPdfPage, setEditingPdfPage] = useState<{
    pageNumber: number
    pageFile: File
    sourceUrl: string
  } | null>(null)
  const [preparingPdfPageEdit, setPreparingPdfPageEdit] = useState(false)

  const newInputRef = useRef<HTMLInputElement>(null)

  // Reset PDF-specific UI state when the active history item changes
  useEffect(() => {
    setPdfPreviewOpen(false)
    setEditingPdfPage(null)
  }, [activeId])

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
          originalPdfFile: null,
          pdfRestoredPages: [],
          pdfPages: null,
        }))
        if (records.length > 0) {
          setHistory(records)
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
          originalPdfFile: pendingFile,
          pdfRestoredPages: result.pages
            .filter((p) => p.public_url)
            .map((p) => ({ pageNumber: p.page, url: p.public_url! })),
          pdfPages: null,
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
        originalPdfFile: null,
        pdfRestoredPages: [],
        pdfPages: null,
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

  // ── Single-image editing callbacks ────────────────────────────────────

  const active: ImageDoc | null = activeRecord?.mode === "image" ? activeRecord.imageDoc : null
  const canContinueEditing = Boolean(activeRecord?.originalFile)

  useEffect(() => {
    if (!canContinueEditing) setEditing(false)
  }, [canContinueEditing])

  const handleThresholdApply = useCallback(
    (newUrl: string, _contentHash: string) => {
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId) return rec
          if (rec.mode === "image" && rec.imageDoc) {
            return { ...rec, imageDoc: { ...rec.imageDoc, restoredUrl: newUrl }, thumbUrl: newUrl }
          }
          return rec
        }),
      )
      if (activeId) {
        updateDocument(activeId, { restored_url: newUrl }).catch((err) => {
          console.log("[v0] Failed to update document after threshold apply:", err)
        })
      }
    },
    [activeId],
  )

  const handleAdjustmentApply = useCallback(
    (newUrl: string) => {
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId) return rec
          if (rec.mode === "image" && rec.imageDoc) {
            return { ...rec, imageDoc: { ...rec.imageDoc, restoredUrl: newUrl }, thumbUrl: newUrl }
          }
          return rec
        }),
      )
    },
    [activeId],
  )

  const handleSoftLoaded = useCallback(
    (softUrl: string, softContentHash: string) => {
      setHistory((prev) =>
        prev.map((rec) =>
          rec.id !== activeId ? rec : { ...rec, softImageUrl: softUrl, softContentHash },
        ),
      )
    },
    [activeId],
  )

  const handleDownloadImage = () => {
    if (!active) return
    downloadDataUrl(active.restoredUrl, `${baseName}-restored.png`)
  }

  // ── PDF preview & download ────────────────────────────────────────────

  const handlePdfPreview = useCallback(async () => {
    if (!activeRecord || activeRecord.mode !== "pdf") return

    // Already loaded — just toggle open
    if (activeRecord.pdfPages) {
      setPdfPreviewOpen((prev) => !prev)
      return
    }

    setLoadingPdfPreview(true)
    try {
      let restoredPages = activeRecord.pdfRestoredPages

      // For records loaded from DB (no in-memory pages), fetch from the backend
      if (restoredPages.length === 0) {
        const dbPages = await fetchPdfJobPages(activeRecord.id)
        restoredPages = dbPages
          .filter((p) => p.public_url)
          .map((p) => ({ pageNumber: p.page, url: p.public_url! }))
      }

      if (restoredPages.length === 0) {
        console.warn("[pdf-preview] No page URLs available for job", activeRecord.id)
        setLoadingPdfPreview(false)
        return
      }

      // Build PdfPageRecord for each page in parallel
      const pdfPages: PdfPageRecord[] = await Promise.all(
        restoredPages.map(async (restoredPage) => {
          // Fetch restored page via backend proxy → blob URL (avoids CORS for jsPDF)
          const restoredBlobUrl = await fetchPdfPageBlobUrl(
            activeRecord.id,
            restoredPage.pageNumber,
          )

          let originalUrl = ""
          let width = 0
          let height = 0

          if (activeRecord.originalPdfFile) {
            // Render original page from the in-memory PDF file
            const rendered = await renderSinglePdfPage(
              activeRecord.originalPdfFile,
              restoredPage.pageNumber,
            )
            originalUrl = rendered.dataUrl
            width = rendered.width
            height = rendered.height
          } else {
            // Infer dimensions from the already-fetched restored blob
            await new Promise<void>((resolve) => {
              const img = new Image()
              img.onload = () => {
                width = img.naturalWidth
                height = img.naturalHeight
                resolve()
              }
              img.onerror = () => resolve()
              img.src = restoredBlobUrl
            })
          }

          return {
            pageNumber: restoredPage.pageNumber,
            originalUrl,
            restoredUrl: restoredBlobUrl,
            width,
            height,
            softImageUrl: null,
            softContentHash: null,
            deleted: false,
            modified: false,
          } satisfies PdfPageRecord
        }),
      )

      // Ensure pages are in order
      pdfPages.sort((a, b) => a.pageNumber - b.pageNumber)

      setHistory((prev) =>
        prev.map((rec) => (rec.id === activeId ? { ...rec, pdfPages } : rec)),
      )
      setPdfPreviewOpen(true)
    } catch (err) {
      console.error("[pdf-preview] Failed to load pages:", err)
    } finally {
      setLoadingPdfPreview(false)
    }
  }, [activeRecord, activeId])

  const handleDeletePdfPage = useCallback(
    (pageNumber: number) => {
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId || !rec.pdfPages) return rec
          return {
            ...rec,
            pdfPages: rec.pdfPages.map((p) =>
              p.pageNumber === pageNumber ? { ...p, deleted: true } : p,
            ),
          }
        }),
      )
    },
    [activeId],
  )

  const handleRestorePdfPage = useCallback(
    (pageNumber: number) => {
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId || !rec.pdfPages) return rec
          return {
            ...rec,
            pdfPages: rec.pdfPages.map((p) =>
              p.pageNumber === pageNumber ? { ...p, deleted: false } : p,
            ),
          }
        }),
      )
    },
    [activeId],
  )

  /**
   * Render a single page from the original PDF file as a File blob,
   * then open the ContinueEditingDialog for that page.
   */
  const handleEditPdfPage = useCallback(
    async (pageNumber: number) => {
      if (!activeRecord?.originalPdfFile || !activeRecord.pdfPages) return
      const page = activeRecord.pdfPages.find((p) => p.pageNumber === pageNumber)
      if (!page) return

      setPreparingPdfPageEdit(true)
      try {
        const { dataUrl } = await renderSinglePdfPage(
          activeRecord.originalPdfFile,
          pageNumber,
        )
        const pageFile = dataUrlToFile(dataUrl, `page-${pageNumber}.png`)
        setEditingPdfPage({
          pageNumber,
          pageFile,
          sourceUrl: page.restoredUrl,
        })
      } catch (err) {
        console.error("[pdf-edit] Failed to render page for editing:", err)
      } finally {
        setPreparingPdfPageEdit(false)
      }
    },
    [activeRecord],
  )

  /**
   * Called when threshold is applied to a PDF page.
   * The content_hash lets us proxy-fetch a blob URL suitable for jsPDF.
   */
  const handlePdfPageThresholdApply = useCallback(
    async (newUrl: string, contentHash: string) => {
      if (!editingPdfPage || !activeId) return
      const { pageNumber } = editingPdfPage

      // Exchange the R2 URL for a same-origin blob URL so jsPDF can embed it
      let blobUrl = newUrl
      try {
        blobUrl = await fetchCachedImageBlobUrl(contentHash)
      } catch {
        // Fall back to the R2 URL — display still works, only PDF rebuild may fail
      }

      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId || !rec.pdfPages) return rec
          return {
            ...rec,
            pdfPages: rec.pdfPages.map((p) =>
              p.pageNumber === pageNumber
                ? { ...p, restoredUrl: blobUrl, modified: true }
                : p,
            ),
          }
        }),
      )
      setEditingPdfPage(null)
    },
    [editingPdfPage, activeId],
  )

  /** Called when adjustments (brightness/contrast/rotate/crop) are applied to a PDF page. */
  const handlePdfPageAdjustmentApply = useCallback(
    (newUrl: string) => {
      if (!editingPdfPage || !activeId) return
      const { pageNumber } = editingPdfPage

      // newUrl is a canvas data URL — safe for jsPDF directly
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId || !rec.pdfPages) return rec
          return {
            ...rec,
            pdfPages: rec.pdfPages.map((p) =>
              p.pageNumber === pageNumber
                ? { ...p, restoredUrl: newUrl, modified: true }
                : p,
            ),
          }
        }),
      )
      setEditingPdfPage(null)
    },
    [editingPdfPage, activeId],
  )

  /** Cache the soft URL for a PDF page after first load. */
  const handlePdfPageSoftLoaded = useCallback(
    (softUrl: string, softContentHash: string) => {
      if (!editingPdfPage || !activeId) return
      const { pageNumber } = editingPdfPage
      setHistory((prev) =>
        prev.map((rec) => {
          if (rec.id !== activeId || !rec.pdfPages) return rec
          return {
            ...rec,
            pdfPages: rec.pdfPages.map((p) =>
              p.pageNumber === pageNumber
                ? { ...p, softImageUrl: softUrl, softContentHash }
                : p,
            ),
          }
        }),
      )
    },
    [editingPdfPage, activeId],
  )

  const handleDownloadPdf = useCallback(async () => {
    if (!activeRecord || activeRecord.mode !== "pdf") return
    const outputFilename = `${baseName}-restored.pdf`

    const pdfPages = activeRecord.pdfPages
    const needsRebuild = pdfPages && pdfPages.some((p) => p.deleted || p.modified)

    if (!needsRebuild) {
      // No modifications — serve the backend-merged PDF directly
      if (activeRecord.outputPdfUrl) {
        downloadDataUrl(activeRecord.outputPdfUrl, outputFilename)
      }
      return
    }

    // Rebuild PDF from individual page blobs
    setBuildingPdf(true)
    try {
      await buildPdfFromPages(pdfPages!, outputFilename)
    } catch (err) {
      console.error("[pdf-download] Failed to build PDF:", err)
    } finally {
      setBuildingPdf(false)
    }
  }, [activeRecord, baseName])

  // ── Derived values ────────────────────────────────────────────────────

  const activePdfRecord =
    activeRecord?.mode === "pdf" ? activeRecord : null

  const activePdfPages = activePdfRecord?.pdfPages ?? null

  const editingPdfPageRecord = editingPdfPage
    ? activePdfPages?.find((p) => p.pageNumber === editingPdfPage.pageNumber) ?? null
    : null

  // ── Render ────────────────────────────────────────────────────────────

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
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
          <div className="flex items-center gap-3">
            {user.user_metadata?.avatar_url ? (
              <img
                src={user.user_metadata.avatar_url}
                alt={user.user_metadata?.full_name ?? user.email ?? "User"}
                className="size-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                {(user.user_metadata?.full_name ?? user.email ?? "U").charAt(0).toUpperCase()}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-muted-foreground">
              <LogOut className="size-3.5" />
              Sign out
            </Button>
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
                  Clean up faded scans and aged paper. Upload an image or PDF, compare the result
                  against the original, and download a polished copy.
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

          {/* ── PDF done state ── */}
          {status === "done" && activePdfRecord && (
            <div className="flex flex-col gap-6">
              {/* Summary card */}
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <FileText className="size-5" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="truncate text-sm font-medium text-foreground">
                      {activePdfRecord.fileName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {activePdfRecord.pageCount} page{activePdfRecord.pageCount !== 1 ? "s" : ""} · Restored
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  {/* Preview button */}
                  <Button
                    variant="outline"
                    onClick={handlePdfPreview}
                    disabled={loadingPdfPreview}
                  >
                    {loadingPdfPreview ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Loading…
                      </>
                    ) : (
                      <>
                        <Eye className="size-4" />
                        {pdfPreviewOpen ? "Close preview" : "Preview pages"}
                      </>
                    )}
                  </Button>

                  {/* Download button */}
                  <Button onClick={handleDownloadPdf} disabled={buildingPdf}>
                    {buildingPdf ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Building PDF…
                      </>
                    ) : (
                      <>
                        <Download className="size-4" />
                        Download PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Page-by-page preview */}
              {pdfPreviewOpen && activePdfPages && (
                <PdfPreviewView
                  pages={activePdfPages}
                  canEdit={Boolean(activePdfRecord.originalPdfFile) && !preparingPdfPageEdit}
                  onDeletePage={handleDeletePdfPage}
                  onRestorePage={handleRestorePdfPage}
                  onEditPage={handleEditPdfPage}
                />
              )}

              {/* Preparing page for editing spinner */}
              {preparingPdfPageEdit && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Preparing page for editing…
                </div>
              )}
            </div>
          )}

          {/* ── Single-image done state ── */}
          {status === "done" && active && activeRecord?.mode === "image" && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_260px]">
              <div className="order-2 flex min-w-0 flex-col gap-6 xl:order-1">
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <ImageIcon className="size-5" />
                    </div>
                    <div className="overflow-hidden">
                      <p className="truncate text-sm font-medium text-foreground">
                        {activeRecord.fileName}
                      </p>
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
                    <Button onClick={handleDownloadImage}>
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

      {/* ── Single-image ContinueEditingDialog ── */}
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

      {/* ── PDF-page ContinueEditingDialog ── */}
      {editingPdfPage && (
        <ContinueEditingDialog
          open
          onOpenChange={(open) => {
            if (!open) setEditingPdfPage(null)
          }}
          sourceUrl={editingPdfPage.sourceUrl}
          originalFile={editingPdfPage.pageFile}
          onThresholdApply={handlePdfPageThresholdApply}
          onAdjustmentApply={handlePdfPageAdjustmentApply}
          cachedSoftUrl={editingPdfPageRecord?.softImageUrl ?? null}
          cachedSoftContentHash={editingPdfPageRecord?.softContentHash ?? null}
          onSoftLoaded={handlePdfPageSoftLoaded}
        />
      )}
    </main>
  )
}
