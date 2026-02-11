# Production Deployment Setup

## Quick Start Guide

### Frontend (Netlify) - 5 Minutes
1. Go to [Netlify](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect GitHub repository
4. Configure:
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `client/dist`
5. Add environment variable: `VITE_API_URL` = Your Vercel backend URL
6. Deploy!

### Backend (Vercel) - 10 Minutes
1. Install Vercel CLI: `npm i -g vercel`
2. Navigate to server: `cd server`
3. Run: `vercel`
4. Set environment variables in Vercel dashboard:
   - `MONGODB_URI` (MongoDB Atlas connection string)
   - `FRONTEND_URL` (Your Netlify URL)
   - `NODE_ENV` = `production`
5. Deploy: `vercel --prod`

---

## Environment Variables

### Frontend (.env in client/)
```
VITE_API_URL=https://your-backend.vercel.app
```

### Backend (Set in Vercel Dashboard)
```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/hrm
FRONTEND_URL=https://your-frontend.netlify.app
NODE_ENV=production
ENABLE_SCHEDULER=false
```

**Note**: Scheduler is disabled on Vercel. Use Vercel Cron Jobs instead (already configured in `vercel.json`).

---

## MongoDB Atlas Setup

1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create database user
4. Network Access: Add IP `0.0.0.0/0` (allows Vercel)
5. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/hrm`
6. Add to Vercel as `MONGODB_URI`

---

## File Structure

```
hrm-itcs/
├── client/              # Frontend (Netlify)
│   ├── netlify.toml    # Netlify config
│   ├── .env.example    # Environment template
│   └── src/
│       └── utils/
│           └── api.ts   # API configuration
│
└── server/              # Backend (Vercel)
    ├── vercel.json     # Vercel config
    ├── .env.example    # Environment template
    ├── api/
    │   ├── index.ts    # Serverless entry point
    │   └── cron/
    │       └── probation-check.ts  # Cron job
    └── src/
        └── index.ts    # Main server file
```

---

## Post-Deployment Checklist

- [ ] Frontend deployed on Netlify
- [ ] Backend deployed on Vercel
- [ ] `VITE_API_URL` set in Netlify (points to Vercel URL)
- [ ] `MONGODB_URI` set in Vercel
- [ ] `FRONTEND_URL` set in Vercel
- [ ] MongoDB Atlas IP whitelist configured
- [ ] Test API endpoints
- [ ] Test file uploads
- [ ] Verify CORS is working

---

## Troubleshooting

### CORS Errors
- Check `FRONTEND_URL` in Vercel matches your Netlify URL exactly
- Ensure no trailing slashes

### MongoDB Connection Issues
- Verify connection string format
- Check IP whitelist includes `0.0.0.0/0`
- Verify database user credentials

### Build Failures
- Check Node version (should be 18+)
- Verify all dependencies are in package.json
- Check build logs for specific errors

### File Upload Issues
- Vercel uses `/tmp` directory (ephemeral)
- Consider using cloud storage (S3, Cloudinary) for production

---

## Production Optimizations Applied

✅ Environment-based API URLs
✅ CORS configuration for production
✅ File upload size limits (10MB)
✅ Build optimizations (code splitting)
✅ Error handling
✅ Production-ready configurations

