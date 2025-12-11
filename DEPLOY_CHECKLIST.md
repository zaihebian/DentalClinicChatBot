# Vercel Deployment Checklist

## ✅ Pre-Deployment

- [ ] All code committed to Git
- [ ] `vercel.json` file created
- [ ] `src/index.js` exports app for Vercel
- [ ] `.env` file NOT committed (already in .gitignore)

## ✅ Environment Variables (Add in Vercel Dashboard)

- [ ] `OPENAI_API_KEY`
- [ ] `OPENAI_MODEL` (optional, defaults to gpt-4o-mini)
- [ ] `WHATSAPP_API_URL` (optional, defaults to v22.0)
- [ ] `WHATSAPP_PHONE_NUMBER_ID`
- [ ] `WHATSAPP_ACCESS_TOKEN`
- [ ] `WHATSAPP_VERIFY_TOKEN`
- [ ] `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- [ ] `GOOGLE_PRIVATE_KEY` (with `\n` characters, wrapped in quotes)
- [ ] `GOOGLE_PROJECT_ID`
- [ ] `GOOGLE_CALENDAR_IDS` (comma-separated format)
- [ ] `GOOGLE_SHEET_ID`
- [ ] `GOOGLE_SHEET_NAME` (optional, defaults to Conversations)
- [ ] `GOOGLE_DOC_ID`
- [ ] `SESSION_TIMEOUT_MINUTES` (optional, defaults to 10)
- [ ] `PORT` (optional, defaults to 3000)
- [ ] `NODE_ENV=production`

## ✅ Deploy Steps

### Option 1: GitHub Integration (Easiest)
1. [ ] Push code to GitHub
2. [ ] Go to https://vercel.com/new
3. [ ] Import GitHub repository
4. [ ] Add environment variables
5. [ ] Deploy

### Option 2: Vercel CLI
1. [ ] Install: `npm install -g vercel`
2. [ ] Login: `vercel login`
3. [ ] Deploy: `vercel`
4. [ ] Add env vars: `vercel env add VARIABLE_NAME production`
5. [ ] Deploy to prod: `vercel --prod`

## ✅ Post-Deployment

- [ ] Get HTTPS URL from Vercel dashboard
- [ ] Test health endpoint: `https://your-app.vercel.app/health`
- [ ] Configure WhatsApp webhook:
  - [ ] Callback URL: `https://your-app.vercel.app/webhook`
  - [ ] Verify Token: (matches Vercel env var)
  - [ ] Subscribe to `messages` field
- [ ] Send test WhatsApp message
- [ ] Check Vercel logs for errors
- [ ] Verify Google Sheets logging works

## ✅ Testing

- [ ] Health check returns `{"status":"ok"}`
- [ ] Webhook verification succeeds
- [ ] Can receive WhatsApp messages
- [ ] Can send WhatsApp replies
- [ ] Google Sheets logging works
- [ ] Calendar integration works
- [ ] AI responses work correctly

## ⚠️ Important Notes

- **Function Timeout**: Free tier = 10 seconds, Hobby = 60s, Pro = 300s
- **Session Storage**: Currently in-memory (may reset between requests)
- **Cold Starts**: First request may take 1-2 seconds
- **Environment Variables**: Must be set in Vercel dashboard, not `.env` file

## 🔗 Quick Links

- Vercel Dashboard: https://vercel.com/dashboard
- Deployment Guide: See `VERCEL_DEPLOY.md`
- Troubleshooting: Check Vercel logs tab
