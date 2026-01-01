# Dental Appointment Chatbot - Feature Analysis

## Overview

This is a comprehensive dental appointment booking chatbot that manages the complete lifecycle of dental appointments through intelligent conversation flows. The system handles appointment booking, cancellation, rescheduling, availability checking, and intent detection with robust validation and error handling.

## Main Features

### 1. Appointment Booking

**Purpose:** Enables users to schedule new dental appointments by collecting required information and confirming availability.

**Logic Flow:**

1. **Check booking confirmation pending**
   - Variable: `session.selectedSlot` (selected appointment time slot object)
   - Variable: `session.bookingConfirmationPending` (boolean flag indicating user needs to confirm booking)
   - If true: Proceed to confirmation detection
   - If false: Continue to availability checking

2. **Detect user confirmation/decline**
   - Variable: `userMessage` (current user input text)
   - Variable: `context.hasPendingSlot` (true when slot is selected and awaiting confirmation)
   - If confirmation detected: Validate patient name and proceed to booking
   - If decline detected: Clear slot selection and return decline message
   - If ambiguous: Re-prompt for clarification

3. **Validate patient name requirement**
   - Variable: `session.patientName` (stored patient name from conversation)
   - If null/empty: Return error message requesting patient name
   - If valid: Proceed to booking execution

4. **Execute booking with validation**
   - Variable: `session.selectedSlot.startTime/endTime` (selected time range)
   - Variable: `session.dentistName` (chosen dentist)
   - Re-check slot availability with fresh API call
   - If slot no longer available: Clear selection and find alternatives
   - If available: Create calendar event and update session state

5. **Handle booking success/failure**
   - Variable: `calendarService.createAppointment()` result (API response object)
   - If success: Clear pending flags, store booking details, log action
   - If failure: Clear session state and return error message

### 2. Appointment Cancellation

**Purpose:** Allows users to cancel existing appointments with confirmation safeguards.

**Logic Flow:**

1. **Check if cancellation confirmation needed**
   - Variable: `session.cancellationConfirmationPending` (boolean flag for pending cancellation)
   - If false: Search for existing bookings and display for confirmation
   - If true: Process user confirmation response

2. **Find existing bookings**
   - Variable: `session.phone` (user's phone number for booking lookup)
   - Query calendar service for bookings matching phone number
   - If no bookings found: Clear cancel intent and return "no booking found" message
   - If bookings found: Store booking details and set confirmation pending

3. **Display booking for confirmation**
   - Variable: `existingBookings[0]` (first found booking object)
   - Format booking details (doctor, date, time)
   - Return confirmation prompt message to user

4. **Process confirmation response**
   - Variable: `userMessage` (user's yes/no/confirm response)
   - Variable: `context.hasPendingCancellation` (true during cancellation confirmation)
   - If confirmation: Proceed to cancellation execution
   - If decline: Clear cancellation state and return decline message
   - If ambiguous: Re-prompt for clarification

5. **Execute cancellation**
   - Variable: `booking.calendarId` (Google Calendar ID)
   - Variable: `booking.calendarEventId` (event identifier)
   - Call calendar service to cancel appointment
   - If success: Clear session state, log action, return success message
   - If failure: Return error message and log issue

### 3. Appointment Rescheduling

**Purpose:** Enables users to change existing appointment times by cancelling old booking and creating new one.

**Logic Flow:**

1. **Check reschedule confirmation status**
   - Variable: `session.rescheduleConfirmationPending` (boolean flag for pending reschedule)
   - If false: Find existing bookings and display for selection
   - If true: Process user selection/confirmation

2. **Find and filter existing bookings**
   - Variable: `session.phone` (normalized phone number for matching)
   - Query all bookings and filter by phone number
   - If no bookings: Return "no bookings found" message
   - If multiple bookings: Display list and ask user to specify which one
   - If single booking: Auto-select and proceed to confirmation

3. **Handle booking selection**
   - Variable: `session.existingBookings` (array of found bookings)
   - If multiple: Parse user message to select specific booking
   - If selection unclear: Re-display options and ask for clarification
   - If selection clear: Store selected booking and proceed to confirmation

4. **Process reschedule confirmation**
   - Variable: `userMessage` (user's confirmation response)
   - Variable: `context.hasPendingReschedule` (true during reschedule confirmation)
   - If confirmation: Cancel old booking and prepare for new booking
   - If decline: Clear reschedule state and return decline message
   - If ambiguous: Re-prompt for clarification

5. **Execute reschedule transition**
   - Variable: `existingBookingToReschedule` (booking object to cancel)
   - Cancel old appointment via calendar service
   - Store cancelled slot to exclude from new availability
   - Clear reschedule state and switch to booking intent
   - Return success message and continue to booking flow

### 4. Availability Checking

**Purpose:** Finds and presents available appointment slots based on treatment type and user preferences.

**Logic Flow:**

1. **Fetch fresh availability data**
   - Variable: `session.treatmentType` (type of dental treatment needed)
   - Query calendar service for available slots across all eligible dentists
   - Update session cache with fresh data
   - If no slots available: Return "no availability" message

2. **Auto-select dentist if needed**
   - Variable: `session.dentistName` (user's preferred dentist)
   - If not specified: Find earliest available slot across all dentists
   - If specified: Filter slots to selected dentist only

3. **Extract date/time preferences**
   - Variable: `userMessage` (current user input)
   - Variable: `session.dateTimePreference` (stored preference from previous interactions)
   - Use AI to parse natural language date/time expressions
   - Convert to structured date/time objects

4. **Filter slots by preferences**
   - Variable: `extractedDatePreference` (parsed date/time from AI)
   - Filter available slots by date range, time preferences, working hours
   - Apply treatment duration requirements
   - Exclude cancelled slots during reschedule flow

5. **Select and present best slot**
   - Variable: `filteredSlots` (slots matching all criteria)
   - Select earliest available slot or closest match to preferences
   - Store selected slot and set confirmation pending
   - Return formatted availability message with booking prompt

### 5. Intent Detection & Information Extraction

**Purpose:** Analyzes user messages to understand intent and extract structured appointment information.

**Logic Flow:**

1. **Build conversation context**
   - Variable: `session.intents` (array of previously detected intents)
   - Variable: `session.conversationHistory` (recent message history)
   - Include existing session data (treatment, dentist, patient name)
   - Check for existing bookings to provide context

2. **Prepare AI prompt with rules**
   - Define available intents: booking, cancel, reschedule, price_inquiry, appointment_inquiry
   - Specify intent detection rules and edge cases
   - List valid treatment types and dentist names
   - Include extraction requirements for patient info

3. **Call AI for analysis**
   - Variable: `message` (user input to analyze)
   - Send structured prompt to OpenAI API
   - Request JSON response with intents and extracted information

4. **Parse and validate AI response**
   - Variable: `aiResponse` (JSON response from OpenAI)
   - Validate JSON format and content
   - Filter intents to allowed values only
   - Validate extracted information against allowed ranges

5. **Update session state**
   - Variable: `validatedIntents` (filtered intent array)
   - Variable: `extractedInfo` (validated patient/treatment/dentist data)
   - Store new intents if detected
   - Update session with validated information
   - Handle special cases like clarifying questions

## Key Design Patterns

- **Confirmation Safeguards:** All destructive actions (cancel, reschedule) require explicit user confirmation
- **Fresh Data Validation:** Critical operations re-validate data before execution to prevent conflicts
- **Session State Management:** Comprehensive state tracking prevents duplicate operations and maintains context
- **Error Recovery:** Failed operations clear problematic state and provide clear next steps
- **Intent-Driven Flow:** User intent determines which feature logic path to follow
- **Progressive Information Gathering:** System collects required information incrementally across conversation turns
