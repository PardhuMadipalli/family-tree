# Family Tree

A privacy-first, local-only web app for building, visualizing, and sharing family trees. Add people, define relationships, render an automatic tree layout, and keep multiple trees side by side. Everything stays in your browser — no backend, no signup, nothing leaves your device.

## Try it

### Use the hosted version (Vercel)

Open the live app and start adding people right away:

**[https://family-tree-mpardhu.vercel.app](https://family-tree-mpardhu.vercel.app)** *(replace with your deployed URL)*

Your data is saved in your browser's IndexedDB. Different browsers and devices each have their own independent set of trees — use the export / import features below to move data between them.

### Deploy your own copy to Vercel

The app is a static-style Next.js project with no backend, so any Vercel free-tier account can host it.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPardhuMadipalli%2Ffamily-tree)

Or do it manually:

1. Fork [PardhuMadipalli/family-tree](https://github.com/PardhuMadipalli/family-tree) on GitHub.
2. Sign in to [vercel.com](https://vercel.com) and click **Add New… → Project**.
3. Import your fork. Vercel auto-detects Next.js — accept the defaults and click **Deploy**.
4. Within a minute you'll have your own URL like `https://family-tree-<your-name>.vercel.app`.

### Run it locally

You'll need [Node.js 20+](https://nodejs.org) and a recent npm.

```bash
git clone https://github.com/PardhuMadipalli/family-tree.git
cd family-tree
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Edits to source files reload automatically.

To build a production bundle:

```bash
npm run build
npm start
```

## Features

- **Add people** with names, dates, gender, and freeform notes.
- **Define relationships** — partnerships (unions) and parent → child links.
- **Automatic tree visualization** with an [ELK](https://eclipse.dev/elk/)-driven layered layout. Union edges run horizontally, parent-child edges vertically. The whole connected family fits on one canvas.
- **Multiple family trees** — switch between independent trees with a top-bar selector. Create / rename / delete trees from the same dropdown.
- **Export / import** as a versioned JSON envelope. Import-as-new-tree loads a backup as a brand-new tree without touching anything you already have.
- **Light / dark theme** — respects your system preference and remembers your choice.
- **Local-first** — every byte lives in your browser's IndexedDB. There is no server, no analytics, no telemetry.

## Privacy

There is no backend. The app is shipped as static assets; everything runs client-side. Your tree data lives in your browser's IndexedDB, your active-tree selection lives in `localStorage`, and the app never makes a network request with your data.

If you clear site data, your trees are gone — use the **Data** page to export a backup first.

## Documentation

- **[Development.md](./Development.md)** — architecture, dependencies, data model, testing, and contributor setup.

## License

This is a personal hobby project. No formal license has been chosen yet; treat the code as "look but do not redistribute" until that changes.
