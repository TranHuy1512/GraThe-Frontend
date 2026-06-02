"use client"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1"
const CLASSIFICATION_ENDPOINT = "/classifications"

export const DOCUMENT_CLASS_ID = 0
export const PHOTO_CLASS_ID = 1

export interface ClassProbability {
  class_id: number
  label: string
  confidence: number
}

export interface ClassificationResult {
  filename: string
  predicted_class_id: number
  predicted_class: string
  confidence: number
  probabilities: ClassProbability[]
}

export async function classifyImage(file: File): Promise<ClassificationResult> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await fetch(`${API_BASE_URL}${CLASSIFICATION_ENDPOINT}`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Classification failed with status ${response.status}`)
  }

  return response.json()
}
