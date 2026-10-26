import type { Metadata, Viewport } from 'next'
import 'maplibre-gl/dist/maplibre-gl.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Riverside Marathon · cheers in your headphones',
  description: 'Follow a runner live and leave cheers on the course. Built on PubNub DataSync.',
}

export const viewport: Viewport = {
  themeColor: '#0a0e23',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
