import 'server-only'
import { NextResponse } from 'next/server'

// The Drive proxy routes serve files from this app's own address, so whatever type Drive has on record decides
// how the browser treats the bytes. A file uploaded as "text/html" or "image/svg+xml" (the public maintenance
// form accepts uploads without a login) would otherwise run as a page on our origin, with the viewer's session.
// Only plain images and PDFs are shown in the browser; anything else is a download, never rendered.
const INLINE = /^(image\/(jpeg|png|gif|webp|heic|heif|bmp|avif)|application\/pdf)$/i

export function driveFileResponse(stream: NodeJS.ReadableStream, mimeType: string, filename?: string) {
  const inline = INLINE.test(mimeType)
  const headers: Record<string, string> = {
    'Content-Type': inline ? mimeType : 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=86400, immutable', // a file id's bytes never change once uploaded
  }
  if (!inline) headers['Content-Disposition'] = `attachment${filename ? `; filename*=UTF-8''${encodeURIComponent(filename)}` : ''}`
  if (!/pdf/i.test(mimeType)) headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
  return new NextResponse(stream as unknown as BodyInit, { headers })
}
