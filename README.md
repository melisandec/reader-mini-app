# READER - Farcaster Mini App

A Farcaster Mini App for tracking your daily reading.

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Project Structure

- `public/` - Main application files
  - `index.html` - Main HTML file
  - `main.js` - Main JavaScript entry point
  - `styles.css` - Application styles
  - `.well-known/farcaster.json` - Farcaster Mini App manifest

## Development

The app uses Vite as the development server. The manifest file is served from `.well-known/farcaster.json` which is the standard location for Farcaster Mini Apps.
