import type { NextApiRequest, NextApiResponse } from 'next'

const CIRCLE_BASE = 'https://api.circle.com/v1/w3s'

function isEthAddress(val: unknown): boolean {
  return typeof val === 'string' && /^0x[0-9a-fA-F]{40}$/.test(val)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  const key = process.env.CIRCLE_API_KEY
  if (!key) return res.status(503).json({ error: 'Circle API not configured' })

  if (req.method === 'POST') {
    // POST /api/circle/faucet — request testnet USDC
    try {
      const { address } = req.body as { address?: string }
      if (!address || !isEthAddress(address)) {
        return res.status(400).json({ error: 'Valid Ethereum address required' })
      }
      const r = await fetch(`${CIRCLE_BASE}/testnet/faucet`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blockchain: 'ARC-TESTNET', address, usdc: true, native: true }),
      })
      const text = await r.text()
      const data = text ? JSON.parse(text) : {}
      if (r.status === 204 || r.ok) return res.status(200).json({ success: true })
      return res.status(r.status).json({ error: data?.message || 'Faucet request failed', detail: data })
    } catch (e: unknown) {
      return res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' })
    }
  }

  res.setHeader('Allow', ['POST'])
  return res.status(405).json({ error: 'Method not allowed' })
}
