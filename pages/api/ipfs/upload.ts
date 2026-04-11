import type { NextApiRequest, NextApiResponse } from 'next'
import formidable, { Fields, Files } from 'formidable'
import fs from 'fs'
import FormData from 'form-data'

// Disable default body parsing so formidable can handle multipart
export const config = {
  api: {
    bodyParser: false,
  },
}

function parseForm(req: NextApiRequest): Promise<{ fields: Fields; files: Files }> {
  return new Promise((resolve, reject) => {
    const form = formidable({ maxFileSize: 10 * 1024 * 1024 }) // 10 MB
    form.parse(req, (err, fields, files) => {
      if (err) reject(err)
      else resolve({ fields, files })
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const jwt = process.env.PINATA_JWT
  if (!jwt) return res.status(503).json({ error: 'IPFS upload not configured' })

  try {
    const { files } = await parseForm(req)

    // formidable wraps files; grab the first file field
    const fileField = files.file
    const uploadedFile = Array.isArray(fileField) ? fileField[0] : fileField
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided' })
    }

    // Re-stream to Pinata
    const form = new FormData()
    form.append('file', fs.createReadStream(uploadedFile.filepath), {
      filename: uploadedFile.originalFilename || 'upload',
      contentType: uploadedFile.mimetype || 'application/octet-stream',
    })

    const pinataRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...form.getHeaders(),
      },
      body: form as unknown as BodyInit,
    })

    if (!pinataRes.ok) {
      const txt = await pinataRes.text()
      return res.status(502).json({ error: `Pinata error ${pinataRes.status}: ${txt}` })
    }

    const data = await pinataRes.json() as { IpfsHash?: string }
    const hash = data.IpfsHash
    return res.status(200).json({
      IpfsHash: hash,
      uri: `ipfs://${hash}`,
      url: `https://gateway.pinata.cloud/ipfs/${hash}`,
    })
  } catch (e: unknown) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Upload failed' })
  }
}
