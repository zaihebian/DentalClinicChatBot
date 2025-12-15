/**
 * Comprehensive Test Suite for parseDateTimePreference Function
 * 
 * Tests all possible date/time parsing scenarios to ensure correctness
 * Run with: node test_dateParser.js
 */

import { parseDateTimePreference, matchesDateTimePreference } from './src/utils/dateParser.js';

// Helper function to format date for display
function formatDate(date) {
  if (!date) return 'null';
  return date.toISOString().split('T')[0] + ' ' + date.toLocaleDateString('en-US', { weekday: 'long' });
}

// Helper function to format time for display
function formatTime(time) {
  if (!time) return 'null';
  return `${time.hours}:${time.minutes.toString().padStart(2, '0')}`;
}

// Test runner
function runTest(testName, message, referenceDate, expectedResult) {
  const result = parseDateTimePreference(message, referenceDate);
  
  const dateMatch = !expectedResult.date && !result.date || 
                   (expectedResult.date && result.date && 
                    expectedResult.date.toISOString().split('T')[0] === result.date.toISOString().split('T')[0]);
  
  const timeMatch = !expectedResult.time && !result.time ||
                   (expectedResult.time && result.time &&
                    expectedResult.time.hours === result.time.hours &&
                    expectedResult.time.minutes === result.time.minutes);
  
  const passed = dateMatch && timeMatch;
  
  console.log(`${passed ? '✅' : '❌'} ${testName}`);
  if (!passed) {
    console.log(`   Input: "${message}"`);
    console.log(`   Expected: date=${formatDate(expectedResult.date)}, time=${formatTime(expectedResult.time)}`);
    console.log(`   Got:      date=${formatDate(result.date)}, time=${formatTime(result.time)}`);
  }
  
  return passed;
}

console.log('='.repeat(80));
console.log('COMPREHENSIVE TEST SUITE FOR parseDateTimePreference');
console.log('='.repeat(80));
console.log('\n');

// Set reference date: Wednesday, January 15, 2024, 2:00 PM
const referenceDate = new Date('2024-01-15T14:00:00Z');
console.log(`Reference Date: ${referenceDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
console.log(`Reference Time: ${referenceDate.toLocaleTimeString()}\n`);

let passedTests = 0;
let totalTests = 0;

// ============================================================================
// TEST GROUP 1: Relative Dates
// ============================================================================
console.log('TEST GROUP 1: Relative Dates');
console.log('-'.repeat(80));

// Test 1.1: "today"
totalTests++;
const test1_1 = runTest(
  '1.1: "today"',
  'today',
  referenceDate,
  { date: new Date('2024-01-15T00:00:00Z'), time: null, dateRange: null }
);
if (test1_1) passedTests++;

// Test 1.2: "tomorrow"
totalTests++;
const test1_2 = runTest(
  '1.2: "tomorrow"',
  'tomorrow',
  referenceDate,
  { date: new Date('2024-01-16T00:00:00Z'), time: null, dateRange: null }
);
if (test1_2) passedTests++;

// Test 1.3: "next week"
totalTests++;
const test1_3 = runTest(
  '1.3: "next week"',
  'next week',
  referenceDate,
  { date: new Date('2024-01-22T00:00:00Z'), time: null, dateRange: null }
);
if (test1_3) passedTests++;

// Test 1.4: Case insensitive - "TODAY"
totalTests++;
const test1_4 = runTest(
  '1.4: Case insensitive "TODAY"',
  'TODAY',
  referenceDate,
  { date: new Date('2024-01-15T00:00:00Z'), time: null, dateRange: null }
);
if (test1_4) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 2: Day of Week - Full Names
// ============================================================================
console.log('TEST GROUP 2: Day of Week - Full Names');
console.log('-'.repeat(80));

// Test 2.1: "Monday" (next occurrence - already passed this week)
totalTests++;
const test2_1 = runTest(
  '2.1: "Monday" (next occurrence)',
  'Monday',
  referenceDate,
  { date: new Date('2024-01-22T00:00:00Z'), time: null, dateRange: null } // Next Monday
);
if (test2_1) passedTests++;

// Test 2.2: "Thursday" (this week - hasn't passed)
totalTests++;
const test2_2 = runTest(
  '2.2: "Thursday" (this week)',
  'Thursday',
  referenceDate,
  { date: new Date('2024-01-18T00:00:00Z'), time: null, dateRange: null } // This Thursday
);
if (test2_2) passedTests++;

// Test 2.3: "next Monday" (always next week)
totalTests++;
const test2_3 = runTest(
  '2.3: "next Monday" (always next week)',
  'next Monday',
  referenceDate,
  { date: new Date('2024-01-22T00:00:00Z'), time: null, dateRange: null } // Next week's Monday
);
if (test2_3) passedTests++;

// Test 2.4: "this Thursday" (this week)
totalTests++;
const test2_4 = runTest(
  '2.4: "this Thursday" (this week)',
  'this Thursday',
  referenceDate,
  { date: new Date('2024-01-18T00:00:00Z'), time: null, dateRange: null } // This Thursday
);
if (test2_4) passedTests++;

// Test 2.5: "next Friday" - when today is Monday, "next Friday" means this Friday (hasn't passed yet)
// But "next [day]" typically means next week. Let's test with a case where Friday already passed
// Use Friday as reference to test "next Friday" = next week's Friday
const fridayRefDate = new Date('2024-01-19T14:00:00Z'); // Friday, Jan 19, 2024
totalTests++;
const test2_5 = runTest(
  '2.5: "next Friday" (when today is Friday, next Friday = next week)',
  'next Friday',
  fridayRefDate,
  { date: new Date('2024-01-26T00:00:00Z'), time: null, dateRange: null } // Next week's Friday
);
if (test2_5) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 3: Day of Week - Abbreviations
// ============================================================================
console.log('TEST GROUP 3: Day of Week - Abbreviations');
console.log('-'.repeat(80));

// Test 3.1: "Mon"
totalTests++;
const test3_1 = runTest(
  '3.1: "Mon"',
  'Mon',
  referenceDate,
  { date: new Date('2024-01-22T00:00:00Z'), time: null, dateRange: null }
);
if (test3_1) passedTests++;

// Test 3.2: "Tue"
totalTests++;
const test3_2 = runTest(
  '3.2: "Tue"',
  'Tue',
  referenceDate,
  { date: new Date('2024-01-16T00:00:00Z'), time: null, dateRange: null } // Tomorrow
);
if (test3_2) passedTests++;

// Test 3.3: "Wed"
totalTests++;
const test3_3 = runTest(
  '3.3: "Wed"',
  'Wed',
  referenceDate,
  { date: new Date('2024-01-17T00:00:00Z'), time: null, dateRange: null } // Next Wednesday
);
if (test3_3) passedTests++;

// Test 3.4: "next Tue"
totalTests++;
const test3_4 = runTest(
  '3.4: "next Tue"',
  'next Tue',
  referenceDate,
  { date: new Date('2024-01-23T00:00:00Z'), time: null, dateRange: null } // Next week's Tuesday
);
if (test3_4) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 4: Time Parsing - Basic Formats
// ============================================================================
console.log('TEST GROUP 4: Time Parsing - Basic Formats');
console.log('-'.repeat(80));

// Test 4.1: "10am"
totalTests++;
const test4_1 = runTest(
  '4.1: "10am"',
  '10am',
  referenceDate,
  { date: null, time: { hours: 10, minutes: 0 }, dateRange: null }
);
if (test4_1) passedTests++;

// Test 4.2: "2pm"
totalTests++;
const test4_2 = runTest(
  '4.2: "2pm"',
  '2pm',
  referenceDate,
  { date: null, time: { hours: 14, minutes: 0 }, dateRange: null }
);
if (test4_2) passedTests++;

// Test 4.3: "10:30am"
totalTests++;
const test4_3 = runTest(
  '4.3: "10:30am"',
  '10:30am',
  referenceDate,
  { date: null, time: { hours: 10, minutes: 30 }, dateRange: null }
);
if (test4_3) passedTests++;

// Test 4.4: "2:30pm"
totalTests++;
const test4_4 = runTest(
  '4.4: "2:30pm"',
  '2:30pm',
  referenceDate,
  { date: null, time: { hours: 14, minutes: 30 }, dateRange: null }
);
if (test4_4) passedTests++;

// Test 4.5: "12am" (midnight)
totalTests++;
const test4_5 = runTest(
  '4.5: "12am" (midnight)',
  '12am',
  referenceDate,
  { date: null, time: { hours: 0, minutes: 0 }, dateRange: null }
);
if (test4_5) passedTests++;

// Test 4.6: "12pm" (noon)
totalTests++;
const test4_6 = runTest(
  '4.6: "12pm" (noon)',
  '12pm',
  referenceDate,
  { date: null, time: { hours: 12, minutes: 0 }, dateRange: null }
);
if (test4_6) passedTests++;

// Test 4.7: "10 o'clock"
totalTests++;
const test4_7 = runTest(
  '4.7: "10 o\'clock"',
  '10 o\'clock',
  referenceDate,
  { date: null, time: { hours: 10, minutes: 0 }, dateRange: null }
);
if (test4_7) passedTests++;

// Test 4.8: Case insensitive - "10AM"
totalTests++;
const test4_8 = runTest(
  '4.8: Case insensitive "10AM"',
  '10AM',
  referenceDate,
  { date: null, time: { hours: 10, minutes: 0 }, dateRange: null }
);
if (test4_8) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 5: Specific Dates
// ============================================================================
console.log('TEST GROUP 5: Specific Dates');
console.log('-'.repeat(80));

// Test 5.1: "12/25" (MM/DD format)
totalTests++;
const test5_1 = runTest(
  '5.1: "12/25" (MM/DD)',
  '12/25',
  referenceDate,
  { date: new Date('2024-12-25T00:00:00Z'), time: null, dateRange: null }
);
if (test5_1) passedTests++;

// Test 5.2: "1/5" (MM/DD format)
totalTests++;
const test5_2 = runTest(
  '5.2: "1/5" (MM/DD)',
  '1/5',
  referenceDate,
  { date: new Date('2024-01-05T00:00:00Z'), time: null, dateRange: null }
);
if (test5_2) passedTests++;

// Test 5.3: "2024-12-25" (YYYY-MM-DD format)
totalTests++;
const test5_3 = runTest(
  '5.3: "2024-12-25" (YYYY-MM-DD)',
  '2024-12-25',
  referenceDate,
  { date: new Date('2024-12-25T00:00:00Z'), time: null, dateRange: null }
);
if (test5_3) passedTests++;

// Test 5.4: "2025-01-01" (YYYY-MM-DD format)
totalTests++;
const test5_4 = runTest(
  '5.4: "2025-01-01" (YYYY-MM-DD)',
  '2025-01-01',
  referenceDate,
  { date: new Date('2025-01-01T00:00:00Z'), time: null, dateRange: null }
);
if (test5_4) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 6: Combined Date and Time
// ============================================================================
console.log('TEST GROUP 6: Combined Date and Time');
console.log('-'.repeat(80));

// Test 6.1: "tomorrow at 10am"
totalTests++;
const test6_1 = runTest(
  '6.1: "tomorrow at 10am"',
  'tomorrow at 10am',
  referenceDate,
  { date: new Date('2024-01-16T00:00:00Z'), time: { hours: 10, minutes: 0 }, dateRange: null }
);
if (test6_1) passedTests++;

// Test 6.2: "next Monday at 2:30pm"
totalTests++;
const test6_2 = runTest(
  '6.2: "next Monday at 2:30pm"',
  'next Monday at 2:30pm',
  referenceDate,
  { date: new Date('2024-01-22T00:00:00Z'), time: { hours: 14, minutes: 30 }, dateRange: null }
);
if (test6_2) passedTests++;

// Test 6.3: "12/25 at 3pm"
totalTests++;
const test6_3 = runTest(
  '6.3: "12/25 at 3pm"',
  '12/25 at 3pm',
  referenceDate,
  { date: new Date('2024-12-25T00:00:00Z'), time: { hours: 15, minutes: 0 }, dateRange: null }
);
if (test6_3) passedTests++;

// Test 6.4: "Thursday at 10:30am"
totalTests++;
const test6_4 = runTest(
  '6.4: "Thursday at 10:30am"',
  'Thursday at 10:30am',
  referenceDate,
  { date: new Date('2024-01-18T00:00:00Z'), time: { hours: 10, minutes: 30 }, dateRange: null }
);
if (test6_4) passedTests++;

// Test 6.5: "today at 2pm"
totalTests++;
const test6_5 = runTest(
  '6.5: "today at 2pm"',
  'today at 2pm',
  referenceDate,
  { date: new Date('2024-01-15T00:00:00Z'), time: { hours: 14, minutes: 0 }, dateRange: null }
);
if (test6_5) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 7: Edge Cases - Time
// ============================================================================
console.log('TEST GROUP 7: Edge Cases - Time');
console.log('-'.repeat(80));

// Test 7.1: "1am" (single digit hour)
totalTests++;
const test7_1 = runTest(
  '7.1: "1am" (single digit)',
  '1am',
  referenceDate,
  { date: null, time: { hours: 1, minutes: 0 }, dateRange: null }
);
if (test7_1) passedTests++;

// Test 7.2: "9am" (single digit hour)
totalTests++;
const test7_2 = runTest(
  '7.2: "9am" (single digit)',
  '9am',
  referenceDate,
  { date: null, time: { hours: 9, minutes: 0 }, dateRange: null }
);
if (test7_2) passedTests++;

// Test 7.3: "11:59pm"
totalTests++;
const test7_3 = runTest(
  '7.3: "11:59pm"',
  '11:59pm',
  referenceDate,
  { date: null, time: { hours: 23, minutes: 59 }, dateRange: null }
);
if (test7_3) passedTests++;

// Test 7.4: "12:00am"
totalTests++;
const test7_4 = runTest(
  '7.4: "12:00am"',
  '12:00am',
  referenceDate,
  { date: null, time: { hours: 0, minutes: 0 }, dateRange: null }
);
if (test7_4) passedTests++;

// Test 7.5: "12:00pm"
totalTests++;
const test7_5 = runTest(
  '7.5: "12:00pm"',
  '12:00pm',
  referenceDate,
  { date: null, time: { hours: 12, minutes: 0 }, dateRange: null }
);
if (test7_5) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 8: Edge Cases - Day of Week Logic
// ============================================================================
console.log('TEST GROUP 8: Edge Cases - Day of Week Logic');
console.log('-'.repeat(80));

// Test 8.1: Today is Wednesday, "Wednesday" should be next week
totalTests++;
const test8_1 = runTest(
  '8.1: Today is Wed, "Wednesday" (next occurrence)',
  'Wednesday',
  referenceDate,
  { date: new Date('2024-01-17T00:00:00Z'), time: null, dateRange: null } // Next Wednesday
);
if (test8_1) passedTests++;

// Test 8.2: "next Wednesday" should be next week (always)
totalTests++;
const test8_2 = runTest(
  '8.2: "next Wednesday" (always next week)',
  'next Wednesday',
  referenceDate,
  { date: new Date('2024-01-24T00:00:00Z'), time: null, dateRange: null } // Next week's Wednesday
);
if (test8_2) passedTests++;

// Test 8.3: "this Wednesday" should be today (if today is Wednesday)
// Use a Wednesday as reference date
const wednesdayRefDate = new Date('2024-01-17T14:00:00Z'); // Wednesday, Jan 17, 2024
totalTests++;
const test8_3 = runTest(
  '8.3: "this Wednesday" (today)',
  'this Wednesday',
  wednesdayRefDate,
  { date: new Date('2024-01-17T00:00:00Z'), time: null, dateRange: null } // Today
);
if (test8_3) passedTests++;

// Test with different reference date: Monday
const mondayRef = new Date('2024-01-15T00:00:00Z'); // Set to Monday
mondayRef.setDate(15); // Jan 15 is actually a Monday
mondayRef.setDay = function(day) { 
  const diff = day - this.getDay();
  this.setDate(this.getDate() + diff);
};
// Actually, let's use a known Monday
const mondayRefDate = new Date('2024-01-08T14:00:00Z'); // Monday, Jan 8, 2024

// Test 8.4: Today is Monday, "Tuesday" should be tomorrow
totalTests++;
const test8_4 = runTest(
  '8.4: Today is Mon, "Tuesday" (tomorrow)',
  'Tuesday',
  mondayRefDate,
  { date: new Date('2024-01-09T00:00:00Z'), time: null, dateRange: null } // Tomorrow
);
if (test8_4) passedTests++;

// Test 8.5: Today is Monday, "next Tuesday" should be next week
totalTests++;
const test8_5 = runTest(
  '8.5: Today is Mon, "next Tuesday" (next week)',
  'next Tuesday',
  mondayRefDate,
  { date: new Date('2024-01-16T00:00:00Z'), time: null, dateRange: null } // Next week's Tuesday
);
if (test8_5) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 9: No Date/Time Found
// ============================================================================
console.log('TEST GROUP 9: No Date/Time Found');
console.log('-'.repeat(80));

// Test 9.1: "Hello"
totalTests++;
const test9_1 = runTest(
  '9.1: "Hello" (no date/time)',
  'Hello',
  referenceDate,
  { date: null, time: null, dateRange: null }
);
if (test9_1) passedTests++;

// Test 9.2: "anytime"
totalTests++;
const test9_2 = runTest(
  '9.2: "anytime"',
  'anytime',
  referenceDate,
  { date: null, time: null, dateRange: null }
);
if (test9_2) passedTests++;

// Test 9.3: Empty string
totalTests++;
const test9_3 = runTest(
  '9.3: Empty string',
  '',
  referenceDate,
  { date: null, time: null, dateRange: null }
);
if (test9_3) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 10: Natural Language Variations
// ============================================================================
console.log('TEST GROUP 10: Natural Language Variations');
console.log('-'.repeat(80));

// Test 10.1: "I want an appointment tomorrow at 10am"
totalTests++;
const test10_1 = runTest(
  '10.1: "I want an appointment tomorrow at 10am"',
  'I want an appointment tomorrow at 10am',
  referenceDate,
  { date: new Date('2024-01-16T00:00:00Z'), time: { hours: 10, minutes: 0 }, dateRange: null }
);
if (test10_1) passedTests++;

// Test 10.2: "Can we schedule for next Tuesday?"
totalTests++;
const test10_2 = runTest(
  '10.2: "Can we schedule for next Tuesday?"',
  'Can we schedule for next Tuesday?',
  referenceDate,
  { date: new Date('2024-01-23T00:00:00Z'), time: null, dateRange: null }
);
if (test10_2) passedTests++;

// Test 10.3: "How about 12/25 at 3pm?"
totalTests++;
const test10_3 = runTest(
  '10.3: "How about 12/25 at 3pm?"',
  'How about 12/25 at 3pm?',
  referenceDate,
  { date: new Date('2024-12-25T00:00:00Z'), time: { hours: 15, minutes: 0 }, dateRange: null }
);
if (test10_3) passedTests++;

// Test 10.4: "Maybe Thursday morning around 10"
totalTests++;
const test10_4 = runTest(
  '10.4: "Maybe Thursday morning around 10"',
  'Maybe Thursday morning around 10',
  referenceDate,
  { date: new Date('2024-01-18T00:00:00Z'), time: { hours: 10, minutes: 0 }, dateRange: null }
);
if (test10_4) passedTests++;

console.log('\n');

// ============================================================================
// TEST GROUP 11: matchesDateTimePreference Function
// ============================================================================
console.log('TEST GROUP 11: matchesDateTimePreference Function');
console.log('-'.repeat(80));

// Test 11.1: Exact match
totalTests++;
const slot1 = new Date('2024-01-16T10:00:00Z');
const pref1 = { date: new Date('2024-01-16T00:00:00Z'), time: { hours: 10, minutes: 0 } };
const result11_1 = matchesDateTimePreference(slot1, pref1);
console.log(`${result11_1 ? '✅' : '❌'} 11.1: Exact match (date + time)`);
if (result11_1) passedTests++;

// Test 11.2: Time within ±1 hour
totalTests++;
const slot2 = new Date('2024-01-16T10:30:00Z');
const pref2 = { date: new Date('2024-01-16T00:00:00Z'), time: { hours: 10, minutes: 0 } };
const result11_2 = matchesDateTimePreference(slot2, pref2);
console.log(`${result11_2 ? '✅' : '❌'} 11.2: Time within ±1 hour (10:30am matches 10am)`);
if (result11_2) passedTests++;

// Test 11.3: Time outside ±1 hour
totalTests++;
const slot3 = new Date('2024-01-16T14:00:00Z');
const pref3 = { date: new Date('2024-01-16T00:00:00Z'), time: { hours: 10, minutes: 0 } };
const result11_3 = !matchesDateTimePreference(slot3, pref3);
console.log(`${result11_3 ? '✅' : '❌'} 11.3: Time outside ±1 hour (2pm does NOT match 10am)`);
if (result11_3) passedTests++;

// Test 11.4: Date only (no time constraint)
totalTests++;
const slot4 = new Date('2024-01-16T14:00:00Z');
const pref4 = { date: new Date('2024-01-16T00:00:00Z'), time: null };
const result11_4 = matchesDateTimePreference(slot4, pref4);
console.log(`${result11_4 ? '✅' : '❌'} 11.4: Date only (any time on that date)`);
if (result11_4) passedTests++;

// Test 11.5: Time only (no date constraint)
totalTests++;
const slot5 = new Date('2024-01-17T10:00:00Z');
const pref5 = { date: null, time: { hours: 10, minutes: 0 } };
const result11_5 = matchesDateTimePreference(slot5, pref5);
console.log(`${result11_5 ? '✅' : '❌'} 11.5: Time only (any date with that time)`);
if (result11_5) passedTests++;

// Test 11.6: No preference (matches any)
totalTests++;
const slot6 = new Date('2024-01-16T10:00:00Z');
const pref6 = { date: null, time: null };
const result11_6 = matchesDateTimePreference(slot6, pref6);
console.log(`${result11_6 ? '✅' : '❌'} 11.6: No preference (matches any slot)`);
if (result11_6) passedTests++;

// Test 11.7: Date mismatch
totalTests++;
const slot7 = new Date('2024-01-17T10:00:00Z');
const pref7 = { date: new Date('2024-01-16T00:00:00Z'), time: { hours: 10, minutes: 0 } };
const result11_7 = !matchesDateTimePreference(slot7, pref7);
console.log(`${result11_7 ? '✅' : '❌'} 11.7: Date mismatch (different dates)`);
if (result11_7) passedTests++;

console.log('\n');

// ============================================================================
// SUMMARY
// ============================================================================
console.log('='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${totalTests - passedTests}`);
console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
console.log('='.repeat(80));

if (passedTests === totalTests) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please review the output above.');
  process.exit(1);
}
