import type { GetServerSideProps, NextPage } from 'next'
import fs from 'fs'
import path from 'path'

// This page serves the full DaatFI SPA HTML directly.
// getServerSideProps reads the pre-built HTML from /public/app.html
// and injects it via dangerouslySetInnerHTML on a minimal wrapper.
// Since the app is a vanilla JS SPA, this preserves full functionality.

interface Props {
  html: string
}

const HomePage: NextPage<Props> = ({ html }) => {
  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  )
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const htmlPath = path.join(process.cwd(), 'public', 'app.html')
  const html = fs.readFileSync(htmlPath, 'utf-8')

  // Serve raw HTML directly — bypasses Next.js wrapper entirely
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
  res.write(html)
  res.end()

  return { props: {} }
}

export default HomePage
