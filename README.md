# AI Dental Clinic Receptionist

An AI-powered virtual receptionist that communicates with customers via WhatsApp, handles multi-turn conversations, manages appointments for multiple dentists, provides treatment and pricing information, and logs all actions.

## Features

- 🤖 **AI-Powered Conversations**: Uses OpenAI GPT-4/GPT-4o-mini for natural, context-aware conversations
- 📅 **Appointment Management**: Books, cancels, and reschedules appointments across multiple dentist calendars
- 💬 **WhatsApp Integration**: Seamless communication via WhatsApp Business API
- 📊 **Activity Logging**: All conversations and actions logged to Google Sheets
- 💰 **Pricing Information**: Retrieves treatment pricing from Google Docs
- 🧠 **Session Management**: Maintains conversation context with automatic timeout
- ⏱️ **Smart Scheduling**: Calculates treatment durations and finds optimal time slots

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
GOOGLE_CALENDAR_IDS=Dr. Denis:calendar_id_1,Dr. Maria Gorete:calendar_id_2,Dr. Jinho:calendar_id_3,Dr. Harry:calendar_id_4,Dr. Grace:calendar_id_5,Dr. Vicky:calendar_id_6

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

**Bot:** "Which dentist would you like? (Options: Dr. Denis, Dr. Maria Gorete)"

**User:** "Dr. Maria"

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

**Bot:** "Found appointment with Dr. Grace on 2025-12-10 at 15:00. Confirm cancellation?"

**User:** "Yes"

**Bot:** "✅ Your appointment has been cancelled successfully."

## Treatment Types & Durations

- **Consultation**: 15 minutes
- **Cleaning**: 30 minutes
- **Braces Maintenance**: 
  - Dr. Maria Gorete: 45 minutes
  - Dr. Denis: 15 minutes
- **Filling**: 30 minutes for first tooth + 15 minutes per additional tooth

## Dentist Assignments

- **Braces Treatment**: Dr. Denis, Dr. Maria Gorete
- **General Treatment**: Dr. Jinho, Dr. Harry, Dr. Grace, Dr. Vicky

## Session Management

- Sessions are maintained per phone number (conversation ID)
- Sessions timeout after 10 minutes of inactivity (configurable)
- Session data includes:
  - Patient information
  - Treatment type and dentist
  - Selected time slot
  - Conversation history
  - Confirmation status

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

- Failed bookings are logged with status: `NEEDS FOLLOW-UP***************`
- Missing appointments trigger follow-up requests
- All errors are logged for review

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

