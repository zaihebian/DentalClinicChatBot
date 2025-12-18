# Complete Implementation Plan: Remove `confirmationStatus` + Unified Reschedule Flow

## Overview
This plan covers:
1. **Removing `confirmationStatus`** and replacing with separate boolean variables for clarity
2. **Implementing unified reschedule flow** with `handleReschedule()` function
3. **Updating cancellation** to use boolean variables (adding confirmation step)
4. **Updating all references** throughout the codebase

---

## Phase 1: Update Session Structure

### Step 1.1: Update `sessionManager.js` - `createNewSession()`
**Location:** `src/sessionManager.js`, line 164

**Remove:**
```javascript
confirmationStatus: 'pending', // 'pending' or 'confirmed'
```

**Add:**
```javascript
// Separate boolean flags for each operation to avoid confusion
bookingConfirmationPending: false,  // true when slot selected, waiting for user to confirm booking
cancellationConfirmationPending: false,  // true when asking user to confirm cancellation
rescheduleConfirmationPending: false,  // true when asking user to confirm reschedule cancellation
bookingConfirmed: false,  // true after booking is successfully created (prevents duplicate bookings)
existingBookingToReschedule: null,  // { calendarId, calendarEventId, doctor, startTime, endTime, patientName } - booking user wants to reschedule
```

**Rationale:** 
- `confirmationStatus` is ambiguous - unclear if it's for booking, cancel, or reschedule
- Separate booleans make the code self-documenting
- `existingBookingToReschedule` stores the booking to cancel during reschedule

---

## Phase 2: Update Booking Flow - Replace `confirmationStatus` with `bookingConfirmationPending`

### Step 2.1: Update `checkAvailability()` - Set `bookingConfirmationPending`
**Location:** `src/openaiHandler.js`, line ~2042

**Find:**
```javascript
confirmationStatus: 'pending',
```

**Replace with:**
```javascript
bookingConfirmationPending: true,
```

**Also update:** Line ~2051 (local session update)
```javascript
session.confirmationStatus = 'pending';
```
**Replace with:**
```javascript
session.bookingConfirmationPending = true;
```

### Step 2.2: Update `generateResponse()` - Confirmation Check
**Location:** `src/openaiHandler.js`, line ~425

**Find:**
```javascript
if (session.selectedSlot && session.confirmationStatus === 'pending') {
```

**Replace with:**
```javascript
if (session.selectedSlot && session.bookingConfirmationPending) {
```

### Step 2.3: Update `generateResponse()` - Clear Booking Flags
**Locations:** Multiple places where booking confirmation is cleared

**Find all instances of:**
```javascript
confirmationStatus: null
```
**Replace with:**
```javascript
bookingConfirmationPending: false,
bookingConfirmed: false
```

**Specific locations:**
- Line ~478-481: After user declines booking
- Line ~495-498: After booking fails
- Line ~558-562: After reschedule clears old slot
- Line ~2223-2226: In `confirmBooking()` after failure
- Line ~2381-2384: In `confirmBooking()` after error

### Step 2.4: Update `generateResponse()` - Check for Already Confirmed
**Location:** `src/openaiHandler.js`, line ~577

**Find:**
```javascript
const isAlreadyConfirmed = session.confirmationStatus === 'confirmed';
```

**Replace with:**
```javascript
const isAlreadyConfirmed = session.bookingConfirmed;
```

### Step 2.5: Update `confirmBooking()` - Set `bookingConfirmed`
**Location:** `src/openaiHandler.js`, line ~2335

**Find:**
```javascript
confirmationStatus: 'confirmed',
```

**Replace with:**
```javascript
bookingConfirmed: true,
bookingConfirmationPending: false,
```

**Also update:** Line ~2342 (local session update)
```javascript
session.confirmationStatus = 'confirmed';
```
**Replace with:**
```javascript
session.bookingConfirmed = true;
session.bookingConfirmationPending = false;
```

### Step 2.6: Update Logging Statements
**Locations:** Multiple logging statements

**Find and replace:**
- Line ~200: `confirmationStatus: session.confirmationStatus` → `bookingConfirmationPending: session.bookingConfirmationPending, bookingConfirmed: session.bookingConfirmed`
- Line ~397: Same replacement
- Line ~413: Same replacement
- Line ~420: `'confirmationStatus === pending': session.confirmationStatus === 'pending'` → `'bookingConfirmationPending': session.bookingConfirmationPending`
- Line ~421: `'will enter confirmation check': !!(session.selectedSlot && session.confirmationStatus === 'pending')` → `'will enter confirmation check': !!(session.selectedSlot && session.bookingConfirmationPending)`
- Line ~639: Same replacement as line ~200
- Line ~1660: `if (session.confirmationStatus === 'pending' && !actionResult)` → `if (session.bookingConfirmationPending && !actionResult)`
- Line ~2055: `confirmationStatus: session.confirmationStatus` → `bookingConfirmationPending: session.bookingConfirmationPending`

---

## Phase 3: Update Cancellation Flow - Add Confirmation Step

### Step 3.1: Update `handleCancellation()` - Add Confirmation Logic
**Location:** `src/openaiHandler.js`, line ~2516

**Current behavior:** Cancels immediately without confirmation

**New behavior:** 
1. If `cancellationConfirmationPending === false` → Find booking, ask for confirmation, set `cancellationConfirmationPending = true`
2. If `cancellationConfirmationPending === true` → Check user response:
   - If confirmed → Cancel appointment
   - If declined → Clear flag, return message
   - If ambiguous → Re-ask confirmation

**Implementation:**

**Replace the entire `handleCancellation()` function (lines 2516-2619) with:**

```javascript
async handleCancellation(session, userMessage) {
  try {
    // Phase 1: Find booking and ask for confirmation
    if (!session.cancellationConfirmationPending) {
      // Find booking by phone
      const booking = await googleCalendarService.findBookingByPhone(session.phone);
      
      if (!booking) {
        await googleSheetsService.logAction({
          conversationId: session.conversationId,
          phone: session.phone,
          status: 'NEEDS FOLLOW-UP***************',
          action: 'cancellation_not_found',
        });

        return { 
          success: false, 
          message: 'I could not find an appointment for your phone number. Please contact our receptionist for assistance.' 
        };
      }

      // Validate booking object structure
      const bookingStartTime = booking.startTime instanceof Date 
        ? booking.startTime 
        : new Date(booking.startTime);
      const bookingEndTime = booking.endTime instanceof Date 
        ? booking.endTime 
        : new Date(booking.endTime);
      
      // Validate doctor name
      let doctorName = booking.doctor;
      if (doctorName && doctorName.includes('@group.calendar.google.com')) {
        const calendarIdToDoctor = Object.fromEntries(
          Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
        );
        doctorName = calendarIdToDoctor[doctorName] || doctorName;
        console.log('⚠️ [CANCELLATION] Found calendar ID as doctor, mapped to:', doctorName);
      }
      
      // Validate dates
      if (isNaN(bookingStartTime.getTime()) || isNaN(bookingEndTime.getTime())) {
        console.error('❌ [CANCELLATION] Invalid dates in booking:', {
          startTime: booking.startTime,
          endTime: booking.endTime
        });
        return { 
          success: false, 
          message: 'I found your appointment, but there was an error reading the appointment details. Please contact our receptionist for assistance.' 
        };
      }

      // Store booking and ask for confirmation
      sessionManager.updateSession(session.conversationId, {
        existingBooking: booking,
        cancellationConfirmationPending: true
      });
      session.existingBooking = booking;
      session.cancellationConfirmationPending = true;

      const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
        month: 'numeric', 
        day: 'numeric', 
        year: 'numeric' 
      });
      const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });

      return {
        success: false, // Not cancelled yet, waiting for confirmation
        message: `I found your appointment:\n\nDoctor: ${doctorName}\nDate: ${formattedDate}\nTime: ${formattedStartTime}\n\nWould you like to confirm cancellation?`
      };
    }

    // Phase 2: User is confirming/declining
    if (!session.existingBooking) {
      // Should not happen, but handle gracefully
      sessionManager.updateSession(session.conversationId, {
        cancellationConfirmationPending: false
      });
      session.cancellationConfirmationPending = false;
      return {
        success: false,
        message: 'I could not find your appointment details. Please try again or contact our receptionist.'
      };
    }

    // Detect confirmation or decline
    const confirmationResult = await this.detectConfirmationOrDecline(userMessage, {
      hasPendingSlot: false,
      hasPendingCancellation: true
    });

    if (confirmationResult.confirmed) {
      // User confirmed - proceed with cancellation
      const booking = session.existingBooking;
      const bookingStartTime = booking.startTime instanceof Date 
        ? booking.startTime 
        : new Date(booking.startTime);
      const bookingEndTime = booking.endTime instanceof Date 
        ? booking.endTime 
        : new Date(booking.endTime);
      
      let doctorName = booking.doctor;
      if (doctorName && doctorName.includes('@group.calendar.google.com')) {
        const calendarIdToDoctor = Object.fromEntries(
          Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
        );
        doctorName = calendarIdToDoctor[doctorName] || doctorName;
      }

      console.log('🔄 [CANCELLATION] Cancelling appointment:', {
        calendarId: booking.calendarId,
        eventId: booking.calendarEventId,
        phone: session.phone
      });
      
      const cancelResult = await googleCalendarService.cancelAppointment(
        booking.calendarId,
        booking.calendarEventId
      );
      
      console.log('🔄 [CANCELLATION] Cancel result:', cancelResult);

      if (cancelResult.success) {
        await googleSheetsService.logAction({
          conversationId: session.conversationId,
          phone: session.phone,
          patientName: booking.patientName,
          intent: INTENTS.CANCEL,
          dentist: doctorName,
          dateTime: `${bookingStartTime.toISOString()} - ${bookingEndTime.toISOString()}`,
          eventId: booking.calendarEventId,
          status: 'cancelled',
          action: 'appointment_cancelled',
        });

        // Clear cancellation state
        sessionManager.updateSession(session.conversationId, { 
          existingBooking: null,
          cancellationConfirmationPending: false
        });
        session.existingBooking = null;
        session.cancellationConfirmationPending = false;
        
        return { 
          success: true, 
          message: '✅ Your appointment has been cancelled successfully. We hope to see you again soon!' 
        };
      } else {
        await googleSheetsService.logAction({
          conversationId: session.conversationId,
          phone: session.phone,
          status: 'NEEDS FOLLOW-UP***************',
          action: 'cancellation_failed',
        });

        return { 
          success: false, 
          message: 'I apologize, there was an error cancelling your appointment. Please contact our receptionist.' 
        };
      }
    } else if (confirmationResult.declined) {
      // User declined - clear cancellation state
      sessionManager.updateSession(session.conversationId, {
        existingBooking: null,
        cancellationConfirmationPending: false
      });
      session.existingBooking = null;
      session.cancellationConfirmationPending = false;

      return {
        success: false,
        message: 'No problem. Your appointment remains scheduled. Is there anything else I can help you with?'
      };
    } else {
      // Ambiguous response - re-ask confirmation
      const booking = session.existingBooking;
      const bookingStartTime = booking.startTime instanceof Date 
        ? booking.startTime 
        : new Date(booking.startTime);
      const bookingEndTime = booking.endTime instanceof Date 
        ? booking.endTime 
        : new Date(booking.endTime);
      
      let doctorName = booking.doctor;
      if (doctorName && doctorName.includes('@group.calendar.google.com')) {
        const calendarIdToDoctor = Object.fromEntries(
          Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
        );
        doctorName = calendarIdToDoctor[doctorName] || doctorName;
      }

      const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
        month: 'numeric', 
        day: 'numeric', 
        year: 'numeric' 
      });
      const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });

      return {
        success: false,
        message: `I found your appointment:\n\nDoctor: ${doctorName}\nDate: ${formattedDate}\nTime: ${formattedStartTime}\n\nWould you like to confirm cancellation?`
      };
    }
  } catch (error) {
    console.error('Error handling cancellation:', error);
    return { 
      success: false, 
      message: 'I apologize, I am having trouble processing your cancellation. Please contact our receptionist.' 
    };
  }
}
```

### Step 3.2: Update `detectConfirmationOrDecline()` - Support Cancellation Context
**Location:** `src/openaiHandler.js`, line ~1400 (approximate)

**Find the function signature and add support for `hasPendingCancellation`:**

**Current:**
```javascript
async detectConfirmationOrDecline(userMessage, context = {}) {
  const { hasPendingSlot = false } = context;
```

**Update to:**
```javascript
async detectConfirmationOrDecline(userMessage, context = {}) {
  const { hasPendingSlot = false, hasPendingCancellation = false } = context;
```

**Update the prompt to handle cancellation context** (find the prompt construction and add cancellation handling).

---

## Phase 4: Implement Unified Reschedule Flow

### Step 4.1: Create `handleReschedule()` Function
**Location:** `src/openaiHandler.js`, after `handleCancellation()` (around line 2620)

**Add new function:**

```javascript
/**
 * Handles reschedule flow in two phases:
 * Phase 1: Find all existing bookings by phone, ask user which one to reschedule
 * Phase 2: User confirms → Cancel old booking → Proceed with booking flow for new slot
 * 
 * @param {Object} session - Current session object
 * @param {string} userMessage - User's message
 * @returns {Promise<Object>} { success: boolean, message: string, shouldProceedToBooking?: boolean }
 */
async handleReschedule(session, userMessage) {
  try {
    // Phase 1: Find bookings and ask for confirmation
    if (!session.rescheduleConfirmationPending) {
      // Find all bookings by phone
      const bookings = await googleCalendarService.getAllBookings(session.phone);
      
      if (!bookings || bookings.length === 0) {
        await googleSheetsService.logAction({
          conversationId: session.conversationId,
          phone: session.phone,
          status: 'NEEDS FOLLOW-UP***************',
          action: 'reschedule_not_found',
        });

        return { 
          success: false, 
          message: 'I could not find any appointments for your phone number. Would you like to book a new appointment instead?',
          shouldProceedToBooking: false
        };
      }

      // If only one booking, auto-select it
      if (bookings.length === 1) {
        const booking = bookings[0];
        const bookingStartTime = booking.startTime instanceof Date 
          ? booking.startTime 
          : new Date(booking.startTime);
        const bookingEndTime = booking.endTime instanceof Date 
          ? booking.endTime 
          : new Date(booking.endTime);
        
        let doctorName = booking.doctor;
        if (doctorName && doctorName.includes('@group.calendar.google.com')) {
          const calendarIdToDoctor = Object.fromEntries(
            Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
          );
          doctorName = calendarIdToDoctor[doctorName] || doctorName;
        }

        const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
          month: 'numeric', 
          day: 'numeric', 
          year: 'numeric' 
        });
        const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });

        // Store booking and ask for confirmation
        sessionManager.updateSession(session.conversationId, {
          existingBookingToReschedule: booking,
          rescheduleConfirmationPending: true
        });
        session.existingBookingToReschedule = booking;
        session.rescheduleConfirmationPending = true;

        return {
          success: false, // Not rescheduled yet, waiting for confirmation
          message: `I found your appointment:\n\nDoctor: ${doctorName}\nDate: ${formattedDate}\nTime: ${formattedStartTime}\n\nWould you like to reschedule this appointment?`,
          shouldProceedToBooking: false
        };
      }

      // Multiple bookings - list them and ask user to specify
      let message = 'I found multiple appointments:\n\n';
      bookings.forEach((booking, index) => {
        const bookingStartTime = booking.startTime instanceof Date 
          ? booking.startTime 
          : new Date(booking.startTime);
        const bookingEndTime = booking.endTime instanceof Date 
          ? booking.endTime 
          : new Date(booking.endTime);
        
        let doctorName = booking.doctor;
        if (doctorName && doctorName.includes('@group.calendar.google.com')) {
          const calendarIdToDoctor = Object.fromEntries(
            Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
          );
          doctorName = calendarIdToDoctor[doctorName] || doctorName;
        }

        const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
          month: 'numeric', 
          day: 'numeric', 
          year: 'numeric' 
        });
        const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });

        message += `${index + 1}. Doctor: ${doctorName}, Date: ${formattedDate}, Time: ${formattedStartTime}\n`;
      });
      message += '\nWhich appointment would you like to reschedule? Please specify by number or date/time.';

      // Store all bookings for selection
      sessionManager.updateSession(session.conversationId, {
        existingBookings: bookings,
        rescheduleConfirmationPending: true
      });
      session.existingBookings = bookings;
      session.rescheduleConfirmationPending = true;

      return {
        success: false,
        message: message,
        shouldProceedToBooking: false
      };
    }

    // Phase 2: User is confirming/selecting booking to reschedule
    if (session.existingBookings && session.existingBookings.length > 1) {
      // User needs to select which booking to reschedule
      // Try to match user message to a booking
      const selectedBooking = this.selectBookingFromMessage(userMessage, session.existingBookings);
      
      if (!selectedBooking) {
        // Could not determine which booking - re-ask
        let message = 'I found multiple appointments:\n\n';
        session.existingBookings.forEach((booking, index) => {
          const bookingStartTime = booking.startTime instanceof Date 
            ? booking.startTime 
            : new Date(booking.startTime);
          let doctorName = booking.doctor;
          if (doctorName && doctorName.includes('@group.calendar.google.com')) {
            const calendarIdToDoctor = Object.fromEntries(
              Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
            );
            doctorName = calendarIdToDoctor[doctorName] || doctorName;
          }
          const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
            month: 'numeric', 
            day: 'numeric', 
            year: 'numeric' 
          });
          const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          });
          message += `${index + 1}. Doctor: ${doctorName}, Date: ${formattedDate}, Time: ${formattedStartTime}\n`;
        });
        message += '\nWhich appointment would you like to reschedule? Please specify by number or date/time.';

        return {
          success: false,
          message: message,
          shouldProceedToBooking: false
        };
      }

      // Store selected booking
      sessionManager.updateSession(session.conversationId, {
        existingBookingToReschedule: selectedBooking,
        existingBookings: null
      });
      session.existingBookingToReschedule = selectedBooking;
      session.existingBookings = null;
    }

    // Now we have a selected booking (either from single booking or user selection)
    if (!session.existingBookingToReschedule) {
      sessionManager.updateSession(session.conversationId, {
        rescheduleConfirmationPending: false
      });
      session.rescheduleConfirmationPending = false;
      return {
        success: false,
        message: 'I could not find the appointment to reschedule. Please try again or contact our receptionist.',
        shouldProceedToBooking: false
      };
    }

    // Detect confirmation or decline
    const confirmationResult = await this.detectConfirmationOrDecline(userMessage, {
      hasPendingSlot: false,
      hasPendingCancellation: false,
      hasPendingReschedule: true
    });

    if (confirmationResult.confirmed) {
      // User confirmed - cancel old booking and proceed to booking flow
      const booking = session.existingBookingToReschedule;
      
      console.log('🔄 [RESCHEDULE] Cancelling old appointment:', {
        calendarId: booking.calendarId,
        eventId: booking.calendarEventId,
        phone: session.phone
      });
      
      const cancelResult = await googleCalendarService.cancelAppointment(
        booking.calendarId,
        booking.calendarEventId
      );
      
      if (!cancelResult.success) {
        console.error('⚠️ [RESCHEDULE] Failed to cancel old appointment:', cancelResult);
        // Continue anyway - we'll create new event and old one might need manual cleanup
      }

      // Clear reschedule state and proceed to booking flow
      sessionManager.updateSession(session.conversationId, {
        existingBookingToReschedule: null,
        rescheduleConfirmationPending: false,
        eventId: null, // Clear old event ID
        bookingConfirmed: false // Reset booking confirmed status
      });
      session.existingBookingToReschedule = null;
      session.rescheduleConfirmationPending = false;
      session.eventId = null;
      session.bookingConfirmed = false;

      return {
        success: true,
        message: '✅ I\'ve cancelled your old appointment. Now let\'s find a new time slot for you.',
        shouldProceedToBooking: true
      };
    } else if (confirmationResult.declined) {
      // User declined - clear reschedule state
      sessionManager.updateSession(session.conversationId, {
        existingBookingToReschedule: null,
        rescheduleConfirmationPending: false,
        existingBookings: null
      });
      session.existingBookingToReschedule = null;
      session.rescheduleConfirmationPending = false;
      session.existingBookings = null;

      return {
        success: false,
        message: 'No problem. Your appointment remains scheduled. Is there anything else I can help you with?',
        shouldProceedToBooking: false
      };
    } else {
      // Ambiguous response - re-ask confirmation
      const booking = session.existingBookingToReschedule;
      const bookingStartTime = booking.startTime instanceof Date 
        ? booking.startTime 
        : new Date(booking.startTime);
      
      let doctorName = booking.doctor;
      if (doctorName && doctorName.includes('@group.calendar.google.com')) {
        const calendarIdToDoctor = Object.fromEntries(
          Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
        );
        doctorName = calendarIdToDoctor[doctorName] || doctorName;
      }

      const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
        month: 'numeric', 
        day: 'numeric', 
        year: 'numeric' 
      });
      const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });

      return {
        success: false,
        message: `I found your appointment:\n\nDoctor: ${doctorName}\nDate: ${formattedDate}\nTime: ${formattedStartTime}\n\nWould you like to reschedule this appointment?`,
        shouldProceedToBooking: false
      };
    }
  } catch (error) {
    console.error('Error handling reschedule:', error);
    return { 
      success: false, 
      message: 'I apologize, I am having trouble processing your reschedule request. Please contact our receptionist.',
      shouldProceedToBooking: false
    };
  }
}

/**
 * Helper function to select a booking from user message when multiple bookings exist
 * @param {string} userMessage - User's message
 * @param {Array} bookings - Array of booking objects
 * @returns {Object|null} Selected booking or null if cannot determine
 */
selectBookingFromMessage(userMessage, bookings) {
  const message = userMessage.toLowerCase().trim();
  
  // Try to match by number (1, 2, 3, etc.)
  const numberMatch = message.match(/\b(\d+)\b/);
  if (numberMatch) {
    const index = parseInt(numberMatch[1]) - 1;
    if (index >= 0 && index < bookings.length) {
      return bookings[index];
    }
  }
  
  // Try to match by date/time keywords
  // This is a simple implementation - can be enhanced with AI if needed
  for (const booking of bookings) {
    const bookingStartTime = booking.startTime instanceof Date 
      ? booking.startTime 
      : new Date(booking.startTime);
    const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    const formattedTime = bookingStartTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    if (message.includes(formattedDate.toLowerCase()) || message.includes(formattedTime.toLowerCase())) {
      return booking;
    }
  }
  
  return null;
}
```

### Step 4.2: Update `detectConfirmationOrDecline()` - Support Reschedule Context
**Location:** `src/openaiHandler.js`, line ~1400

**Update function signature:**
```javascript
async detectConfirmationOrDecline(userMessage, context = {}) {
  const { hasPendingSlot = false, hasPendingCancellation = false, hasPendingReschedule = false } = context;
```

**Update prompt to handle reschedule context** (similar to cancellation).

### Step 4.3: Update `generateResponse()` - Handle Reschedule Flow
**Location:** `src/openaiHandler.js`, line ~452 (cancellation handler area)

**Find the cancellation handler (around line 452) and add reschedule handler BEFORE it:**

```javascript
// Handle reschedule intent
if (latestIntents.includes(INTENTS.RESCHEDULE)) {
  console.log('🔄 [RESCHEDULE] Reschedule intent detected');
  
  const rescheduleResult = await this.handleReschedule(session, userMessage);
  
  if (rescheduleResult.success && rescheduleResult.shouldProceedToBooking) {
    // Old booking cancelled, proceed to booking flow
    // Clear reschedule intent and set booking intent
    sessionManager.updateSession(session.conversationId, {
      intents: [INTENTS.BOOKING] // Switch to booking intent
    });
    session.intents = [INTENTS.BOOKING];
    
    // Return message and let booking flow continue
    return rescheduleResult.message;
  } else if (rescheduleResult.success) {
    // Reschedule completed but shouldn't proceed to booking (shouldn't happen)
    return rescheduleResult.message;
  } else {
    // Reschedule in progress or failed - return message
    return rescheduleResult.message;
  }
}

// Handle cancellation intent
if (latestIntents.includes(INTENTS.CANCEL)) {
  // ... existing cancellation handler ...
}
```

### Step 4.4: Update `generateResponse()` - Remove Old Reschedule Logic
**Location:** `src/openaiHandler.js`, line ~553

**Find and REMOVE:**
```javascript
// Handle reschedule: clear old slot before AI (so AI knows we're looking for new slot)
if (latestIntents.includes(INTENTS.RESCHEDULE) && session.selectedSlot) {
  console.log('🔄 [PRE-AI] Reschedule detected, clearing old selectedSlot');
  const dentistToPreserve = session.dentistName || session.selectedSlot?.doctor;
  sessionManager.updateSession(session.conversationId, {
    selectedSlot: null,
    confirmationStatus: null,
    ...(dentistToPreserve && { dentistName: dentistToPreserve })
  });
  session.selectedSlot = null;
  session.confirmationStatus = null;
  if (dentistToPreserve) {
    session.dentistName = dentistToPreserve;
  }
}
```

**Rationale:** Reschedule is now handled by `handleReschedule()` function, not by clearing slots.

### Step 4.5: Update `generateResponse()` - Booking Intent Check
**Location:** `src/openaiHandler.js`, line ~570

**Find:**
```javascript
const hasBookingIntent = latestIntents.includes(INTENTS.BOOKING) ||
                         latestIntents.includes(INTENTS.RESCHEDULE) ||
                         (session.intents && session.intents.includes(INTENTS.BOOKING)) ||
                         (session.intents && session.intents.includes(INTENTS.RESCHEDULE));
```

**Replace with:**
```javascript
const hasBookingIntent = latestIntents.includes(INTENTS.BOOKING) ||
                         (session.intents && session.intents.includes(INTENTS.BOOKING));
```

**Rationale:** Reschedule is handled separately, and when it proceeds to booking, it sets `INTENTS.BOOKING` explicitly.

### Step 4.6: Update `confirmBooking()` - Remove Old Reschedule Logic
**Location:** `src/openaiHandler.js`, line ~2237

**Find and REMOVE:**
```javascript
// If rescheduling, delete old event first
if (session.eventId && session.intents?.includes(INTENTS.RESCHEDULE)) {
  console.log('🔄 [BOOKING] Reschedule detected, deleting old event:', session.eventId);
  try {
    const oldCalendarId = config.calendar.dentistCalendars[session.dentistName];
    if (oldCalendarId) {
      const cancelResult = await googleCalendarService.cancelAppointment(oldCalendarId, session.eventId);
      if (cancelResult.success) {
        // ... rest of the code ...
      }
    }
  } catch (error) {
    console.error('⚠️ [BOOKING] Error deleting old event during reschedule:', error);
    // Continue anyway - we'll create new event and old one might need manual cleanup
  }
}
```

**Rationale:** Old booking is already cancelled in `handleReschedule()` before proceeding to booking flow.

### Step 4.7: Update `confirmBooking()` - Logging
**Location:** `src/openaiHandler.js`, line ~2349

**Find:**
```javascript
// Determine intent for logging (reschedule vs booking)
const isReschedule = session.intents?.includes(INTENTS.RESCHEDULE);
const logIntent = isReschedule ? INTENTS.RESCHEDULE : INTENTS.BOOKING;
const logAction = isReschedule ? 'appointment_rescheduled' : 'booking_created';
```

**Replace with:**
```javascript
// Check if this was a reschedule (old booking was cancelled)
const isReschedule = session.existingBookingToReschedule !== null && session.existingBookingToReschedule !== undefined;
const logIntent = isReschedule ? INTENTS.RESCHEDULE : INTENTS.BOOKING;
const logAction = isReschedule ? 'appointment_rescheduled' : 'booking_created';
```

**Also update:** Line ~2387 (same logic)

---

## Phase 5: Clean Up and Testing

### Step 5.1: Remove All Remaining `confirmationStatus` References
**Search for:** `confirmationStatus` in `src/openaiHandler.js`

**Verify all instances are replaced** (should be 0 matches after Phase 2-4).

### Step 5.2: Update Comments and Documentation
**Location:** `src/openaiHandler.js`, top of file

**Update module-level comments** to reflect new boolean flags instead of `confirmationStatus`.

### Step 5.3: Test Cases to Verify

1. **Booking Flow:**
   - User books appointment → `bookingConfirmationPending` set to `true`
   - User confirms → `bookingConfirmed` set to `true`, `bookingConfirmationPending` set to `false`
   - User declines → Both flags set to `false`

2. **Cancellation Flow:**
   - User requests cancellation → `cancellationConfirmationPending` set to `true`, booking found
   - User confirms → Appointment cancelled, `cancellationConfirmationPending` set to `false`
   - User declines → `cancellationConfirmationPending` set to `false`, booking remains

3. **Reschedule Flow (Single Booking):**
   - User requests reschedule → `rescheduleConfirmationPending` set to `true`, booking found
   - User confirms → Old booking cancelled, `rescheduleConfirmationPending` set to `false`, proceeds to booking flow
   - User declines → `rescheduleConfirmationPending` set to `false`, booking remains

4. **Reschedule Flow (Multiple Bookings):**
   - User requests reschedule → Multiple bookings listed, `rescheduleConfirmationPending` set to `true`
   - User selects booking → `existingBookingToReschedule` set
   - User confirms → Old booking cancelled, proceeds to booking flow

5. **Edge Cases:**
   - No bookings found for cancellation/reschedule
   - API failures during cancellation
   - Ambiguous user responses

---

## Summary of Changes

### Files Modified:
1. **`src/sessionManager.js`**
   - Remove `confirmationStatus`
   - Add `bookingConfirmationPending`, `cancellationConfirmationPending`, `rescheduleConfirmationPending`, `bookingConfirmed`, `existingBookingToReschedule`

2. **`src/openaiHandler.js`**
   - Replace all `confirmationStatus` references with appropriate boolean flags
   - Update `handleCancellation()` to add confirmation step
   - Create new `handleReschedule()` function
   - Create new `selectBookingFromMessage()` helper function
   - Update `detectConfirmationOrDecline()` to support cancellation and reschedule contexts
   - Update `generateResponse()` to handle reschedule flow separately
   - Remove old reschedule logic from `confirmBooking()`
   - Update all logging statements

### Key Benefits:
1. **Clarity:** Separate boolean flags make it clear which operation is pending confirmation
2. **Unified Reschedule:** Single function handles all reschedule scenarios (newly booked or old bookings)
3. **Consistent Confirmation:** All calendar operations (booking, cancel, reschedule) require confirmation
4. **Maintainability:** Clear separation of concerns, easier to debug

---

## Implementation Order

1. **Phase 1** - Update session structure (foundation)
2. **Phase 2** - Update booking flow (most used feature)
3. **Phase 3** - Update cancellation flow (add confirmation)
4. **Phase 4** - Implement reschedule flow (new feature)
5. **Phase 5** - Clean up and test (verification)

---

## Notes

- **Backward Compatibility:** Old sessions with `confirmationStatus` will need migration logic (or just let them expire naturally)
- **Testing:** Test each phase independently before proceeding to next phase
- **Rollback:** Keep git commits for each phase to enable easy rollback if needed
