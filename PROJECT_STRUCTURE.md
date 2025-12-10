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
- **AI-powered response generation**: Uses GPT-4/GPT-4o-mini for natural, context-aware conversations
- **AI-powered intent detection**: 
  - Detects booking, cancel, reschedule, price_inquiry intents from natural language
  - Handles multiple intents in single message
  - Handles negations, confirmations, and context-aware detection
  - Validates all detected intents (format, type, allowed values)
  - Removes duplicates and invalid intents
  - Fallback to keyword-based detection if AI fails
- **AI-powered information extraction**: 
  - Extracts patient name, treatment type, dentist, number of teeth, date/time from natural language
  - Single comprehensive extraction call (more efficient than multiple regex patterns)
  - Validates all extracted data (format, type, allowed values, ranges)
  - Handles edge cases and natural language variations
  - Returns null for invalid/missing data (graceful degradation)
- **Robust validation**: 
  - Defense-in-depth: validates at extraction AND at usage
  - Patient name: 2-100 chars, alphanumeric with spaces/hyphens/apostrophes
  - Treatment type: Must match exactly from allowed list
  - Dentist name: Must match exactly from available dentists
  - Number of teeth: Integer 1-32 (human teeth range)
  - Date/time text: 3-200 chars (parsed separately by dateParser)
- **Intent management**: 
  - Replaces old intents with new ones (doesn't accumulate) to prevent conflicts
  - Keeps existing intents if no new ones detected (for confirmations)
  - Only latest intents drive business logic
- Maintains conversation context (patient info, treatment, dentist, selected slot)
- Handles business logic:
  - Treatment detection and validation
  - Dentist selection with availability checking (braces vs general)
  - Availability checking with preference matching (±1 hour flexibility)
  - Booking confirmation with calendar integration
  - Cancellation handling with two-phase confirmation flow
  - Price inquiries with Google Docs integration
- Comprehensive error handling and logging

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
   - **Intent detection**: AI analyzes message for intents (booking, cancel, reschedule, price_inquiry)
     - Validates detected intents (format, type, removes duplicates)
     - Updates session with latest intents only (replaces old, doesn't accumulate)
     - Keeps existing intents if no new ones detected (for confirmations)
   - **Information extraction**: AI extracts structured data in one call
     - Patient name, treatment type, dentist name, number of teeth, date/time text
     - Validates all extracted data (format, type, allowed values, ranges)
     - Defense-in-depth: validates at extraction AND at usage
   - **Response generation**:
     - Builds context from session (patient, intents, treatment, dentist, selected slot)
     - Sends to OpenAI API with conversation history
     - Generates natural, context-aware response
   - **Post-processing**:
     - Routes validated information to appropriate flows
     - Updates session with extracted data
     - Triggers availability checks, confirmations, cancellations, price inquiries
     - Handles business logic based on latest intents only

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
  intents: string[],             // Array of latest intents: 'booking', 'cancel', 'reschedule', 'price_inquiry'
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
  existingBooking: Object,       // For cancellation flow
  conversationHistory: Array,     // Array of { role: 'user'|'assistant', content: string }
  createdAt: number,
  lastActivity: number,
  eventId: string                 // Google Calendar event ID after booking
}
```

## Key Features

✅ **Multi-turn conversations** with full context retention
✅ **AI-powered intent detection**:
   - Detects booking, cancel, reschedule, price_inquiry intents
   - Handles multiple intents in single message
   - Handles negations, confirmations, context-aware detection
   - Validates all detected intents (format, type, removes duplicates)
   - Fallback to keyword-based detection if AI fails
✅ **AI-powered information extraction**:
   - Extracts patient name, treatment type, dentist, number of teeth, date/time
   - Single comprehensive extraction call (efficient)
   - Handles natural language variations and edge cases
   - Validates all extracted data (format, type, allowed values, ranges)
   - Defense-in-depth validation (at extraction AND usage)
✅ **Intent management**: 
   - Replaces old intents with new ones (prevents conflicts)
   - Keeps existing intents if no new ones detected (for confirmations)
   - Only latest intents drive business logic
✅ **Treatment processing**:
   - Treatment type detection and validation
   - Dentist assignment based on treatment (braces vs general)
   - Availability checking (dentist must be qualified for treatment)
✅ **Duration calculation**:
   - Fixed durations: Consultation (15 min), Cleaning (30 min)
   - Variable durations: Braces Maintenance (15-45 min depending on dentist)
   - Fillings: 30 min (first tooth) + 15 min per additional tooth
✅ **Calendar integration**:
   - Availability checking with preference matching (±1 hour flexibility)
   - Finds gaps between appointments (9 AM - 6 PM, Mon-Fri)
   - Creates calendar events for confirmed bookings
   - Cancels appointments by deleting calendar events
✅ **Appointment management**:
   - Booking with confirmation flow
   - Cancellation with two-phase confirmation
   - Finds bookings by phone number
✅ **Pricing information**: Retrieves from Google Docs with treatment-specific search
✅ **Comprehensive logging**: All conversations and actions logged to Google Sheets
✅ **Session management**: 
   - Automatic timeout (10 minutes, configurable)
   - Automatic cleanup of expired sessions
   - Conversation history retention
✅ **Error handling**: 
   - Graceful degradation on API failures
   - User-friendly error messages
   - Follow-up logging for manual review
   - All errors logged to Google Sheets

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

