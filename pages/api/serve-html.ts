import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const htmlPath = path.join(process.cwd(), 'public', 'app.html')
  const html = fs.readFileSync(htmlPath, 'utf-8')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.status(200).send(html)
}
