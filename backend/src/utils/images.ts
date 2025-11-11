import path from 'path'
import fs from 'fs/promises'
import { imagesDir, MAX_IMAGE_BYTES, CACHE_TTL_MS } from '../config.js'
import { toHttp } from './http.js'

const imageCache = new Map<string, { value: string, expiresAt: number }>()
const PLACEHOLDER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9ca3af" font-size="10">Agent</text></svg>'
const PLACEHOLDER_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(PLACEHOLDER_SVG)}`

// Infer MIME by extension for common formats
export function inferImageMime(p: string): string {
  const lower = p.toLowerCase()
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

export async function bufferToDataURI(buf: Buffer, mime: string): Promise<string> {
  const base64 = buf.toString('base64')
  return `data:${mime};base64,${base64}`
}

// Load image from local folder when it's a relative /images/... path
export async function loadLocalImageDataURI(relPath: string): Promise<string | undefined> {
  try {
    if (!relPath.startsWith('/images/')) return undefined
    const fileRel = relPath.replace('/images/', '')
    const filePath = path.join(imagesDir, fileRel)
    const stat = await fs.stat(filePath)
    if (stat.size > MAX_IMAGE_BYTES) return undefined
    const buf = await fs.readFile(filePath)
    const mime = inferImageMime(filePath)
    return bufferToDataURI(buf, mime)
  } catch {
    return undefined
  }
}

// Load image from URL (http/https/ipfs or local relative path) and return data URI
export async function loadImageDataURI(imageRef?: string): Promise<string | undefined> {
  try {
    if (!imageRef) return undefined
    const normalized = toHttp(imageRef)
    if (!normalized) return undefined
    // Cache lookup
    const cached = imageCache.get(normalized)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }
    if (normalized.startsWith('/')) {
      const val = await loadLocalImageDataURI(normalized)
      if (val) imageCache.set(normalized, { value: val, expiresAt: Date.now() + CACHE_TTL_MS })
      return val
    }
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      // If the URL points to our static route /images/... treat it as local
      try {
        const u = new URL(normalized)
        if (u.pathname.startsWith('/images/')) {
          const val = await loadLocalImageDataURI(u.pathname)
          if (val) imageCache.set(normalized, { value: val, expiresAt: Date.now() + CACHE_TTL_MS })
          return val
        }
      } catch {
        // If it cannot be parsed, continue with fetch
      }
      // @ts-ignore Node 18+ global fetch
      const resp = await fetch(normalized)
      if (!resp?.ok) return undefined
      const lenHeader = resp.headers.get('content-length')
      const contentLen = lenHeader ? Number(lenHeader) : undefined
      if (typeof contentLen === 'number' && contentLen > MAX_IMAGE_BYTES) return undefined
      const mime = resp.headers.get('content-type') || inferImageMime(normalized)
      const arrayBuf = await resp.arrayBuffer()
      const buf = Buffer.from(arrayBuf)
      if (buf.length > MAX_IMAGE_BYTES) return undefined
      const val = await bufferToDataURI(buf, mime)
      imageCache.set(normalized, { value: val, expiresAt: Date.now() + CACHE_TTL_MS })
      return val
    }
    return undefined
  } catch {
    return undefined
  }
}

export async function ensureImageDataURI(imageRef?: string): Promise<string> {
  const val = await loadImageDataURI(imageRef)
  return val || PLACEHOLDER_DATA_URI
}