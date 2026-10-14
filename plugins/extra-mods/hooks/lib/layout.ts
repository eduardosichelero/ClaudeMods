// The menu's own layout arithmetic, shared by its pages. Pure; the drawing is in register.tsx.

import type { RenderSurface } from 'claude-code'

// Rows the menu's tab strip takes, `width` cells wide. The terminal draws it
// in three rows of its own glyphs, the rule in the last. The desktop draws
// each tab as a framed chip (three rows; its label and four cells of frame
// and padding wide), then a spacer and the close as a plain button (one row),
// in a row that wraps with one cell between items, and a rule under it.
export function tabStripRows(surface: RenderSurface, tabs: readonly string[], close: string, width: number) {
  if (surface !== 'desktop') return 3
  const items = [...tabs.map(label => ({ cells: label.length + 4, rows: 3 })), { cells: 0, rows: 0 }, { cells: close.length, rows: 1 }]
  let rows = 0
  let lineCells = -1
  let lineRows = 0
  for (const item of items) {
    if (lineCells >= 0 && lineCells + 1 + item.cells > width) {
      rows += lineRows
      lineCells = -1
      lineRows = 0
    }
    lineCells += 1 + item.cells
    lineRows = Math.max(lineRows, item.rows)
  }
  return rows + lineRows + 1
}
