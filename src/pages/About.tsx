import AboutPanel from '../components/AboutPanel'
import BrandName from '../components/BrandName'
import { usePageMeta } from '../lib/usePageMeta'

export default function About() {
  usePageMeta('About', 'Learn how DHGRAM works and who builds it.')
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight">
          About <BrandName />
        </h1>
      </header>
      <AboutPanel />
    </div>
  )
}
