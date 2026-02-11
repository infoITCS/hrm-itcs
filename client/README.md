# HRM System - Frontend

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

## Environment Variables

Create a `.env` file in the root directory:

```
VITE_API_URL=http://localhost:5000
```

For production, set `VITE_API_URL` to your backend API URL.

## Netlify Deployment

1. Connect your repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `dist`
4. Add environment variable: `VITE_API_URL` (your backend URL)
5. Deploy!

The `netlify.toml` file is already configured for automatic deployment.
