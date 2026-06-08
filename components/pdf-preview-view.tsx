"use client"

import type React from "react"

import { useCallback, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PdfPageRecord {
  pageNumber: number
  /** Data URL rendered from the original PDF; empty string if original file not available. */
  originalUrl: string
  /** Blob URL fetched through the backend proxy; updated after threshold/adjustment apply. */
  restoredUrl: string
  width: number
  height: number
  softImageUrl: string | null
  softContentHash: string | null
  deleted: boolean
  /** True once the user has applied a threshold or adjustment to this page. */
  modified: boolean
}

interface PdfPreviewViewProps {
  pages: PdfPageRecord[]
  /** Whether the user can open "Continue editing" (requires original PDF in memory). */
  canEdit: boolean
  onDeletePage: (pageNumber: number) => void
  onRestorePage: (pageNumber: number) => void
  onEditPage: (pageNumber: number) => void
}

type ViewMode = "slider" | "side-by-side"

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function PdfPreviewView({
  pages,
  canEdit,
  onDeletePage,
  onRestorePage,
  onEditPage,
}: PdfPreviewViewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>("slider")

  const current = pages[currentIndex] ?? null
  const totalPages = pages.length
  const activeCount = pages.filter((p) => !p.deleted).length

  const goTo = (idx: number) => setCurrentIndex(Math.min(totalPages - 1, Math.max(0, idx)))
  const hasOriginal = Boolean(current?.originalUrl)

  if (!current) return null

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">
            Page {current.pageNumber} of {totalPages}
          </span>
          {totalPages - activeCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({totalPages - activeCount} deleted)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View-mode toggle — only meaningful when both images are available */}
          {hasOriginal && !current.deleted && (
            <div className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("slider")}
                aria-pressed={viewMode === "slider"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === "slider"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <SlidersHorizontal className="size-3.5" />
                Slider
              </button>
              <button
                type="button"
                onClick={() => setViewMode("side-by-side")}
                aria-pressed={viewMode === "side-by-side"}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  viewMode === "side-by-side"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Columns2 className="size-3.5" />
                Side by side
              </button>
            </div>
          )}

          {/* Page navigation */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => goTo(currentIndex + 1)}
            disabled={currentIndex === totalPages - 1}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Page comparison area ── */}
      <div className="p-4">
        {current.deleted ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Page {current.pageNumber} will be removed from the download
            </p>
            <Button variant="outline" size="sm" onClick={() => onRestorePage(current.pageNumber)}>
              <RotateCcw className="size-4" />
              Restore page
            </Button>
          </div>
        ) : hasOriginal ? (
          viewMode === "slider" ? (
            <PageSliderCompare page={current} />
          ) : (
            <PageSideBySide page={current} />
          )
        ) : (
          /* No original available — show only the restored image */
          <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
            <img
              src={current.restoredUrl}
              alt={`Restored page ${current.pageNumber}`}
              className="block w-full"
              draggable={false}
            />
            <Tag className="left-3">Restored</Tag>
          </div>
        )}
      </div>

      {/* ── Per-page actions ── */}
      {!current.deleted && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDeletePage(current.pageNumber)}
          >
            <Trash2 className="size-4" />
            Delete page
          </Button>
          {canEdit && hasOriginal && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEditPage(current.pageNumber)}
            >
              <Pencil className="size-4" />
              Continue editing
            </Button>
          )}
          {current.modified && (
            <span className="ml-auto text-xs text-muted-foreground">Modified</span>
          )}
        </div>
      )}

      {/* ── Thumbnail strip ── */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {pages.map((page, idx) => (
            <button
              key={page.pageNumber}
              type="button"
              onClick={() => goTo(idx)}
              title={page.deleted ? `Page ${page.pageNumber} (deleted)` : `Page ${page.pageNumber}`}
              className={cn(
                "group relative flex-shrink-0 overflow-hidden rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                idx === currentIndex ? "border-primary" : "border-transparent hover:border-border",
                page.deleted && "opacity-40",
              )}
            >
              <img
                src={page.restoredUrl}
                alt={`Page ${page.pageNumber}`}
                className="h-20 w-auto object-contain bg-muted"
                draggable={false}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-foreground/60 px-1 py-0.5 text-center text-[10px] font-medium leading-tight text-background">
                {page.deleted ? "×" : page.pageNumber}
                {page.modified && !page.deleted && " ✓"}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared label tag                                                   */
/* ------------------------------------------------------------------ */

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-3 rounded-md bg-foreground/80 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-background",
        className,
      )}
    >
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Slider comparison                                                  */
/* ------------------------------------------------------------------ */

function PageSliderCompare({ page }: { page: PdfPageRecord }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(50)
  const draggingRef = useRef(false)

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPosition(Math.min(100, Math.max(0, pct)))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    updateFromClientX(e.clientX)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    updateFromClientX(e.clientX)
  }
  const onPointerUp = () => {
    draggingRef.current = false
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none overflow-hidden rounded-xl border border-border bg-muted"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Restored is the base layer */}
      <img
        src={page.restoredUrl}
        alt={`Restored page ${page.pageNumber}`}
        className="block w-full"
        draggable={false}
      />
      <Tag className="right-3">Restored</Tag>

      {/* Original clipped on top */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img
          src={page.originalUrl}
          alt={`Original page ${page.pageNumber}`}
          className="block h-full w-auto max-w-none"
          style={{ width: containerRef.current ? containerRef.current.clientWidth : "100%" }}
          draggable={false}
        />
        <Tag className="left-3">Original</Tag>
      </div>

      {/* Drag handle */}
      <div
        className="absolute inset-y-0 flex w-0.5 items-center justify-center bg-primary"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      >
        <div className="flex size-9 items-center justify-center rounded-full border-2 border-primary bg-card shadow-md">
          <SlidersHorizontal className="size-4 text-primary" />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Side-by-side comparison                                            */
/* ------------------------------------------------------------------ */

function PageSideBySide({ page }: { page: PdfPageRecord }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
        <img
          src={page.originalUrl}
          alt={`Original page ${page.pageNumber}`}
          className="block w-full"
          draggable={false}
        />
        <Tag className="left-3">Original</Tag>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
        <img
          src={page.restoredUrl}
          alt={`Restored page ${page.pageNumber}`}
          className="block w-full"
          draggable={false}
        />
        <Tag className="left-3">Restored</Tag>
      </div>
    </div>
  )
}
