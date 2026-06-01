"use client"

import type React from "react"

import { useCallback, useRef, useState } from "react"
import { Upload, ImageIcon, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploaderProps {
  onFile: (file: File) => void
}

const ACCEPTED = "image/png,image/jpeg,image/jpg,image/webp,application/pdf"

export function Uploader({ onFile }: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      if (!file.type.startsWith("image/") && file.type !== "application/pdf") return
      onFile(file)
    },
    [onFile],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      handleFiles(e.dataTransfer.files)
    },
    [handleFiles],
  )

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload an image or PDF"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-16 text-center transition-colors",
          dragging ? "border-primary bg-accent" : "border-border hover:border-primary/60 hover:bg-accent/40",
        )}
      >
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Upload className="size-6" />
        </div>
        <h2 className="text-balance text-lg font-semibold text-foreground">
          Drop a document here, or click to browse
        </h2>
        <p className="mt-2 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
          Upload a scanned image or a multi-page PDF. We&apos;ll restore it and let you compare against the original.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs font-medium text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5">
            <ImageIcon className="size-3.5" />
            PNG · JPG · WEBP
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5">
            <FileText className="size-3.5" />
            PDF
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  )
}
