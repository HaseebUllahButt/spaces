import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import './index.css'
import App from './App.tsx'
import { ConvexProvider, ConvexReactClient } from "convex/react";

// Cap canvas backing resolution on hi-DPI screens: rendering the full-screen
// stage at 2-3x devicePixelRatio quadruples GPU fill cost for little visible
// gain. PDF export passes its own explicit pixelRatio, so it stays sharp.
Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>,
)
