// MapLibre GL v6 loads its worker from a URL. Bundlers rewrite import.meta.url,
// so copy the worker into public/ and point MapLibre at it (see components/RunMap.tsx).
import { copyFileSync, mkdirSync } from 'node:fs'

mkdirSync('public', { recursive: true })
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/maplibre-gl-worker.mjs')
