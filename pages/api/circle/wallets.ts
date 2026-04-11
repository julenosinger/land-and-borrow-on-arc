import type { NextApiRequest, NextApiResponse } from 'next'

const CIRCLE_BASE = 'https://api.circle.com/v1/w3s'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const key = process.env.CIRCLE_API_KEY
  if (!key) return res.status(503).json({ error: 'Circle API not configured' })

  try {
    const r = await fetch(`${CIRCLE_BASE}/wallets?blockchain=ARC-TESTNET&pageSize=50`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await r.json() as {
      data?: {
        wallets?: Array<{
          id?: string
          address?: string
          state?: string
          custodyType?: string
          createDate?: string
        }>
      }
    }
    const wallets = (data?.data?.wallets || []).map((w) => ({
      id: w.id,
      address: w.address,
      state: w.state,
      custodyType: w.custodyType,
      createDate: w.createDate,
    }))
    return res.status(200).json({ wallets, count: wallets.length })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' })
  }
}
