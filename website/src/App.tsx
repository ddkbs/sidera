import { Analytics } from '@vercel/analytics/react'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Boards, Stats } from './components/Boards'
import { Mcp } from './components/Mcp'
import { Ipad } from './components/Ipad'
import { LocalFirst } from './components/LocalFirst'
import { More } from './components/More'
import { Cta, Footer } from './components/Cta'

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <Nav />
      <Hero />
      {/* Page rails: dashed verticals at the content edges, like a drafting sheet. */}
      <main className="relative mx-auto max-w-[1240px]">
        <div className="dash-y pointer-events-none absolute inset-y-0 left-0 w-px" />
        <div className="dash-y pointer-events-none absolute inset-y-0 right-0 w-px" />
        <Stats />
        <Boards />
        <Mcp />
        <Ipad />
        <LocalFirst />
        <More />
        <Cta />
        <Footer />
      </main>
      <Analytics />
    </div>
  )
}
