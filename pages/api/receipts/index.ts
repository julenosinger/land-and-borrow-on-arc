import type { NextApiRequest, NextApiResponse } from 'next'

// ── In-memory store (Vercel serverless: persists per instance, not global)
// For production at scale, replace with Vercel KV / Redis / Upstash
const receipts = new Map<string, object>()
const MAX_RECEIPTS = 1000

const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /data:text\/html/i,
  /vbscript:/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
]

function isSafeString(val: string): boolean {
  return !DANGEROUS_PATTERNS.some((p) => p.test(val))
}

function isAlphanumericId(val: unknown): boolean {
  return typeof val === 'string' && /^[a-zA-Z0-9_\-]{1,128}$/.test(val)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'POST') {
    try {
      const body = req.body as Record<string, unknown>
      const allowed = ['txHash', 'loanId', 'amount', 'type', 'network', 'address', 'rate', 'installments']
      const safe: Record<string, string> = {}

      for (const k of allowed) {
        if (body[k] !== undefined) {
          const v = String(body[k]).slice(0, 256)
          if (!isSafeString(v)) {
            return res.status(400).json({ error: 'Invalid input detected.' })
          }
          safe[k] = v
        }
      }

      const id = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      if (receipts.size >= MAX_RECEIPTS) {
        const fk = receipts.keys().next().value
        if (fk) receipts.delete(fk)
      }
      receipts.set(id, { ...safe, id, createdAt: new Date().toISOString() })
      return res.status(200).json({ success: true, id })
    } catch {
      return res.status(400).json({ error: 'Invalid body' })
    }
  }

  if (req.method === 'GET') {
    const { id } = req.query
    if (!isAlphanumericId(id)) return res.status(400).json({ error: 'Invalid id' })
    const r = receipts.get(id as string)
    if (!r) return res.status(404).json({ error: 'Not found' })
    return res.status(200).json(r)
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: 'Method not allowed' })
}
