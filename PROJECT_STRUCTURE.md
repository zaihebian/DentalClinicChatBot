# Project Structure

## Directory Layout

```
Chatbot/
├── src/
│   ├── config.js              # Configuration management
│   ├── index.js               # Main Express server and webhook handlers
│   ├── sessionManager.js      # Session management for conversations
│   ├── treatmentLogic.js      # Treatment detection and duration calculation
│   ├── googleCalendar.js     # Google Calendar API integration
│   ├── googleSheets.js       # Google Sheets logging
│   ├── googleDocs.js         # Google Docs pricing retrieval
│   ├── whatsapp.js           # WhatsApp Business API integration
│   ├── openaiHandler.js      # OpenAI GPT-4 conversational AI handler
│   └── utils/
│       └── dateParser.js      # Date/time parsing utilities
├── package.json              # Dependencies and scripts
├── .gitignore               # Git ignore rules
├── README.md                # Main documentation
├── SETUP.md                 # Quick setup guide
└── PROJECT_STRUCTURE.md     # This file
```

## Core Components

### 1. Configuration (`config.js`)
- Loads environment variables
- Parses calendar IDs
- Defines dentist assignments and treatment types
- Validates required configuration

### 2. Session Management (`sessionManager.js`)
- Maintains conversation state per phone number
- Tracks patient info, treatment, dentist, slots, etc.
- Auto-cleans expired sessions (10 min timeout)
- Stores conversation history

### 3. Treatment Logic (`treatmentLogic.js`)
- Detects treatment type from user input
- Determines dentist type (braces vs general)
- Calculates treatment duration
- Extracts number of teeth for fillings

### 4. Google Calendar (`googleCalendar.js`)
- Fetches available slots for next 1 month
- Finds gaps between existing appointments
- Creates calendar events for bookings
- Cancels appointments
- Retrieves all bookings for 2 months

### 5. Google Sheets (`googleSheets.js`)
- Logs all conversation messages
- Logs all actions (booking, cancellation, etc.)
- Initializes sheet with headers
- Tracks status and event IDs

### 6. Google Docs (`googleDocs.js`)
- Retrieves pricing information
- Searches for specific treatment pricing
- Returns formatted pricing text

### 7. WhatsApp (`whatsapp.js`)
- Sends messages via WhatsApp Business API
- Verifies webhook requests
- Parses incoming webhook messages

### 8. OpenAI Handler (`openaiHandler.js`)
- Generates AI responses using GPT-4
- Maintains conversation context
- Handles business logic:
  - Treatment detection
  - Dentist selection
  - Availability checking
  - Booking confirmation
  - Cancellation handling
  - Price inquiries

### 9. Main Server (`index.js`)
- Express server setup
- Webhook endpoints for WhatsApp
- Health check endpoint
- Initialization and graceful shutdown

## Data Flow

1. **Incoming Message**
   - WhatsApp webhook receives message
   - Parses phone number and message text
   - Logs to Google Sheets

2. **Session Management**
   - Gets or creates session for phone number
   - Updates last activity timestamp

3. **AI Processing**
   - Builds context from session
   - Sends to OpenAI API
   - Post-processes response
   - Handles business logic

4. **Action Execution**
   - Checks availability (if booking)
   - Creates calendar event (if confirmed)
   - Cancels appointment (if requested)
   - Retrieves pricing (if inquired)

5. **Response**
   - Sends message via WhatsApp
   - Logs to Google Sheets
   - Updates session state

## Session Data Structure

```javascript
{
  conversationId: string,        // Phone number
  phone: string,
  patientName: string,
  intent: string,                // 'booking', 'cancel', 'reschedule', 'price_inquiry'
  dentistType: string,           // 'braces' or 'general'
  dentistName: string,
  treatmentType: string,
  treatmentDuration: number,     // minutes
  numberOfTeeth: number,         // For fillings
  selectedSlot: {
    doctor: string,
    startTime: Date,
    endTime: Date,
    duration: number,
    weekday: string
  },
  confirmationStatus: string,     // 'pending' or 'confirmed'
  availableSlots: Array,
  existingBookings: Array,
  existingBooking: Object,       // For cancellation
  conversationHistory: Array,
  createdAt: number,
  lastActivity: number,
  eventId: string
}
```

## Key Features

✅ Multi-turn conversations with context
✅ Treatment type detection
✅ Dentist assignment based on treatment
✅ Duration calculation (including fillings with multiple teeth)
✅ Calendar availability checking
✅ Appointment booking with confirmation
✅ Appointment cancellation with confirmation
✅ Price information retrieval
✅ Conversation logging to Google Sheets
✅ Session timeout management
✅ Error handling and follow-up logging

## Environment Variables

See `SETUP.md` for complete list of required environment variables.

## API Endpoints

- `GET /health` - Health check
- `GET /webhook` - WhatsApp webhook verification
- `POST /webhook` - WhatsApp webhook handler

## Dependencies

- `express` - Web server
- `openai` - OpenAI API client
- `googleapis` - Google APIs client
- `axios` - HTTP client for WhatsApp API
- `dotenv` - Environment variable management

## Next Steps for Enhancement

1. Add rescheduling functionality
2. Improve date/time parsing
3. Add support for multiple languages
4. Add appointment reminders
5. Add patient database integration
6. Improve error messages
7. Add analytics dashboard
8. Support for recurring appointments

