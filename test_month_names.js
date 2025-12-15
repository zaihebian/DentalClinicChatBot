import { parseDateTimePreference } from './src/utils/dateParser.js';

const referenceDate = new Date('2024-01-15T14:00:00Z');

const testCases = [
  'July 21st',
  'July 21',
  '21st of July',
  '21 of July',
  'July 21, 2024',
  'July 21st, 2025',
  '21st of July, 2024',
  'December 25th',
  'Dec 25',
  'Jan 1st',
  'March 15',
  'September 3rd',
  'Feb 29th, 2024',
];

console.log('Testing Month Name Date Formats\n');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = parseDateTimePreference(testCase, referenceDate);
  const hasDate = result.date !== null;
  const dateStr = result.date ? result.date.toISOString().split('T')[0] : 'null';
  
  if (hasDate) {
    console.log(`✅ "${testCase}" → ${dateStr}`);
    passed++;
  } else {
    console.log(`❌ "${testCase}" → null (not parsed)`);
    failed++;
  }
}

console.log('\n' + '='.repeat(80));
console.log(`Summary: ${passed} passed, ${failed} failed`);
