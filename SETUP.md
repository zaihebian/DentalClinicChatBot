# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment Variables

Create a `.env` file in the root directory with the following:

```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# WhatsApp
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_ACCESS_TOKEN=your_token
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Google Service Account
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id

# Google Calendar (format: Dentist Name:Calendar ID)
GOOGLE_CALENDAR_IDS=Dr. [Braces Dentist 1]:cal1@group.calendar.google.com,Dr. [Braces Dentist 2]:cal2@group.calendar.google.com,Dr. [General Dentist 1]:cal3@group.calendar.google.com,Dr. [General Dentist 2]:cal4@group.calendar.google.com,Dr. [General Dentist 3]:cal5@group.calendar.google.com,Dr. [General Dentist 4]:cal6@group.calendar.google.com

# Google Sheets
GOOGLE_SHEET_ID=your_sheet_id_here
GOOGLE_SHEET_NAME=Conversations

# Google Docs
GOOGLE_DOC_ID=your_doc_id_here

# Session
SESSION_TIMEOUT_MINUTES=10

# Server
PORT=3000
NODE_ENV=development
```

## Step 3: Google Cloud Setup

### Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable APIs:
   - Google Calendar API
   - Google Sheets API
   - Google Docs API
4. Go to **IAM & Admin** > **Service Accounts**
5. Click **Create Service Account**
6. Download JSON key file
7. Extract:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY` (keep the `\n` characters)

### Setup Calendars

1. Create Google Calendars for each dentist
2. Share each calendar with service account email (Editor permission)
3. Get Calendar ID from calendar settings (looks like: `abc123@group.calendar.google.com`)
4. Add to `GOOGLE_CALENDAR_IDS` in format: `Dentist Name:Calendar ID`

### Setup Google Sheet

1. Create a new Google Sheet
2. Share with service account email (Editor permission)
3. Copy Sheet ID from URL: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
4. Add to `GOOGLE_SHEET_ID`

### Setup Google Doc

1. Create a document with pricing information
2. Share with service account email (Viewer permission)
3. Copy Document ID from URL: `https://docs.google.com/document/d/[DOC_ID]/edit`
4. Add to `GOOGLE_DOC_ID`

## Step 4: WhatsApp Business API Setup

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a WhatsApp Business App
3. Get:
   - Phone Number ID
   - Access Token
4. Set up webhook:
   - URL: `https://your-domain.com/webhook`
   - Verify Token: (use same as `WHATSAPP_VERIFY_TOKEN`)
   - Subscribe to `messages` field

## Step 5: Run the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## Step 6: Test

1. Send a WhatsApp message to your business number
2. Try: "I want braces maintenance"
3. Follow the conversation flow
4. Check Google Sheets for logged conversations

## Troubleshooting

### "Calendar ID not found"
- Verify calendar IDs in `.env` match actual calendar IDs
- Ensure calendars are shared with service account

### "Authentication error"
- Check service account credentials
- Verify private key includes `\n` characters
- Ensure APIs are enabled in Google Cloud

### "WhatsApp webhook not working"
- Verify webhook URL is accessible
- Check verify token matches
- Ensure webhook is subscribed to `messages`

### "OpenAI API error"
- Verify API key is correct
- Check you have credits/quota
- Verify model name is correct

