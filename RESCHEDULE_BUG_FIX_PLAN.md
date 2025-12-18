# Reschedule Bug Fix Plan

## Issues Identified

### Issue 1: Time Preferences Not Considered During Reschedule
**Problem**: When user requests reschedule with a time preference (e.g., "reschedule to next Wednesday"), the system doesn't preserve this preference when proceeding to booking flow. The `checkAvailability()` function extracts date/time from `userMessage`, but during reschedule confirmation, `userMessage` is just "ok" (confirmation), not the original reschedule request.

**Root Cause**: 
- The date/time preference is extracted from the initial reschedule request message
- But when user confirms with "ok", the system proceeds to booking flow
- `checkAvailability()` is called with `userMessage = "ok"`, which has no date/time information
- The original date/time preference stored in `session.dateTimePreference` is not being used

**Evidence from logs**:
```
📅 [AVAILABILITY] Extracted date preference: { date: null, time: null }
```

### Issue 2: Cancelled Slot Not Excluded from Available Slots
**Problem**: When rescheduling, the system cancels the old appointment, making that slot available again. But `checkAvailability()` doesn't know about the cancelled slot, so it might offer the same time slot again.

**Root Cause**:
- `handleReschedule()` cancels the old booking
- Then it proceeds to booking flow which calls `checkAvailability()`
- `checkAvailability()` fetches fresh slots from Google Calendar API
- The cancelled slot is now available again and might be selected
- No mechanism to exclude the just-cancelled slot

**Impact**: User might get the same time slot they just cancelled, which defeats the purpose of rescheduling.

---

## Change Plan

### Fix 1: Preserve Date/Time Preference During Reschedule

#### Step 1.1: Extract and Store Date/Time Preference in `handleReschedule()`
**Location**: `src/openaiHandler.js`, `handleReschedule()` function, Phase 1 (when reschedule intent is first detected)

**Current behavior**: Only finds bookings and asks for confirmation

**New behavior**: 
- Extract date/time preference from `userMessage` using AI extraction (similar to how it's done in `generateResponse()`)
- Store it in `session.dateTimePreference` BEFORE asking for confirmation
- This ensures the preference is preserved even when user confirms with "ok"

**Implementation**:
```javascript
// In handleReschedule(), Phase 1, after finding bookings but before asking confirmation
// Extract date/time preference from the reschedule request
if (validated.dateTimeText && !session.dateTimePreference) {
  sessionManager.updateSession(session.conversationId, {
    dateTimePreference: validated.dateTimeText
  });
  session.dateTimePreference = validated.dateTimeText;
  console.log('✅ [RESCHEDULE] Stored date/time preference:', validated.dateTimeText);
}
```

**But wait**: We need to extract `dateTimeText` from the user message. The extraction happens in `generateResponse()` using combined AI call. We need to do the same extraction in `handleReschedule()`.

**Better approach**: 
- In `generateResponse()`, when reschedule intent is detected, extract date/time preference BEFORE calling `handleReschedule()`
- Store it in session
- Then call `handleReschedule()` which will use the stored preference

**Alternative approach** (simpler):
- Modify `checkAvailability()` to check `session.dateTimePreference` if `userMessage` doesn't contain date/time info
- This way, the preference stored from the initial reschedule request will be used

#### Step 1.2: Update `checkAvailability()` to Use Stored Preference
**Location**: `src/openaiHandler.js`, `checkAvailability()` function, around line 1944

**Current code**:
```javascript
const datePreference = await this.extractDateTimeWithAI(userMessage, new Date());
```

**New code**:
```javascript
// Extract date/time preference from user message OR use stored preference
let datePreference;
if (userMessage && userMessage.trim() !== 'ok' && userMessage.trim() !== 'yes') {
  // User message contains date/time info, extract it
  datePreference = await this.extractDateTimeWithAI(userMessage, new Date());
} else if (session.dateTimePreference) {
  // User message is just confirmation, use stored preference
  console.log('📅 [AVAILABILITY] Using stored date/time preference:', session.dateTimePreference);
  datePreference = await this.extractDateTimeWithAI(session.dateTimePreference, new Date());
} else {
  // No preference available
  datePreference = { date: null, time: null };
}
```

**Rationale**: This ensures that when user confirms reschedule with "ok", the system uses the date/time preference from the original reschedule request.

---

### Fix 2: Exclude Cancelled Slot from Available Slots

#### Step 2.1: Store Cancelled Slot Information in Session
**Location**: `src/openaiHandler.js`, `handleReschedule()` function, after cancelling old booking (around line 2973)

**Current code**:
```javascript
// Clear reschedule state and proceed to booking flow
sessionManager.updateSession(session.conversationId, {
  existingBookingToReschedule: null,
  rescheduleConfirmationPending: false,
  eventId: null,
  bookingConfirmed: false
});
```

**New code**:
```javascript
// Store cancelled slot info to exclude it from available slots
const cancelledSlotInfo = {
  calendarId: booking.calendarId,
  startTime: booking.startTime instanceof Date ? booking.startTime : new Date(booking.startTime),
  endTime: booking.endTime instanceof Date ? booking.endTime : new Date(booking.endTime),
  doctor: booking.doctor
};

// Clear reschedule state and proceed to booking flow
sessionManager.updateSession(session.conversationId, {
  existingBookingToReschedule: null,
  rescheduleConfirmationPending: false,
  eventId: null,
  bookingConfirmed: false,
  cancelledSlotToExclude: cancelledSlotInfo // Store cancelled slot info
});
session.cancelledSlotToExclude = cancelledSlotInfo;
```

#### Step 2.2: Add `cancelledSlotToExclude` to Session Structure
**Location**: `src/sessionManager.js`, `createNewSession()` function

**Add**:
```javascript
cancelledSlotToExclude: null, // { calendarId, startTime, endTime, doctor } - slot to exclude during reschedule
```

#### Step 2.3: Update `checkAvailability()` to Exclude Cancelled Slot
**Location**: `src/openaiHandler.js`, `checkAvailability()` function, after fetching slots (around line 1958)

**Current code**:
```javascript
const validSlots = slots.filter(slot => {
  // If dentist specified, only include that dentist's slots
  if (dentistToUse && slot.doctor !== dentistToUse) return false;
  // Filter by working hours
  const hour = slot.startTime.getHours();
  const minute = slot.startTime.getMinutes();
  const timeMinutes = hour * 60 + minute;
  return timeMinutes >= workingStartMinutes && timeMinutes < workingEndMinutes;
});
```

**New code**:
```javascript
const validSlots = slots.filter(slot => {
  // If dentist specified, only include that dentist's slots
  if (dentistToUse && slot.doctor !== dentistToUse) return false;
  // Filter by working hours
  const hour = slot.startTime.getHours();
  const minute = slot.startTime.getMinutes();
  const timeMinutes = hour * 60 + minute;
  if (timeMinutes < workingStartMinutes || timeMinutes >= workingEndMinutes) return false;
  
  // Exclude cancelled slot if rescheduling
  if (session.cancelledSlotToExclude) {
    const cancelled = session.cancelledSlotToExclude;
    const slotStart = slot.startTime.getTime();
    const slotEnd = slotStart + (slot.duration * 60 * 1000);
    const cancelledStart = cancelled.startTime instanceof Date 
      ? cancelled.startTime.getTime() 
      : new Date(cancelled.startTime).getTime();
    const cancelledEnd = cancelled.endTime instanceof Date 
      ? cancelled.endTime.getTime() 
      : new Date(cancelled.endTime).getTime();
    
    // Exclude if slot overlaps with cancelled slot (same calendar, overlapping time)
    if (slot.doctor === cancelled.doctor && 
        slotStart < cancelledEnd && 
        slotEnd > cancelledStart) {
      console.log('🚫 [AVAILABILITY] Excluding cancelled slot:', {
        cancelled: cancelledStart,
        slot: slotStart
      });
      return false;
    }
  }
  
  return true;
});
```

#### Step 2.4: Clear `cancelledSlotToExclude` After Booking
**Location**: `src/openaiHandler.js`, `confirmBooking()` function, after successful booking (around line 2347)

**Add**:
```javascript
sessionManager.updateSession(session.conversationId, {
  bookingConfirmed: true,
  bookingConfirmationPending: false,
  eventId: result.eventId,
  selectedSlot: null,
  existingBooking: bookingDetails,
  cancelledSlotToExclude: null // Clear cancelled slot exclusion after booking
});
```

**Also update local session**:
```javascript
session.cancelledSlotToExclude = null;
```

---

## Implementation Order

1. **Fix 1.2** - Update `checkAvailability()` to use stored preference (simpler, addresses Issue 1)
2. **Fix 2.1** - Store cancelled slot info in session
3. **Fix 2.2** - Add `cancelledSlotToExclude` to session structure
4. **Fix 2.3** - Update `checkAvailability()` to exclude cancelled slot
5. **Fix 2.4** - Clear `cancelledSlotToExclude` after booking

**Note**: Fix 1.1 might not be needed if Fix 1.2 works correctly, because the date/time preference should already be extracted in `generateResponse()` before calling `handleReschedule()`. But we should verify this.

---

## Testing Scenarios

### Test 1: Time Preference Preservation
1. User: "I want to reschedule to next Wednesday at 2pm"
2. System: Finds booking, asks for confirmation
3. User: "yes"
4. System: Cancels old booking, proceeds to booking
5. **Expected**: System should find slots for next Wednesday around 2pm
6. **Current**: System finds earliest available slot (ignores preference)

### Test 2: Cancelled Slot Exclusion
1. User has appointment on Dec 18 at 4:45 PM
2. User: "I want to reschedule"
3. System: Finds booking, asks for confirmation
4. User: "yes"
5. System: Cancels Dec 18 4:45 PM appointment
6. System: Proceeds to find new slots
7. **Expected**: Dec 18 4:45 PM slot should NOT be offered
8. **Current**: Dec 18 4:45 PM slot might be offered again

---

## Additional Considerations

1. **Edge Case**: What if the cancelled slot is the only available slot? Should we still exclude it?
   - **Answer**: Yes, exclude it. User explicitly wants a different time.

2. **Edge Case**: What if user reschedules multiple times in the same session?
   - **Answer**: Only exclude the most recently cancelled slot. Previous cancellations are already in the calendar.

3. **Performance**: Filtering slots adds minimal overhead, acceptable.

4. **Logging**: Add logging when excluding cancelled slot for debugging.

---

## Summary

- **Issue 1 Fix**: Make `checkAvailability()` use `session.dateTimePreference` when `userMessage` is just confirmation
- **Issue 2 Fix**: Store cancelled slot info in session and filter it out in `checkAvailability()`

Both fixes are localized and shouldn't impact other flows.
