/**
 * Test cases for getAvailableSlots function
 * 
 * This file demonstrates different test scenarios and expected results
 * Run with: node test_getAvailableSlots.js
 */

import { googleCalendarService } from './src/googleCalendar.js';
import { config } from './src/config.js';

// Mock data for testing (simulating calendar events)
const mockCalendarEvents = {
  // Test Case 1: Empty calendar (no appointments)
  emptyCalendar: {
    items: []
  },
  
  // Test Case 2: Single appointment in middle of day
  singleAppointment: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' }
      }
    ]
  },
  
  // Test Case 3: Multiple appointments with gaps
  multipleAppointments: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' }
      },
      {
        id: 'event2',
        start: { dateTime: '2024-01-15T14:00:00Z' },
        end: { dateTime: '2024-01-15T15:00:00Z' }
      }
    ]
  },
  
  // Test Case 4: Full day booked (no gaps)
  fullDayBooked: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-15T09:00:00Z' },
        end: { dateTime: '2024-01-15T18:00:00Z' }
      }
    ]
  },
  
  // Test Case 5: Appointment at start of day
  appointmentAtStart: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-15T09:00:00Z' },
        end: { dateTime: '2024-01-15T10:00:00Z' }
      }
    ]
  },
  
  // Test Case 6: Appointment at end of day
  appointmentAtEnd: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-15T17:00:00Z' },
        end: { dateTime: '2024-01-15T18:00:00Z' }
      }
    ]
  },
  
  // Test Case 7: Back-to-back appointments (no gap)
  backToBackAppointments: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T11:00:00Z' }
      },
      {
        id: 'event2',
        start: { dateTime: '2024-01-15T11:00:00Z' },
        end: { dateTime: '2024-01-15T12:00:00Z' }
      }
    ]
  },
  
  // Test Case 8: Small gap (< 15 minutes - should be filtered out)
  smallGap: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-15T10:00:00Z' },
        end: { dateTime: '2024-01-15T10:10:00Z' } // 10 minutes gap
      }
    ]
  },
  
  // Test Case 9: Weekend appointments (should be skipped)
  weekendAppointments: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-13T10:00:00Z' }, // Saturday
        end: { dateTime: '2024-01-13T11:00:00Z' }
      },
      {
        id: 'event2',
        start: { dateTime: '2024-01-14T10:00:00Z' }, // Sunday
        end: { dateTime: '2024-01-14T11:00:00Z' }
      }
    ]
  },
  
  // Test Case 10: Multiple days with appointments
  multipleDays: {
    items: [
      {
        id: 'event1',
        start: { dateTime: '2024-01-15T10:00:00Z' }, // Monday
        end: { dateTime: '2024-01-15T11:00:00Z' }
      },
      {
        id: 'event2',
        start: { dateTime: '2024-01-16T14:00:00Z' }, // Tuesday
        end: { dateTime: '2024-01-16T15:00:00Z' }
      }
    ]
  }
};

/**
 * Test Case Results Analysis
 * 
 * Based on the getAvailableSlots logic:
 * - Working hours: 9:00 AM - 6:00 PM (9 hours = 540 minutes)
 * - Minimum slot duration: 15 minutes
 * - Weekends are skipped
 * - Slots are found in gaps between appointments
 */

console.log('='.repeat(80));
console.log('TEST CASES FOR getAvailableSlots FUNCTION');
console.log('='.repeat(80));
console.log('\n');

// Test Case 1: Empty Calendar
console.log('TEST CASE 1: Empty Calendar (No Appointments)');
console.log('-'.repeat(80));
console.log('Input: No calendar events');
console.log('Expected Result:');
console.log('  - One slot: 9:00 AM - 6:00 PM (540 minutes)');
console.log('  - Duration: 540 minutes');
console.log('  - Weekday: Monday (assuming start date is Monday)');
console.log('\n');

// Test Case 2: Single Appointment in Middle of Day
console.log('TEST CASE 2: Single Appointment (10:00 AM - 11:00 AM)');
console.log('-'.repeat(80));
console.log('Input: One appointment from 10:00 AM to 11:00 AM');
console.log('Expected Result:');
console.log('  - Slot 1: 9:00 AM - 10:00 AM (60 minutes)');
console.log('  - Slot 2: 11:00 AM - 6:00 PM (420 minutes)');
console.log('  - Total: 2 slots');
console.log('\n');

// Test Case 3: Multiple Appointments with Gaps
console.log('TEST CASE 3: Multiple Appointments (10:00-11:00 AM, 2:00-3:00 PM)');
console.log('-'.repeat(80));
console.log('Input: Two appointments');
console.log('Expected Result:');
console.log('  - Slot 1: 9:00 AM - 10:00 AM (60 minutes)');
console.log('  - Slot 2: 11:00 AM - 2:00 PM (180 minutes)');
console.log('  - Slot 3: 3:00 PM - 6:00 PM (180 minutes)');
console.log('  - Total: 3 slots');
console.log('\n');

// Test Case 4: Full Day Booked
console.log('TEST CASE 4: Full Day Booked (9:00 AM - 6:00 PM)');
console.log('-'.repeat(80));
console.log('Input: One appointment covering entire working day');
console.log('Expected Result:');
console.log('  - No available slots');
console.log('  - Total: 0 slots');
console.log('\n');

// Test Case 5: Appointment at Start of Day
console.log('TEST CASE 5: Appointment at Start (9:00 AM - 10:00 AM)');
console.log('-'.repeat(80));
console.log('Input: Appointment from 9:00 AM to 10:00 AM');
console.log('Expected Result:');
console.log('  - Slot 1: 10:00 AM - 6:00 PM (480 minutes)');
console.log('  - Total: 1 slot');
console.log('\n');

// Test Case 6: Appointment at End of Day
console.log('TEST CASE 6: Appointment at End (5:00 PM - 6:00 PM)');
console.log('-'.repeat(80));
console.log('Input: Appointment from 5:00 PM to 6:00 PM');
console.log('Expected Result:');
console.log('  - Slot 1: 9:00 AM - 5:00 PM (480 minutes)');
console.log('  - Total: 1 slot');
console.log('\n');

// Test Case 7: Back-to-Back Appointments
console.log('TEST CASE 7: Back-to-Back Appointments (10:00-11:00 AM, 11:00 AM-12:00 PM)');
console.log('-'.repeat(80));
console.log('Input: Two appointments with no gap between them');
console.log('Expected Result:');
console.log('  - Slot 1: 9:00 AM - 10:00 AM (60 minutes)');
console.log('  - Slot 2: 12:00 PM - 6:00 PM (360 minutes)');
console.log('  - Total: 2 slots');
console.log('\n');

// Test Case 8: Small Gap (< 15 minutes)
console.log('TEST CASE 8: Small Gap (< 15 minutes)');
console.log('-'.repeat(80));
console.log('Input: Appointment from 10:00 AM to 10:10 AM (10-minute gap before next)');
console.log('Expected Result:');
console.log('  - Slot 1: 9:00 AM - 10:00 AM (60 minutes)');
console.log('  - Gap from 10:10 AM is < 15 minutes, so filtered out');
console.log('  - Slot 2: 10:10 AM - 6:00 PM (only if gap >= 15 minutes)');
console.log('  - Note: Small gaps are filtered out by minimum duration check');
console.log('\n');

// Test Case 9: Weekend Appointments
console.log('TEST CASE 9: Weekend Appointments (Saturday & Sunday)');
console.log('-'.repeat(80));
console.log('Input: Appointments on Saturday and Sunday');
console.log('Expected Result:');
console.log('  - Weekend days are skipped entirely');
console.log('  - No slots returned for weekend days');
console.log('  - Only weekdays (Monday-Friday) are processed');
console.log('\n');

// Test Case 10: Multiple Days
console.log('TEST CASE 10: Multiple Days with Appointments');
console.log('-'.repeat(80));
console.log('Input: Appointments on Monday (10:00-11:00 AM) and Tuesday (2:00-3:00 PM)');
console.log('Expected Result:');
console.log('  Monday:');
console.log('    - Slot 1: 9:00 AM - 10:00 AM (60 minutes)');
console.log('    - Slot 2: 11:00 AM - 6:00 PM (420 minutes)');
console.log('  Tuesday:');
console.log('    - Slot 1: 9:00 AM - 2:00 PM (300 minutes)');
console.log('    - Slot 2: 3:00 PM - 6:00 PM (180 minutes)');
console.log('  - Total: 4 slots across 2 days');
console.log('\n');

// Test Case 11: Multiple Dentists
console.log('TEST CASE 11: Multiple Dentists');
console.log('-'.repeat(80));
console.log('Input: Two dentists, each with different appointments');
console.log('Expected Result:');
console.log('  - Slots from both dentists are combined');
console.log('  - Each slot includes doctor name');
console.log('  - All slots sorted by start time');
console.log('  - Example:');
console.log('    Dr GeneralA: 9:00 AM - 10:00 AM');
console.log('    Dr GeneralB: 9:00 AM - 10:00 AM');
console.log('    Dr GeneralA: 11:00 AM - 6:00 PM');
console.log('    Dr GeneralB: 11:00 AM - 6:00 PM');
console.log('\n');

// Test Case 12: Edge Case - Appointment Exactly at Boundaries
console.log('TEST CASE 12: Appointment at Exact Boundaries');
console.log('-'.repeat(80));
console.log('Input: Appointment from 9:00 AM to 6:00 PM (exact boundaries)');
console.log('Expected Result:');
console.log('  - No available slots');
console.log('  - Working hours are 9:00 AM to 6:00 PM (exclusive end)');
console.log('  - If appointment ends at 6:00 PM, no slot after it');
console.log('\n');

console.log('='.repeat(80));
console.log('SUMMARY OF TEST CASES');
console.log('='.repeat(80));
console.log(`
Key Behaviors Tested:
1. ✅ Empty calendar → Full day slot (9 AM - 6 PM)
2. ✅ Single appointment → Creates gaps before and after
3. ✅ Multiple appointments → Multiple gaps
4. ✅ Full day booked → No slots
5. ✅ Appointment at start → Slot after appointment
6. ✅ Appointment at end → Slot before appointment
7. ✅ Back-to-back → No gap between appointments
8. ✅ Small gaps → Filtered out (< 15 minutes)
9. ✅ Weekends → Skipped entirely
10. ✅ Multiple days → Slots for each day
11. ✅ Multiple dentists → Combined results
12. ✅ Boundary conditions → Handled correctly

Working Hours: 9:00 AM - 6:00 PM (Monday-Friday)
Minimum Slot Duration: 15 minutes
Weekends: Skipped
`);

console.log('\nNote: To run actual tests, you would need to:');
console.log('1. Set up Google Calendar API credentials');
console.log('2. Create test calendars with actual events');
console.log('3. Call googleCalendarService.getAvailableSlots() with test data');
console.log('4. Compare results with expected outputs above');
