# Simple Architecture: Just Make It Work

## Core Principle
**Keep it simple. Make it work. Fix bugs when they happen.**

---

## SIMPLIFIED MODULE STRUCTURE

```
src/
├── services/              # External API calls
│   ├── whatsapp.js       # Send/receive WhatsApp messages
│   ├── calendar.js        # Google Calendar operations
│   ├── sheets.js         # Google Sheets logging
│   └── docs.js           # Google Docs pricing
│
├── handlers/             # Main business logic
│   ├── booking.js        # Handle booking flow
│   ├── cancellation.js   # Handle cancellation flow
│   └── inquiry.js        # Handle price/appointment inquiries
│
├── ai/                   # AI operations
│   ├── detectIntent.js   # Detect what user wants
│   ├── extractInfo.js    # Extract patient name, treatment, etc.
│   └── generateResponse.js # Generate AI response
│
├── utils/                # Helper functions
│   ├── session.js        # Session management
│   ├── validation.js     # Simple validation
│   └── treatment.js      # Treatment duration calculation
│
└── index.js              # Main entry point
```

**Total: 12 files instead of 23**

---

## SIMPLIFIED FLOW

### Main Flow (index.js):
```javascript
1. Receive WhatsApp message
2. Get session
3. Detect intent (booking/cancel/inquiry)
4. Extract info (name, treatment, etc.)
5. Handle action:
   - If booking → booking handler
   - If cancel → cancellation handler
   - If inquiry → inquiry handler
6. Generate AI response
7. Send response
8. Log to sheets
```

**That's it. Simple.**

---

## MODULE RESPONSIBILITIES (Simplified)

### 1. **services/whatsapp.js**
- Send message
- Parse incoming message
- Verify webhook
**That's all.**

### 2. **services/calendar.js**
- Get available slots
- Create appointment
- Cancel appointment
- Find booking by phone
**That's all.**

### 3. **services/sheets.js**
- Log conversation
- Log action
**That's all.**

### 4. **services/docs.js**
- Get pricing
**That's all.**

### 5. **handlers/booking.js**
- Check if ready to book (has name, treatment, slot)
- If ready → create appointment
- If not ready → check availability
- Return message
**That's all.**

### 6. **handlers/cancellation.js**
- Find booking
- Cancel if confirmed
- Return message
**That's all.**

### 7. **handlers/inquiry.js**
- Get pricing OR appointment details
- Return message
**That's all.**

### 8. **ai/detectIntent.js**
- Call AI to detect intent
- Fallback to keywords if AI fails
- Return intent
**That's all.**

### 9. **ai/extractInfo.js**
- Call AI to extract info
- Return extracted data
**That's all.**

### 10. **ai/generateResponse.js**
- Build prompt
- Call OpenAI
- Return response
**That's all.**

### 11. **utils/session.js**
- Get session
- Update session
- Add message to history
**That's all.**

### 12. **utils/validation.js**
- Validate patient name
- Validate treatment
- Validate dentist
**That's all.**

### 13. **utils/treatment.js**
- Calculate duration
- Get available dentists
**That's all.**

---

## SIMPLIFIED BOOKING FLOW

```javascript
// handlers/booking.js
async function handleBooking(session, userMessage) {
  // Step 1: Check if confirming
  if (session.selectedSlot && session.confirmationStatus === 'pending') {
    if (isConfirmation(userMessage)) {
      return await confirmBooking(session);
    }
  }
  
  // Step 2: Check if we have everything
  if (!session.patientName) {
    return "What's your name?";
  }
  if (!session.treatmentType) {
    return "What treatment do you need?";
  }
  
  // Step 3: Check availability
  if (!session.selectedSlot) {
    const slots = await getAvailableSlots(session);
    if (slots.length === 0) {
      return "No slots available. Please try another time.";
    }
    const slot = selectBestSlot(slots, session);
    session.selectedSlot = slot;
    session.confirmationStatus = 'pending';
    return `Found slot: ${formatSlot(slot)}. Confirm?`;
  }
  
  return "Please confirm the slot.";
}

async function confirmBooking(session) {
  try {
    const result = await createAppointment(session);
    if (result.success) {
      session.confirmationStatus = 'confirmed';
      session.eventId = result.eventId;
      session.selectedSlot = null; // Clear slot
      return `✅ Appointment confirmed!`;
    } else {
      session.selectedSlot = null; // Clear on failure
      session.confirmationStatus = null;
      return "Sorry, booking failed. Please try again.";
    }
  } catch (error) {
    session.selectedSlot = null; // Always clear on error
    session.confirmationStatus = null;
    return "Sorry, there was an error. Please try again.";
  }
}
```

**Simple. Clear. Works.**

---

## SIMPLIFIED MAIN FILE (index.js)

```javascript
// index.js
async function handleMessage(conversationId, userMessage, phoneNumber) {
  // 1. Get session
  const session = getSession(conversationId);
  addMessage(session, 'user', userMessage);
  
  // 2. Detect intent
  const intent = await detectIntent(userMessage, session);
  
  // 3. Extract info
  const info = await extractInfo(userMessage, session);
  updateSession(session, info);
  
  // 4. Handle action
  let response;
  if (intent === 'booking') {
    response = await handleBooking(session, userMessage);
  } else if (intent === 'cancel') {
    response = await handleCancellation(session, userMessage);
  } else if (intent === 'price_inquiry') {
    response = await handleInquiry(session, 'price');
  } else {
    // 5. Generate AI response
    response = await generateResponse(session, userMessage);
  }
  
  // 6. Save and return
  addMessage(session, 'assistant', response);
  saveSession(session);
  logToSheets(conversationId, userMessage, response, session);
  
  return response;
}
```

**That's it. Simple flow.**

---

## KEY SIMPLIFICATIONS

### 1. **No Complex State Machine**
- Just use simple flags: `selectedSlot`, `confirmationStatus`
- Clear slot when done or on error
- **Simple.**

### 2. **No Complex Error Handling**
- Try/catch with simple error messages
- Clear state on error
- Log and move on
- **Simple.**

### 3. **No Complex Validation**
- Basic validation: check if exists, check format
- If invalid, ask again
- **Simple.**

### 4. **No Complex Orchestration**
- One main function that calls handlers
- Handlers do their thing
- **Simple.**

### 5. **No Dependency Injection**
- Just import what you need
- Keep it simple
- **Simple.**

### 6. **No Complex Adapters**
- Services are just wrappers around APIs
- Call API, return result
- **Simple.**

---

## WHAT TO KEEP SIMPLE

### ✅ DO:
- Keep functions small (50-100 lines max)
- One function = one thing
- Clear function names
- Simple error handling (try/catch, return error message)
- Basic validation (exists? format ok?)
- Clear flow (step by step)

### ❌ DON'T:
- Over-engineer error handling
- Create complex state machines
- Add layers of abstraction
- Handle every edge case
- Create complex validation
- Add unnecessary patterns

---

## MIGRATION PLAN (Simplified)

### Week 1: Extract Services
- Move WhatsApp, Calendar, Sheets, Docs to `services/`
- Keep existing code, just move files
- **Low risk**

### Week 2: Extract Handlers
- Create `handlers/booking.js`
- Create `handlers/cancellation.js`
- Create `handlers/inquiry.js`
- Move logic from `openaiHandler.js`
- **Low risk**

### Week 3: Extract AI
- Create `ai/detectIntent.js`
- Create `ai/extractInfo.js`
- Create `ai/generateResponse.js`
- Move AI logic
- **Low risk**

### Week 4: Extract Utils
- Create `utils/session.js`
- Create `utils/validation.js`
- Create `utils/treatment.js`
- Move helper functions
- **Low risk**

### Week 5: Simplify Main Flow
- Update `index.js` to use new modules
- Simplify flow
- Test everything
- **Medium risk**

**Total: 5 weeks, not 10**

---

## EXAMPLE: Simple Booking Handler

```javascript
// handlers/booking.js
const { getAvailableSlots, createAppointment } = require('../services/calendar');
const { calculateDuration } = require('../utils/treatment');
const { isConfirmation } = require('../ai/detectIntent');

async function handleBooking(session, userMessage) {
  // Check if confirming
  if (session.selectedSlot && session.confirmationStatus === 'pending') {
    if (isConfirmation(userMessage)) {
      return await confirmBooking(session);
    }
    if (isDecline(userMessage)) {
      session.selectedSlot = null;
      session.confirmationStatus = null;
      return "No problem. Would you like to choose another time?";
    }
  }
  
  // Check what's missing
  if (!session.patientName) {
    return "I need your name to book an appointment. What's your name?";
  }
  
  if (!session.treatmentType) {
    return "What treatment do you need? (Consultation, Cleaning, Filling, Braces Maintenance)";
  }
  
  // Check availability
  if (!session.selectedSlot) {
    const slots = await getAvailableSlots(session.treatmentType);
    if (slots.length === 0) {
      return "Sorry, no slots available right now. Please try again later.";
    }
    
    const slot = selectBestSlot(slots, session);
    session.selectedSlot = slot;
    session.confirmationStatus = 'pending';
    
    return `I found a slot:\n\nDoctor: ${slot.doctor}\nDate: ${formatDate(slot.startTime)}\nTime: ${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}\n\nWould you like to confirm?`;
  }
  
  return "Please confirm the appointment slot.";
}

async function confirmBooking(session) {
  try {
    const result = await createAppointment({
      patientName: session.patientName,
      doctor: session.selectedSlot.doctor,
      treatment: session.treatmentType,
      startTime: session.selectedSlot.startTime,
      endTime: session.selectedSlot.endTime,
      phone: session.phone
    });
    
    if (result.success) {
      // Success
      session.confirmationStatus = 'confirmed';
      session.eventId = result.eventId;
      session.selectedSlot = null;
      
      return `✅ Appointment confirmed!\n\nDoctor: ${session.selectedSlot.doctor}\nTreatment: ${session.treatmentType}\nDate: ${formatDate(session.selectedSlot.startTime)}\nTime: ${formatTime(session.selectedSlot.startTime)}\n\nWe look forward to seeing you!`;
    } else {
      // Failure - clear state
      session.selectedSlot = null;
      session.confirmationStatus = null;
      return "Sorry, I couldn't book that slot. It may no longer be available. Please try again.";
    }
  } catch (error) {
    // Error - always clear state
    session.selectedSlot = null;
    session.confirmationStatus = null;
    console.error('Booking error:', error);
    return "Sorry, there was an error. Please try again or contact us directly.";
  }
}

function selectBestSlot(slots, session) {
  // Simple: just pick first available slot
  // Can improve later if needed
  return slots[0];
}

module.exports = { handleBooking };
```

**Simple. Clear. Works.**

---

## SIMPLIFIED ERROR HANDLING

```javascript
// Just wrap in try/catch, return error message
async function someFunction() {
  try {
    const result = await apiCall();
    return { success: true, data: result };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error: 'Something went wrong' };
  }
}

// Use it
const result = await someFunction();
if (!result.success) {
  return "Sorry, there was an error. Please try again.";
}
```

**No complex error objects. No error codes. Just works.**

---

## SIMPLIFIED VALIDATION

```javascript
// utils/validation.js
function validatePatientName(name) {
  if (!name || name.trim().length < 2) {
    return false;
  }
  return true;
}

function validateTreatment(treatment) {
  const valid = ['Consultation', 'Cleaning', 'Filling', 'Braces Maintenance'];
  return valid.includes(treatment);
}

// Use it
if (!validatePatientName(session.patientName)) {
  return "I need a valid name. What's your name?";
}
```

**Simple checks. That's it.**

---

## SUMMARY

**Goal**: Make it work simply, not perfectly.

**Architecture**:
- 12 files instead of 23
- Simple flow: detect → extract → handle → respond
- Basic error handling
- Simple validation
- No over-engineering

**Key Principles**:
1. Keep functions small and focused
2. One function = one thing
3. Simple error handling (try/catch)
4. Basic validation (exists? format ok?)
5. Clear flow (step by step)
6. Fix bugs when they happen, don't prevent every possible bug

**Migration**:
- 5 weeks instead of 10
- Low risk (move code, don't rewrite)
- Keep it working

**Result**:
- Code that works
- Easy to understand
- Easy to fix when bugs happen
- Not perfect, but good enough
