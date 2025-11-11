// Simplificado: convierte ipfs:// a gateway HTTPS; si no, devuelve tal cual
export function toHttp(uri?: string): string | undefined {
  if (!uri) return undefined
  if (uri.startsWith('ipfs://')) {
    const cidPath = uri.replace('ipfs://', '')
    return `https://ipfs.io/ipfs/${cidPath}`
  }
  return uri
}