import type { NextApiRequest, NextApiResponse } from 'next'

const CIRCLE_BASE = 'https://api.circle.com/v1/w3s'

function isEthAddress(val: unknown): boolean {
  return typeof val === 'string' && /^0x[0-9a-fA-F]{40}$/.test(val)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const key = process.env.CIRCLE_API_KEY
  if (!key) return res.status(503).json({ error: 'Circle API not configured' })

  const { address } = req.query
  if (!address || !isEthAddress(address)) {
    return res.status(400).json({ error: 'Valid Ethereum address required' })
  }

  try {
    const r = await fetch(`${CIRCLE_BASE}/wallets?blockchain=ARC-TESTNET&pageSize=50`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const data = await r.json() as { data?: { wallets?: Array<{ address?: string; id?: string }> } }
    const wallet = data?.data?.wallets?.find(
      (w) => w.address?.toLowerCase() === (address as string).toLowerCase()
    )
    return res.status(200).json({ address, walletId: wallet?.id || null, found: !!wallet })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Unknown error' })
  }
}
