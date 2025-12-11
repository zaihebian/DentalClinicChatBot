# .env File Validation Checklist

## ⚠️ CRITICAL ISSUE FOUND

Based on the `.env` file check, there is **one critical issue** that needs to be fixed:

### ❌ Issue: GOOGLE_CALENDAR_IDS uses OLD format

**Current format (WRONG):**
```
GOOGLE_CALENDAR_IDS=Dr. [Braces Dentist 1]:calendar_id_1,Dr. [Braces Dentist 2]:calendar_id_2,Dr. [General Dentist 1]:calendar_id_3,Dr. [General Dentist 2]:calendar_id_4,Dr. [General Dentist 3]:calendar_id_5,Dr. [General Dentist 4]:calendar_id_6
```

**Correct format (REQUIRED):**
```
GOOGLE_CALENDAR_IDS=Dr BracesA:calendar_id_1,Dr BracesB:calendar_id_2,Dr GeneralA:calendar_id_3,Dr GeneralB:calendar_id_4
```

**Why this matters:**
- The code expects exactly 4 dentists: `Dr BracesA`, `Dr BracesB`, `Dr GeneralA`, `Dr GeneralB`
- Using the old format will cause calendar lookups to fail
- The app won't be able to find calendars for appointments

**How to fix:**
1. Update your `.env` file
2. Replace the `GOOGLE_CALENDAR_IDS` line with the correct format above
3. Use your actual calendar IDs (replace `calendar_id_1`, `calendar_id_2`, etc. with real IDs)

---

## ✅ Other Configuration Checks

### WhatsApp API URL
- **Current:** `v18.0`
- **Status:** ⚠️ Using older version
- **Note:** Latest is `v22.0`, but `v18.0` will work fine

### Required Variables Checklist

Make sure all these have **real values** (not placeholders):

- [ ] `OPENAI_API_KEY` - Should start with `sk-`
- [ ] `WHATSAPP_PHONE_NUMBER_ID` - Should be numeric
- [ ] `WHATSAPP_ACCESS_TOKEN` - Should start with `EAA...`
- [ ] `WHATSAPP_VERIFY_TOKEN` - Your custom token
- [ ] `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Should end with `.iam.gserviceaccount.com`
- [ ] `GOOGLE_PRIVATE_KEY` - Should include `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
- [ ] `GOOGLE_PROJECT_ID` - Your Google Cloud project ID
- [ ] `GOOGLE_SHEET_ID` - Your Google Sheet ID
- [ ] `GOOGLE_DOC_ID` - Your Google Doc ID
- [ ] `GOOGLE_CALENDAR_IDS` - **MUST USE NEW FORMAT** (see above)

---

## 🔍 Quick Validation

After fixing `GOOGLE_CALENDAR_IDS`, you can test your configuration by running:

```bash
npm start
```

The app will validate configuration on startup and show warnings for any missing variables.

---

## 📝 Example of Correct .env Format

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini
WHATSAPP_API_URL=https://graph.facebook.com/v22.0
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_VERIFY_TOKEN=my_secure_token_12345
GOOGLE_SERVICE_ACCOUNT_EMAIL=my-service@my-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=my-google-cloud-project
GOOGLE_CALENDAR_IDS=Dr BracesA:abc123@group.calendar.google.com,Dr BracesB:def456@group.calendar.google.com,Dr GeneralA:ghi789@group.calendar.google.com,Dr GeneralB:jkl012@group.calendar.google.com
GOOGLE_SHEET_ID=1a2b3c4d5e6f7g8h9i0j
GOOGLE_SHEET_NAME=Conversations
GOOGLE_DOC_ID=1a2b3c4d5e6f7g8h9i0j_k
SESSION_TIMEOUT_MINUTES=10
PORT=3000
NODE_ENV=development
```
