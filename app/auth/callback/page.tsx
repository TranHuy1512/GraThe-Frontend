"use client"

import { Suspense, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { supabase } from "@/lib/supabase"

function AuthCallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const code = searchParams.get("code")
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(() => router.replace("/"))
        .catch(() => router.replace("/login"))
    } else {
      // Implicit flow: session is already set via URL hash — just go home
      supabase.auth.getSession().then(({ data }) => {
        router.replace(data.session ? "/" : "/login")
      })
    }
  }, [router, searchParams])

  return null
}

const Spinner = () => (
  <div className="flex h-screen items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Signing in…</p>
    </div>
  </div>
)

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AuthCallbackHandler />
      <Spinner />
    </Suspense>
  )
}
