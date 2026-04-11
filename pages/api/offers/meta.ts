import type { NextApiRequest, NextApiResponse } from 'next'

const offerMeta = new Map<string, object>()
const MAX_OFFER_META = 500

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
      const offerId = body?.offerId
      if (!offerId || !isAlphanumericId(String(offerId))) {
        return res.status(400).json({ error: 'Valid offerId required' })
      }
      const allowed = ['offerId', 'lenderName', 'rate', 'liquidity', 'collateralType']
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
      if (offerMeta.size >= MAX_OFFER_META) {
        const fk = offerMeta.keys().next().value
        if (fk) offerMeta.delete(fk)
      }
      offerMeta.set(offerId.toString(), { ...safe, offerId, updatedAt: new Date().toISOString() })
      return res.status(200).json({ success: true })
    } catch {
      return res.status(400).json({ error: 'Invalid body' })
    }
  }

  if (req.method === 'GET') {
    const { offerId } = req.query
    if (!isAlphanumericId(offerId)) {
      return res.status(400).json({ error: 'Invalid offerId' })
    }
    const m = offerMeta.get(String(offerId))
    return res.status(200).json(m || {})
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: 'Method not allowed' })
}
