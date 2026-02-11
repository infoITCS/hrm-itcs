# Deployment Guide

## Frontend (Netlify)

### Step 1: Prepare Repository
1. Ensure all changes are committed and pushed to GitHub
2. Make sure `client/netlify.toml` exists

### Step 2: Deploy to Netlify
1. Go to [Netlify](https://www.netlify.com/)
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repository
4. Configure build settings:
   - **Base directory**: `client`
   - **Build command**: `npm run build`
   - **Publish directory**: `client/dist`
5. Add environment variable:
   - **Key**: `VITE_API_URL`
   - **Value**: Your Vercel backend URL (e.g., `https://your-backend.vercel.app`)
6. Click "Deploy site"

### Step 3: Update Environment Variables
After backend is deployed, update `VITE_API_URL` in Netlify:
1. Go to Site settings → Environment variables
2. Update `VITE_API_URL` with your Vercel backend URL

---

## Backend (Vercel)

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Deploy to Vercel
1. Navigate to the `server` directory:
   ```bash
   cd server
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```
   - Follow the prompts
   - Select your project settings
   - Vercel will detect the `vercel.json` configuration

### Step 3: Set Environment Variables
In Vercel Dashboard:
1. Go to your project → Settings → Environment Variables
2. Add the following:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `FRONTEND_URL`: Your Netlify frontend URL (e.g., `https://your-app.netlify.app`)
   - `NODE_ENV`: `production`
   - `ENABLE_SCHEDULER`: `true`

### Step 4: MongoDB Atlas Setup
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Create a database user
4. Whitelist IP addresses (add `0.0.0.0/0` for Vercel)
5. Get connection string and add to Vercel as `MONGODB_URI`

### Step 5: Redeploy
After setting environment variables:
```bash
vercel --prod
```

---

## Post-Deployment Checklist

### Frontend (Netlify)
- [ ] Site is accessible
- [ ] API calls are working (check browser console)
- [ ] Environment variable `VITE_API_URL` is set correctly
- [ ] Custom domain configured (optional)

### Backend (Vercel)
- [ ] API endpoints are accessible
- [ ] MongoDB connection is working
- [ ] Environment variables are set
- [ ] File uploads are working (check `/tmp` directory)
- [ ] Scheduler is running (if enabled)

### Testing
- [ ] Test employee creation
- [ ] Test file uploads
- [ ] Test employee list
- [ ] Test employee profile
- [ ] Test audit logs

---

## Troubleshooting

### Frontend Issues
- **API calls failing**: Check `VITE_API_URL` environment variable
- **Build errors**: Check Node version (should be 18+)
- **Routing issues**: Ensure `netlify.toml` has redirects configured

### Backend Issues
- **MongoDB connection errors**: Check connection string and IP whitelist
- **File upload errors**: Vercel uses `/tmp` directory (ephemeral)
- **Scheduler not running**: Check `ENABLE_SCHEDULER` environment variable
- **CORS errors**: Update `FRONTEND_URL` in environment variables

---

## Production URLs
After deployment, you'll have:
- **Frontend**: `https://your-app.netlify.app`
- **Backend**: `https://your-backend.vercel.app`

Update the frontend's `VITE_API_URL` to point to your Vercel backend URL.

