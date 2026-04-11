import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({
    status: 'ok',
    network: 'Arc Testnet',
    chainId: 5042002,
    marketplace: true,
  })
}
