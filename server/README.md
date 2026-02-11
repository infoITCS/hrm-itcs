# HRM System - Backend

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm start
```

## Environment Variables

Create a `.env` file in the root directory:

```
MONGODB_URI=mongodb://localhost:27017/hrm
PORT=5000
NODE_ENV=production
FRONTEND_URL=https://your-frontend.netlify.app
ENABLE_SCHEDULER=true
```

## Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the server directory
3. Add environment variables in Vercel dashboard:
   - `MONGODB_URI` (your MongoDB connection string)
   - `FRONTEND_URL` (your Netlify frontend URL)
   - `ENABLE_SCHEDULER=true`
4. Deploy!

The `vercel.json` file is already configured for serverless deployment.

## MongoDB Setup

For production, use MongoDB Atlas:
1. Create a cluster at https://www.mongodb.com/cloud/atlas
2. Get your connection string
3. Add it to Vercel environment variables as `MONGODB_URI`

