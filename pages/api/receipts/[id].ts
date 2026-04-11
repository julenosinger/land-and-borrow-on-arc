import type { NextApiRequest, NextApiResponse } from 'next'

// Re-uses the same in-memory map via module singleton
// NOTE: In serverless environments each cold-start creates a fresh map.
// For cross-instance persistence use Vercel KV / Upstash Redis.
const receipts = new Map<string, object>()

function isAlphanumericId(val: unknown): boolean {
  return typeof val === 'string' && /^[a-zA-Z0-9_\-]{1,128}$/.test(val)
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { id } = req.query
  if (!isAlphanumericId(id)) return res.status(400).json({ error: 'Invalid id' })
  const r = receipts.get(id as string)
  if (!r) return res.status(404).json({ error: 'Not found' })
  return res.status(200).json(r)
}
