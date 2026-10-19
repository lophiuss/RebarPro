'use client'

import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

// Draws its children on <body>, outside the page. A meeting page can be zoomed (the +/- control next to
// Present), and CSS zoom also scales and shifts anything positioned `fixed` inside it: a dropdown opens
// far from its button and runs off the bottom of the screen, a dialog grows taller than the window.
// Drawers, dialogs and dropdown lists go through this so they always sit exactly where they should.
export default function Portal({ children }: { children: React.ReactNode }) {
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false)
  return ready ? createPortal(children, document.body) : null
}
