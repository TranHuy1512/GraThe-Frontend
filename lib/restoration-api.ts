"use client"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1"
const RESTORATION_ENDPOINT = "/restorations"
const PDF_RESTORATION_ENDPOINT = "/pdf-restorations"

export interface RestoredFile {
  page: number
  filename: string
  url: string
}

export interface RestorationResponse {
  request_id: string
  input_filename: string
  input_type: string
  total_pages: number
  outputs: RestoredFile[]
}

export type PdfRestorationStatus =
  | "pending"
  | "extracting"
  | "processing"
  | "merging"
  | "uploading"
  | "completed"
  | "failed"

export interface PdfRestoredPage {
  page: number
  filename: string
  r2_object_key: string
  public_url: string | null
}

export interface PdfRestorationResponse {
  job_id: string
  status: PdfRestorationStatus
  input_filename: string
  total_pages: number | null
  processed_pages: number
  pages: PdfRestoredPage[]
  output_pdf_url: string | null
  error: string | null
  created_at: string
  updated_at: string
  progress_percent: number
}

export async function restoreImage(file: File): Promise<RestorationResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE_URL}${RESTORATION_ENDPOINT}`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Restoration failed with status ${response.status}`)
  }

  return response.json()
}

export async function restorePdf(file: File): Promise<PdfRestorationResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE_URL}${PDF_RESTORATION_ENDPOINT}`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`PDF restoration failed with status ${response.status}`)
  }

  const result: PdfRestorationResponse = await response.json()

  if (result.status !== "completed" || !result.output_pdf_url) {
    throw new Error(result.error || "PDF restoration did not return a downloadable PDF.")
  }

  return result
}

export function resolveBackendAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url

  const apiUrl = new URL(API_BASE_URL)
  return new URL(url, apiUrl.origin).toString()
}
