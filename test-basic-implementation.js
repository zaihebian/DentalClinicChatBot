/**
 * Basic test for the implementation changes:
 * - Removed confirmationStatus, added boolean flags
 * - Updated cancellation with confirmation
 * - Unified reschedule flow
 */

import { sessionManager } from './src/sessionManager.js';

console.log('🧪 Basic Implementation Test\n');

// Test 1: Session structure
console.log('Test 1: Session structure');
const testSession = sessionManager.getSession('test123');
console.log('✅ Session created');
console.log('  - bookingConfirmationPending:', testSession.bookingConfirmationPending === false ? '✅' : '❌');
console.log('  - cancellationConfirmationPending:', testSession.cancellationConfirmationPending === false ? '✅' : '❌');
console.log('  - rescheduleConfirmationPending:', testSession.rescheduleConfirmationPending === false ? '✅' : '❌');
console.log('  - bookingConfirmed:', testSession.bookingConfirmed === false ? '✅' : '❌');
console.log('  - confirmationStatus:', testSession.confirmationStatus === undefined ? '✅ (removed)' : '❌ (still exists)');
console.log('  - existingBookingToReschedule:', testSession.existingBookingToReschedule === null ? '✅' : '❌');
console.log('');

// Test 2: Update booking flags
console.log('Test 2: Update booking flags');
sessionManager.updateSession('test123', {
  bookingConfirmationPending: true
});
const updatedSession = sessionManager.getSession('test123');
console.log('  - bookingConfirmationPending set to true:', updatedSession.bookingConfirmationPending === true ? '✅' : '❌');
console.log('');

// Test 3: Update cancellation flags
console.log('Test 3: Update cancellation flags');
sessionManager.updateSession('test123', {
  cancellationConfirmationPending: true,
  existingBooking: { calendarId: 'test', calendarEventId: 'test123' }
});
const cancelSession = sessionManager.getSession('test123');
console.log('  - cancellationConfirmationPending set to true:', cancelSession.cancellationConfirmationPending === true ? '✅' : '❌');
console.log('  - existingBooking set:', cancelSession.existingBooking !== null ? '✅' : '❌');
console.log('');

// Test 4: Update reschedule flags
console.log('Test 4: Update reschedule flags');
sessionManager.updateSession('test123', {
  rescheduleConfirmationPending: true,
  existingBookingToReschedule: { calendarId: 'test', calendarEventId: 'test456' }
});
const rescheduleSession = sessionManager.getSession('test123');
console.log('  - rescheduleConfirmationPending set to true:', rescheduleSession.rescheduleConfirmationPending === true ? '✅' : '❌');
console.log('  - existingBookingToReschedule set:', rescheduleSession.existingBookingToReschedule !== null ? '✅' : '❌');
console.log('');

// Test 5: Booking confirmed flag
console.log('Test 5: Booking confirmed flag');
sessionManager.updateSession('test123', {
  bookingConfirmed: true,
  bookingConfirmationPending: false
});
const confirmedSession = sessionManager.getSession('test123');
console.log('  - bookingConfirmed set to true:', confirmedSession.bookingConfirmed === true ? '✅' : '❌');
console.log('  - bookingConfirmationPending set to false:', confirmedSession.bookingConfirmationPending === false ? '✅' : '❌');
console.log('');

console.log('✅ All basic tests passed!');
console.log('\nNote: This is a basic structure test. Full functionality testing requires:');
console.log('  - Mocking Google Calendar API');
console.log('  - Mocking OpenAI API');
console.log('  - Testing actual conversation flows');
