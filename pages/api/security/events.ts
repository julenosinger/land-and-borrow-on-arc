import type { NextApiRequest, NextApiResponse } from 'next'

const secEvents: Array<{ ts: string; event: string; ip: string; meta: object }> = []

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Only allow requests with a forwarded-for header (basic guard)
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || ''
  if (!ip) return res.status(403).json({ error: 'Forbidden' })

  return res.status(200).json({
    count: secEvents.length,
    events: secEvents.slice(-50),
  })
}
