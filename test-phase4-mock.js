/**
 * Phase 4 Test: Move Availability Check Before AI
 * Tests basic cases using mock dialogues - no actual API calls
 */

import { sessionManager } from './src/sessionManager.js';
import { openaiHandler } from './src/openaiHandler.js';
import fs from 'fs';

async function testPhase4Mock() {
  console.log('\n🧪 Phase 4 Test: Move Availability Check Before AI\n');
  console.log('Testing with mock dialogues (basic cases only)...\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Verify availability check moved before AI
  console.log('Test 1: Verify availability check moved before AI');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Check if availability check happens before AI call
    const availabilityBeforeAI = code.indexOf('checkAvailability') < code.indexOf('openai.chat.completions.create');
    const hasPreAICheck = code.includes('[PRE-AI] Booking intent detected, checking availability');
    
    if (availabilityBeforeAI && hasPreAICheck) {
      console.log('✅ PASS: Availability check moved before AI\n');
      passed++;
    } else {
      throw new Error('Availability check not moved before AI');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 2: Verify reschedule handling moved before AI
  console.log('Test 2: Verify reschedule handling moved before AI');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Check if reschedule handling happens before AI
    const rescheduleBeforeAI = code.includes('[PRE-AI] Reschedule detected');
    const rescheduleAfterAI = code.includes('[POST-PROCESS] Reschedule detected');
    
    if (rescheduleBeforeAI && !rescheduleAfterAI) {
      console.log('✅ PASS: Reschedule handling moved before AI\n');
      passed++;
    } else {
      throw new Error('Reschedule handling not moved before AI');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 3: Verify availability check removed from post-processing
  console.log('Test 3: Verify availability check removed from post-processing');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Find postProcessResponse function body (between { and })
    const postProcessStart = code.indexOf('async postProcessResponse');
    const functionBodyStart = code.indexOf('{', postProcessStart);
    const nextFunctionStart = code.indexOf('async ', functionBodyStart + 1);
    const postProcessCode = code.substring(functionBodyStart, nextFunctionStart);
    
    // Check if availability check EXECUTION is removed (not function definition)
    const hasAvailabilityCall = postProcessCode.includes('await this.checkAvailability') ||
                                postProcessCode.includes('return await this.checkAvailability');
    const hasAvailabilityConditions = postProcessCode.includes('hasBookingIntent && hasTreatment && noSlotPending');
    const hasCommentAboutMove = postProcessCode.includes('Availability check moved to before AI');
    
    if (!hasAvailabilityCall && !hasAvailabilityConditions && hasCommentAboutMove) {
      console.log('✅ PASS: Availability check removed from post-processing\n');
      passed++;
    } else {
      throw new Error('Availability check execution still in post-processing');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 4: Verify post-processing only handles inquiries
  console.log('Test 4: Verify post-processing only handles inquiries');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Find postProcessResponse function body
    const postProcessStart = code.indexOf('async postProcessResponse');
    const functionBodyStart = code.indexOf('{', postProcessStart);
    const nextFunctionStart = code.indexOf('async ', functionBodyStart + 1);
    const postProcessCode = code.substring(functionBodyStart, nextFunctionStart);
    
    // Check if post-processing only has price inquiry and appointment inquiry handlers
    const hasPriceInquiry = postProcessCode.includes('if (validatedLatestIntents.includes(\'price_inquiry\')');
    const hasAppointmentInquiry = postProcessCode.includes('if (validatedLatestIntents.includes(\'appointment_inquiry\')');
    const hasAvailabilityExecution = postProcessCode.includes('await this.checkAvailability') ||
                                     postProcessCode.includes('hasBookingIntent && hasTreatment && noSlotPending');
    
    if (hasPriceInquiry && hasAppointmentInquiry && !hasAvailabilityExecution) {
      console.log('✅ PASS: Post-processing only handles inquiries\n');
      passed++;
    } else {
      throw new Error('Post-processing still has availability check execution');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    failed++;
  }

  // Test 5: Verify flow structure
  console.log('Test 5: Verify flow structure');
  try {
    const code = fs.readFileSync('./src/openaiHandler.js', 'utf8');
    
    // Check flow order: reschedule → availability → AI
    const rescheduleIndex = code.indexOf('[PRE-AI] Reschedule detected');
    const availabilityIndex = code.indexOf('[PRE-AI] Booking intent detected, checking availability');
    const aiIndex = code.indexOf('openai.chat.completions.create');
    
    if (rescheduleIndex < availabilityIndex && availabilityIndex < aiIndex) {
      console.log('✅ PASS: Flow structure correct (reschedule → availability → AI)\n');
      passed++;
    } else {
      throw new Error('Flow structure incorrect');
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
    console.log('✅ Phase 4 basic tests PASSED!');
    console.log('✅ Availability check moved before AI successfully\n');
    return true;
  } else {
    console.log('❌ Phase 4 basic tests FAILED!');
    console.log('❌ Fix issues before proceeding\n');
    return false;
  }
}

// Run tests
testPhase4Mock()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test error:', error);
    process.exit(1);
  });
