"use client"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1"
const RESTORATION_ENDPOINT = "/restorations"
const PDF_RESTORATION_ENDPOINT = "/pdf-restorations"
const DOCUMENTS_ENDPOINT = "/documents"

export interface RestoredFile {
  page: number
  filename: string
  url: string
  content_hash: string
  cached: boolean
}

export interface RestorationResponse {
  request_id: string
  input_filename: string
  input_type: string
  total_pages: number
  outputs: RestoredFile[]
  document_id: string | null
}

export interface SoftRestorationResponse {
  request_id: string
  input_filename: string
  input_type: string
  total_pages: number
  soft_output: RestoredFile
  recommended_threshold: number
}

export interface ConfirmThresholdResponse {
  request_id: string
  filename: string
  url: string
  content_hash: string
  threshold: number
  cached: boolean
  document_id: string | null
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
  document_id: string | null
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

export interface DocumentRecord {
  id: string
  mode: "image" | "pdf"
  file_name: string
  file_size: number | null
  page_count: number
  original_url: string | null
  restored_url: string | null
  content_hash: string | null
  width: number | null
  height: number | null
  soft_content_hash: string | null
  soft_image_url: string | null
  output_pdf_url: string | null
  patch_size: number | null
  threshold: number | null
  binarize_output: boolean | null
  overlap: boolean | null
  created_at: string
  updated_at: string
}

export interface DocumentListResponse {
  items: DocumentRecord[]
  total: number
}

export interface DocumentUpdatePayload {
  restored_url?: string
  content_hash?: string
  threshold?: number
  soft_content_hash?: string
  soft_image_url?: string
  output_pdf_url?: string
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

export async function restoreSoftImage(file: File): Promise<SoftRestorationResponse> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE_URL}${RESTORATION_ENDPOINT}/soft`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Soft restoration failed with status ${response.status}`)
  }

  return response.json()
}

export async function confirmThreshold(
  softContentHash: string,
  threshold: number,
  documentId?: string | null,
): Promise<ConfirmThresholdResponse> {
  const response = await fetch(`${API_BASE_URL}${RESTORATION_ENDPOINT}/confirm-threshold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      soft_content_hash: softContentHash,
      threshold,
      document_id: documentId ?? null,
    }),
  })

  if (!response.ok) {
    throw new Error(`Confirm threshold failed with status ${response.status}`)
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

/**
 * Fetch the soft-restored image through the backend proxy and return a
 * local blob: URL.  This avoids CORS issues when drawing the image onto
 * a Canvas for real-time threshold preview (getImageData requires
 * same-origin or CORS-enabled images).
 */
export async function fetchSoftImageBlobUrl(contentHash: string): Promise<string> {
  const response = await fetch(
    `${API_BASE_URL}${RESTORATION_ENDPOINT}/soft-image/${encodeURIComponent(contentHash)}`,
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch soft image (status ${response.status})`)
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

// ------------------------------------------------------------------ //
//  Document library API                                               //
// ------------------------------------------------------------------ //

export async function fetchDocuments(limit = 100, offset = 0): Promise<DocumentListResponse> {
  const response = await fetch(
    `${API_BASE_URL}${DOCUMENTS_ENDPOINT}?limit=${limit}&offset=${offset}`,
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch documents (status ${response.status})`)
  }

  return response.json()
}

export async function deleteDocument(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${DOCUMENTS_ENDPOINT}/${id}`, {
    method: "DELETE",
  })

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete document (status ${response.status})`)
  }
}

export async function updateDocument(id: string, patch: DocumentUpdatePayload): Promise<DocumentRecord> {
  const response = await fetch(`${API_BASE_URL}${DOCUMENTS_ENDPOINT}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })

  if (!response.ok) {
    throw new Error(`Failed to update document (status ${response.status})`)
  }

  return response.json()
}
