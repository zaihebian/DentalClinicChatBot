# AI Dental Clinic Receptionist

An AI-powered virtual receptionist that communicates with customers via WhatsApp, handles multi-turn conversations, manages appointments for multiple dentists, provides treatment and pricing information, and logs all actions.

## Features

- 🤖 **AI-Powered Conversations**: 
  - Uses OpenAI GPT-4/GPT-4o-mini for natural, context-aware conversations
  - Maintains full conversation history and context
  - Handles multi-turn conversations seamlessly
- 🎯 **AI-Powered Intent Detection**:
  - Detects booking, cancel, reschedule, price_inquiry intents from natural language
  - Handles multiple intents in single message
  - Handles negations, confirmations, and context-aware detection
  - Validates all detected intents (format, type, removes duplicates)
  - Fallback to keyword-based detection if AI fails
- 🔍 **AI-Powered Information Extraction**:
  - Extracts patient name, treatment type, dentist, number of teeth, date/time from natural language
  - Single comprehensive extraction call (more efficient than multiple regex patterns)
  - Handles natural language variations and edge cases
  - Validates all extracted data (format, type, allowed values, ranges)
  - Defense-in-depth validation (at extraction AND usage)
- 📅 **Appointment Management**: 
  - Books, cancels appointments across multiple dentist calendars
  - Two-phase confirmation flow for cancellations
  - Finds bookings by phone number
- 💬 **WhatsApp Integration**: Seamless communication via WhatsApp Business API
- 📊 **Activity Logging**: All conversations and actions logged to Google Sheets with comprehensive details
- 💰 **Pricing Information**: Retrieves treatment pricing from Google Docs with treatment-specific search
- 🧠 **Session Management**: 
  - Maintains conversation context with automatic timeout (10 minutes)
  - Automatic cleanup of expired sessions
  - Intent management: replaces old intents with new ones (prevents conflicts)
- ⏱️ **Smart Scheduling**: 
  - Calculates treatment durations (including variable durations for fillings)
  - Finds optimal time slots with preference matching (±1 hour flexibility)
  - Validates dentist availability for treatment type

## Prerequisites

- Node.js 18+ installed
- WhatsApp Business API account and credentials
- OpenAI API key
- Google Cloud Project with:
  - Service Account with access to:
    - Google Calendar API
    - Google Sheets API
    - Google Docs API
  - Calendar IDs for each dentist
  - Google Sheet for logging conversations
  - Google Doc with pricing information

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory (copy from `.env.example` if available) with the following variables:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini

# WhatsApp Business API Configuration
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_VERIFY_TOKEN=your_verify_token

# Google APIs Configuration
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your_project_id

# Google Calendar IDs (comma-separated)
# Format: dentist_name:calendar_id
GOOGLE_CALENDAR_IDS=Dr. [Braces Dentist 1]:calendar_id_1,Dr. [Braces Dentist 2]:calendar_id_2,Dr. [General Dentist 1]:calendar_id_3,Dr. [General Dentist 2]:calendar_id_4,Dr. [General Dentist 3]:calendar_id_5,Dr. [General Dentist 4]:calendar_id_6

# Google Sheets Configuration
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SHEET_NAME=Conversations

# Google Docs Configuration
GOOGLE_DOC_ID=your_pricing_doc_id

# Session Configuration
SESSION_TIMEOUT_MINUTES=10

# Server Configuration
PORT=3000
NODE_ENV=development
```

## Google Cloud Setup

### 1. Create Service Account

1. Go to Google Cloud Console
2. Create a new project or select existing one
3. Enable APIs:
   - Google Calendar API
   - Google Sheets API
   - Google Docs API
4. Create a Service Account:
   - Go to IAM & Admin > Service Accounts
   - Create new service account
   - Download JSON key file
   - Extract email and private key from JSON

### 2. Calendar Setup

1. Create or use existing Google Calendars for each dentist
2. Share each calendar with the service account email (with "Make changes to events" permission)
3. Get Calendar IDs (found in calendar settings)
4. Add to `GOOGLE_CALENDAR_IDS` in `.env`

### 3. Google Sheets Setup

1. Create a new Google Sheet
2. Share with service account email (with "Editor" permission)
3. Copy Sheet ID from URL (between `/d/` and `/edit`)
4. Add to `GOOGLE_SHEET_ID` in `.env`

### 4. Google Docs Setup

1. Create a document with pricing information
2. Share with service account email (with "Viewer" permission)
3. Copy Document ID from URL (between `/d/` and `/edit`)
4. Add to `GOOGLE_DOC_ID` in `.env`

## WhatsApp Business API Setup

1. Create a Meta Developer account
2. Create a WhatsApp Business App
3. Get your Phone Number ID and Access Token
4. Set up webhook:
   - Webhook URL: `https://your-domain.com/webhook`
   - Verify Token: (use the same value as `WHATSAPP_VERIFY_TOKEN` in `.env`)
   - Subscribe to `messages` events

## Running the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The server will start on port 3000 (or the port specified in `.env`).

## Deployment

### Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` and follow prompts
3. Add environment variables in Vercel dashboard
4. Update WhatsApp webhook URL to your Vercel URL

### AWS Lambda

1. Use Serverless Framework or AWS SAM
2. Package the application
3. Deploy to Lambda
4. Set up API Gateway endpoint
5. Update WhatsApp webhook URL

### Other Platforms

The application is a standard Express.js app and can be deployed to:
- Heroku
- Railway
- DigitalOcean App Platform
- Any Node.js hosting service

## Usage Examples

### Booking an Appointment

**User:** "I want braces maintenance"

**Bot:** "Which dentist would you like? (Options: Dr. [Braces Dentist 1], Dr. [Braces Dentist 2])"

**User:** "Dr. [Braces Dentist 2]"

**Bot:** "What day/time works for you?"

**User:** "Tomorrow at 10am"

**Bot:** "Checking availability… Slot available for 45min. Confirm?"

**User:** "Yes"

**Bot:** "✅ Appointment confirmed! [Details]"

### Filling Appointment

**User:** "I need a filling"

**Bot:** "How many teeth need filling?"

**User:** "3"

**Bot:** "Earliest available slot: 13:00–14:30. Confirm?"

**User:** "Yes"

**Bot:** "✅ Appointment confirmed! [Details]"

### Cancellation

**User:** "I want to cancel my appointment"

**Bot:** "Found appointment with Dr. [General Dentist 3] on 2025-12-10 at 15:00. Confirm cancellation?"

**User:** "Yes"

**Bot:** "✅ Your appointment has been cancelled successfully."

## Treatment Types & Durations

- **Consultation**: 15 minutes
- **Cleaning**: 30 minutes
- **Braces Maintenance**: 
  - Dr. [Braces Dentist 2]: 45 minutes
  - Dr. [Braces Dentist 1]: 15 minutes
- **Filling**: 30 minutes for first tooth + 15 minutes per additional tooth

## Dentist Assignments

- **Braces Treatment**: Dr. [Braces Dentist 1], Dr. [Braces Dentist 2]
- **General Treatment**: Dr. [General Dentist 1], Dr. [General Dentist 2], Dr. [General Dentist 3], Dr. [General Dentist 4]

## Session Management

- Sessions are maintained per phone number (conversation ID)
- Sessions timeout after 10 minutes of inactivity (configurable via `SESSION_TIMEOUT_MINUTES`)
- Automatic cleanup of expired sessions (runs every minute)
- Session data includes:
  - Patient information (name, phone)
  - Latest intents (array, replaces old intents, doesn't accumulate)
  - Treatment type and dentist (with validation)
  - Selected time slot (with duration)
  - Conversation history (all messages with timestamps)
  - Confirmation status (pending/confirmed)
  - Calendar event ID (after booking)
- Intent management: Only latest intents are considered (prevents conflicts)
- Session expires if no activity for timeout period (prevents stale data)

## Logging

All conversations and actions are logged to Google Sheets with:
- Timestamp
- Conversation ID (phone number)
- Patient name
- Message content
- Intent
- Dentist
- Treatment
- Date/Time
- Event ID
- Status
- Action type

## Error Handling

- **Graceful degradation**: API failures don't crash the application
- **User-friendly messages**: Errors are converted to helpful messages for users
- **Comprehensive logging**: All errors logged to Google Sheets with details
- **Follow-up tracking**: Failed operations logged with status: `NEEDS FOLLOW-UP***************`
- **Validation**: All AI outputs validated (format, type, allowed values) before use
- **Fallback mechanisms**: Keyword-based detection if AI fails
- **Error recovery**: Missing appointments trigger follow-up requests
- **Defense-in-depth**: Multiple validation layers prevent invalid data from causing issues

## Security Notes

- Never commit `.env` file to version control
- Keep API keys and credentials secure
- Use environment variables for all sensitive data
- Regularly rotate access tokens
- Monitor Google Sheets logs for suspicious activity

## Troubleshooting

### WhatsApp webhook not receiving messages
- Verify webhook URL is accessible
- Check verify token matches
- Ensure webhook is subscribed to `messages` events

### Google Calendar errors
- Verify service account has access to calendars
- Check calendar IDs are correct
- Ensure calendars are shared with service account

### OpenAI API errors
- Check API key is valid
- Verify you have credits/quota
- Check model name is correct

### Session timeout issues
- Adjust `SESSION_TIMEOUT_MINUTES` in `.env`
- Check server time is synchronized

## Support

For issues or questions, please check the logs in Google Sheets or contact the development team.

## License

ISC

