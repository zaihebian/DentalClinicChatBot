# Complete Setup Guide - AI Dental Receptionist

This guide will walk you through setting up all credentials and getting the application running.

## Prerequisites

- Node.js 18+ installed ([Download](https://nodejs.org/))
- A Google account (for Google Cloud)
- A Meta/Facebook account (for WhatsApp Business API)
- An OpenAI account ([Sign up](https://platform.openai.com/))

---

## Step 1: Install Dependencies

```bash
npm install
```

---

## Step 2: Set Up Environment Variables

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Open `.env` file** and fill in all the values (instructions below)

---

## Step 3: OpenAI Setup

### Get Your API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys**: https://platform.openai.com/api-keys
4. Click **"Create new secret key"**
5. Copy the key (starts with `sk-`)
6. **Paste it in `.env`**:
   ```env
   OPENAI_API_KEY=sk-your-actual-key-here
   ```

**Note:** Keep your API key secret! Never commit it to version control.

---

## Step 4: Google Cloud Setup

### 4.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Enter project name (e.g., "Dental Receptionist")
4. Click **"Create"**
5. Wait for project creation, then select it

### 4.2 Enable Required APIs

1. Go to **"APIs & Services"** → **"Library"**
2. Search and enable these APIs:
   - **Google Calendar API**
   - **Google Sheets API**
   - **Google Docs API**
3. Click **"Enable"** for each

### 4.3 Create Service Account

1. Go to **"IAM & Admin"** → **"Service Accounts"**
2. Click **"Create Service Account"**
3. Fill in:
   - **Name**: `dental-receptionist-bot`
   - **Description**: `Service account for AI Dental Receptionist`
4. Click **"Create and Continue"**
5. Skip role assignment (click **"Continue"**)
6. Click **"Done"**

### 4.4 Create and Download Service Account Key

1. Click on the service account you just created
2. Go to **"Keys"** tab
3. Click **"Add Key"** → **"Create new key"**
4. Select **JSON** format
5. Click **"Create"** (JSON file downloads automatically)

### 4.5 Extract Credentials from JSON

Open the downloaded JSON file. You'll see:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "your-service@your-project.iam.gserviceaccount.com",
  ...
}
```

**Copy these values to `.env`:**
- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_PRIVATE_KEY` (keep the `\n` characters!)
- `project_id` → `GOOGLE_PROJECT_ID`

**Important:** For `GOOGLE_PRIVATE_KEY`, wrap it in quotes and keep the `\n` characters:
```env
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
```

### 4.6 Create Google Calendars

For each dentist, create a calendar:

1. Go to [Google Calendar](https://calendar.google.com/)
2. Click **"+"** next to "Other calendars" → **"Create new calendar"**
3. Enter calendar name (e.g., "Dr BracesA")
4. Click **"Create calendar"**
5. Go to calendar settings (click **"Settings and sharing"**)
6. Scroll to **"Integrate calendar"**
7. Copy the **Calendar ID** (looks like: `abc123@group.calendar.google.com`)
8. **Share calendar with service account:**
   - Scroll to **"Share with specific people"**
   - Click **"Add people"**
   - Enter the service account email (`your-service@your-project.iam.gserviceaccount.com`)
   - Select **"Make changes to events"** permission
   - Click **"Send"**

**Repeat for all 4 dentists:**
- Dr BracesA
- Dr BracesB
- Dr GeneralA
- Dr GeneralB

**Add to `.env`:**
```env
GOOGLE_CALENDAR_IDS=Dr BracesA:calendar_id_1,Dr BracesB:calendar_id_2,Dr GeneralA:calendar_id_3,Dr GeneralB:calendar_id_4
```

### 4.7 Create Google Sheet for Logging

1. Go to [Google Sheets](https://sheets.google.com/)
2. Click **"Blank"** to create new sheet
3. Name it "Conversations" (or your preferred name)
4. **Share with service account:**
   - Click **"Share"** button
   - Enter service account email
   - Select **"Editor"** permission
   - Click **"Send"**
5. **Get Sheet ID from URL:**
   - URL looks like: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
   - Copy the `[SHEET_ID]` part
6. **Add to `.env`:**
   ```env
   GOOGLE_SHEET_ID=your_sheet_id_here
   GOOGLE_SHEET_NAME=Conversations
   ```

### 4.8 Create Google Doc for Pricing

1. Go to [Google Docs](https://docs.google.com/)
2. Click **"Blank"** to create new document
3. Add pricing information, for example:
   ```
   Cleaning: $50
   Filling: $100 per tooth
   Braces Maintenance: $75
   Consultation: $30
   ```
4. **Share with service account:**
   - Click **"Share"** button
   - Enter service account email
   - Select **"Viewer"** permission (read-only)
   - Click **"Send"**
5. **Get Doc ID from URL:**
   - URL looks like: `https://docs.google.com/document/d/[DOC_ID]/edit`
   - Copy the `[DOC_ID]` part
6. **Add to `.env`:**
   ```env
   GOOGLE_DOC_ID=your_doc_id_here
   ```

---

## Step 5: WhatsApp Business API Setup

### 5.1 Create Meta Developer Account

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click **"Get Started"** or **"My Apps"**
3. Log in with your Facebook account

### 5.2 Create WhatsApp Business App

1. Click **"Create App"**
2. Select **"Business"** as app type
3. Fill in:
   - **App Name**: `Dental Receptionist Bot`
   - **App Contact Email**: Your email
4. Click **"Create App"**

### 5.3 Add WhatsApp Product

1. In your app dashboard, find **"WhatsApp"** product
2. Click **"Set up"**
3. Follow the setup wizard

### 5.4 Get Phone Number ID and Access Token

1. Go to **"WhatsApp"** → **"API Setup"**
2. You'll see:
   - **Phone Number ID**: Copy this (looks like: `123456789012345`)
   - **Temporary Access Token**: Copy this (starts with `EAA...`)
   
   **Note:** Temporary tokens expire. For production, set up a permanent token (see below).

3. **Add to `.env`:**
   ```env
   WHATSAPP_PHONE_NUMBER_ID=123456789012345
   WHATSAPP_ACCESS_TOKEN=EAAyour-token-here
   ```

### 5.5 Set Up Webhook

**Important:** You need a publicly accessible URL for the webhook. Options:
- Deploy to a server (Heroku, Railway, DigitalOcean, etc.)
- Use ngrok for local testing (see below)

#### For Local Testing (ngrok):

1. **Install ngrok**: [Download](https://ngrok.com/download)
2. **Start your app** (in another terminal):
   ```bash
   npm start
   ```
3. **Start ngrok** (in new terminal):
   ```bash
   ngrok http 3000
   ```
4. **Copy the HTTPS URL** (looks like: `https://abc123.ngrok.io`)

#### Configure Webhook:

1. Go to **WhatsApp** → **"Configuration"** in Meta Developer Console
2. Under **"Webhook"**, click **"Edit"**
3. Enter:
   - **Callback URL**: `https://your-domain.com/webhook` (or your ngrok URL)
   - **Verify Token**: Create a random string (e.g., `my_secure_token_12345`)
4. Click **"Verify and Save"**
5. **Add verify token to `.env`:**
   ```env
   WHATSAPP_VERIFY_TOKEN=my_secure_token_12345
   ```
6. **Subscribe to webhook fields:**
   - Check **"messages"**
   - Click **"Save"**

---

## Step 6: Verify Configuration

Check that your `.env` file has all required values:

```bash
# Run validation
node -e "import('./src/config.js').then(m => console.log(m.validateConfig() ? '✅ All config valid' : '❌ Missing config'))"
```

Or start the app and check for warnings:
```bash
npm start
```

Look for: `"Warning: Missing environment variables: ..."`

---

## Step 7: Test the Application

### 7.1 Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

You should see:
```
Server running on port 3000
Initializing AI Dental Receptionist...
Google Sheets initialized
AI Dental Receptionist is ready!
```

### 7.2 Test Health Endpoint

Open in browser or use curl:
```bash
curl http://localhost:3000/health
```

Should return:
```json
{"status":"ok","timestamp":"2024-01-15T10:30:00.000Z"}
```

### 7.3 Test WhatsApp Webhook

1. **Send a test message** to your WhatsApp Business number
2. **Check console** for logs
3. **Check Google Sheets** - should see logged conversation

### 7.4 Test Booking Flow

Try these messages:
- "I want braces maintenance"
- "I need a cleaning"
- "How much does cleaning cost?"

---

## Troubleshooting

### "Missing environment variables" Warning

- Check `.env` file exists in root directory
- Verify all variables are filled in (no empty values)
- Make sure there are no extra spaces around `=`

### "Calendar ID not found" Error

- Verify calendar IDs in `.env` match actual calendar IDs
- Ensure calendars are shared with service account email
- Check calendar IDs format: `Dentist Name:calendar_id`

### "Authentication error" (Google APIs)

- Verify `GOOGLE_PRIVATE_KEY` includes `\n` characters
- Make sure private key is wrapped in quotes
- Check service account email is correct
- Ensure APIs are enabled in Google Cloud Console

### "WhatsApp webhook not receiving messages"

- Verify webhook URL is accessible (use ngrok for local testing)
- Check verify token matches in `.env` and webhook config
- Ensure webhook is subscribed to `messages` field
- Check WhatsApp Business API status

### "OpenAI API error"

- Verify API key is correct (starts with `sk-`)
- Check you have credits/quota in OpenAI account
- Verify model name is correct (`gpt-4o-mini`)

### "Session timeout issues"

- Adjust `SESSION_TIMEOUT_MINUTES` in `.env`
- Check server time is synchronized

### Google Sheets not logging

- Verify sheet is shared with service account (Editor permission)
- Check sheet ID is correct
- Ensure Google Sheets API is enabled

---

## Next Steps

1. **Deploy to production** (see README.md for deployment options)
2. **Set up permanent WhatsApp access token** (for production)
3. **Monitor Google Sheets** for conversation logs
4. **Customize treatment types** in `src/config.js`
5. **Adjust session timeout** if needed

---

## Security Reminders

- ✅ Never commit `.env` file to version control
- ✅ Keep API keys and tokens secure
- ✅ Rotate access tokens regularly
- ✅ Use environment variables for all sensitive data
- ✅ Monitor Google Sheets logs for suspicious activity
- ✅ Use HTTPS for webhook URLs in production

---

## Need Help?

- Check `README.md` for more details
- Review `PROJECT_STRUCTURE.md` for architecture
- Check Google Sheets logs for error details
- Verify all credentials are correct
