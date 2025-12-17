# Automated Testing Framework

## Overview

This testing framework automatically simulates multiple conversations covering all features and edge cases, evaluates performance, identifies problems, and generates comprehensive reports.

## Features

- ✅ **Comprehensive Test Coverage**: Tests all main features (booking, rescheduling, cancellation, price inquiry, appointment inquiry)
- ✅ **Edge Case Testing**: Covers invalid inputs, missing information, ambiguous responses, and error scenarios
- ✅ **Performance Metrics**: Tracks response times, success rates, and error patterns
- ✅ **Mock Services**: Simulates external APIs (Google Calendar, Google Sheets, Google Docs) without making actual API calls
- ✅ **Automated Problem Detection**: Identifies performance issues, low accuracy rates, and recurring errors
- ✅ **Detailed Reports**: Generates both console output and JSON report file

## Usage

### Run All Tests

```bash
node test_framework.js
```

### Test Output

The framework will:
1. Set up mock services
2. Run all test cases sequentially
3. Display progress in console
4. Generate a comprehensive report
5. Save detailed JSON report to `test_report.json`

### Example Output

```
🔧 Setting up test environment...
✅ Test environment ready
🚀 Starting test suite...

[1/25] Running: Complete Booking - Braces Maintenance
[2/25] Running: Complete Booking - Cleaning
...

✅ Test suite complete

================================================================================
📊 TEST REPORT
================================================================================

📈 SUMMARY
--------------------------------------------------------------------------------
Total Tests: 25
Passed: 23
Failed: 2
Success Rate: 92.00%
Average Response Time: 2345.67ms

🎯 INTENT DETECTION ACCURACY
--------------------------------------------------------------------------------
booking: 95.00% (19/20)
cancel: 100.00% (3/3)
reschedule: 100.00% (2/2)
price_inquiry: 100.00% (3/3)

🔧 FEATURE COVERAGE
--------------------------------------------------------------------------------
booking: 90.00% (9 passed, 1 failed)
cancel: 100.00% (3 passed, 0 failed)
reschedule: 100.00% (2 passed, 0 failed)
price_inquiry: 100.00% (3 passed, 0 failed)

⚠️  IDENTIFIED PROBLEMS
--------------------------------------------------------------------------------

1. [MEDIUM] Performance
   Issue: High average response time: 2345.67ms
   Recommendation: Optimize API calls, consider caching, or reduce AI model complexity

================================================================================

💾 Detailed report saved to: test_report.json
```

## Test Cases

### Booking Flow Tests
- Complete booking flows for different treatment types
- Missing information scenarios (dentist, date/time)
- Invalid date handling
- Edge cases (multiple intents, ambiguous confirmations)

### Reschedule Flow Tests
- Complete reschedule flow
- Reschedule without existing appointment

### Cancellation Flow Tests
- Complete cancellation flow
- Decline cancellation confirmation
- Cancellation without existing appointment

### Price Inquiry Tests
- Single treatment pricing
- Multiple treatment pricing

### Appointment Inquiry Tests
- Check appointment with existing appointment
- Check appointment without appointment

### Edge Cases
- Multiple intents in one message
- Ambiguous confirmations
- Invalid treatment types
- Very long messages
- Empty messages
- Special characters

## Report Structure

The generated `test_report.json` contains:

```json
{
  "summary": {
    "totalTests": 25,
    "passedTests": 23,
    "failedTests": 2,
    "successRate": "92.00%",
    "averageResponseTime": "2345.67ms"
  },
  "intentDetectionAccuracy": {
    "booking": {
      "accuracy": "95.00%",
      "correct": 19,
      "total": 20
    }
  },
  "featureCoverage": {
    "booking": {
      "successRate": "90.00%",
      "passed": 9,
      "failed": 1
    }
  },
  "errors": [...],
  "testCases": [...],
  "problems": [...]
}
```

## Customization

### Adding New Test Cases

Edit the `getTestCases()` method in `test_framework.js`:

```javascript
{
  name: 'Your Test Name',
  feature: 'booking', // or 'cancel', 'reschedule', etc.
  expectedIntent: 'booking',
  conversationId: '+1111111999',
  phoneNumber: '+1111111999',
  messages: [
    'User message 1',
    'User message 2',
  ],
  validate: (response, session) => {
    // Return true if test passed, false otherwise
    return response.includes('expected text');
  },
}
```

### Modifying Mock Data

Edit the `MockServices` class to customize:
- Available calendar slots
- Pricing information
- Mock event behavior

## Troubleshooting

### Tests Fail Due to API Errors

The framework uses mocks by default. If you see API errors, ensure:
1. Mocks are properly set up in `setup()`
2. Original services are restored in `teardown()`

### Tests Are Slow

- Reduce delay between messages (`setTimeout` in `runTestCase`)
- Reduce delay between tests
- Consider running tests in parallel (requires refactoring)

### Missing Test Coverage

Add new test cases to `getTestCases()` method covering:
- Additional edge cases
- Specific bug scenarios
- New features

## Integration with CI/CD

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: node test_framework.js
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The test framework will exit with code 1 if any tests fail, making it suitable for CI/CD.

## Notes

- **No Real API Calls**: All external services are mocked, so tests run quickly and don't affect production data
- **Session Isolation**: Each test gets a fresh session to avoid interference
- **Deterministic**: Mock services provide consistent results for reproducible tests
- **Performance Tracking**: Response times are tracked for each test case
