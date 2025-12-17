/**
 * Automated Testing Framework for AI Dental Receptionist
 * 
 * Simulates multiple conversations covering all features and edge cases,
 * evaluates performance, identifies problems, and generates comprehensive reports.
 * 
 * Features:
 * - Mock external services (Google Calendar, WhatsApp, Google Sheets, Google Docs)
 * - Simulate conversations by calling generateResponse() directly
 * - Track metrics (response time, success rate, errors, intent detection accuracy)
 * - Generate detailed reports with problem identification
 * 
 * Usage:
 * node test_framework.js
 */

import { openaiHandler } from './src/openaiHandler.js';
import { sessionManager } from './src/sessionManager.js';
import { googleCalendarService } from './src/googleCalendar.js';
import { googleSheetsService } from './src/googleSheets.js';
import { googleDocsService } from './src/googleDocs.js';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

/**
 * Test Results Storage
 */
class TestResults {
  constructor() {
    this.testCases = [];
    this.metrics = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      errors: [],
      intentDetectionAccuracy: {},
      featureCoverage: {},
    };
  }

  addTestCase(testCase) {
    this.testCases.push(testCase);
    this.metrics.totalTests++;
    
    if (testCase.passed) {
      this.metrics.passedTests++;
    } else {
      this.metrics.failedTests++;
    }

    this.metrics.totalResponseTime += testCase.responseTime || 0;
    this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.totalTests;

    if (testCase.error) {
      this.metrics.errors.push({
        testCase: testCase.name,
        error: testCase.error,
        message: testCase.userMessage,
      });
    }

    // Track intent detection accuracy
    if (testCase.expectedIntent) {
      const intent = testCase.expectedIntent;
      if (!this.metrics.intentDetectionAccuracy[intent]) {
        this.metrics.intentDetectionAccuracy[intent] = { correct: 0, total: 0 };
      }
      this.metrics.intentDetectionAccuracy[intent].total++;
      if (testCase.detectedIntent === intent) {
        this.metrics.intentDetectionAccuracy[intent].correct++;
      }
    }

    // Track feature coverage
    if (testCase.feature) {
      if (!this.metrics.featureCoverage[testCase.feature]) {
        this.metrics.featureCoverage[testCase.feature] = { passed: 0, failed: 0 };
      }
      if (testCase.passed) {
        this.metrics.featureCoverage[testCase.feature].passed++;
      } else {
        this.metrics.featureCoverage[testCase.feature].failed++;
      }
    }
  }

  generateReport() {
    const report = {
      summary: {
        totalTests: this.metrics.totalTests,
        passedTests: this.metrics.passedTests,
        failedTests: this.metrics.failedTests,
        successRate: ((this.metrics.passedTests / this.metrics.totalTests) * 100).toFixed(2) + '%',
        averageResponseTime: this.metrics.averageResponseTime.toFixed(2) + 'ms',
      },
      intentDetectionAccuracy: {},
      featureCoverage: {},
      errors: this.metrics.errors,
      testCases: this.testCases,
      problems: [],
    };

    // Calculate intent detection accuracy percentages
    for (const [intent, stats] of Object.entries(this.metrics.intentDetectionAccuracy)) {
      report.intentDetectionAccuracy[intent] = {
        accuracy: ((stats.correct / stats.total) * 100).toFixed(2) + '%',
        correct: stats.correct,
        total: stats.total,
      };
    }

    // Calculate feature coverage percentages
    for (const [feature, stats] of Object.entries(this.metrics.featureCoverage)) {
      const total = stats.passed + stats.failed;
      report.featureCoverage[feature] = {
        successRate: ((stats.passed / total) * 100).toFixed(2) + '%',
        passed: stats.passed,
        failed: stats.failed,
      };
    }

    // Identify problems
    report.problems = this.identifyProblems();

    return report;
  }

  identifyProblems() {
    const problems = [];

    // Low success rate
    const successRate = (this.metrics.passedTests / this.metrics.totalTests) * 100;
    if (successRate < 80) {
      problems.push({
        severity: 'HIGH',
        category: 'Overall Performance',
        issue: `Low success rate: ${successRate.toFixed(2)}%`,
        recommendation: 'Review failed test cases and identify common failure patterns',
      });
    }

    // Slow response times
    if (this.metrics.averageResponseTime > 5000) {
      problems.push({
        severity: 'MEDIUM',
        category: 'Performance',
        issue: `High average response time: ${this.metrics.averageResponseTime.toFixed(2)}ms`,
        recommendation: 'Optimize API calls, consider caching, or reduce AI model complexity',
      });
    }

    // Intent detection issues
    for (const [intent, stats] of Object.entries(this.metrics.intentDetectionAccuracy)) {
      const accuracy = (stats.correct / stats.total) * 100;
      if (accuracy < 80) {
        problems.push({
          severity: 'HIGH',
          category: 'Intent Detection',
          issue: `Low accuracy for "${intent}" intent: ${accuracy.toFixed(2)}%`,
          recommendation: `Review intent detection prompts and add more training examples for "${intent}"`,
        });
      }
    }

    // Feature coverage issues
    for (const [feature, stats] of Object.entries(this.metrics.featureCoverage)) {
      const successRate = (stats.passed / (stats.passed + stats.failed)) * 100;
      if (successRate < 70) {
        problems.push({
          severity: 'HIGH',
          category: 'Feature Coverage',
          issue: `Low success rate for "${feature}" feature: ${successRate.toFixed(2)}%`,
          recommendation: `Review "${feature}" implementation and fix identified bugs`,
        });
      }
    }

    // Common errors
    const errorCounts = {};
    this.metrics.errors.forEach(err => {
      const errorType = err.error?.message || err.error || 'Unknown';
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
    });

    for (const [errorType, count] of Object.entries(errorCounts)) {
      if (count >= 3) {
        problems.push({
          severity: 'HIGH',
          category: 'Error Patterns',
          issue: `Recurring error: "${errorType}" (${count} occurrences)`,
          recommendation: 'Fix root cause of this error pattern',
        });
      }
    }

    return problems;
  }
}

/**
 * Mock Services
 * These mocks simulate external API calls without making actual requests
 */
class MockServices {
  constructor() {
    this.calendarEvents = [];
    this.sheetsLogs = [];
    this.docsContent = 'Cleaning: $50\nFilling: $100 per tooth\nBraces Maintenance: $200\nConsultation: $75';
  }

  // Mock Google Calendar
  mockCalendar() {
    const originalGetAvailableSlots = googleCalendarService.getAvailableSlots;
    const originalCreateAppointment = googleCalendarService.createAppointment;
    const originalCancelAppointment = googleCalendarService.cancelAppointment;
    const originalFindBookingByPhone = googleCalendarService.findBookingByPhone;
    const originalGetAllBookings = googleCalendarService.getAllBookings;

    googleCalendarService.getAvailableSlots = async (treatmentType, dentistNames) => {
      // Return mock available slots
      // Signature matches real function: getAvailableSlots(treatmentType, dentistNames)
      const slots = [];
      const now = new Date();
      const oneMonthLater = new Date(now);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      
      // Generate slots for each dentist
      for (const doctor of dentistNames) {
        // Start from today, generate slots for next 30 days
        for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
          const currentDate = new Date(now);
          currentDate.setDate(currentDate.getDate() + dayOffset);
          
          // Skip weekends
          if (currentDate.getDay() === 0 || currentDate.getDay() === 6) continue;
          
          // Generate slots from 9 AM to 5 PM (working hours)
          // Use 60-minute slots to accommodate all treatment durations (max is 45 min for braces)
          for (let hour = 9; hour < 17; hour++) {
            const slotStart = new Date(currentDate);
            slotStart.setHours(hour, 0, 0, 0);
            slotStart.setSeconds(0, 0);
            
            // Use 60-minute duration to accommodate all treatments (max needed is 45 min)
            const slotDuration = 60; // minutes
            const slotEnd = new Date(slotStart);
            slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);
            
            // Only add slots in the future
            if (slotStart <= now) continue;
            
            // Check if slot conflicts with existing events
            const conflicts = this.calendarEvents.filter(event => {
              return event.doctor === doctor &&
                     event.startTime < slotEnd &&
                     event.endTime > slotStart;
            });
            
            if (conflicts.length === 0) {
              slots.push({
                startTime: slotStart,
                endTime: slotEnd,
                doctor: doctor,
                duration: slotDuration,
                weekday: slotStart.toLocaleDateString('en-US', { weekday: 'long' }),
              });
            }
          }
        }
      }
      
      // Sort by start time
      slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      
      return slots.slice(0, 50); // Return first 50 slots
    };

    googleCalendarService.createAppointment = async (calendarId, appointmentData) => {
      const { patientName, doctor, treatment, phone, startTime, endTime } = appointmentData;
      
      // Ensure startTime and endTime are Date objects
      const startTimeDate = startTime instanceof Date ? startTime : new Date(startTime);
      const endTimeDate = endTime instanceof Date ? endTime : new Date(endTime);
      
      // Validate dates
      if (isNaN(startTimeDate.getTime()) || isNaN(endTimeDate.getTime())) {
        console.error(`[MOCK] Invalid date values: startTime=${startTime}, endTime=${endTime}`);
        return { success: false, error: 'Invalid date values' };
      }
      
      const event = {
        id: `mock_event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        doctor,
        patientName,
        treatment,
        phone,
        startTime: startTimeDate,
        endTime: endTimeDate,
        calendarId,
      };
      this.calendarEvents.push(event);
      console.log(`[MOCK] Created appointment: ${patientName} with ${doctor} at ${startTimeDate.toISOString()}`);
      return { success: true, eventId: event.id };
    };

    googleCalendarService.cancelAppointment = async (calendarId, eventId) => {
      const index = this.calendarEvents.findIndex(e => e.id === eventId);
      if (index !== -1) {
        this.calendarEvents.splice(index, 1);
        return { success: true };
      }
      return { success: false, error: 'Event not found' };
    };

    googleCalendarService.findBookingByPhone = async (phone) => {
      // Normalize phone for comparison (remove formatting differences)
      const normalizePhone = (p) => p ? p.replace(/[\s\-\(\)]/g, '') : '';
      const normalizedSearchPhone = normalizePhone(phone);
      
      // Find most recent booking for this phone (in case of multiple)
      const bookings = this.calendarEvents
        .filter(e => {
          const normalizedEventPhone = normalizePhone(e.phone);
          return normalizedEventPhone === normalizedSearchPhone || 
                 normalizedEventPhone.endsWith(normalizedSearchPhone) ||
                 normalizedSearchPhone.endsWith(normalizedEventPhone);
        })
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime()); // Most recent first
      
      const booking = bookings[0];
      if (!booking) {
        console.log(`[MOCK] No booking found for phone: ${phone} (total events: ${this.calendarEvents.length})`);
        return undefined;
      }
      
      console.log(`[MOCK] Found booking for ${phone}: ${booking.patientName} with ${booking.doctor}`);
      return {
        patientPhone: booking.phone,
        patientName: booking.patientName,
        doctor: booking.doctor,
        treatment: booking.treatment,
        startTime: booking.startTime,
        endTime: booking.endTime,
        calendarEventId: booking.id,
        calendarId: 'mock_calendar_id',
      };
    };

    googleCalendarService.getAllBookings = async () => {
      return this.calendarEvents.map(event => ({
        patientPhone: event.phone,
        patientName: event.patientName,
        doctor: event.doctor,
        treatment: event.treatment,
        startTime: event.startTime,
        endTime: event.endTime,
        calendarEventId: event.id,
        calendarId: 'mock_calendar_id',
      }));
    };

    return {
      restore: () => {
        googleCalendarService.getAvailableSlots = originalGetAvailableSlots;
        googleCalendarService.createAppointment = originalCreateAppointment;
        googleCalendarService.cancelAppointment = originalCancelAppointment;
        googleCalendarService.findBookingByPhone = originalFindBookingByPhone;
        googleCalendarService.getAllBookings = originalGetAllBookings;
      },
    };
  }

  // Mock Google Sheets
  mockSheets() {
    const originalLogConversationTurn = googleSheetsService.logConversationTurn;
    const originalLogAction = googleSheetsService.logAction;

    googleSheetsService.logConversationTurn = async (...args) => {
      this.sheetsLogs.push({ type: 'conversation', args });
      return { success: true };
    };

    googleSheetsService.logAction = async (...args) => {
      this.sheetsLogs.push({ type: 'action', args });
      return { success: true };
    };

    return {
      restore: () => {
        googleSheetsService.logConversationTurn = originalLogConversationTurn;
        googleSheetsService.logAction = originalLogAction;
      },
    };
  }

  // Mock Google Docs
  mockDocs() {
    const originalGetPricingInfo = googleDocsService.getPricingInfo;

    googleDocsService.getPricingInfo = async () => {
      return this.docsContent;
    };

    return {
      restore: () => {
        googleDocsService.getPricingInfo = originalGetPricingInfo;
      },
    };
  }

  reset() {
    this.calendarEvents = [];
    this.sheetsLogs = [];
  }
}

/**
 * Test Runner
 */
class TestRunner {
  constructor() {
    this.results = new TestResults();
    this.mockServices = new MockServices();
    this.mocks = [];
  }

  async setup() {
    console.log('🔧 Setting up test environment...');
    
    // Setup mocks
    this.mocks.push(this.mockServices.mockCalendar());
    this.mocks.push(this.mockServices.mockSheets());
    this.mocks.push(this.mockServices.mockDocs());
    
    console.log('✅ Test environment ready');
  }

  async teardown() {
    console.log('🧹 Cleaning up test environment...');
    
    // Restore original services
    this.mocks.forEach(mock => mock.restore());
    
    // Clear all sessions
    sessionManager.destroy();
    
    console.log('✅ Cleanup complete');
  }

  async runTestCase(testCase) {
    const startTime = Date.now();
    let response = '';
    let error = null;
    let detectedIntent = null;
    
    try {
      // Clear session for new conversation
      sessionManager.endSession(testCase.conversationId);
      
      // Simulate conversation
      for (let i = 0; i < testCase.messages.length; i++) {
        const userMessage = testCase.messages[i];
        response = await openaiHandler.generateResponse(
          testCase.conversationId,
          userMessage,
          testCase.phoneNumber || testCase.conversationId
        );
        
        // Extract detected intent from session
        const session = sessionManager.getSession(testCase.conversationId);
        if (session.intents && session.intents.length > 0) {
          detectedIntent = session.intents[0];
        }
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Validate results
      const passed = testCase.validate ? testCase.validate(response, sessionManager.getSession(testCase.conversationId)) : true;
      
      const responseTime = Date.now() - startTime;
      
      this.results.addTestCase({
        name: testCase.name,
        feature: testCase.feature,
        expectedIntent: testCase.expectedIntent,
        detectedIntent: detectedIntent,
        userMessage: testCase.messages.join(' | '),
        response: response,
        passed: passed,
        responseTime: responseTime,
        error: null,
      });
      
      return { passed, response, responseTime };
    } catch (err) {
      const responseTime = Date.now() - startTime;
      
      this.results.addTestCase({
        name: testCase.name,
        feature: testCase.feature,
        expectedIntent: testCase.expectedIntent,
        detectedIntent: detectedIntent,
        userMessage: testCase.messages.join(' | '),
        response: response,
        passed: false,
        responseTime: responseTime,
        error: err,
      });
      
      return { passed: false, response, responseTime, error: err };
    }
  }

  async runAllTests(filterFeature = null) {
    console.log('🚀 Starting test suite...\n');
    
    let testCases = this.getTestCases();
    
    // Filter by feature if specified
    if (filterFeature) {
      testCases = testCases.filter(tc => tc.feature === filterFeature);
      console.log(`🔍 Filtering tests by feature: ${filterFeature} (${testCases.length} tests)\n`);
    }
    
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`[${i + 1}/${testCases.length}] Running: ${testCase.name}`);
      
      // Reset mocks for each test
      this.mockServices.reset();
      
      await this.runTestCase(testCase);
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n✅ Test suite complete\n');
  }

  getTestCases() {
    return [
      // ========== BOOKING FLOW TESTS ==========
      {
        name: 'Complete Booking - Braces Maintenance',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111111',
        phoneNumber: '+1111111111',
        messages: [
          'I want braces maintenance',
          'My name is John Doe',
          'Dr BracesB',
          'Tomorrow at 10am',
          'Yes',
        ],
        validate: (response, session) => {
          return response.includes('confirmed') || response.includes('✅') || session.eventId;
        },
      },
      {
        name: 'Complete Booking - Cleaning',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111112',
        phoneNumber: '+1111111112',
        messages: [
          'I need a cleaning',
          'My name is Jane Smith',
          'Dr GeneralA',
          'Next Monday at 2pm',
          'Yes',
        ],
        validate: (response, session) => {
          return response.includes('confirmed') || response.includes('✅') || session.eventId;
        },
      },
      {
        name: 'Complete Booking - Filling with Teeth Count',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111113',
        phoneNumber: '+1111111113',
        messages: [
          'I need a filling for 3 teeth',
          'I am Bob Johnson',
          'Dr GeneralB',
          'Friday at 11am',
          'Yes',
        ],
        validate: (response, session) => {
          return response.includes('confirmed') || response.includes('✅') || session.eventId;
        },
      },
      {
        name: 'Booking - Missing Dentist Selection',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111114',
        phoneNumber: '+1111111114',
        messages: [
          'I want braces maintenance',
          'My name is Frank Miller',
          'Tomorrow at 10am', // Skipping dentist selection
        ],
        validate: (response, session) => {
          // Should ask for dentist OR proceed if dentist can be inferred
          return response.toLowerCase().includes('dentist') || response.toLowerCase().includes('doctor') || response.toLowerCase().includes('available');
        },
      },
      {
        name: 'Booking - Missing Date/Time',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111115',
        phoneNumber: '+1111111115',
        messages: [
          'I want braces maintenance',
          'My name is Grace Taylor',
          'Dr BracesA',
          // Missing date/time
        ],
        validate: (response, session) => {
          // Should ask for date/time OR show available slots
          return response.toLowerCase().includes('time') || response.toLowerCase().includes('date') || response.toLowerCase().includes('when') || response.toLowerCase().includes('available');
        },
      },
      {
        name: 'Booking - Invalid Date',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111116',
        phoneNumber: '+1111111116',
        messages: [
          'I want braces maintenance',
          'My name is Henry White',
          'Dr BracesA',
          'Yesterday at 10am', // Past date
        ],
        validate: (response, session) => {
          // Should handle invalid date gracefully (ask for name or show available slots)
          return !response.toLowerCase().includes('error') || response.toLowerCase().includes('available') || response.toLowerCase().includes('name');
        },
      },
      
      // ========== RESCHEDULE FLOW TESTS ==========
      {
        name: 'Reschedule - Complete Flow',
        feature: 'reschedule',
        expectedIntent: 'reschedule',
        conversationId: '+1111111120',
        phoneNumber: '+1111111120',
        messages: [
          'I want braces maintenance',
          'My name is Alice Brown',
          'Dr BracesB',
          'Tomorrow at 10am',
          'Yes', // Confirm booking
          'I want to reschedule to next week',
          'Tuesday at 2pm',
          'Yes', // Confirm reschedule
        ],
        validate: (response, session) => {
          // Should have rescheduled successfully
          return response.includes('rescheduled') || response.includes('confirmed') || response.includes('✅');
        },
      },
      {
        name: 'Reschedule - Without Existing Appointment',
        feature: 'reschedule',
        expectedIntent: 'reschedule',
        conversationId: '+1111111121',
        phoneNumber: '+1111111121',
        messages: [
          'I want to reschedule my appointment',
        ],
        validate: (response, session) => {
          // Should handle case where no appointment exists
          return response.toLowerCase().includes('not found') || response.toLowerCase().includes('appointment') || response.toLowerCase().includes('phone');
        },
      },
      
      // ========== CANCELLATION FLOW TESTS ==========
      {
        name: 'Cancellation - Complete Flow',
        feature: 'cancel',
        expectedIntent: 'cancel',
        conversationId: '+1111111130',
        phoneNumber: '+1111111130',
        messages: [
          'I want braces maintenance',
          'My name is Charlie Wilson',
          'Dr BracesA',
          'Tomorrow at 10am',
          'Yes', // Confirm booking
          'I want to cancel my appointment',
          'Yes', // Confirm cancellation
        ],
        validate: (response, session) => {
          // Should have cancelled successfully
          return response.toLowerCase().includes('cancelled') || response.toLowerCase().includes('cancel');
        },
      },
      {
        name: 'Cancellation - Decline Confirmation',
        feature: 'cancel',
        expectedIntent: 'cancel',
        conversationId: '+1111111131',
        phoneNumber: '+1111111131',
        messages: [
          'I want braces maintenance',
          'My name is David Lee',
          'Dr BracesA',
          'Tomorrow at 10am',
          'Yes', // Confirm booking
          'I want to cancel my appointment',
          'No', // Decline cancellation
        ],
        validate: (response, session) => {
          // Should keep appointment
          return response.toLowerCase().includes('remains') || response.toLowerCase().includes('scheduled') || response.toLowerCase().includes('keep');
        },
      },
      {
        name: 'Cancellation - No Appointment Found',
        feature: 'cancel',
        expectedIntent: 'cancel',
        conversationId: '+1111111132',
        phoneNumber: '+1111111132',
        messages: [
          'I want to cancel my appointment',
        ],
        validate: (response, session) => {
          // Should handle case where no appointment exists
          return response.toLowerCase().includes('not found') || response.toLowerCase().includes('appointment');
        },
      },
      
      // ========== PRICE INQUIRY TESTS ==========
      {
        name: 'Price Inquiry - Cleaning',
        feature: 'price_inquiry',
        expectedIntent: 'price_inquiry',
        conversationId: '+1111111140',
        phoneNumber: '+1111111140',
        messages: [
          'How much does cleaning cost?',
        ],
        validate: (response, session) => {
          // Should return pricing information
          return response.toLowerCase().includes('50') || response.toLowerCase().includes('cleaning') || response.toLowerCase().includes('price') || response.toLowerCase().includes('cost');
        },
      },
      {
        name: 'Price Inquiry - Filling',
        feature: 'price_inquiry',
        expectedIntent: 'price_inquiry',
        conversationId: '+1111111141',
        phoneNumber: '+1111111141',
        messages: [
          'What is the price for filling?',
        ],
        validate: (response, session) => {
          // Should return pricing information
          return response.toLowerCase().includes('100') || response.toLowerCase().includes('filling') || response.toLowerCase().includes('price') || response.toLowerCase().includes('cost');
        },
      },
      {
        name: 'Price Inquiry - Multiple Treatments',
        feature: 'price_inquiry',
        expectedIntent: 'price_inquiry',
        conversationId: '+1111111142',
        phoneNumber: '+1111111142',
        messages: [
          'How much do cleaning and braces maintenance cost?',
        ],
        validate: (response, session) => {
          // Should return pricing information
          return response.toLowerCase().includes('price') || response.toLowerCase().includes('cost') || response.toLowerCase().includes('50') || response.toLowerCase().includes('200');
        },
      },
      
      // ========== APPOINTMENT INQUIRY TESTS ==========
      {
        name: 'Appointment Inquiry - With Existing Appointment',
        feature: 'appointment_inquiry',
        expectedIntent: 'appointment_inquiry',
        conversationId: '+1111111150',
        phoneNumber: '+1111111150',
        messages: [
          'I want braces maintenance',
          'My name is Emma Davis',
          'Dr BracesB',
          'Tomorrow at 10am',
          'Yes', // Confirm booking
          'When is my appointment?',
        ],
        validate: (response, session) => {
          // Should return appointment details
          return response.toLowerCase().includes('appointment') && 
                 (response.toLowerCase().includes('doctor') || response.toLowerCase().includes('time') || response.toLowerCase().includes('date') || response.toLowerCase().includes('details'));
        },
      },
      {
        name: 'Appointment Inquiry - No Appointment',
        feature: 'appointment_inquiry',
        expectedIntent: 'appointment_inquiry',
        conversationId: '+1111111151',
        phoneNumber: '+1111111151',
        messages: [
          'What time is my appointment?',
        ],
        validate: (response, session) => {
          // Should handle case where no appointment exists
          return response.toLowerCase().includes('not found') || response.toLowerCase().includes('appointment');
        },
      },
      
      // ========== EDGE CASES ==========
      {
        name: 'Edge Case - Multiple Intents',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111160',
        phoneNumber: '+1111111160',
        messages: [
          'I want to book an appointment and also check the price for cleaning',
        ],
        validate: (response, session) => {
          // Should handle both intents
          return true; // Just check it doesn't crash
        },
      },
      {
        name: 'Edge Case - Ambiguous Confirmation',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111161',
        phoneNumber: '+1111111161',
        messages: [
          'I want braces maintenance',
          'My name is Isabella Martinez',
          'Dr BracesA',
          'Tomorrow at 10am',
          'Maybe', // Ambiguous response
        ],
        validate: (response, session) => {
          // Should handle ambiguous response gracefully
          return true; // Just check it doesn't crash
        },
      },
      {
        name: 'Edge Case - Session Timeout Simulation',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111162',
        phoneNumber: '+1111111162',
        messages: [
          'I want braces maintenance',
          'My name is Jack Anderson',
          'Dr BracesA',
          // Wait and then continue (simulating timeout)
        ],
        validate: (response, session) => {
          // Should handle gracefully (ask for date/time or show slots)
          return response.toLowerCase().includes('time') || response.toLowerCase().includes('date') || response.toLowerCase().includes('available') || response.toLowerCase().includes('name');
        },
      },
      {
        name: 'Edge Case - Invalid Treatment Type',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111163',
        phoneNumber: '+1111111163',
        messages: [
          'I want something that does not exist',
        ],
        validate: (response, session) => {
          // Should handle invalid treatment gracefully
          return !response.toLowerCase().includes('error') || response.toLowerCase().includes('treatment');
        },
      },
      {
        name: 'Edge Case - Very Long Message',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111164',
        phoneNumber: '+1111111164',
        messages: [
          'I want braces maintenance ' + 'and '.repeat(100) + 'I need it soon',
        ],
        validate: (response, session) => {
          // Should handle long messages
          return true; // Just check it doesn't crash
        },
      },
      {
        name: 'Edge Case - Empty Message',
        feature: 'booking',
        expectedIntent: null,
        conversationId: '+1111111165',
        phoneNumber: '+1111111165',
        messages: [
          '',
        ],
        validate: (response, session) => {
          // Should handle empty messages gracefully
          return true; // Just check it doesn't crash
        },
      },
      {
        name: 'Edge Case - Special Characters',
        feature: 'booking',
        expectedIntent: 'booking',
        conversationId: '+1111111166',
        phoneNumber: '+1111111166',
        messages: [
          'I want braces maintenance!!! @#$%^&*()',
        ],
        validate: (response, session) => {
          // Should handle special characters
          return true; // Just check it doesn't crash
        },
      },
    ];
  }

  generateReport() {
    const report = this.results.generateReport();
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST REPORT');
    console.log('='.repeat(80) + '\n');
    
    console.log('📈 SUMMARY');
    console.log('-'.repeat(80));
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Passed: ${report.summary.passedTests}`);
    console.log(`Failed: ${report.summary.failedTests}`);
    console.log(`Success Rate: ${report.summary.successRate}`);
    console.log(`Average Response Time: ${report.summary.averageResponseTime}\n`);
    
    if (Object.keys(report.intentDetectionAccuracy).length > 0) {
      console.log('🎯 INTENT DETECTION ACCURACY');
      console.log('-'.repeat(80));
      for (const [intent, stats] of Object.entries(report.intentDetectionAccuracy)) {
        console.log(`${intent}: ${stats.accuracy} (${stats.correct}/${stats.total})`);
      }
      console.log('');
    }
    
    if (Object.keys(report.featureCoverage).length > 0) {
      console.log('🔧 FEATURE COVERAGE');
      console.log('-'.repeat(80));
      for (const [feature, stats] of Object.entries(report.featureCoverage)) {
        console.log(`${feature}: ${stats.successRate} (${stats.passed} passed, ${stats.failed} failed)`);
      }
      console.log('');
    }
    
    if (report.problems.length > 0) {
      console.log('⚠️  IDENTIFIED PROBLEMS');
      console.log('-'.repeat(80));
      report.problems.forEach((problem, index) => {
        console.log(`\n${index + 1}. [${problem.severity}] ${problem.category}`);
        console.log(`   Issue: ${problem.issue}`);
        console.log(`   Recommendation: ${problem.recommendation}`);
      });
      console.log('');
    }
    
    if (report.errors.length > 0) {
      console.log('❌ ERRORS');
      console.log('-'.repeat(80));
      report.errors.forEach((error, index) => {
        console.log(`\n${index + 1}. Test: ${error.testCase}`);
        console.log(`   Message: ${error.message}`);
        console.log(`   Error: ${error.error?.message || error.error}`);
      });
      console.log('');
    }
    
    console.log('='.repeat(80));
    
    // Save report to file
    const reportJson = JSON.stringify(report, null, 2);
    writeFileSync('test_report.json', reportJson);
    console.log('\n💾 Detailed report saved to: test_report.json');
    
    return report;
  }
}

/**
 * Main execution
 */
async function main() {
  const runner = new TestRunner();
  
  try {
    await runner.setup();
    
    // Check command line arguments for feature filter
    const filterFeature = process.argv[2] === '--feature' ? process.argv[3] : null;
    await runner.runAllTests(filterFeature);
    
    const report = runner.generateReport();
    await runner.teardown();
    
    // Exit with appropriate code
    process.exit(report.summary.failedTests > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Fatal error during test execution:', error);
    await runner.teardown();
    process.exit(1);
  }
}

// Run if executed directly
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && 
  (process.argv[1].replace(/\\/g, '/').endsWith('test_framework.js') ||
   process.argv[1] === __filename);

if (isMainModule) {
  main();
}

export { TestRunner, TestResults, MockServices };
