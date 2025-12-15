import { parseDateTimePreference } from './src/utils/dateParser.js';

const referenceDate = new Date('2024-01-15T14:00:00Z');

console.log('Testing: "July 21st"');
const result = parseDateTimePreference('July 21st', referenceDate);

console.log('\nResult:');
console.log('  Date:', result.date ? result.date.toISOString().split('T')[0] : 'null');
console.log('  Time:', result.time ? `${result.time.hours}:${result.time.minutes}` : 'null');
console.log('  DateRange:', result.dateRange);

if (!result.date) {
  console.log('\n❌ "July 21st" is NOT currently supported');
  console.log('The parser only supports:');
  console.log('  - MM/DD format: "12/25"');
  console.log('  - YYYY-MM-DD format: "2024-12-25"');
  console.log('  - Relative dates: "today", "tomorrow", "next week"');
  console.log('  - Day of week: "Monday", "next Monday"');
} else {
  console.log('\n✅ "July 21st" is supported!');
}
