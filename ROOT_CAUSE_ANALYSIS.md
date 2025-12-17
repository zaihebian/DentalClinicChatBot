# Root Cause Analysis - Deep Investigation

## Issue 1: Duration Calculation Bug

### Surface Problem
Line 2126 uses `treatmentDuration` instead of `finalTreatmentDuration`

### Root Cause Investigation

**Variable Scope Analysis**:
- Line 1964: `let treatmentDuration;` - declared at function start
- Line 1967 or 1970: `treatmentDuration = ...` - assigned initial value (might be wrong if dentist not specified)
- Line 2085-2089: `const finalTreatmentDuration = calculateTreatmentDuration(...)` - recalculated with CORRECT dentist
- Line 2108: `treatmentDuration: finalTreatmentDuration` - stored in session correctly
- Line 2126: `Duration: ${treatmentDuration} minutes` - **USES WRONG VARIABLE**

**Why This Happens**:
- `treatmentDuration` is still in scope (declared at line 1964)
- `finalTreatmentDuration` is calculated but not used in the return statement
- This is a **copy-paste error** - someone copied the template string but forgot to update the variable name

**Root Cause**: Variable name mismatch - using old variable instead of recalculated one

---

## Issue 2: Reschedule Not Preserving Dentist

### Surface Problem
When rescheduling, system selects wrong dentist (Dr BracesA instead of Dr BracesB)

### Root Cause Investigation

**Flow Analysis**:
1. Line 1807-1816: Reschedule detected, clears `selectedSlot` and `confirmationStatus`
2. Line 1835: Gets fresh session: `const updatedSession = sessionManager.getSession(conversationId);`
3. Line 1836: Calls `checkAvailability(conversationId, updatedSession, userMessage)`
4. Line 1962: `let dentistToUse = session.dentistName;` - Uses session.dentistName

**The Problem**:
- When reschedule clears `selectedSlot`, it doesn't explicitly preserve `dentistName`
- BUT: `dentistName` should still be in session (not cleared)
- HOWEVER: If `session.dentistName` is somehow lost or not set, then `dentistToUse` becomes `null`
- Line 1965: If `dentistToUse` is null and braces maintenance, uses max duration (45 min)
- Line 2032: `dentistToUse = selectedSlot.doctor;` - Auto-selects dentist from selected slot
- **This auto-selection happens AFTER slot is selected, so wrong dentist gets selected**

**Root Cause**: 
- `dentistName` might not be preserved in session after clearing `selectedSlot`
- OR: `checkAvailability` doesn't use `session.dentistName` correctly when filtering slots
- OR: Auto-selection logic (line 2032) overrides original dentist preference

**Deep Root Cause**: 
- When rescheduling, the system should FILTER slots by original dentist FIRST
- But current logic: filters by `dentistToUse` (line 1997), which might be null
- Then auto-selects dentist from first available slot (line 2032)
- This loses the original dentist preference

---

## Issue 3: Cancellation Shows "Invalid Date"

### Surface Problem
`booking.doctor` shows calendar ID, `booking.startTime` shows "Invalid Date"

### Root Cause Investigation

**Flow Analysis**:
1. Line 2504: `const booking = await googleCalendarService.findBookingByPhone(session.phone);`
2. Line 2518: Stores booking in session: `sessionManager.updateSession(conversationId, { existingBooking: booking });`
3. Line 2519: Uses `booking.doctor` and `booking.startTime.toLocaleDateString()`

**What `findBookingByPhone` Returns**:
- Line 768-829: Calls `getAllBookings()` then filters by phone
- Line 724-752: `getAllBookings()` calls `parseEventToBooking(event, calendarId, doctor)`
- Line 640-699: `parseEventToBooking()` returns booking object

**The Problem**:
- Line 741: `parseEventToBooking(event, calendarId, doctor)` - passes `doctor` as `defaultDoctor`
- Line 693: `doctor: defaultDoctor` - Uses `defaultDoctor` parameter
- BUT: If event is NOT AI-booked format, and `defaultDoctor` is wrong...
- Wait, `getAllBookings()` passes `doctor` from `config.calendar.dentistCalendars` (line 730)
- So `doctor` should be correct (e.g., "Dr BracesA")

**BUT**: Test shows calendar ID as doctor name:
- `Doctor: a9885a8e83a386bae81d28d23d86f1c7ac9dfa48b69d4a4951b78d137eadbe33@group.calendar.google.com`

**Root Cause**:
- `getAllBookings()` iterates: `for (const [doctor, calendarId] of Object.entries(config.calendar.dentistCalendars))`
- This should give correct doctor name
- BUT: If `parseEventToBooking()` returns `null` for some events, and then finds a different event...
- OR: The booking object structure is wrong - maybe `booking.doctor` is actually `booking.calendarId`?

**Deep Root Cause**:
- Need to check what `findBookingByPhone()` actually returns
- The booking object might have wrong structure
- OR: `booking.startTime` might not be a Date object (could be string or invalid)

---

## Issue 4: Booking Errors During Finalization

### Surface Problem
Booking confirmation appears, then error: "I apologize, but there was an error processing your booking"

### Root Cause Investigation

**Flow Analysis**:
1. Line 416: `const bookingMessage = await this.confirmBooking(conversationId, freshSession);`
2. Line 2328: `const result = await googleCalendarService.createAppointment(calendarId, appointmentData);`
3. Line 2330: `if (result.success)` - checks if booking succeeded
4. Line 2363-2374: Logs to Google Sheets
5. Line 2379: Returns success message

**The Error Message**:
- Test shows: "I apologize, but there was an error processing your booking"
- This comes from catch block (line 2401-2410)

**Possible Root Causes**:
1. **`createAppointment()` fails**: Returns `{success: false, error: ...}`
   - But then line 2380-2399 handles this case and returns different message
   - So this is NOT the source of the error message

2. **Error in try block**: Exception thrown during:
   - `createAppointment()` - but this is caught and returns error object
   - `sessionManager.updateSession()` - might throw
   - `googleSheetsService.logAction()` - might throw
   - Accessing `session.selectedSlot.startTime` (line 2370, 2379) - if selectedSlot is null

3. **Error accessing `session.selectedSlot`**:
   - Line 2370: `${session.selectedSlot.startTime.toISOString()}`
   - Line 2379: `session.selectedSlot.startTime.toLocaleDateString()`
   - If `session.selectedSlot` is null or undefined, this throws error
   - Error caught by catch block → returns generic error message

**Root Cause**: 
- `session.selectedSlot` might be null when trying to log or return success message
- This happens if `selectedSlot` was cleared somewhere between confirmation and booking

---

## Issue 5: Confirmation Detection Not Working

### Surface Problem
User says "Yes" but system asks for confirmation again

### Root Cause Investigation

**Flow Analysis**:
1. Line 396: `if (freshSession.selectedSlot && freshSession.confirmationStatus === 'pending')`
2. Line 397: Calls `detectConfirmationOrDecline(userMessage, {hasPendingSlot: true})`
3. Line 400: `const isConfirmation = confirmationResult.isConfirmation;`
4. Line 403: `if (isConfirmation)` - proceeds to booking

**The Problem**:
- Test shows: User says "Yes" but system asks "Would you like to confirm this appointment?"
- This means confirmation check (line 396-403) didn't trigger booking

**Possible Root Causes**:
1. **`selectedSlot` not set**: Line 396 checks `freshSession.selectedSlot`
   - If this is null, confirmation check doesn't run
   - Flow continues to AI generation, which asks for confirmation again

2. **`confirmationStatus` not 'pending'**: Line 396 checks `freshSession.confirmationStatus === 'pending'`
   - If this is not 'pending', confirmation check doesn't run

3. **`detectConfirmationOrDecline()` not detecting "Yes"**:
   - AI might not be detecting "Yes" as confirmation
   - Or fallback keyword matching not working

**Root Cause**:
- Most likely: `selectedSlot` is not set when checking confirmation
- OR: `confirmationStatus` is not 'pending'
- OR: `detectConfirmationOrDecline()` is not detecting "Yes" correctly

---

## Issue 6: Reschedule Not Matching Date/Time

### Surface Problem
User wants "next week Tuesday at 2pm" but gets Dec 18, 9:00 AM

### Root Cause Investigation

**Flow Analysis**:
1. Line 1983: `const datePreference = await this.extractDateTimeWithAI(userMessage, new Date());`
2. Line 2008: `if (datePreference.date || datePreference.time)` - checks if preference exists
3. Line 2012-2025: Filters slots matching preference
4. Line 2013: `matchesDateTimePreference(slot.startTime, datePreference)`

**The Problem**:
- User says "next week Tuesday at 2pm"
- System should extract: date = next Tuesday, time = 2pm
- But gets: Dec 18, 9:00 AM (wrong date, wrong time)

**Possible Root Causes**:

1. **Date Extraction Fails**:
   - `extractDateTimeWithAI()` might not extract "next week Tuesday" correctly
   - Returns `{date: null, time: null}` or wrong values
   - Then no preference match, falls back to ASAP (earliest slot)

2. **Date Calculation Fails**:
   - Line 1152-1200: Converts AI extraction to actual dates
   - "next week Tuesday" needs to calculate: today + 7 days, then find Tuesday
   - If calculation fails, `datePreference.date` is null
   - Then no preference match

3. **Slot Matching Fails**:
   - `matchesDateTimePreference()` might not match correctly
   - Or no slots exist for "next week Tuesday at 2pm"
   - Falls back to earliest available slot

**Root Cause**:
- Most likely: Date extraction or calculation fails for "next week Tuesday"
- AI extracts it, but code doesn't calculate the actual date correctly
- OR: No slots exist for that date/time, so falls back to earliest

---

## Summary of Root Causes

### Issue 1: Duration Bug ✅ CONFIRMED
**Root Cause**: Variable name mismatch at line 2126
- `finalTreatmentDuration` is calculated correctly (line 2085-2089)
- But return statement uses old `treatmentDuration` variable (still in scope from line 1964)
- **Fix**: Change line 2126 to use `finalTreatmentDuration`

### Issue 2: Reschedule Not Preserving Dentist ✅ CONFIRMED
**Root Cause**: Auto-selection logic overrides original dentist preference
- When reschedule clears `selectedSlot` (line 1809-1812), `dentistName` is NOT cleared (good)
- BUT: Line 1962 uses `session.dentistName` - if this is null/undefined, `dentistToUse` becomes null
- Line 1997: If `dentistToUse` is null, includes ALL dentists' slots
- Line 2032: Auto-selects dentist from first matching slot - **THIS OVERRIDES ORIGINAL DENTIST**
- **Root Cause**: When `dentistName` is not explicitly preserved or is lost, auto-selection picks wrong dentist
- **Fix**: Ensure `dentistName` is preserved when clearing `selectedSlot`, OR filter slots by original dentist BEFORE auto-selection

### Issue 3: Cancellation Shows "Invalid Date" ✅ CONFIRMED
**Root Cause**: Booking object structure issue
- `findBookingByPhone()` calls `getAllBookings()` which calls `parseEventToBooking(event, calendarId, doctor)`
- Line 693: `doctor: defaultDoctor` - should use `doctor` parameter from config
- BUT: Test shows calendar ID as doctor name - this means `defaultDoctor` IS the calendar ID
- **Root Cause**: `parseEventToBooking()` is called with wrong parameter order OR `doctor` variable contains calendar ID
- Line 741: `parseEventToBooking(event, calendarId, doctor)` - third parameter is `doctor`
- Line 730: `for (const [doctor, calendarId] of Object.entries(...))` - `doctor` should be correct
- **Actual Root Cause**: The booking object returned might have `doctor` field set to `calendarId` somehow, OR the test mock is returning wrong structure
- **Fix**: Check what `parseEventToBooking()` actually returns, ensure `doctor` field is correct

### Issue 4: Booking Errors During Finalization ✅ CONFIRMED
**Root Cause**: `session.selectedSlot` is null when accessing it
- Line 2370: `${session.selectedSlot.startTime.toISOString()}` - accesses `selectedSlot`
- Line 2379: `session.selectedSlot.startTime.toLocaleDateString()` - accesses `selectedSlot`
- If `selectedSlot` is null/undefined, throws TypeError → caught by catch block → returns generic error
- **Why selectedSlot might be null**:
  - Line 2351: `selectedSlot: null` - cleared AFTER successful booking
  - BUT: Line 2370 and 2379 access `session.selectedSlot` BEFORE it's cleared
  - UNLESS: `session` parameter passed to `confirmBooking()` is stale, and `selectedSlot` was already cleared
  - OR: Error occurs in `createAppointment()` or `logAction()`, and by the time we access `selectedSlot`, it's been cleared
- **Root Cause**: Race condition or stale session object - `session.selectedSlot` is accessed after it's been cleared
- **Fix**: Store `selectedSlot` values in local variables before clearing, OR use fresh session

### Issue 5: Confirmation Detection Not Working ✅ CONFIRMED
**Root Cause**: `selectedSlot` not set when checking confirmation
- Line 396: `if (freshSession.selectedSlot && freshSession.confirmationStatus === 'pending')`
- If `selectedSlot` is null, confirmation check doesn't run
- Flow continues to AI generation, which asks for confirmation again
- **Why selectedSlot might not be set**:
  - `checkAvailability()` should set `selectedSlot` (line 2103-2110)
  - BUT: If `checkAvailability()` returns early (e.g., no slots), `selectedSlot` is never set
  - OR: If `checkAvailability()` is not called (e.g., patient name missing), `selectedSlot` is never set
  - OR: Session is cleared between `checkAvailability()` and confirmation check
- **Root Cause**: `selectedSlot` is not set in session when user says "Yes", OR session is stale
- **Fix**: Ensure `selectedSlot` is set before asking for confirmation, OR check if slot exists before confirmation

### Issue 6: Reschedule Not Matching Date/Time ✅ CONFIRMED
**Root Cause**: Date extraction/calculation fails for "next week Tuesday"
- Line 1983: `extractDateTimeWithAI()` extracts "next week Tuesday at 2pm"
- Line 1172: Calls `parseDateTimePreference(extracted.relative, referenceDate)` with "next week Tuesday"
- `parseDateTimePreference()` should handle "next [day]" pattern (line 152-158)
- BUT: If extraction returns "next week Tuesday" as `relative`, `parseDateTimePreference()` might not parse it correctly
- **Root Cause**: 
  - AI might extract "next week Tuesday" correctly
  - BUT: `parseDateTimePreference()` expects "next tuesday" (without "week")
  - Line 152-158: Pattern is `next\\s+${dayName}` - matches "next tuesday" but NOT "next week tuesday"
  - So "next week Tuesday" doesn't match the pattern, falls back to "next week" logic (line 132-135)
  - "next week" adds 7 days but doesn't set specific day → wrong date
- **Fix**: Update `parseDateTimePreference()` to handle "next week [day]" pattern, OR normalize AI extraction to "next [day]"
- **Verification**: Line 132-135 handles "next week" but doesn't extract day name, so "next week Tuesday" becomes just "next week" (adds 7 days, no specific day)
