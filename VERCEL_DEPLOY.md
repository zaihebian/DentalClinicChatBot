# Vercel Deployment Guide

This guide will help you deploy the AI Dental Receptionist to Vercel.

## Prerequisites

- Vercel account ([Sign up](https://vercel.com/signup))
- GitHub account (for easy deployment)
- All environment variables ready

## Quick Deploy (GitHub Integration - Recommended)

### Step 1: Push Code to GitHub

1. Create a new repository on GitHub
2. Push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/your-repo.git
   git push -u origin main
   ```

### Step 2: Deploy to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/new)
2. Click **"Import Project"**
3. Select your GitHub repository
4. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (default)
   - **Build Command**: (leave empty)
   - **Output Directory**: (leave empty)
5. Click **"Deploy"**

### Step 3: Add Environment Variables

1. Go to your project dashboard on Vercel
2. Navigate to **Settings** → **Environment Variables**
3. Add all required variables:

   ```
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-4o-mini
   WHATSAPP_API_URL=https://graph.facebook.com/v22.0
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_ACCESS_TOKEN=your_access_token
   WHATSAPP_VERIFY_TOKEN=your_verify_token
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GOOGLE_PROJECT_ID=your_project_id
   GOOGLE_CALENDAR_IDS=Dr. [Braces Dentist 1]:cal_id_1,Dr. [Braces Dentist 2]:cal_id_2,...
   GOOGLE_SHEET_ID=your_sheet_id
   GOOGLE_SHEET_NAME=Conversations
   GOOGLE_DOC_ID=your_doc_id
   SESSION_TIMEOUT_MINUTES=10
   PORT=3000
   NODE_ENV=production
   ```

4. **Important**: For `GOOGLE_PRIVATE_KEY`, make sure to:
   - Keep the `\n` characters
   - Wrap in quotes
   - Include the full key with BEGIN/END markers

5. Select **"Production"** environment for all variables

6. Click **"Save"**

### Step 4: Redeploy

1. Go to **Deployments** tab
2. Click **"Redeploy"** on the latest deployment
3. Wait for deployment to complete

### Step 5: Get Your HTTPS URL

After deployment, you'll get:
- **Production URL**: `https://your-app-name.vercel.app`
- Use this for WhatsApp webhook: `https://your-app-name.vercel.app/webhook`

---

## Deploy via CLI

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login

```bash
vercel login
```

### Step 3: Deploy

```bash
vercel
```

Follow the prompts:
- Link to existing project or create new
- Confirm settings

### Step 4: Add Environment Variables

Add each variable one by one:

```bash
vercel env add OPENAI_API_KEY production
vercel env add WHATSAPP_PHONE_NUMBER_ID production
vercel env add WHATSAPP_ACCESS_TOKEN production
vercel env add WHATSAPP_VERIFY_TOKEN production
vercel env add GOOGLE_SERVICE_ACCOUNT_EMAIL production
vercel env add GOOGLE_PRIVATE_KEY production
vercel env add GOOGLE_PROJECT_ID production
vercel env add GOOGLE_CALENDAR_IDS production
vercel env add GOOGLE_SHEET_ID production
vercel env add GOOGLE_DOC_ID production
```

**For GOOGLE_PRIVATE_KEY**, when prompted, paste the full key including `\n` characters.

### Step 5: Deploy to Production

```bash
vercel --prod
```

---

## Configure WhatsApp Webhook

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Navigate to your WhatsApp Business App
3. Go to **WhatsApp** → **Configuration**
4. Under **Webhook**, click **"Edit"**
5. Enter:
   - **Callback URL**: `https://your-app-name.vercel.app/webhook`
   - **Verify Token**: (same as `WHATSAPP_VERIFY_TOKEN` in Vercel)
6. Click **"Verify and Save"**
7. Subscribe to **"messages"** field

---

## Testing

1. **Health Check**:
   ```bash
   curl https://your-app-name.vercel.app/health
   ```
   Should return: `{"status":"ok","timestamp":"..."}`

2. **Send Test Message**:
   Send a WhatsApp message to your business number
   Check Vercel logs for processing

---

## Important Notes

### Serverless Functions

- Vercel uses serverless functions (each request may be a new instance)
- **Session Storage**: Currently in-memory, may reset between requests
- **Cold Starts**: First request may take 1-2 seconds
- **Function Timeout**: 
  - Free tier: 10 seconds
  - Hobby: 60 seconds
  - Pro: 300 seconds

### Session Management

The current implementation uses in-memory session storage. For production with high traffic, consider:
- Using Redis or a database for persistent sessions
- Using Vercel KV (Redis-compatible) for session storage

### Environment Variables

- All sensitive data must be in Vercel environment variables
- Never commit `.env` file to GitHub
- Update variables in Vercel dashboard, then redeploy

### Monitoring

- Check **Logs** tab in Vercel dashboard for errors
- Monitor function execution time
- Watch for timeout errors

---

## Troubleshooting

### "Function Timeout"

- Your function is taking too long (>10s on free tier)
- Optimize API calls or upgrade plan
- Consider breaking long operations into smaller chunks

### "Environment Variable Not Found"

- Check variables are added in Vercel dashboard
- Ensure they're set for **Production** environment
- Redeploy after adding variables

### "Webhook Verification Failed"

- Check `WHATSAPP_VERIFY_TOKEN` matches in Vercel and WhatsApp dashboard
- Ensure webhook URL is correct: `https://your-app.vercel.app/webhook`
- Check Vercel logs for verification requests

### "Google API Authentication Error"

- Verify `GOOGLE_PRIVATE_KEY` includes `\n` characters
- Check private key is wrapped in quotes in Vercel
- Ensure service account has proper permissions

---

## Next Steps

1. ✅ Deploy to Vercel
2. ✅ Configure WhatsApp webhook
3. ✅ Test with real messages
4. ✅ Monitor logs and performance
5. Consider upgrading to Pro plan for longer timeouts
6. Consider adding Redis for persistent sessions

---

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Community: https://github.com/vercel/vercel/discussions
- Check deployment logs in Vercel dashboard
