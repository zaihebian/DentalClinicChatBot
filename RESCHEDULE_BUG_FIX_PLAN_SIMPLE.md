# Reschedule Bug Fix Plan - Minimal Changes

## Approach: Minimal, Targeted Changes Only

Both fixes require small, localized changes that won't affect other flows.

---

## Fix 1: Use Stored Date/Time Preference (1 change)

### Change: Update `checkAvailability()` date preference extraction
**Location**: `src/openaiHandler.js`, line ~1946

**Current**:
```javascript
const datePreference = await this.extractDateTimeWithAI(userMessage, new Date());
```

**Change to**:
```javascript
// Use stored preference ONLY if we're in reschedule flow (cancelledSlotToExclude exists)
// This ensures we don't mix reschedule flow with normal booking flow
const datePreference = session.cancelledSlotToExclude && session.dateTimePreference
  ? await this.extractDateTimeWithAI(session.dateTimePreference, new Date())
  : await this.extractDateTimeWithAI(userMessage, new Date());
```

**Why this works**: 
- Only applies during reschedule flow (when `cancelledSlotToExclude` exists)
- Normal booking flow: unchanged (no `cancelledSlotToExclude`, uses `userMessage` as before)
- Normal cancellation: unchanged (no `cancelledSlotToExclude`)
- Reschedule: Uses stored preference from original request
- Minimal change - isolated to reschedule flow only

---

## Fix 2: Exclude Cancelled Slot (3 small changes)

### Change 1: Add field to session structure
**Location**: `src/sessionManager.js`, line ~174 (after `dateTimePreference`)

**Add**:
```javascript
cancelledSlotToExclude: null, // { startTime, endTime, doctor } - exclude this slot during reschedule
```

### Change 2: Store cancelled slot when cancelling
**Location**: `src/openaiHandler.js`, line ~2974 (in `handleReschedule()`, after cancelling)

**Find**:
```javascript
// Clear reschedule state and proceed to booking flow
sessionManager.updateSession(session.conversationId, {
  existingBookingToReschedule: null,
  rescheduleConfirmationPending: false,
  eventId: null,
  bookingConfirmed: false
});
```

**Change to**:
```javascript
// Store cancelled slot to exclude it from available slots
const cancelledSlot = {
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
  cancelledSlotToExclude: cancelledSlot
});
session.cancelledSlotToExclude = cancelledSlot;
```

### Change 3: Filter out cancelled slot in `checkAvailability()`
**Location**: `src/openaiHandler.js`, line ~1958 (in the `validSlots` filter)

**Find**:
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

**Change to**:
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
    
    // Exclude if same doctor and overlapping time
    if (slot.doctor === cancelled.doctor && 
        slotStart < cancelledEnd && slotEnd > cancelledStart) {
      return false;
    }
  }
  
  return true;
});
```

### Change 4: Clear cancelled slot after booking
**Location**: `src/openaiHandler.js`, line ~2347 (in `confirmBooking()`, after successful booking)

**Find**:
```javascript
sessionManager.updateSession(session.conversationId, {
  bookingConfirmed: true,
  bookingConfirmationPending: false,
  eventId: result.eventId,
  selectedSlot: null,
  existingBooking: bookingDetails,
});
```

**Change to**:
```javascript
sessionManager.updateSession(session.conversationId, {
  bookingConfirmed: true,
  bookingConfirmationPending: false,
  eventId: result.eventId,
  selectedSlot: null,
  existingBooking: bookingDetails,
  cancelledSlotToExclude: null
});
session.cancelledSlotToExclude = null;
```

---

## Summary

**Total Changes**: 4 small, localized changes
1. One line change in `checkAvailability()` for date preference
2. One field added to session structure
3. One block added when cancelling (stores cancelled slot)
4. One filter condition added in `checkAvailability()` (excludes cancelled slot)
5. One line added when booking succeeds (clears cancelled slot)

**Risk**: Very low - changes are isolated and don't affect other flows
- Fix 1: Only affects behavior when `userMessage` is "ok"/"yes" AND preference exists
- Fix 2: Only affects slot filtering when `cancelledSlotToExclude` exists (only during reschedule)

**Testing**: 
- Normal booking flow: Unchanged (no cancelled slot, no "ok" confirmation)
- Normal cancellation: Unchanged (no cancelled slot stored)
- Reschedule: Both fixes apply, should work correctly
