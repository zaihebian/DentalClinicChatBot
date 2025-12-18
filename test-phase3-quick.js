/**
 * Quick Phase 3 Test: Simplify Main Flow
 * Tests basic cases only - no complex/rare situations
 */

import { sessionManager } from './src/sessionManager.js';
import { openaiHandler } from './src/openaiHandler.js';
import fs from 'fs';

async function quickTestPhase3() {
  console.log('\n🧪 Quick Phase 3 Test: Simplify Main Flow\n');
  console.log('Testing basic cases only...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Verify appointment inquiry special case removed
  console.log('Test 1: Verify appointment inquiry special case removed');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Check if old complex patterns are removed
    const hasAppointmentInquiryKeywords = code.includes('appointmentInquiryKeywords');
    const hasForceAppointmentInquiry = code.includes('forceAppointmentInquiry');
    const hasInquiryPreCheck = code.includes('Pre-check for appointment inquiry');
    
    if (!hasAppointmentInquiryKeywords && !hasForceAppointmentInquiry && !hasInquiryPreCheck) {
      console.log('✅ PASS: Appointment inquiry special case removed\n');
      passed++;
    } else {
      throw new Error('Appointment inquiry special case still present');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 2: Verify booking acknowledgment check removed
  console.log('Test 2: Verify booking acknowledgment check removed');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Check if booking acknowledgment check is removed
    const hasBookingJustCompleted = code.includes('bookingJustCompleted');
    const hasBookingAcknowledgment = code.includes('booking acknowledgment') || 
                                     code.includes('acknowledged booking completion');
    
    if (!hasBookingJustCompleted && !hasBookingAcknowledgment) {
      console.log('✅ PASS: Booking acknowledgment check removed\n');
      passed++;
    } else {
      throw new Error('Booking acknowledgment check still present');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 3: Verify intent processing simplified
  console.log('Test 3: Verify intent processing simplified');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Check if intent processing is simpler (no forced intents)
    const hasForcedIntent = code.includes('Forced appointment_inquiry intent') ||
                           code.includes('bypassing AI detection');
    
    // Check if intent detection is straightforward
    const hasSimpleIntentDetection = code.includes('detectedIntents = combinedResult.intents') ||
                                    code.includes('const detectedIntents = combinedResult.intents');
    
    if (!hasForcedIntent && hasSimpleIntentDetection) {
      console.log('✅ PASS: Intent processing simplified\n');
      passed++;
    } else {
      throw new Error('Intent processing not simplified');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 4: Verify flow is linear
  console.log('Test 4: Verify flow is linear');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Check flow structure - should have clear steps
    const hasStep1 = code.includes('STEP 1:') || code.includes('STEP 2:');
    const hasClearFlow = code.includes('detectIntentsAndExtractInformation') &&
                        code.includes('buildSystemPrompt') &&
                        code.includes('postProcessResponse');
    
    if (hasClearFlow) {
      console.log('✅ PASS: Flow is linear and clear\n');
      passed++;
    } else {
      throw new Error('Flow structure unclear');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 5: Verify no complex conditional logic removed
  console.log('Test 5: Verify complex conditionals removed');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Check for removed complex patterns
    const hasComplexPatterns = code.includes('hasInquiryKeywords && session.phone') &&
                               code.includes('forceAppointmentInquiry = true');
    
    if (!hasComplexPatterns) {
      console.log('✅ PASS: Complex conditionals removed\n');
      passed++;
    } else {
      throw new Error('Complex conditionals still present');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  if (failed === 0) {
    console.log('✅ Phase 3 basic tests PASSED!');
    console.log('✅ Main flow simplified successfully\n');
    return true;
  } else {
    console.log('❌ Phase 3 basic tests FAILED!');
    console.log('❌ Fix issues before proceeding\n');
    return false;
  }
}

// Run tests
quickTestPhase3()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test error:', error);
    process.exit(1);
  });
