import path from 'path'
import fs from 'fs/promises'
import { toHttp } from './http.js'
import { metadataDir } from '../config.js'

// Minimal metadata loader using toHttp and fetch
export async function loadMetadataJSON(metadataURI: string): Promise<any | null> {
  try {
    const url = toHttp(metadataURI)
    if (!url) return null
    // If it's a local relative path /metadata/...
    if (url.startsWith('/metadata/')) {
      try {
        const rel = url.replace('/metadata/', '')
        const filePath = path.join(metadataDir, rel)
        const buf = await fs.readFile(filePath)
        return JSON.parse(buf.toString('utf-8'))
      } catch {
        return null
      }
    }
    // If it's http(s) and points to our /metadata folder, load locally
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const u = new URL(url)
        if (u.pathname.startsWith('/metadata/')) {
          const rel = u.pathname.replace('/metadata/', '')
          const filePath = path.join(metadataDir, rel)
          const buf = await fs.readFile(filePath)
          return JSON.parse(buf.toString('utf-8'))
        }
      } catch {
        // Continue with fetch if it cannot be parsed
      }
      // @ts-ignore Node 18+ global fetch
      const resp = await fetch(url)
      if (!resp?.ok) return null
      return await resp.json()
    }
    return null
  } catch {
    return null
  }
}