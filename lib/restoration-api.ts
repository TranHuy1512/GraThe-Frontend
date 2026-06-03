"use client"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1"
const RESTORATION_ENDPOINT = "/restorations"

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

export function resolveBackendAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url

  const apiUrl = new URL(API_BASE_URL)
  return new URL(url, apiUrl.origin).toString()
}
