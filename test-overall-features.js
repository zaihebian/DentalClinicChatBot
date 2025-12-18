/**
 * Overall Feature Test: Tests all main features with mock conversations
 * Uses mocks for external services - NO CODE CHANGES
 * Tests basic and common use cases only
 */

import { openaiHandler } from './src/openaiHandler.js';
import { sessionManager } from './src/sessionManager.js';
import { googleCalendarService } from './src/googleCalendar.js';
import { googleSheetsService } from './src/googleSheets.js';
import { googleDocsService } from './src/googleDocs.js';
import OpenAI from 'openai';
import * as openaiHandlerModule from './src/openaiHandler.js';

// Mock external services
const originalMethods = {};

// Mock OpenAI
const mockOpenAI = {
  chat: {
    completions: {
      create: async (params) => {
        const userMessage = params.messages.find(m => m.role === 'user')?.content || '';
        const systemMessage = params.messages.find(m => m.role === 'system')?.content || '';
        
        // Mock intent detection
        if (systemMessage.includes('intent detection')) {
          if (userMessage.toLowerCase().includes('book') || userMessage.toLowerCase().includes('appointment')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ intents: ['booking'] })
                }
              }]
            };
          }
          if (userMessage.toLowerCase().includes('cancel')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ intents: ['cancel'] })
                }
              }]
            };
          }
          if (userMessage.toLowerCase().includes('reschedule')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ intents: ['reschedule'] })
                }
              }]
            };
          }
          if (userMessage.toLowerCase().includes('price') || userMessage.toLowerCase().includes('cost') || userMessage.toLowerCase().includes('how much')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ intents: ['price_inquiry'] })
                }
              }]
            };
          }
          if (userMessage.toLowerCase().includes('my appointment') || userMessage.toLowerCase().includes('what\'s my')) {
            return {
              choices: [{
                message: {
                  content: JSON.stringify({ intents: ['appointment_inquiry'] })
                }
              }]
            };
          }
          return {
            choices: [{
              message: {
                content: JSON.stringify({ intents: [] })
              }
            }]
          };
        }
        
        // Mock information extraction
        if (systemMessage.includes('information extraction')) {
          const extracted = {};
          if (userMessage.toLowerCase().includes('cleaning')) {
            extracted.treatmentType = 'Cleaning';
          }
          if (userMessage.toLowerCase().includes('filling')) {
            extracted.treatmentType = 'Filling';
          }
          if (userMessage.toLowerCase().includes('dr.') || userMessage.toLowerCase().includes('doctor')) {
            extracted.dentistName = 'Dr GeneralA';
          }
          if (userMessage.toLowerCase().includes('john')) {
            extracted.patientName = 'John Doe';
          }
          return {
            choices: [{
              message: {
                content: JSON.stringify(extracted)
              }
            }]
          };
        }
        
        // Mock confirmation detection
        if (systemMessage.includes('confirmation')) {
          const isYes = userMessage.toLowerCase().includes('yes') || 
                       userMessage.toLowerCase().includes('sure') ||
                       userMessage.toLowerCase().includes('ok') ||
                       userMessage.toLowerCase().includes('confirm');
          const isNo = userMessage.toLowerCase().includes('no') ||
                      userMessage.toLowerCase().includes('cancel') ||
                      userMessage.toLowerCase().includes('don\'t');
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  isConfirmation: isYes && !isNo
                })
              }
            }]
          };
        }
        
        // Mock response generation
        if (systemMessage.includes('virtual receptionist')) {
          if (userMessage.toLowerCase().includes('book')) {
            return {
              choices: [{
                message: {
                  content: 'I can help you book an appointment. What type of treatment do you need?'
                }
              }]
            };
          }
          if (userMessage.toLowerCase().includes('cancel')) {
            return {
              choices: [{
                message: {
                  content: 'I can help you cancel your appointment.'
                }
              }]
            };
          }
          if (userMessage.toLowerCase().includes('price')) {
            return {
              choices: [{
                message: {
                  content: 'Here is the pricing information:'
                }
              }]
            };
          }
          return {
            choices: [{
              message: {
                content: 'How can I help you today?'
              }
            }]
          };
        }
        
        // Default response
        return {
          choices: [{
            message: {
              content: 'I understand. How can I help you?'
            }
          }]
        };
      }
    }
  }
};

// Mock Google Calendar Service
const mockCalendarService = {
  findBookingByPhone: async (phone) => {
    if (phone === '+1234567890') {
      return {
        calendarId: 'test-calendar-id',
        calendarEventId: 'test-event-id',
        doctor: 'Dr GeneralA',
        startTime: new Date('2024-12-20T10:00:00Z'),
        endTime: new Date('2024-12-20T10:30:00Z'),
        patientName: 'John Doe',
        treatment: 'Cleaning'
      };
    }
    return null;
  },
  
  getAvailableSlots: async (startDate, endDate, calendarId) => {
    // Return mock available slots
    const slots = [];
    const baseDate = new Date(startDate);
    for (let i = 0; i < 5; i++) {
      const slotDate = new Date(baseDate);
      slotDate.setDate(slotDate.getDate() + i);
      slotDate.setHours(10 + i, 0, 0, 0);
      slots.push({
        start: slotDate,
        end: new Date(slotDate.getTime() + 30 * 60000),
        calendarId: calendarId || 'test-calendar-id'
      });
    }
    return slots;
  },
  
  createAppointment: async (calendarId, eventData) => {
    return {
      success: true,
      eventId: 'new-event-id-' + Date.now(),
      startTime: eventData.start,
      endTime: eventData.end
    };
  },
  
  cancelAppointment: async (calendarId, eventId) => {
    return { success: true };
  }
};

// Mock Google Sheets Service
const mockSheetsService = {
  logAction: async (data) => {
    // Just log, don't actually write
    return true;
  }
};

// Mock Google Docs Service
const mockDocsService = {
  getPricingInfo: async () => {
    return 'Cleaning: $100\nFilling: $200\nConsultation: $50';
  }
};

// Store original methods
originalMethods.calendar = {
  findBookingByPhone: googleCalendarService.findBookingByPhone,
  getAvailableSlots: googleCalendarService.getAvailableSlots,
  createAppointment: googleCalendarService.createAppointment,
  cancelAppointment: googleCalendarService.cancelAppointment
};
originalMethods.sheets = {
  logAction: googleSheetsService.logAction
};
originalMethods.docs = {
  getPricingInfo: googleDocsService.getPricingInfo
};

// Replace with mocks
// Note: We're replacing service methods, not modifying source code
googleCalendarService.findBookingByPhone = mockCalendarService.findBookingByPhone.bind(mockCalendarService);
googleCalendarService.getAvailableSlots = mockCalendarService.getAvailableSlots.bind(mockCalendarService);
googleCalendarService.createAppointment = mockCalendarService.createAppointment.bind(mockCalendarService);
googleCalendarService.cancelAppointment = mockCalendarService.cancelAppointment.bind(mockCalendarService);
googleSheetsService.logAction = mockSheetsService.logAction.bind(mockSheetsService);
googleDocsService.getPricingInfo = mockDocsService.getPricingInfo.bind(mockDocsService);

// Mock OpenAI by replacing the module's openai constant
// We'll use a proxy approach - intercept OpenAI calls
// Since openai is a const in the module, we need to patch it at runtime
// This is done via dynamic import replacement
const originalOpenAICreate = OpenAI.prototype.chat?.completions?.create;
if (originalOpenAICreate) {
  // Store original
  originalMethods.openaiCreate = originalOpenAICreate;
}

// Create a mock OpenAI instance wrapper
// We'll intercept at the call site by patching the module's openai object
// Since we can't directly modify the const, we'll use a different approach:
// Mock the actual OpenAI API calls by intercepting the completions.create method
// This requires accessing the openai instance from the module

// For now, we'll document that OpenAI mocking requires module-level access
// and proceed with service-level mocks which are sufficient for testing flow
console.log('⚠️  Note: OpenAI calls will use actual API (or fail if no API key)');
console.log('⚠️  For full mocking, OpenAI instance needs to be mocked at module level\n');

// Test cases
const testCases = [
  {
    name: 'Test 1: Booking Flow (Happy Path)',
    conversations: [
      { phone: '+1111111111', message: 'I want to book a cleaning appointment' },
      { phone: '+1111111111', message: 'Yes, that works' }
    ],
    expected: ['booking', 'confirmation']
  },
  {
    name: 'Test 2: Cancellation Flow',
    conversations: [
      { phone: '+1234567890', message: 'I want to cancel my appointment' }
    ],
    expected: ['cancel', 'success']
  },
  {
    name: 'Test 3: Reschedule Flow',
    conversations: [
      { phone: '+1234567890', message: 'I need to reschedule my appointment' }
    ],
    expected: ['reschedule', 'availability']
  },
  {
    name: 'Test 4: Price Inquiry',
    conversations: [
      { phone: '+2222222222', message: 'How much does a cleaning cost?' }
    ],
    expected: ['price_inquiry', 'pricing']
  },
  {
    name: 'Test 5: Appointment Inquiry',
    conversations: [
      { phone: '+1234567890', message: 'What\'s my appointment?' }
    ],
    expected: ['appointment_inquiry', 'details']
  },
  {
    name: 'Test 6: Booking with Treatment and Dentist',
    conversations: [
      { phone: '+3333333333', message: 'I need a filling with Dr. GeneralA' }
    ],
    expected: ['booking', 'treatment', 'dentist']
  },
  {
    name: 'Test 7: Booking Confirmation Decline',
    conversations: [
      { phone: '+4444444444', message: 'I want to book cleaning' },
      { phone: '+4444444444', message: 'No, that doesn\'t work' }
    ],
    expected: ['booking', 'decline']
  },
  {
    name: 'Test 8: Multi-message Booking Flow',
    conversations: [
      { phone: '+5555555555', message: 'I want an appointment' },
      { phone: '+5555555555', message: 'Cleaning' }
    ],
    expected: ['booking', 'treatment']
  }
];

async function runTests() {
  console.log('\n🧪 Overall Feature Test: All Main Features\n');
  console.log('='.repeat(60));
  console.log('Testing basic and common use cases with mock conversations');
  console.log('='.repeat(60) + '\n');

  let totalPassed = 0;
  let totalFailed = 0;

  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log('-'.repeat(60));
    
    // Clear session before each test (getSession will create if needed)
    const conversationId = testCase.conversations[0].phone;
    // Clear any existing session by deleting it
    const existingSession = sessionManager.getSessionData(conversationId);
    if (existingSession) {
      sessionManager.endSession(conversationId);
    }
    
    let testPassed = true;
    const results = [];

    try {
      for (const conv of testCase.conversations) {
        const response = await openaiHandler.generateResponse(
          conv.phone,
          conv.message,
          conv.phone
        );
        
        results.push({
          message: conv.message,
          response: response.substring(0, 100) + (response.length > 100 ? '...' : '')
        });
        
        console.log(`  User: "${conv.message}"`);
        console.log(`  Bot:  "${response.substring(0, 150)}${response.length > 150 ? '...' : ''}"`);
      }

      // Basic validation - check if response contains expected keywords
      const lastResponse = results[results.length - 1].response.toLowerCase();
      const hasExpected = testCase.expected.some(expected => {
        if (expected === 'booking') return lastResponse.includes('appointment') || lastResponse.includes('slot');
        if (expected === 'confirmation') return lastResponse.includes('confirmed') || lastResponse.includes('booked');
        if (expected === 'cancel') return lastResponse.includes('cancel');
        if (expected === 'success') return lastResponse.includes('cancelled') || lastResponse.includes('success');
        if (expected === 'reschedule') return lastResponse.includes('reschedule') || lastResponse.includes('available');
        if (expected === 'availability') return lastResponse.includes('available') || lastResponse.includes('slot');
        if (expected === 'price_inquiry') return lastResponse.includes('price') || lastResponse.includes('cost');
        if (expected === 'pricing') return lastResponse.includes('$') || lastResponse.includes('price');
        if (expected === 'appointment_inquiry') return lastResponse.includes('appointment') || lastResponse.includes('details');
        if (expected === 'details') return lastResponse.includes('doctor') || lastResponse.includes('date') || lastResponse.includes('time');
        if (expected === 'treatment') return lastResponse.includes('treatment') || lastResponse.includes('cleaning') || lastResponse.includes('filling');
        if (expected === 'dentist') return lastResponse.includes('doctor') || lastResponse.includes('dr');
        if (expected === 'decline') return lastResponse.includes('no') || lastResponse.includes('else') || lastResponse.includes('help');
        return false;
      });

      if (hasExpected) {
        console.log(`  ✅ PASS: Response contains expected content`);
        totalPassed++;
      } else {
        console.log(`  ⚠️  WARNING: Response may not contain expected content`);
        console.log(`     Expected: ${testCase.expected.join(', ')}`);
        testPassed = false;
        totalFailed++;
      }
    } catch (error) {
      console.log(`  ❌ FAIL: Error during test: ${error.message}`);
      console.log(`     Stack: ${error.stack}`);
      testPassed = false;
      totalFailed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📈 Total:  ${testCases.length}`);
  console.log('='.repeat(60) + '\n');

  // Restore original methods
  if (originalMethods.openai) {
    openaiHandler.openai = originalMethods.openai;
  }
  googleCalendarService.findBookingByPhone = originalMethods.calendar.findBookingByPhone;
  googleCalendarService.getAvailableSlots = originalMethods.calendar.getAvailableSlots;
  googleCalendarService.createAppointment = originalMethods.calendar.createAppointment;
  googleCalendarService.cancelAppointment = originalMethods.calendar.cancelAppointment;
  googleSheetsService.logAction = originalMethods.sheets.logAction;
  googleDocsService.getPricingInfo = originalMethods.docs.getPricingInfo;

  return totalFailed === 0;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test execution error:', error);
    process.exit(1);
  });
