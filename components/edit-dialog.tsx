"use client"

import type React from "react"

import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, RotateCw, Crop, RefreshCw, Check } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { applyAdjustments } from "@/lib/image-utils"

interface EditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceUrl: string
  onApply: (newUrl: string) => void
}

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export function EditDialog({ open, onOpenChange, sourceUrl, onApply }: EditDialogProps) {
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

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

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
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const validCrop = crop && crop.width > 0.02 && crop.height > 0.02

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-base">Edit restored document</DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[70vh] grid-cols-1 overflow-y-auto md:grid-cols-[1fr_240px]">
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
                <span className="text-xs tabular-nums text-muted-foreground">{Math.round(brightness * 100)}%</span>
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
                <span className="text-xs tabular-nums text-muted-foreground">{Math.round(contrast * 100)}%</span>
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
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setRotation((r) => r - 90)}>
                  <RotateCcw className="size-4" />
                  Left
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setRotation((r) => r + 90)}>
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

            <Button variant="ghost" size="sm" className="mt-auto justify-start text-muted-foreground" onClick={reset}>
              <RefreshCw className="size-4" />
              Reset adjustments
            </Button>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={saving}>
            <Check className="size-4" />
            {saving ? "Applying…" : "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
