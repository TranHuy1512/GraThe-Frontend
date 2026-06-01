"use client"

import type React from "react"

import { useCallback, useRef, useState } from "react"
import { Columns2, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

interface CompareViewProps {
  originalUrl: string
  restoredUrl: string
}

type Mode = "slider" | "side-by-side"

export function CompareView({ originalUrl, restoredUrl }: CompareViewProps) {
  const [mode, setMode] = useState<Mode>("slider")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Original vs. Restored</h3>
        <div className="inline-flex rounded-lg border border-border bg-secondary p-0.5">
          <button
            type="button"
            onClick={() => setMode("slider")}
            aria-pressed={mode === "slider"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "slider"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            Slider
          </button>
          <button
            type="button"
            onClick={() => setMode("side-by-side")}
            aria-pressed={mode === "side-by-side"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "side-by-side"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Columns2 className="size-3.5" />
            Side by side
          </button>
        </div>
      </div>

      {mode === "slider" ? (
        <SliderCompare originalUrl={originalUrl} restoredUrl={restoredUrl} />
      ) : (
        <SideBySide originalUrl={originalUrl} restoredUrl={restoredUrl} />
      )}
    </div>
  )
}

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

function SliderCompare({ originalUrl, restoredUrl }: CompareViewProps) {
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
      <img src={restoredUrl || "/placeholder.svg"} alt="Restored document" className="block w-full" draggable={false} />
      <Tag className="right-3">Restored</Tag>

      {/* Original clipped on top */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img
          src={originalUrl || "/placeholder.svg"}
          alt="Original document"
          className="block h-full w-auto max-w-none"
          style={{ width: containerRef.current ? containerRef.current.clientWidth : "100%" }}
          draggable={false}
        />
        <Tag className="left-3">Original</Tag>
      </div>

      {/* Handle */}
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

function SideBySide({ originalUrl, restoredUrl }: CompareViewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
        <img src={originalUrl || "/placeholder.svg"} alt="Original document" className="block w-full" />
        <Tag className="left-3">Original</Tag>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
        <img src={restoredUrl || "/placeholder.svg"} alt="Restored document" className="block w-full" />
        <Tag className="left-3">Restored</Tag>
      </div>
    </div>
  )
}
