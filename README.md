# ImaJig - Web-First Jigsaw Puzzle App

ImaJig is a high-performance, offline-capable jigsaw puzzle application built with React, TypeScript, and Vite. It features a custom Canvas 2D rendering engine, 3 unique procedural cut styles, and robust PWA support.

## 🚀 Features

- **3 Procedural Cut Styles**:
  - **Classic**: Traditional tab/blank jigsaw cuts with smooth Bezier curves.
  - **Retro**: Pixel-perfect 8-bit style stepped edges.
  - **Shapes**: Geometric style with beveled grids, trapezoids, and angled edges.
- **High-Performance Rendering**: Custom Canvas 2D engine supporting pan, zoom, and smooth 60fps interactions.
- **Robust Validation**: Built-in validation framework to ensure every puzzle is solvable and visually correct.
- **Offline-First**: Full PWA support with service worker caching for offline play.
- **Auto-Save**: State persistence using IndexedDB (via Dexie.js) ensures you never lose progress.
- **Neo-Brutalism Design**: Bold, high-contrast UI designed for clarity and fun.

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Rendering**: HTML5 Canvas API
- **State/Storage**: Dexie.js (IndexedDB wrapper)
- **Gestures**: @use-gesture/react
- **Styling**: Tailwind CSS 4 + Neo-Brutalism Theme
- **Testing**: Vitest

## 🏃‍♂️ Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/imajig.git
   cd imajig
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Start the development server:
   ```bash
   pnpm dev
   ```

4. Open `http://localhost:3000` in your browser.

### Building for Production

```bash
pnpm build
```
The output will be in `dist/public`.

### Running Tests

```bash
pnpm test
```

## 🧩 Architecture

### Engine Core (`src/engine/`)
- **`spatialHash.ts`**: Efficient collision detection for snapping pieces.
- **`unionFind.ts`**: Manages connected groups of pieces.
- **`snap.ts`**: Logic for validating and applying piece connections.
- **`pose.ts`**: Math utilities for 2D transformations.
- **`validator.ts`**: Automated validation logic to verify puzzle solvability and geometry.

### Cut Generators (`src/cuts/`)
Each cut style implements the `CutGenerator` interface:
```typescript
interface CutGenerator {
  generate(config: PuzzleConfig): Promise<Piece[]>;
}
```
To add a new style, implement this interface and register it in `generator.ts`.

### Rendering (`src/render/`)

- **`canvasRenderer.ts`**: Handles the main draw loop, optimizing by caching piece paths.
- **`camera.ts`**: Manages viewport transformations (pan/zoom).

## 📝 Acceptance Criteria Status

- [x] **Image Upload**: Users can upload custom images.
- [x] **3 Cut Styles**: Classic, Retro, and Shapes implemented and polished.
- [x] **Snap System**: Adjacency-based snapping with group merging and subpixel precision.
- [x] **Persistence**: Auto-saves to IndexedDB.
- [x] **PWA**: Manifest and service worker configured.
- [x] **Tests**: Unit tests for core logic passing.

## 🎨 Design System

ImaJig uses a **Neo-Brutalism / Pop Art** design language:
- **Colors**: Electric Blue (`#2D5BFF`), Vibrant Yellow (`#FFD600`), Off-White (`#F0F0F0`).
- **Typography**: Space Grotesk (Headings), DM Sans (Body).
- **Visuals**: Thick black borders, hard shadows, and high contrast.

## 📄 License

MIT
