"use client"

import type React from "react"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  RotateCcw,
  RotateCw,
  Crop,
  RefreshCw,
  Check,
  SlidersHorizontal,
  Settings2,
  Loader2,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { applyAdjustments, loadImage } from "@/lib/image-utils"
import {
  restoreSoftImage,
  confirmThreshold,
  fetchSoftImageBlobUrl,
  resolveBackendAssetUrl,
} from "@/lib/restoration-api"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ContinueEditingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The currently-displayed restored image URL (used by Adjustments tab). */
  sourceUrl: string
  /** The original File object so we can call soft-restore. */
  originalFile: File | null
  /**
   * Called when the user applies threshold.
   * Receives the new R2 URL and the content hash of the confirmed image.
   * The hash can be used to proxy-fetch a blob URL for canvas/jsPDF operations.
   */
  onThresholdApply: (newUrl: string, contentHash: string) => void
  /** Called when the user applies adjustments – receives the new data URL. */
  onAdjustmentApply: (newUrl: string) => void
  /** Cached soft output to avoid redundant API calls. */
  cachedSoftUrl?: string | null
  cachedSoftContentHash?: string | null
  /** Called to cache soft output for this record. */
  onSoftLoaded?: (softUrl: string, softContentHash: string) => void
}

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/* ------------------------------------------------------------------ */
/*  Main dialog                                                        */
/* ------------------------------------------------------------------ */

export function ContinueEditingDialog({
  open,
  onOpenChange,
  sourceUrl,
  originalFile,
  onThresholdApply,
  onAdjustmentApply,
  cachedSoftUrl,
  cachedSoftContentHash,
  onSoftLoaded,
}: ContinueEditingDialogProps) {
  const [activeTab, setActiveTab] = useState<"threshold" | "adjustments">("threshold")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Continue editing</DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "threshold" | "adjustments")}
          className="flex flex-col gap-0"
        >
          <div className="border-b border-border px-5 pt-2">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="threshold" className="gap-1.5">
                <SlidersHorizontal className="size-3.5" />
                Threshold
              </TabsTrigger>
              <TabsTrigger value="adjustments" className="gap-1.5">
                <Settings2 className="size-3.5" />
                Adjustments
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="threshold" className="m-0">
            <ThresholdTab
              open={open}
              originalFile={originalFile}
              cachedSoftUrl={cachedSoftUrl}
              cachedSoftContentHash={cachedSoftContentHash}
              onSoftLoaded={onSoftLoaded}
              onApply={(url, contentHash) => {
                onThresholdApply(url, contentHash)
                onOpenChange(false)
              }}
              onCancel={() => onOpenChange(false)}
            />
          </TabsContent>

          <TabsContent value="adjustments" className="m-0">
            <AdjustmentsTab
              sourceUrl={sourceUrl}
              onApply={(url) => {
                onAdjustmentApply(url)
                onOpenChange(false)
              }}
              onCancel={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Threshold tab                                                      */
/* ------------------------------------------------------------------ */

function ThresholdTab({
  open,
  originalFile,
  cachedSoftUrl,
  cachedSoftContentHash,
  onSoftLoaded,
  onApply,
  onCancel,
}: {
  open: boolean
  originalFile: File | null
  cachedSoftUrl?: string | null
  cachedSoftContentHash?: string | null
  onSoftLoaded?: (softUrl: string, softContentHash: string) => void
  onApply: (url: string, contentHash: string) => void
  onCancel: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Soft image data
  const [softUrl, setSoftUrl] = useState<string | null>(null)
  const [softContentHash, setSoftContentHash] = useState<string | null>(null)
  const [threshold, setThreshold] = useState(0.5)

  // Canvas for real-time preview
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const softPixelDataRef = useRef<Uint8ClampedArray | null>(null)
  const softWidthRef = useRef(0)
  const softHeightRef = useRef(0)

  // Load soft image when the dialog opens
  useEffect(() => {
    if (!open) return

    // If we already have a cached blob URL, use it directly
    if (cachedSoftUrl && cachedSoftContentHash) {
      setSoftUrl(cachedSoftUrl)
      setSoftContentHash(cachedSoftContentHash)
      setThreshold(0.5)
      return
    }

    if (!originalFile) return

    let cancelled = false
    setLoading(true)
    setError(null)

    restoreSoftImage(originalFile)
      .then(async (result) => {
        if (cancelled) return
        const hash = result.soft_output.content_hash
        // Fetch image bytes through backend proxy to avoid CORS issues
        // when drawing to Canvas for pixel-level threshold preview
        const blobUrl = await fetchSoftImageBlobUrl(hash)
        if (cancelled) return
        setSoftUrl(blobUrl)
        setSoftContentHash(hash)
        setThreshold(result.recommended_threshold)
        onSoftLoaded?.(blobUrl, hash)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("[ThresholdTab] soft restore failed:", err)
        setError(err instanceof Error ? err.message : "Failed to load soft output")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, originalFile, cachedSoftUrl, cachedSoftContentHash])

  // Load the soft image into canvas pixel data once URL is ready
  useEffect(() => {
    if (!softUrl) return
    let cancelled = false

    loadImage(softUrl).then((img) => {
      if (cancelled) return

      const w = img.naturalWidth
      const h = img.naturalHeight
      softWidthRef.current = w
      softHeightRef.current = h

      // Offscreen canvas to read pixels
      const offscreen = document.createElement("canvas")
      offscreen.width = w
      offscreen.height = h
      const ctx = offscreen.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      softPixelDataRef.current = ctx.getImageData(0, 0, w, h).data

      // Set preview canvas size
      const canvas = previewCanvasRef.current
      if (canvas) {
        canvas.width = w
        canvas.height = h
      }

      // Apply initial threshold
      applyThresholdToCanvas(threshold)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [softUrl])

  // Apply threshold to canvas when slider changes
  const applyThresholdToCanvas = useCallback((t: number) => {
    const canvas = previewCanvasRef.current
    const pixels = softPixelDataRef.current
    if (!canvas || !pixels) return

    const w = softWidthRef.current
    const h = softHeightRef.current
    const ctx = canvas.getContext("2d")!
    const imageData = ctx.createImageData(w, h)
    const data = imageData.data
    const thresholdByte = t * 255

    for (let i = 0; i < pixels.length; i += 4) {
      // Use the red channel (grayscale image, all channels are the same)
      const val = pixels[i] > thresholdByte ? 255 : 0
      data[i] = val      // R
      data[i + 1] = val  // G
      data[i + 2] = val  // B
      data[i + 3] = 255  // A
    }

    ctx.putImageData(imageData, 0, 0)
  }, [])

  // Re-apply when threshold changes
  useEffect(() => {
    if (softPixelDataRef.current) {
      applyThresholdToCanvas(threshold)
    }
  }, [threshold, applyThresholdToCanvas])

  const handleConfirm = async () => {
    if (!softContentHash) return
    setSaving(true)
    setError(null)
    try {
      const result = await confirmThreshold(softContentHash, threshold)
      const finalUrl = resolveBackendAssetUrl(result.url)
      onApply(finalUrl, result.content_hash)
    } catch (err) {
      console.error("[ThresholdTab] confirm failed:", err)
      setError(err instanceof Error ? err.message : "Failed to apply threshold")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="grid max-h-[65vh] grid-cols-1 overflow-y-auto md:grid-cols-[1fr_260px]">
        {/* Preview area */}
        <div className="flex items-center justify-center bg-muted p-4">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-20">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading soft output…</p>
              <p className="text-xs text-muted-foreground">
                This may take a moment for the first time
              </p>
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground">
                Try closing and reopening the dialog
              </p>
            </div>
          )}
          {!loading && !error && softUrl && (
            <canvas
              ref={previewCanvasRef}
              className="block max-h-[60vh] w-auto max-w-full"
              style={{ imageRendering: "pixelated" }}
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-5 border-t border-border p-5 md:border-l md:border-t-0">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                Binarization Threshold
              </Label>
              <span className="text-xs tabular-nums font-medium text-foreground">
                {threshold.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[threshold]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(v) => setThreshold(v[0])}
              disabled={loading || !!error}
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Lower values keep more detail (darker text). Higher values produce cleaner
              backgrounds but may lose faint strokes.
            </p>
          </div>

          <div className="mt-auto space-y-2 border-t border-border pt-4">
            <p className="text-[11px] text-muted-foreground">
              Preview updates in real time. Click &quot;Apply threshold&quot; to save the result.
            </p>
          </div>
        </div>
      </div>

      <DialogFooter className="border-t border-border px-5 py-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={saving || loading || !softContentHash}>
          <Check className="size-4" />
          {saving ? "Applying…" : "Apply threshold"}
        </Button>
      </DialogFooter>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Adjustments tab (brightness, contrast, rotate, crop)               */
/* ------------------------------------------------------------------ */

function AdjustmentsTab({
  sourceUrl,
  onApply,
  onCancel,
}: {
  sourceUrl: string
  onApply: (url: string) => void
  onCancel: () => void
}) {
  const [brightness, setBrightness] = useState(1)
  const [contrast, setContrast] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [cropMode, setCropMode] = useState(false)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [saving, setSaving] = useState(false)

  const imgWrapRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const reset = useCallback(() => {
    setBrightness(1)
    setContrast(1)
    setRotation(0)
    setCropMode(false)
    setCrop(null)
  }, [])

  const getNormalized = (clientX: number, clientY: number) => {
    const el = imgWrapRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!cropMode) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const p = getNormalized(e.clientX, e.clientY)
    dragStart.current = p
    setCrop({ x: p.x, y: p.y, width: 0, height: 0 })
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!cropMode || !dragStart.current) return
    const p = getNormalized(e.clientX, e.clientY)
    const s = dragStart.current
    setCrop({
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    })
  }
  const onPointerUp = () => {
    dragStart.current = null
    if (crop && (crop.width < 0.02 || crop.height < 0.02)) setCrop(null)
  }

  const handleApply = async () => {
    setSaving(true)
    try {
      const url = await applyAdjustments(sourceUrl, {
        brightness,
        contrast,
        rotation,
        crop: cropMode ? crop : null,
      })
      onApply(url)
    } finally {
      setSaving(false)
    }
  }

  const validCrop = crop && crop.width > 0.02 && crop.height > 0.02

  return (
    <div className="flex flex-col">
      <div className="grid max-h-[65vh] grid-cols-1 overflow-y-auto md:grid-cols-[1fr_260px]">
        {/* Preview */}
        <div className="flex items-center justify-center bg-muted p-4">
          <div
            ref={imgWrapRef}
            className={cn(
              "relative inline-block max-h-[58vh] overflow-hidden",
              cropMode && "cursor-crosshair",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceUrl || "/placeholder.svg"}
              alt="Editing preview"
              draggable={false}
              className="block max-h-[58vh] w-auto select-none"
              style={{
                filter: `brightness(${brightness}) contrast(${contrast})`,
                transform: `rotate(${rotation}deg)`,
                transition: "transform 0.2s ease",
              }}
            />
            {cropMode && validCrop && (
              <div
                className="pointer-events-none absolute border-2 border-primary bg-primary/10"
                style={{
                  left: `${crop!.x * 100}%`,
                  top: `${crop!.y * 100}%`,
                  width: `${crop!.width * 100}%`,
                  height: `${crop!.height * 100}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-5 border-t border-border p-5 md:border-l md:border-t-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Brightness</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(brightness * 100)}%
              </span>
            </div>
            <Slider
              value={[brightness]}
              min={0.5}
              max={1.5}
              step={0.01}
              onValueChange={(v) => setBrightness(v[0])}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">Contrast</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {Math.round(contrast * 100)}%
              </span>
            </div>
            <Slider
              value={[contrast]}
              min={0.5}
              max={1.5}
              step={0.01}
              onValueChange={(v) => setContrast(v[0])}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Rotate</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setRotation((r) => r - 90)}
              >
                <RotateCcw className="size-4" />
                Left
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setRotation((r) => r + 90)}
              >
                <RotateCw className="size-4" />
                Right
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Crop</Label>
            <Button
              variant={cropMode ? "default" : "outline"}
              size="sm"
              className="w-full"
              onClick={() => {
                setCropMode((c) => !c)
                if (cropMode) setCrop(null)
              }}
            >
              <Crop className="size-4" />
              {cropMode ? "Cropping — drag on image" : "Enable crop"}
            </Button>
            {cropMode && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Drag a rectangle over the preview to select the area to keep.
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="mt-auto justify-start text-muted-foreground"
            onClick={reset}
          >
            <RefreshCw className="size-4" />
            Reset adjustments
          </Button>
        </div>
      </div>

      <DialogFooter className="border-t border-border px-5 py-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleApply} disabled={saving}>
          <Check className="size-4" />
          {saving ? "Applying…" : "Apply changes"}
        </Button>
      </DialogFooter>
    </div>
  )
}
