import type { NextApiRequest, NextApiResponse } from 'next'

const offerMeta = new Map<string, object>()

function isAlphanumericId(val: unknown): boolean {
  return typeof val === 'string' && /^[a-zA-Z0-9_\-]{1,128}$/.test(val)
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { offerId } = req.query
  if (!isAlphanumericId(offerId)) {
    return res.status(400).json({ error: 'Invalid offerId' })
  }
  const m = offerMeta.get(String(offerId))
  return res.status(200).json(m || {})
}
