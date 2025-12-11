# Quick Start Checklist

Follow these steps in order to get your app running:

## ✅ Step 1: Install Dependencies
```bash
npm install
```

## ✅ Step 2: Create .env File
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Or manually create .env file and copy content from .env.example
```

## ✅ Step 3: Get Credentials (Fill in .env)

### OpenAI API Key
- [ ] Go to https://platform.openai.com/api-keys
- [ ] Create new secret key
- [ ] Copy to `OPENAI_API_KEY` in `.env`

### Google Cloud Setup
- [ ] Create project at https://console.cloud.google.com/
- [ ] Enable APIs: Calendar, Sheets, Docs
- [ ] Create service account
- [ ] Download JSON key file
- [ ] Extract `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- [ ] Extract `private_key` → `GOOGLE_PRIVATE_KEY` (keep `\n`)
- [ ] Extract `project_id` → `GOOGLE_PROJECT_ID`

### Google Calendars (4 dentists)
- [ ] Create calendar for each dentist
- [ ] Share each calendar with service account (Editor)
- [ ] Get Calendar ID from settings
- [ ] Add to `GOOGLE_CALENDAR_IDS` (format: `Name:ID,Name:ID,...`)

### Google Sheet
- [ ] Create new Google Sheet
- [ ] Share with service account (Editor)
- [ ] Copy Sheet ID from URL → `GOOGLE_SHEET_ID`

### Google Doc
- [ ] Create document with pricing info
- [ ] Share with service account (Viewer)
- [ ] Copy Doc ID from URL → `GOOGLE_DOC_ID`

### WhatsApp Business API
- [ ] Go to https://developers.facebook.com/
- [ ] Create WhatsApp Business App
- [ ] Get Phone Number ID → `WHATSAPP_PHONE_NUMBER_ID`
- [ ] Get Access Token → `WHATSAPP_ACCESS_TOKEN`
- [ ] Create verify token → `WHATSAPP_VERIFY_TOKEN`
- [ ] Set up webhook (use ngrok for local testing)

## ✅ Step 4: Test Configuration
```bash
npm start
```

Look for: `"AI Dental Receptionist is ready!"`

## ✅ Step 5: Test Webhook (Local)
1. Install ngrok: https://ngrok.com/download
2. Start app: `npm start`
3. Start ngrok: `ngrok http 3000`
4. Copy HTTPS URL
5. Configure webhook in Meta Developer Console

## ✅ Step 6: Send Test Message
Send WhatsApp message to your business number and test!

---

## 📚 Detailed Instructions

See `SETUP_GUIDE.md` for step-by-step instructions with screenshots and troubleshooting.

---

## 🆘 Common Issues

- **"Missing environment variables"** → Check `.env` file exists and all values filled
- **"Calendar ID not found"** → Verify calendar IDs match and calendars are shared
- **"Authentication error"** → Check private key includes `\n` characters
- **"Webhook not working"** → Use ngrok for local testing, verify token matches
