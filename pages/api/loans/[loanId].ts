import type { NextApiRequest, NextApiResponse } from 'next'

const loanMeta = new Map<string, object>()

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { loanId } = req.query
  if (!loanId || !/^\d{1,10}$/.test(String(loanId))) {
    return res.status(400).json({ error: 'Invalid loanId' })
  }
  const m = loanMeta.get(String(loanId))
  return res.status(200).json(m || {})
}
