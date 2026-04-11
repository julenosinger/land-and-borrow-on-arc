import type { NextApiRequest, NextApiResponse } from 'next'

const loanMeta = new Map<string, object>()
const MAX_LOAN_META = 500

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'POST') {
    try {
      const body = req.body as Record<string, unknown>
      const loanId = body?.loanId
      if (!loanId || !/^\d{1,10}$/.test(String(loanId))) {
        return res.status(400).json({ error: 'Valid loanId required' })
      }
      const allowed = ['loanId', 'borrowerName', 'location', 'employment', 'collateralDetail']
      const safe: Record<string, string> = {}
      for (const k of allowed) {
        if (body[k] !== undefined) {
          const v = String(body[k]).slice(0, 512)
          if (!isSafeString(v)) {
            return res.status(400).json({ error: 'Invalid input detected.' })
          }
          safe[k] = v
        }
      }
      if (loanMeta.size >= MAX_LOAN_META) {
        const fk = loanMeta.keys().next().value
        if (fk) loanMeta.delete(fk)
      }
      loanMeta.set(loanId.toString(), { ...safe, loanId, updatedAt: new Date().toISOString() })
      return res.status(200).json({ success: true })
    } catch {
      return res.status(400).json({ error: 'Invalid body' })
    }
  }

  if (req.method === 'GET') {
    const { loanId } = req.query
    if (!loanId || !/^\d{1,10}$/.test(String(loanId))) {
      return res.status(400).json({ error: 'Invalid loanId' })
    }
    const m = loanMeta.get(String(loanId))
    return res.status(200).json(m || {})
  }

  res.setHeader('Allow', ['GET', 'POST'])
  return res.status(405).json({ error: 'Method not allowed' })
}
