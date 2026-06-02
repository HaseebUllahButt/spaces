# Spaces

A spatial curation tool built for creatives. An infinite canvas where ideas, text, and images are arranged freely — not confined to slides, lists, or grids. Designed to feel like a premium creative environment rather than a utility.

The long-term vision is a networked creative platform: multiple boards per workspace, real-time collaboration, public and private sharing, and a social layer for discovering curated boards.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser Client                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     React + Vite                         │  │
│  │                                                          │  │
│  │  ┌─────────────────┐      ┌──────────────────────────┐  │  │
│  │  │   Canvas Layer  │      │      UI Panels           │  │  │
│  │  │  react-konva    │      │  ThemePanel              │  │  │
│  │  │                 │      │  CheckpointPanel         │  │  │
│  │  │  Stage          │      │  Toolbar (glassmorphic)  │  │  │
│  │  │  └─ Layer       │      └──────────────────────────┘  │  │
│  │  │     ├─ Items    │                                     │  │
│  │  │     └─ Transformer                                    │  │
│  │  └────────┬────────┘                                     │  │
│  │           │                                              │  │
│  │  ┌────────▼────────────────────────────────────────┐    │  │
│  │  │              Zustand Store (persisted)           │    │  │
│  │  │                                                  │    │  │
│  │  │  cachedItems   undoStack   redoStack             │    │  │
│  │  │  theme         position    scale                 │    │  │
│  │  │  hasInteracted showGrid                          │    │  │
│  │  │                                                  │    │  │
│  │  │  localStorage via persist middleware             │    │  │
│  │  └────────────────────┬────────────────────────────┘    │  │
│  └───────────────────────┼──────────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────────┘
                           │ Convex React SDK
                           │ useQuery  (reactive subscription)
                           │ useMutation (optimistic write)
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                       Convex Backend                            │
│                                                                 │
│  board.ts                                                       │
│  ┌────────────────┐   ┌─────────────────┐                      │
│  │  items table   │   │checkpoints table│                      │
│  │                │   │                 │                      │
│  │  getItems      │   │  getCheckpoints │                      │
│  │  saveItem      │   │  createCheckpoint                      │
│  │  deleteItem    │   │  restoreCheckpoint                     │
│  └────────────────┘   └─────────────────┘                      │
│                                                                 │
│  Real-time reactive queries — all connected clients receive     │
│  board updates without polling                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

A canvas action (paste, drag, type) takes the following path:

```
User Action
    │
    ├─ pushUndo(currentItems)          snapshot to undoStack
    │
    ├─ setCachedItems(optimisticState) instant local render
    │
    └─ useMutation(...)                fire-and-forget to Convex
            │
            └─ Convex DB write
                    │
                    └─ reactive query updates all subscribed clients
                            │
                            └─ localUpdates ref guards against
                               stale server data overwriting
                               in-flight local edits
```

---

## Features

### Canvas

- Infinite, pannable, zoomable canvas rendered via `react-konva`
- Text nodes and images placed freely in two-dimensional space
- Single-click to select, double-click to edit text inline
- Drag to reposition, transform handles to resize
- Page grid overlay aligned to A4 proportions for print-aware layouts
- Paste images or text directly from the clipboard anywhere on the board

### History

- Undo (`Ctrl Z`) and redo (`Ctrl Y` or `Ctrl Shift Z`) with a 20-step buffer
- History persisted to `localStorage` — survives page refresh
- ID remapping on restore: when a deleted item is recreated via undo, the new Convex-generated ID is propagated back through the undo and redo stacks to maintain consistency across subsequent operations

### Checkpoints

A git-style snapshot system for deliberate save points.

- Name and create a checkpoint at any moment
- Timeline panel lists all checkpoints with age and item count
- Restore any checkpoint with a confirmation step to prevent accidental data loss
- Snapshots stored in Convex — available to any connected client in real time

### Theming

- Curated preset themes with distinct visual identities
- Switching theme recolors all existing text nodes on the canvas
- All theme values (background, text, accent, font family) propagate to the canvas, toolbar, panels, and the inline text editor simultaneously

### Export

- Export the board as a paginated PDF
- Pages are derived from the bounding positions of items on the canvas
- Each page maps to one A4-proportioned grid cell
- Background color is applied to each page before rendering the canvas image

---

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Canvas | react-konva (Konva.js) |
| Backend | Convex (real-time reactive DB) |
| State | Zustand with `persist` middleware |
| Icons | Lucide React |
| PDF | jsPDF |

---

## Local Development

**Prerequisites:** Node.js 18+, a Convex account.

```bash
# Install dependencies
npm install

# Start the Convex dev server (pushes schema and functions, watches for changes)
npx convex dev
```

In a separate terminal:

```bash
# Start the Vite dev server
npm run dev
```

Set the following in `.env.local`:

```
VITE_CONVEX_URL=https://<your-deployment>.convex.cloud
```

---

## Deployment

```bash
# Deploy Convex functions and build the frontend in one step
npx convex deploy --cmd "npm run build"
```

The built output in `dist/` can be served from any static host (Vercel, Netlify, Cloudflare Pages).

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `S` | Switch to Select mode |
| `T` | Switch to Text mode |
| `G` | Toggle page grid |
| `M` | Collapse / expand toolbar |
| `Ctrl Z` | Undo |
| `Ctrl Y` / `Ctrl Shift Z` | Redo |
| `Delete` / `Backspace` | Remove selected item |
| `Escape` | Deselect / close panels |

---

## Project Structure

```
convex/
  schema.ts          database schema (items, checkpoints)
  board.ts           all queries and mutations

src/
  App.tsx            canvas, event handling, keyboard shortcuts
  store.ts           Zustand store — state, undo/redo, persistence
  types.ts           shared TypeScript types

  components/
    ThemePanel.tsx       theme presets and settings panel
    CheckpointPanel.tsx  checkpoint creation and restore panel
    CanvasImage.tsx      image node renderer for react-konva
```
