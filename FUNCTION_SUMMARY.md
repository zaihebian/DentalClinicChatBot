# Dental Chatbot Functions and Methods Summary

This document provides a comprehensive summary of all functions and methods in the AI Dental Receptionist chatbot project. Each function is documented with its purpose, inputs, implementation details, and outputs.

## Table of Contents

1. [Main Application (index.js)](#main-application-indexjs)
2. [Configuration (config.js)](#configuration-configjs)
3. [WhatsApp Service (whatsapp.js)](#whatsapp-service-whatsappjs)
4. [OpenAI Handler (openaiHandler.js)](#openai-handler-openaihandlerjs)
5. [Session Management (sessionManager.js)](#session-management-sessionmanagerjs)
6. [Treatment Logic (treatmentLogic.js)](#treatment-logic-treatmentlogicjs)
7. [Google Sheets Service (googleSheets.js)](#google-sheets-service-googlesheetsjs)
8. [Google Calendar Service (googleCalendar.js)](#google-calendar-service-googlecalendarjs)
9. [Google Docs Service (googleDocs.js)](#google-docs-service-googledocsjs)
10. [Date Parser Utilities (utils/dateParser.js)](#date-parser-utilities-utilsdateparserjs)

---

## Main Application (index.js)

### `app.get('/health')` - Health Check Endpoint
**Purpose:** Returns server status and timestamp for monitoring and health checks.

**Input:**
- HTTP GET request to `/health` endpoint
- No parameters required

**Implementation:**
- Creates a simple JSON response with status "ok" and current ISO timestamp
- Always returns 200 OK status (server availability check)
- No dependencies or external calls

**Output:**
- JSON object: `{ status: "ok", timestamp: "2024-01-15T10:30:00.000Z" }`
- HTTP 200 status code

### `app.get('/webhook')` - WhatsApp Webhook Verification
**Purpose:** Verifies WhatsApp webhook during initial setup by returning challenge token.

**Input:**
- HTTP GET request with query parameters:
  - `hub.mode`: Should be "subscribe"
  - `hub.verify_token`: Token from WhatsApp
  - `hub.challenge`: Challenge string to return

**Implementation:**
- Compares mode with "subscribe" and token with configured `WHATSAPP_VERIFY_TOKEN`
- Logs verification attempt with masked token
- Returns challenge string if verified, 403 if not

**Output:**
- HTTP 200 with challenge string if verified
- HTTP 403 Forbidden if verification fails

### `app.post('/webhook')` - WhatsApp Message Handler
**Purpose:** Processes incoming WhatsApp messages through the AI pipeline and sends responses.

**Input:**
- HTTP POST request with WhatsApp webhook payload containing message data
- JSON body with entry, changes, and message arrays

**Implementation:**
- Verifies webhook object is "whatsapp_business_account"
- Parses message using `whatsappService.parseWebhookMessage()`
- Retrieves/creates session for phone number
- Logs user message to Google Sheets
- Generates AI response using `openaiHandler.generateResponse()`
- Sends response via WhatsApp API
- Always returns 200 OK (prevents WhatsApp retries)

**Output:**
- HTTP 200 OK response (always, even on errors)
- String body: "OK"

### `initialize()` - Application Initialization
**Purpose:** Sets up application dependencies and validates configuration on startup.

**Input:**
- No parameters (called automatically on server start)

**Implementation:**
- Logs startup message
- Validates configuration using `validateConfig()`
- Initializes Google Sheets with headers using `googleSheetsService.initializeSheet()`
- Logs completion message
- Exits process with code 1 on critical errors

**Output:**
- No return value
- Process exit with code 1 on failure
- Console logs for status updates

---

## Configuration (config.js)

### `parseCalendarIds(calendarIdsString)` - Parse Calendar IDs
**Purpose:** Converts comma-separated dentist-calendar ID pairs into a structured object.

**Input:**
- `calendarIdsString`: String in format "Dr BracesA:cal_id_1,Dr BracesB:cal_id_2"

**Implementation:**
- Splits string by commas
- Splits each entry by colon to separate dentist name and calendar ID
- Trims whitespace from both parts
- Only includes entries with both dentist name and calendar ID
- Returns object mapping dentist names to calendar IDs

**Output:**
- Object: `{ "Dr BracesA": "cal_id_1", "Dr BracesB": "cal_id_2" }`
- Empty object `{}` if input string is empty

### `validateConfig()` - Configuration Validation
**Purpose:** Checks that all required environment variables are present for application operation.

**Input:**
- No parameters (reads from `process.env`)

**Implementation:**
- Defines array of required environment variable names
- Filters missing variables from the required list
- Logs warning with missing variable names if any are found
- Returns boolean indicating if all variables are present

**Output:**
- `boolean`: true if all required variables present, false otherwise
- Console warning message listing missing variables

---

## WhatsApp Service (whatsapp.js)

### `WhatsAppService.constructor()` - Service Initialization
**Purpose:** Initializes WhatsApp service with configuration values.

**Input:**
- No parameters (reads from config module)

**Implementation:**
- Sets API URL, phone number ID, and access token from config
- Called automatically when module is imported

**Output:**
- No return value
- Configured WhatsAppService instance

### `sendMessage(phoneNumber, message)` - Send Text Message
**Purpose:** Sends a text message to a phone number via WhatsApp Business API.

**Input:**
- `phoneNumber`: Recipient phone number with country code (e.g., "+1234567890")
- `message`: Plain text message content

**Implementation:**
- Makes POST request to WhatsApp Graph API `/v18.0/{phone-number-id}/messages`
- Includes messaging_product: "whatsapp", recipient, message type "text"
- Uses Bearer token authentication
- Catches and logs API errors

**Output:**
- Object: `{ success: true, messageId: "wamid.ABC123..." }` on success
- Object: `{ success: false, error: error_details }` on failure

### `verifyWebhook(mode, token, challenge)` - Webhook Verification
**Purpose:** Validates webhook verification token during WhatsApp setup.

**Input:**
- `mode`: Webhook mode (should be "subscribe")
- `token`: Verify token from WhatsApp
- `challenge`: Challenge string to return if verified

**Implementation:**
- Checks if mode equals "subscribe" and token matches configured verify token
- Returns challenge string if both conditions met
- Returns null if verification fails

**Output:**
- `string`: Challenge string if verified
- `null`: If verification fails

### `parseWebhookMessage(body)` - Parse Webhook Payload
**Purpose:** Extracts phone number, message text, and metadata from WhatsApp webhook payload.

**Input:**
- `body`: Raw webhook request body from WhatsApp

**Implementation:**
- Safely navigates nested webhook structure using optional chaining
- Extracts message from `body.entry[0].changes[0].value.messages[0]`
- Retrieves phone number (`from`), message text (`text.body`), message ID, and timestamp
- Returns null if message structure is invalid or missing

**Output:**
- Object: `{ phoneNumber, messageText, messageId, timestamp }` if valid message
- `null`: If parsing fails or no message found

---

## OpenAI Handler (openaiHandler.js)

### `generateResponse(conversationId, userMessage, phoneNumber)` - Main Response Generator
**Purpose:** Orchestrates the complete AI conversation flow including intent detection, information extraction, and response generation.

**Input:**
- `conversationId`: Unique conversation identifier (phone number)
- `userMessage`: User's message text
- `phoneNumber`: User's phone number for context

**Implementation:**
- Handles "end session" commands by clearing session and returning confirmation
- Updates phone number in session if missing
- Performs combined intent detection and information extraction via AI
- Validates and updates session with extracted information
- Handles booking confirmation, cancellation, and reschedule flows
- Generates AI response using system prompt and conversation context
- Logs all interactions and manages session state throughout

**Output:**
- `string`: AI-generated response message to send to user

### `detectIntentsAndExtractInformation(message, session)` - Combined AI Processing
**Purpose:** Uses OpenAI to simultaneously detect user intents and extract relevant information from messages.

**Input:**
- `message`: User's message text
- `session`: Current session object with conversation context

**Implementation:**
- Constructs detailed prompt with intent detection and information extraction instructions
- Includes conversation history and session context in prompt
- Makes single OpenAI API call for both tasks
- Parses JSON response with intents array and extracted information object
- Validates response format and handles parsing errors

**Output:**
- Object: `{ intents: [...], extracted: { patientName, treatmentType, dentistName, numberOfTeeth, dateTimeText } }`

### `detectIntents(message, session)` - Intent Detection Only
**Purpose:** Specialized function for detecting user intents using AI (fallback method).

**Input:**
- `message`: User's message text
- `session`: Current session object

**Implementation:**
- Creates focused prompt for intent detection only
- Uses OpenAI API to classify message intent
- Parses JSON response with intents array
- Filters intents against valid intent list

**Output:**
- Array: `["booking", "price_inquiry"]` (validated intent strings)

### `detectConfirmationOrDecline(userMessage, context)` - Confirmation Detection
**Purpose:** Determines if user is confirming or declining an action using AI analysis.

**Input:**
- `userMessage`: User's response message
- `context`: Object describing current context (pending slot, booking, etc.)

**Implementation:**
- Builds context-aware prompt describing the pending action
- Uses OpenAI to analyze if message indicates confirmation or decline
- Falls back to keyword matching if AI fails
- Checks for confirmation keywords ("yes", "ok", "sure") and decline keywords ("no", "cancel")

**Output:**
- Object: `{ isConfirmation: boolean, isDecline: boolean }`

### `extractDateTimeWithAI(userMessage, referenceDate)` - Date/Time Extraction
**Purpose:** Uses AI to extract date and time preferences from natural language messages.

**Input:**
- `userMessage`: Message containing date/time information
- `referenceDate`: Base date for relative calculations (defaults to now)

**Implementation:**
- Creates detailed prompt with date/time extraction instructions
- Includes reference date and parsing examples
- Makes OpenAI API call and parses JSON response
- Converts extracted information into structured date/time objects
- Handles both absolute dates and relative expressions

**Output:**
- Object: `{ absoluteDate, relative, time, timeRange }`

### `confirmBooking(session)` - Booking Confirmation
**Purpose:** Executes the actual booking process after user confirmation.

**Input:**
- `session`: Session object with booking details and selected slot

**Implementation:**
- Creates calendar event using Google Calendar API
- Updates session with event ID and booking confirmation
- Logs booking action to Google Sheets
- Handles booking errors gracefully
- Returns success/failure status with appropriate message

**Output:**
- Object: `{ success: boolean, message: string, eventId?: string }`

### `handleCancellation(session, userMessage)` - Cancellation Processing
**Purpose:** Processes appointment cancellation requests with AI assistance.

**Input:**
- `session`: Session object with user context
- `userMessage`: User's cancellation request

**Implementation:**
- Uses AI to identify which booking to cancel if multiple exist
- Finds booking by phone number using Google Calendar API
- Deletes calendar event if found
- Updates session and logs cancellation
- Provides user feedback on cancellation status

**Output:**
- Object: `{ success: boolean, message: string }`

### `handleReschedule(session, userMessage)` - Reschedule Processing
**Purpose:** Manages appointment rescheduling workflow with confirmation steps.

**Input:**
- `session`: Session object with current booking context
- `userMessage`: User's reschedule request

**Implementation:**
- Identifies existing booking to reschedule
- Sets up reschedule confirmation flow
- Manages state transitions through reschedule process
- Prepares for new booking creation after cancellation
- Returns appropriate user messages for each step

**Output:**
- Object: `{ success: boolean, message: string, shouldProceedToBooking?: boolean }`

### `buildSystemPrompt(session, actionResult)` - System Prompt Construction
**Purpose:** Creates comprehensive system prompt for AI response generation based on current session state.

**Input:**
- `session`: Current session object with all context
- `actionResult`: Result of any recent actions (booking, cancellation)

**Implementation:**
- Builds prompt sections for different session states
- Includes conversation history, available slots, pending actions
- Adds specific instructions based on current intent and context
- Formats prompt for optimal AI response generation

**Output:**
- `string`: Complete system prompt for OpenAI API

---

## Session Management (sessionManager.js)

### `SessionManager.constructor()` - Session Manager Initialization
**Purpose:** Initializes session management with automatic cleanup timer.

**Input:**
- No parameters

**Implementation:**
- Creates empty Map for sessions storage
- Sets up interval timer (60 seconds) for automatic cleanup
- Called automatically when module imported

**Output:**
- No return value
- Configured SessionManager instance

### `getSession(conversationId)` - Get or Create Session
**Purpose:** Retrieves existing session or creates new one for conversation ID.

**Input:**
- `conversationId`: Unique conversation identifier (typically phone number)

**Implementation:**
- Checks for existing session in Map
- If found and not expired, updates lastActivity and returns
- If expired, deletes old session and creates new one
- Always returns valid session object

**Output:**
- `Object`: Session object with all properties initialized

### `createNewSession(conversationId)` - Create Session Template
**Purpose:** Creates new session object with default values for all properties.

**Input:**
- `conversationId`: Unique conversation identifier

**Implementation:**
- Returns object with all session properties set to null/empty defaults
- Includes timestamps for creation and last activity
- Sets up empty arrays for conversation history and available slots

**Output:**
- `Object`: New session object with default property values

### `updateSession(conversationId, updates)` - Update Session Properties
**Purpose:** Merges updates into existing session and refreshes activity timestamp.

**Input:**
- `conversationId`: Unique conversation identifier
- `updates`: Object with properties to update

**Implementation:**
- Retrieves or creates session using getSession()
- Uses Object.assign() to merge updates
- Always updates lastActivity timestamp
- Supports partial updates (only specified fields changed)

**Output:**
- `Object`: Updated session object

### `addMessage(conversationId, role, content)` - Add Conversation Message
**Purpose:** Appends message to session's conversation history for AI context.

**Input:**
- `conversationId`: Unique conversation identifier
- `role`: Message role ("user" or "assistant")
- `content`: Message text content

**Implementation:**
- Gets session and adds message object to conversationHistory array
- Includes timestamp of when message was added
- Updates lastActivity timestamp

**Output:**
- No return value (modifies session in place)

### `isExpired(session)` - Check Session Expiration
**Purpose:** Determines if session has exceeded inactivity timeout period.

**Input:**
- `session`: Session object to check

**Implementation:**
- Calculates time difference between current time and lastActivity
- Compares against configured timeout (default 10 minutes)
- Returns true if session should be considered expired

**Output:**
- `boolean`: true if expired, false if still active

### `cleanupExpiredSessions()` - Remove Expired Sessions
**Purpose:** Automatically removes sessions that have exceeded timeout period.

**Input:**
- No parameters (called by interval timer)

**Implementation:**
- Iterates through all sessions in Map
- Checks each session with isExpired()
- Deletes expired sessions and logs cleanup
- Runs every 60 seconds automatically

**Output:**
- No return value (modifies sessions Map)

### `endSession(conversationId)` - Manually End Session
**Purpose:** Immediately removes session from memory regardless of expiration status.

**Input:**
- `conversationId`: Unique conversation identifier

**Implementation:**
- Retrieves session from Map if exists
- Deletes session from Map
- Returns the ended session object or null

**Output:**
- `Object|null`: Ended session object if found, null if not found

### `getSessionData(conversationId)` - Read Session Without Update
**Purpose:** Retrieves session data without updating lastActivity timestamp.

**Input:**
- `conversationId`: Unique conversation identifier

**Implementation:**
- Direct Map lookup without expiration checks
- Returns session object as-is (may be expired)
- Does not update activity timestamp

**Output:**
- `Object|undefined`: Session object if found, undefined if not found

### `destroy()` - Cleanup Session Manager
**Purpose:** Stops cleanup timer and clears all sessions for application shutdown.

**Input:**
- No parameters

**Implementation:**
- Clears interval timer to stop automatic cleanup
- Clears sessions Map to free memory
- Called during graceful shutdown

**Output:**
- No return value

---

## Session Management (sessionManager.js)

### `SessionManager.constructor()` - Session Manager Initialization
**Purpose:** Initializes session management with automatic cleanup timer.

**Input:**
- No parameters

**Implementation:**
- Creates empty Map for sessions storage
- Sets up interval timer (60 seconds) for automatic cleanup
- Called automatically when module imported

**Output:**
- No return value
- Configured SessionManager instance

### `getSession(conversationId)` - Get or Create Session
**Purpose:** Retrieves existing session or creates new one for conversation ID.

**Input:**
- `conversationId`: Unique conversation identifier (typically phone number)

**Implementation:**
- Checks for existing session in Map
- If found and not expired, updates lastActivity and returns
- If expired, deletes old session and creates new one
- Always returns valid session object

**Output:**
- `Object`: Session object with all properties initialized

### `createNewSession(conversationId)` - Create Session Template
**Purpose:** Creates new session object with default values for all properties.

**Input:**
- `conversationId`: Unique conversation identifier

**Implementation:**
- Returns object with all session properties set to null/empty defaults
- Includes timestamps for creation and last activity
- Sets up empty arrays for conversation history and available slots

**Output:**
- `Object`: New session object with default property values

### `updateSession(conversationId, updates)` - Update Session Properties
**Purpose:** Merges updates into existing session and refreshes activity timestamp.

**Input:**
- `conversationId`: Unique conversation identifier
- `updates`: Object with properties to update

**Implementation:**
- Retrieves or creates session using getSession()
- Uses Object.assign() to merge updates
- Always updates lastActivity timestamp
- Supports partial updates (only specified fields changed)

**Output:**
- `Object`: Updated session object

### `addMessage(conversationId, role, content)` - Add Conversation Message
**Purpose:** Appends message to session's conversation history for AI context.

**Input:**
- `conversationId`: Unique conversation identifier
- `role`: Message role ("user" or "assistant")
- `content`: Message text content

**Implementation:**
- Gets session and adds message object to conversationHistory array
- Includes timestamp of when message was added
- Updates lastActivity timestamp

**Output:**
- No return value (modifies session in place)

### `isExpired(session)` - Check Session Expiration
**Purpose:** Determines if session has exceeded inactivity timeout period.

**Input:**
- `session`: Session object to check

**Implementation:**
- Calculates time difference between current time and lastActivity
- Compares against configured timeout (default 10 minutes)
- Returns true if session should be considered expired

**Output:**
- `boolean`: true if expired, false if still active

### `cleanupExpiredSessions()` - Remove Expired Sessions
**Purpose:** Automatically removes sessions that have exceeded timeout period.

**Input:**
- No parameters (called by interval timer)

**Implementation:**
- Iterates through all sessions in Map
- Checks each session with isExpired()
- Deletes expired sessions and logs cleanup
- Runs every 60 seconds automatically

**Output:**
- No return value (modifies sessions Map)

### `endSession(conversationId)` - Manually End Session
**Purpose:** Immediately removes session from memory regardless of expiration status.

**Input:**
- `conversationId`: Unique conversation identifier

**Implementation:**
- Retrieves session from Map if exists
- Deletes session from Map
- Returns the ended session object or null

**Output:**
- `Object|null`: Ended session object if found, null if not found

### `getSessionData(conversationId)` - Read Session Without Update
**Purpose:** Retrieves session data without updating lastActivity timestamp.

**Input:**
- `conversationId`: Unique conversation identifier

**Implementation:**
- Direct Map lookup without expiration checks
- Returns session object as-is (may be expired)
- Does not update activity timestamp

**Output:**
- `Object|undefined`: Session object if found, undefined if not found

### `destroy()` - Cleanup Session Manager
**Purpose:** Stops cleanup timer and clears all sessions for application shutdown.

**Input:**
- No parameters

**Implementation:**
- Clears interval timer to stop automatic cleanup
- Clears sessions Map to free memory
- Called during graceful shutdown

**Output:**
- No return value

---

## Treatment Logic (treatmentLogic.js)

### `detectTreatmentType(userMessage)` - Treatment Type Detection
**Purpose:** Identifies dental treatment type from user message using keyword matching.

**Input:**
- `userMessage`: User's message text

**Implementation:**
- Converts message to lowercase for case-insensitive matching
- Checks for treatment keywords: "cleaning"/"clean", "filling"/"fill", "braces"/"brace"
- Returns Consultation as default if no keywords found

**Output:**
- `string`: Treatment type constant ("Cleaning", "Filling", "Braces Maintenance", or "Consultation")

### `getDentistType(treatmentType)` - Get Dentist Category
**Purpose:** Determines dentist specialization category based on treatment type.

**Input:**
- `treatmentType`: Treatment type constant

**Implementation:**
- Returns "braces" for Braces Maintenance
- Returns "general" for all other treatments

**Output:**
- `string`: "braces" or "general"

### `getAvailableDentists(treatmentType)` - Get Qualified Dentists
**Purpose:** Returns list of dentists qualified to handle specific treatment type.

**Input:**
- `treatmentType`: Treatment type constant

**Implementation:**
- Gets dentist type using getDentistType()
- Returns corresponding dentist array from DENTIST_ASSIGNMENTS
- Returns empty array if treatment type invalid

**Output:**
- `string[]`: Array of qualified dentist names

### `calculateTreatmentDuration(treatmentType, dentistName, numberOfTeeth)` - Calculate Duration
**Purpose:** Determines appointment duration based on treatment type, dentist, and teeth count.

**Input:**
- `treatmentType`: Treatment type constant
- `dentistName`: Specific dentist name (affects Braces Maintenance duration)
- `numberOfTeeth`: Number of teeth for fillings (optional)

**Implementation:**
- Consultation: 15 minutes fixed
- Cleaning: 30 minutes fixed
- Braces: 45 min (Dr BracesB), 15 min (Dr BracesA)
- Filling: 30 min base + 15 min per additional tooth
- Default: 15 minutes fallback

**Output:**
- `number`: Duration in minutes (always positive integer)

### `extractNumberOfTeeth(message)` - Extract Teeth Count
**Purpose:** Finds number of teeth mentioned in user message using regex pattern matching.

**Input:**
- `message`: User's message text

**Implementation:**
- Uses regex to find first number in message
- Validates number is integer between 1-32 (human teeth range)
- Returns null if no valid number found

**Output:**
- `number|null`: Teeth count (1-32) or null if not found/invalid

### `isValidDentistForTreatment(dentistName, treatmentType)` - Validate Dentist-Treatment Match
**Purpose:** Checks if specified dentist is qualified to perform given treatment.

**Input:**
- `dentistName`: Dentist name to validate
- `treatmentType`: Treatment type constant

**Implementation:**
- Gets available dentists for treatment type
- Checks if dentist name is in the qualified list
- Returns boolean result

**Output:**
- `boolean`: true if dentist can handle treatment, false otherwise

---

## Google Sheets Service (googleSheets.js)

### `GoogleSheetsService.constructor()` - Service Initialization
**Purpose:** Initializes Google Sheets service with authentication.

**Input:**
- No parameters

**Implementation:**
- Sets up JWT authentication with service account credentials
- Initializes Google Sheets API client
- Called automatically when module imported

**Output:**
- No return value
- Configured GoogleSheetsService instance

### `initializeAuth()` - Setup Authentication
**Purpose:** Configures JWT authentication for Google Sheets API access.

**Input:**
- No parameters

**Implementation:**
- Creates JWT auth client with service account email and private key
- Sets up Sheets API client with spreadsheets scope
- Logs authentication details for debugging

**Output:**
- No return value
- Throws error if authentication fails

### `initializeSheet()` - Initialize Spreadsheet
**Purpose:** Creates headers in Google Sheets if sheet is empty.

**Input:**
- No parameters

**Implementation:**
- Checks if sheet has existing data
- If empty, adds header row with column names
- Uses append operation to add headers

**Output:**
- `Promise<void>`: Resolves when headers created or already exist

### `logMessage(conversationData)` - Log Individual Message
**Purpose:** Logs a single conversation message to Google Sheets.

**Input:**
- `conversationData`: Object with message details

**Implementation:**
- Formats message data into spreadsheet row
- Appends row to Google Sheets using API
- Handles API errors gracefully

**Output:**
- `Promise<void>`: Resolves when message logged

### `logAction(actionData)` - Log System Action
**Purpose:** Logs system actions (booking, cancellation) to Google Sheets.

**Input:**
- `actionData`: Object with action details

**Implementation:**
- Formats action data into spreadsheet row
- Appends row to Google Sheets
- Includes action type and status

**Output:**
- `Promise<void>`: Resolves when action logged

### `logConversationTurn(conversationId, phone, role, message, sessionData)` - Log Conversation Turn
**Purpose:** Logs complete conversation turn with context to Google Sheets.

**Input:**
- `conversationId`: Unique conversation identifier
- `phone`: User's phone number
- `role`: Message role ("user" or "assistant")
- `message`: Message content
- `sessionData`: Current session object

**Implementation:**
- Extracts relevant data from session (patient name, treatment, dentist, etc.)
- Formats into comprehensive spreadsheet row
- Appends to Google Sheets with all context

**Output:**
- `Promise<void>`: Resolves when conversation turn logged

---

## Google Calendar Service (googleCalendar.js)

### `GoogleCalendarService.constructor()` - Service Initialization
**Purpose:** Initializes Google Calendar service with authentication.

**Input:**
- No parameters

**Implementation:**
- Sets up JWT authentication with calendar scope
- Initializes Google Calendar API client
- Called automatically when module imported

**Output:**
- No return value
- Configured GoogleCalendarService instance

### `initializeAuth()` - Setup Authentication
**Purpose:** Configures JWT authentication for Google Calendar API access.

**Input:**
- No parameters

**Implementation:**
- Creates JWT auth client with service account credentials
- Sets up Calendar API client with calendar scope
- Throws error if authentication fails

**Output:**
- No return value
- Throws error on authentication failure

### `getAvailableSlots(dentistCalendars, startDate, endDate, treatmentDuration)` - Find Available Slots
**Purpose:** Identifies available appointment slots between existing bookings.

**Input:**
- `dentistCalendars`: Array of calendar IDs to check
- `startDate`: Start date for availability search
- `endDate`: End date for availability search
- `treatmentDuration`: Required slot duration in minutes

**Implementation:**
- Fetches existing events from specified calendar(s)
- Identifies gaps between events during working hours (9am-6pm)
- Filters gaps that are long enough for treatment duration
- Returns available time slots

**Output:**
- `Promise<Array>`: Array of available slot objects with start/end times

### `createEvent(calendarId, eventDetails)` - Create Calendar Event
**Purpose:** Creates a new appointment event in Google Calendar.

**Input:**
- `calendarId`: Target calendar ID
- `eventDetails`: Object with event title, start time, end time, description

**Implementation:**
- Formats event data for Google Calendar API
- Makes API call to create event
- Returns event ID on success

**Output:**
- `Promise<Object>`: `{ success: boolean, eventId?: string, error?: string }`

### `deleteEvent(calendarId, eventId)` - Delete Calendar Event
**Purpose:** Removes an appointment event from Google Calendar.

**Input:**
- `calendarId`: Calendar containing the event
- `eventId`: Event ID to delete

**Implementation:**
- Makes API call to delete specific event
- Handles deletion errors gracefully

**Output:**
- `Promise<Object>`: `{ success: boolean, error?: string }`

### `findBookingByPhone(phoneNumber)` - Find Bookings by Phone
**Purpose:** Retrieves all bookings for a specific phone number.

**Input:**
- `phoneNumber`: Phone number to search for

**Implementation:**
- Searches all dentist calendars for events
- Filters events containing the phone number
- Returns matching booking events

**Output:**
- `Promise<Array>`: Array of booking event objects

### `getBookingsForPeriod(calendarIds, startDate, endDate)` - Get Bookings in Period
**Purpose:** Retrieves all bookings within a specified date range.

**Input:**
- `calendarIds`: Array of calendar IDs to search
- `startDate`: Start date for search period
- `endDate`: End date for search period

**Implementation:**
- Fetches events from all specified calendars
- Filters events within date range
- Returns comprehensive booking data

**Output:**
- `Promise<Array>`: Array of booking events with full details

---

## Google Docs Service (googleDocs.js)

### `GoogleDocsService.constructor()` - Service Initialization
**Purpose:** Initializes Google Docs service with authentication.

**Input:**
- No parameters

**Implementation:**
- Sets up JWT authentication with documents.readonly scope
- Initializes Google Docs API client
- Called automatically when module imported

**Output:**
- No return value
- Configured GoogleDocsService instance

### `initializeAuth()` - Setup Authentication
**Purpose:** Configures JWT authentication for Google Docs API access.

**Input:**
- No parameters

**Implementation:**
- Creates JWT auth client with service account credentials
- Sets up Docs API client with readonly scope
- Throws error if authentication fails

**Output:**
- No return value
- Throws error on authentication failure

### `getPricingInfo()` - Retrieve Full Pricing Document
**Purpose:** Extracts all text content from the configured pricing document.

**Input:**
- No parameters

**Implementation:**
- Fetches document using Google Docs API
- Parses document structure to extract text from paragraphs
- Concatenates all text content
- Returns user-friendly error message on failure

**Output:**
- `Promise<string>`: Full document text or error message

### `getTreatmentPricing(treatmentType)` - Get Treatment-Specific Pricing
**Purpose:** Searches document for pricing information related to specific treatment.

**Input:**
- `treatmentType`: Treatment type to search for

**Implementation:**
- Retrieves full document text
- Filters lines containing treatment type or pricing keywords
- Returns matching lines or first 500 characters if no matches

**Output:**
- `Promise<string>`: Relevant pricing text or fallback content

---

## Date Parser Utilities (utils/dateParser.js)

### `parseDateTimePreference(message, referenceDate)` - Parse Date/Time from Message
**Purpose:** Extracts date and time preferences from natural language messages.

**Input:**
- `message`: User's message text
- `referenceDate`: Reference date for relative calculations (defaults to now)

**Implementation:**
- Handles relative dates: today, tomorrow, next week
- Parses day-of-week references: Monday, next Tuesday, this Friday
- Supports specific date formats: MM/DD, YYYY-MM-DD, "July 21st"
- Extracts time formats: 10am, 2:30pm, 10 o'clock, around 10
- Returns structured date and time objects

**Output:**
- `Object`: `{ date: Date|null, time: {hours, minutes}|null, dateRange: null }`

### `matchesDateTimePreference(slotDate, preference)` - Match Slot to Preference
**Purpose:** Checks if a calendar slot matches user's date/time preferences.

**Input:**
- `slotDate`: Calendar slot date/time
- `preference`: Parsed preference object from parseDateTimePreference

**Implementation:**
- Compares slot date with preference date (exact match)
- Compares slot time with preference time (allows ±1 hour flexibility)
- Returns true if slot matches preference or no preference specified
- Handles date-only or time-only preferences

**Output:**
- `boolean`: true if slot matches preference, false otherwise
