"use client"

import { cn } from "@/lib/utils"
import type { PdfPage } from "@/lib/pdf-utils"

interface PdfPagesProps {
  pages: PdfPage[]
  activeIndex: number
  onSelect: (index: number) => void
}

export function PdfPages({ pages, activeIndex, onSelect }: PdfPagesProps) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        Pages <span className="font-normal text-muted-foreground">({pages.length})</span>
      </h3>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-2 xl:grid-cols-3">
        {pages.map((page, index) => (
          <button
            key={page.pageNumber}
            type="button"
            onClick={() => onSelect(index)}
            aria-pressed={index === activeIndex}
            className={cn(
              "group relative overflow-hidden rounded-lg border bg-card text-left transition-all",
              index === activeIndex
                ? "border-primary ring-2 ring-primary/30"
                : "border-border hover:border-primary/50",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.restoredUrl || "/placeholder.svg"} alt={`Page ${page.pageNumber}`} className="block w-full" />
            <span className="absolute bottom-1.5 left-1.5 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-medium text-background">
              {page.pageNumber}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
