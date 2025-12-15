import { parseDateTimePreference } from './src/utils/dateParser.js';

const referenceDate = new Date('2024-01-15T14:00:00Z');

const testCases = [
  { input: 'July 21st at 10am', expected: '2024-07-21 + 10:00' },
  { input: 'July 21 at 2:30pm', expected: '2024-07-21 + 14:30' },
  { input: 'December 25th at 3pm', expected: '2024-12-25 + 15:00' },
  { input: '21st of July at 9am', expected: '2024-07-21 + 09:00' },
  { input: 'July 21, 2024 at 11am', expected: '2024-07-21 + 11:00' },
];

console.log('Testing Month Name + Time Combinations\n');
console.log('='.repeat(80));

for (const testCase of testCases) {
  const result = parseDateTimePreference(testCase.input, referenceDate);
  const dateStr = result.date ? result.date.toISOString().split('T')[0] : 'null';
  const timeStr = result.time ? `${result.time.hours.toString().padStart(2, '0')}:${result.time.minutes.toString().padStart(2, '0')}` : 'null';
  const actual = `${dateStr} + ${timeStr}`;
  
  const passed = actual === testCase.expected;
  console.log(`${passed ? '✅' : '❌'} "${testCase.input}"`);
  console.log(`   Expected: ${testCase.expected}`);
  console.log(`   Got:      ${actual}\n`);
}
