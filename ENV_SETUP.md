# Environment Variables Setup

## Backend (Railway)

Set these environment variables in Railway dashboard:

```
# MongoDB Connection
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/fieldledger?retryWrites=true&w=majority

# JWT Secret (generate a random string - use: openssl rand -hex 32)
JWT_SECRET=your-super-secret-jwt-key-change-this

# OpenAI API Key
OPENAI_API_KEY=sk-your-openai-api-key

# Frontend URL (for CORS) - get this after deploying frontend
FRONTEND_URL=https://your-app.vercel.app

# Port (Railway sets this automatically, but just in case)
PORT=5000
```

### Future: Cloudflare R2 Storage
When you add cloud storage for files:
```
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=fieldledger-uploads
R2_PUBLIC_URL=https://your-bucket.r2.dev
```

## Frontend (Vercel)

Set these environment variables in Vercel dashboard:

```
# Backend API URL - get this after deploying backend to Railway
REACT_APP_API_URL=https://your-backend.railway.app
```

## Deployment Order

1. Deploy Backend to Railway first
2. Copy the Railway URL (e.g., https://job-hub-app-production.up.railway.app)
3. Deploy Frontend to Vercel
4. Set REACT_APP_API_URL in Vercel to point to Railway URL
5. Set FRONTEND_URL in Railway to point to Vercel URL
