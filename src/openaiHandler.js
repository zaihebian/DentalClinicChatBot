/**
 * OpenAI Handler module for managing AI conversations and business logic.
 * 
 * This module orchestrates the entire conversation flow:
 * - AI-powered intent detection (booking, cancel, reschedule, price inquiry)
 * - AI-powered information extraction (patient name, treatment, dentist, date/time)
 * - Response generation using OpenAI GPT models
 * - Business logic orchestration (availability checks, confirmations, cancellations)
 * - Calendar integration for appointment management
 * 
 * Key features:
 * - Robust validation of all AI-extracted data (defense in depth)
 * - Intent management: replaces old intents with new ones (doesn't accumulate)
 * - Fallback mechanisms: keyword-based detection if AI fails
 * - Comprehensive error handling and logging
 * 
 * @module openaiHandler
 */

import OpenAI from 'openai';
import { config } from './config.js';
import { sessionManager } from './sessionManager.js';
import { detectTreatmentType, getAvailableDentists, calculateTreatmentDuration, extractNumberOfTeeth } from './treatmentLogic.js';
import { googleCalendarService } from './googleCalendar.js';
import { googleSheetsService } from './googleSheets.js';
import { googleDocsService } from './googleDocs.js';
import { parseDateTimePreference, matchesDateTimePreference } from './utils/dateParser.js';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

/**
 * Constants for intent types
 */
const INTENTS = {
  BOOKING: 'booking',
  CANCEL: 'cancel',
  RESCHEDULE: 'reschedule',
  PRICE_INQUIRY: 'price_inquiry',
  APPOINTMENT_INQUIRY: 'appointment_inquiry'
};

const VALID_INTENTS = Object.values(INTENTS);

/**
 * Constants for treatment types
 */
const TREATMENT_TYPES = {
  CONSULTATION: 'Consultation',
  CLEANING: 'Cleaning',
  FILLING: 'Filling',
  BRACES_MAINTENANCE: 'Braces Maintenance'
};

const VALID_TREATMENT_TYPES = Object.values(TREATMENT_TYPES);

/**
 * Constants for dentist names
 */
const DENTISTS = {
  BRACES_A: 'Dr BracesA',
  BRACES_B: 'Dr BracesB',
  GENERAL_A: 'Dr GeneralA',
  GENERAL_B: 'Dr GeneralB'
};

const AVAILABLE_DENTISTS = Object.values(DENTISTS);

/**
 * Constants for dentist types
 */
const DENTIST_TYPES = {
  BRACES: 'braces',
  GENERAL: 'general'
};

/**
 * Constants for action result types
 */
const ACTION_TYPES = {
  BOOKING: 'booking',
  CANCELLATION: 'cancellation'
};

/**
 * Constants for confirmation keywords
 */
const CONFIRMATION_KEYWORDS = [
  'yes', 'ok', 'okay', 'sure', 'confirm', 'confirmed', 
  'yep', 'yeah', 'alright', 'sounds good', 'that works', 
  'perfect', 'great'
];

/**
 * Constants for decline keywords
 */
const DECLINE_KEYWORDS = [
  'no', 'nope', 'cancel', 'change', 'different', 'not', 
  "don't", 'decline'
];

/**
 * Constants for validation limits
 */
const VALIDATION_LIMITS = {
  PATIENT_NAME_MIN_LENGTH: 2,
  PATIENT_NAME_MAX_LENGTH: 100,
  MAX_TEETH_COUNT: 32,
  DATE_TIME_TEXT_MIN_LENGTH: 3,
  DATE_TIME_TEXT_MAX_LENGTH: 200
};

/**
 * Constants for working hours
 */
const WORKING_HOURS = {
  START: 9,  // 9 AM
  END: 18    // 6 PM (18:00)
};

/**
 * Constants for slot duration
 */
const SLOT_DURATION_MINUTES = 15;

/**
 * OpenAIHandler class manages all AI conversation logic and business operations.
 * 
 * This is a singleton class that provides a centralized interface for:
 * - Generating AI responses based on conversation context
 * - Detecting user intents using AI (with fallback to keyword matching)
 * - Extracting structured information from natural language (patient name, treatment, dentist, etc.)
 * - Post-processing responses and executing business logic
 * - Managing appointment bookings, cancellations, and availability checks
 * 
 * All methods are async and return Promises. Error handling is built-in with
 * graceful fallbacks and user-friendly error messages.
 * 
 * @class OpenAIHandler
 */
class OpenAIHandler {
  /**
   * Generates an AI response based on conversation context and user message.
   * Main entry point for processing user messages. Updates session, detects intent,
   * calls OpenAI API, post-processes response, and logs conversation.
   * 
   * Flow:
   * 1. Updates session phone number if not set
   * 2. Adds user message to conversation history
   * 3. Detects intents from message (validates format)
   * 4. Updates session with latest intents (replaces old, doesn't accumulate)
   * 5. Builds system prompt with context
   * 6. Calls OpenAI API with conversation history
   * 7. Post-processes response (extracts info, checks availability, handles business logic)
   * 8. Logs conversation to Google Sheets
   * 
   * @param {string} conversationId - Unique conversation identifier (phone number)
   * @param {string} userMessage - User's message text
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<string>} AI-generated response message
   * 
   * @example
   * // Standard booking request:
   * await generateResponse("+1234567890", "I want braces maintenance", "+1234567890")
   * // Output: "Which dentist would you like? Available options: Dr BracesA, Dr BracesB"
   * 
   * @example
   * // Confirmation (keeps existing intent):
   * await generateResponse("+1234567890", "Yes", "+1234567890")
   * // Session already has intent: ["booking"], selectedSlot exists
   * // Output: "✅ Appointment confirmed!\n\nDoctor: Dr GeneralA..."
   * 
   * @example
   * // Multiple intents in one message:
   * await generateResponse("+1234567890", "How much does cleaning cost and I want to book", "+1234567890")
   * // Output: AI response + pricing info + availability check
   * 
   * @example
   * // Error handling:
   * await generateResponse("+1234567890", "test", "+1234567890")
   * // On OpenAI API error:
   * // Output: "I apologize, I am experiencing technical difficulties. Please try again later or contact our receptionist."
   */
  async generateResponse(conversationId, userMessage, phoneNumber) {
    const session = sessionManager.getSession(conversationId);
    
    console.log('\n🚀 [GENERATE RESPONSE] Starting response generation');
    console.log('🚀 [GENERATE RESPONSE] User message:', userMessage);
    console.log('🚀 [GENERATE RESPONSE] Current session state:', {
      treatmentType: session.treatmentType,
      dentistName: session.dentistName,
      patientName: session.patientName,
      intents: session.intents,
      selectedSlot: session.selectedSlot ? {
        startTime: session.selectedSlot.startTime.toISOString(),
        endTime: session.selectedSlot.endTime?.toISOString(),
        doctor: session.selectedSlot.doctor
      } : null,
      bookingConfirmationPending: session.bookingConfirmationPending,
      bookingConfirmed: session.bookingConfirmed,
      eventId: session.eventId
    });
    
    // Check for "end session" command - handle before any other processing
    const endSessionPatterns = [
      /end\s+session/i,
      /clear\s+session/i,
      /reset\s+session/i,
      /start\s+over/i,
      /restart/i,
      /new\s+session/i
    ];
    
    const isEndSessionCommand = endSessionPatterns.some(pattern => pattern.test(userMessage.trim()));
    
    if (isEndSessionCommand) {
      console.log('🔄 [SESSION] End session command detected, clearing session');
      
      // Add user message and assistant response to history before ending session
      sessionManager.addMessage(conversationId, 'user', userMessage);
      const confirmationMessage = '✅ Your session has been cleared. Starting fresh! How can I help you today?';
      sessionManager.addMessage(conversationId, 'assistant', confirmationMessage);
      
      // Log assistant response before ending session
      await googleSheetsService.logConversationTurn(
        conversationId,
        phoneNumber,
        'assistant',
        confirmationMessage,
        session
      );
      
      // End the session (clears all state)
      sessionManager.endSession(conversationId);
      
      return confirmationMessage;
    }
    
    // Update phone if not set
    if (!session.phone) {
      sessionManager.updateSession(session.conversationId, { phone: phoneNumber });
      session.phone = phoneNumber;
    }

    // Add user message to history
    sessionManager.addMessage(session.conversationId, 'user', userMessage);

    // STEP 1: Combined intent detection and information extraction (single AI call)
    console.log('🔍 [PRE-AI] Combined intent detection and information extraction...');
    const combinedResult = await this.detectIntentsAndExtractInformation(userMessage, session);
    const detectedIntents = combinedResult.intents;
    const extracted = combinedResult.extracted;
    
    // Validate output format and content (defense in depth)
    // Ensures AI response is valid array of strings matching allowed intents
    const validatedIntents = Array.isArray(detectedIntents)
      ? detectedIntents.filter(intent => 
          typeof intent === 'string' && VALID_INTENTS.includes(intent)
        )
      : [];
    
    // Handle intent detection: update session with detected intents
    const hadPreviousIntent = session.intents && session.intents.length > 0;
    const hasNewIntent = validatedIntents.length > 0;
    
    // Check if user is confirming the clarifying question (responded "yes" to "Would you like to book?")
    const isConfirmingClarification = !hadPreviousIntent && 
                                       !hasNewIntent && 
                                       /^(yes|ok|okay|sure|yep|yeah|alright|confirm|confirmed)$/i.test(userMessage.trim());
    
    // Handle intent detection: update session with detected intents
    if (hasNewIntent) {
      // Intent detected - set it immediately
      console.log('🔍 [INTENT DETECTION] Intent detected, setting intent:', validatedIntents);
      sessionManager.updateSession(session.conversationId, { intents: validatedIntents });
      session.intents = validatedIntents;
    } else if (isConfirmingClarification) {
      // User confirmed the clarifying question - set booking intent
      console.log('🔍 [INTENT DETECTION] User confirmed clarifying question, setting booking intent');
      sessionManager.updateSession(session.conversationId, { intents: [INTENTS.BOOKING] });
      session.intents = [INTENTS.BOOKING];
    }
    // Note: If no intent detected, we still proceed to AI generation - AI will handle greetings and ask clarifying questions
    
    // Get latest intents from session (may have been updated above)
    const latestIntents = session.intents && session.intents.length > 0
      ? session.intents
      : (validatedIntents.length > 0 ? validatedIntents : []);

    // STEP 2: Validate and update session with extracted information
    console.log('📝 [PRE-AI] Validating and updating session with extracted information...');
    
    // Validate extracted information format (defense in depth) - comprehensive validation
    
    const validated = {
      patientName: null,
      treatmentType: null,
      dentistName: null,
      numberOfTeeth: null,
      dateTimeText: null,
    };
    
    // Validate patient name: string, trimmed, reasonable length (2-100 chars), alphanumeric with spaces/hyphens/apostrophes only
    if (typeof extracted.patientName === 'string') {
      const cleaned = extracted.patientName.trim();
      if (cleaned.length >= VALIDATION_LIMITS.PATIENT_NAME_MIN_LENGTH && 
          cleaned.length <= VALIDATION_LIMITS.PATIENT_NAME_MAX_LENGTH && 
          /^[a-zA-Z\s'-]+$/.test(cleaned)) {
        validated.patientName = cleaned;
        console.log('✅ [PRE-AI] Validated patientName:', validated.patientName);
      } else {
        console.log('❌ [PRE-AI] Invalid patientName format:', cleaned);
      }
    }
    
    // Validate treatment type: must be exact match from allowed list
    if (typeof extracted.treatmentType === 'string' && VALID_TREATMENT_TYPES.includes(extracted.treatmentType)) {
      validated.treatmentType = extracted.treatmentType;
      console.log('✅ [PRE-AI] Validated treatmentType:', validated.treatmentType);
    } else if (extracted.treatmentType) {
      console.log('❌ [PRE-AI] Invalid treatmentType:', extracted.treatmentType);
    }
    
    // Validate dentist name: must be exact match from available dentists
    if (typeof extracted.dentistName === 'string' && AVAILABLE_DENTISTS.includes(extracted.dentistName)) {
      validated.dentistName = extracted.dentistName;
      console.log('✅ [PRE-AI] Validated dentistName:', validated.dentistName);
    } else if (extracted.dentistName) {
      console.log('❌ [PRE-AI] Invalid dentistName:', extracted.dentistName);
    }
    
    // Validate number of teeth: integer, 1-32 range (human teeth count)
    if (typeof extracted.numberOfTeeth === 'number' && 
        Number.isInteger(extracted.numberOfTeeth) && 
        extracted.numberOfTeeth > 0 && 
        extracted.numberOfTeeth <= VALIDATION_LIMITS.MAX_TEETH_COUNT) {
      validated.numberOfTeeth = extracted.numberOfTeeth;
      console.log('✅ [PRE-AI] Validated numberOfTeeth:', validated.numberOfTeeth);
    } else if (extracted.numberOfTeeth !== null && extracted.numberOfTeeth !== undefined) {
      console.log('❌ [PRE-AI] Invalid numberOfTeeth:', extracted.numberOfTeeth);
    }
    
    // Validate date/time text: string, reasonable length (3-200 chars)
    if (typeof extracted.dateTimeText === 'string') {
      const cleaned = extracted.dateTimeText.trim();
      if (cleaned.length >= VALIDATION_LIMITS.DATE_TIME_TEXT_MIN_LENGTH && 
          cleaned.length <= VALIDATION_LIMITS.DATE_TIME_TEXT_MAX_LENGTH) {
        validated.dateTimeText = cleaned;
        console.log('✅ [PRE-AI] Validated dateTimeText:', validated.dateTimeText);
      } else {
        console.log('❌ [PRE-AI] Invalid dateTimeText length:', cleaned.length);
      }
    }

    // Update session with validated information
    const sessionUpdates = {};
    if (validated.patientName && !session.patientName) {
      sessionUpdates.patientName = validated.patientName;
      console.log('✅ [PRE-AI] Updating patientName:', validated.patientName);
    }
    if (validated.treatmentType && !session.treatmentType) {
      sessionUpdates.treatmentType = validated.treatmentType;
      console.log('✅ [PRE-AI] Updating treatmentType:', validated.treatmentType);
    }
    if (validated.dentistName && !session.dentistName) {
      // Validate dentist is available for treatment type
      const currentTreatment = session.treatmentType || validated.treatmentType;
      if (currentTreatment) {
        const availableDentistsForTreatment = getAvailableDentists(currentTreatment);
        if (availableDentistsForTreatment.includes(validated.dentistName)) {
          sessionUpdates.dentistName = validated.dentistName;
          sessionUpdates.dentistType = currentTreatment === TREATMENT_TYPES.BRACES_MAINTENANCE ? DENTIST_TYPES.BRACES : DENTIST_TYPES.GENERAL;
          console.log('✅ [PRE-AI] Updating dentistName:', validated.dentistName);
        }
      }
    }
    if (validated.numberOfTeeth && session.treatmentType === TREATMENT_TYPES.FILLING && !session.numberOfTeeth) {
      sessionUpdates.numberOfTeeth = validated.numberOfTeeth;
      console.log('✅ [PRE-AI] Updating numberOfTeeth:', validated.numberOfTeeth);
    }
    if (validated.dateTimeText && !session.dateTimePreference) {
      sessionUpdates.dateTimePreference = validated.dateTimeText;
      console.log('✅ [PRE-AI] Updating dateTimePreference:', validated.dateTimeText);
    }
    
    if (Object.keys(sessionUpdates).length > 0) {
      sessionManager.updateSession(session.conversationId, sessionUpdates);
      // Update local session reference with changes
      Object.assign(session, sessionUpdates);
      console.log('🔍 [SESSION UPDATE] Applied updates:', Object.keys(sessionUpdates));
    }

    // DEBUG: Log session state after updates
    console.log('🔍 [SESSION STATE] After validation/updates:', {
      treatmentType: session.treatmentType,
      hasSelectedSlot: !!session.selectedSlot,
      bookingConfirmationPending: session.bookingConfirmationPending,
      bookingConfirmed: session.bookingConfirmed
    });

    // Default treatment to Consultation if booking intent but no treatment specified
    if (!session.treatmentType && latestIntents.includes(INTENTS.BOOKING)) {
      sessionManager.updateSession(session.conversationId, { treatmentType: TREATMENT_TYPES.CONSULTATION });
      session.treatmentType = TREATMENT_TYPES.CONSULTATION;
      console.log('✅ [PRE-AI] Defaulting to Consultation for booking');
    }

    // STEP 3: Handle critical actions before AI (book/cancel)
    let actionResult = null; // { type: 'booking'|'cancellation', success: boolean, message: string, details: object }
    
    // DEBUG: Log session state before confirmation check
    console.log('🔍 [CONFIRMATION CHECK] Session state:', {
      hasSelectedSlot: !!session.selectedSlot,
      bookingConfirmationPending: session.bookingConfirmationPending,
      bookingConfirmed: session.bookingConfirmed,
      treatmentType: session.treatmentType,
      patientName: session.patientName,
      intents: session.intents
    });
    console.log('🔍 [CONFIRMATION CHECK] Condition evaluation:', {
      'session.selectedSlot exists': !!session.selectedSlot,
      'bookingConfirmationPending': session.bookingConfirmationPending,
      'will enter confirmation check': !!(session.selectedSlot && session.bookingConfirmationPending)
    });
    
    // Check for confirmation (slot pending + user confirms)
    if (session.selectedSlot && session.bookingConfirmationPending) {
      const confirmationResult = await this.detectConfirmationOrDecline(userMessage, {
        hasPendingSlot: true
      });
      const isConfirmation = confirmationResult.isConfirmation;
      const isDecline = confirmationResult.isDecline;
      
      if (isConfirmation) {
        console.log('✅ [PRE-AI] User confirmed slot, proceeding to booking...');
        // Check patient name before booking
        if (!session.patientName) {
          actionResult = {
            type: ACTION_TYPES.BOOKING,
            success: false,
            message: 'Patient name is required before booking',
            requiresPatientName: true
          };
        } else {
          // Attempt booking
          // FIX: Store selectedSlot values before booking (it gets cleared after successful booking)
          const slotStartTime = session.selectedSlot?.startTime;
          const slotEndTime = session.selectedSlot?.endTime;
          
          try {
            const result = await this.confirmBooking(session);
            // Simple: just check result.success
            if (result.success) {
              // Booking succeeded
              actionResult = {
                type: ACTION_TYPES.BOOKING,
                success: true,
                message: result.message,
                details: {
                  doctor: session.dentistName,
                  treatment: session.treatmentType,
                  date: slotStartTime?.toLocaleDateString() || 'N/A',
                  time: slotStartTime?.toLocaleTimeString() || 'N/A'
                }
              };
            } else {
              // Booking failed - state already cleared in confirmBooking
              actionResult = {
                type: ACTION_TYPES.BOOKING,
                success: false,
                message: result.message,
                details: {}
              };
            }
          } catch (error) {
            console.error('❌ [PRE-AI] Booking error:', error);
            // Clear state on error
            sessionManager.updateSession(session.conversationId, {
              selectedSlot: null,
              bookingConfirmationPending: false,
              bookingConfirmed: false
            });
            session.selectedSlot = null;
            session.bookingConfirmationPending = false;
            session.bookingConfirmed = false;
            actionResult = {
              type: ACTION_TYPES.BOOKING,
              success: false,
              message: error.message || 'Booking failed due to technical error',
              details: {}
            };
          }
        }
      } else if (isDecline) {
        // User declined slot
        console.log('❌ [PRE-AI] User declined slot');
        sessionManager.updateSession(session.conversationId, { 
          selectedSlot: null,
          bookingConfirmationPending: false,
          bookingConfirmed: false
        });
        session.selectedSlot = null;
        session.bookingConfirmationPending = false;
        session.bookingConfirmed = false;
        actionResult = {
          type: ACTION_TYPES.BOOKING,
          success: false,
          message: 'User declined the appointment slot',
          declined: true
        };
      }
    }
    
    // Handle cancellation: simple flow - check calendar, cancel if found, reply politely if not
    if (!actionResult && latestIntents.includes(INTENTS.CANCEL)) {
      console.log('🔄 [PRE-AI] Cancellation intent detected, processing cancellation...');
      try {
        const result = await this.handleCancellation(session, userMessage);
        
        // Simple: just check result.success
        actionResult = {
          type: ACTION_TYPES.CANCELLATION,
          success: result.success,
          message: result.message,
          details: {}
        };
      } catch (error) {
        console.error('❌ [PRE-AI] Cancellation error:', error);
        actionResult = {
          type: ACTION_TYPES.CANCELLATION,
          success: false,
          message: error.message || 'Cancellation failed',
          details: {}
        };
      }
    }
    
    // Return early if booking was successful to prevent post-processing from running
    // This prevents availability check from running again after successful booking
    if (actionResult && actionResult.type === ACTION_TYPES.BOOKING && actionResult.success) {
      console.log('✅ [PRE-AI] Booking successful, returning early to prevent post-processing');
      const bookingMessage = actionResult.message || 'Appointment booked successfully';
      sessionManager.addMessage(session.conversationId, 'assistant', bookingMessage);
      await googleSheetsService.logConversationTurn(session.conversationId, phoneNumber, 'assistant', bookingMessage, session);
      return bookingMessage;
    }
    
    // FIX: Return early if cancellation was processed (successful or requires confirmation)
    // This ensures cancellation messages are returned immediately
    if (actionResult && actionResult.type === ACTION_TYPES.CANCELLATION) {
      console.log('🔄 [PRE-AI] Cancellation processed, returning cancellation message');
      const cancellationMessage = actionResult.message || 'Cancellation processed';
      sessionManager.addMessage(session.conversationId, 'assistant', cancellationMessage);
      await googleSheetsService.logConversationTurn(session.conversationId, phoneNumber, 'assistant', cancellationMessage, session);
      return cancellationMessage;
    }
    
    // Handle reschedule intent
    if (latestIntents.includes(INTENTS.RESCHEDULE)) {
      console.log('🔄 [RESCHEDULE] Reschedule intent detected');
      
      const rescheduleResult = await this.handleReschedule(session, userMessage);
      
      if (rescheduleResult.success && rescheduleResult.shouldProceedToBooking) {
        // Old booking cancelled, proceed to booking flow
        // Clear reschedule intent and set booking intent
        sessionManager.updateSession(session.conversationId, {
          intents: [INTENTS.BOOKING] // Switch to booking intent
        });
        session.intents = [INTENTS.BOOKING];
        
        // Return message and let booking flow continue
        const rescheduleMessage = rescheduleResult.message;
        sessionManager.addMessage(session.conversationId, 'assistant', rescheduleMessage);
        await googleSheetsService.logConversationTurn(session.conversationId, phoneNumber, 'assistant', rescheduleMessage, session);
        return rescheduleMessage;
      } else if (rescheduleResult.success) {
        // Reschedule completed but shouldn't proceed to booking (shouldn't happen)
        const rescheduleMessage = rescheduleResult.message;
        sessionManager.addMessage(session.conversationId, 'assistant', rescheduleMessage);
        await googleSheetsService.logConversationTurn(session.conversationId, phoneNumber, 'assistant', rescheduleMessage, session);
        return rescheduleMessage;
      } else {
        // Reschedule in progress or failed - return message
        const rescheduleMessage = rescheduleResult.message;
        sessionManager.addMessage(session.conversationId, 'assistant', rescheduleMessage);
        await googleSheetsService.logConversationTurn(session.conversationId, phoneNumber, 'assistant', rescheduleMessage, session);
        return rescheduleMessage;
      }
    }
    
    // Check availability BEFORE AI if booking intent + ready
    let availabilityResult = null;
    const hasBookingIntent = latestIntents.includes(INTENTS.BOOKING) ||
                             (session.intents && session.intents.includes(INTENTS.BOOKING));
    const hasTreatment = session.treatmentType;
    const noSlotPending = !session.selectedSlot;
    const hasPatientName = session.patientName;
    const isAlreadyConfirmed = session.bookingConfirmed;
    
    if (hasBookingIntent && hasTreatment && noSlotPending && hasPatientName && !isAlreadyConfirmed) {
      console.log('📅 [PRE-AI] Booking intent detected, checking availability before AI');
      try {
        availabilityResult = await this.checkAvailability(conversationId, session, userMessage);
        console.log('📅 [PRE-AI] Availability checked, result length:', availabilityResult?.length || 0);
        
        // If availability check returned a message (slots found), return it directly
        // This prevents AI from generating a response when we already have slots
        if (availabilityResult && typeof availabilityResult === 'string' && availabilityResult.length > 0) {
          console.log('📅 [PRE-AI] Availability slots found, returning directly');
          sessionManager.addMessage(session.conversationId, 'assistant', availabilityResult);
          await googleSheetsService.logConversationTurn(session.conversationId, phoneNumber, 'assistant', availabilityResult, session);
          return availabilityResult;
        }
      } catch (error) {
        console.error('❌ [PRE-AI] Error checking availability:', error);
        // Continue without availability info - AI will handle it
      }
    }
    
    // Build system prompt with context and action results
    const systemPrompt = this.buildSystemPrompt(session, actionResult);
    
    // Build conversation history for OpenAI (use session to include latest state)
    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    try {
      const completion = await openai.chat.completions.create({
        model: config.openai.model,
        messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      let aiResponse = completion.choices[0]?.message?.content || 'I apologize, I did not understand that. Could you please rephrase?';
      
      console.log('🤖 [AI RESPONSE] Raw AI response:', aiResponse.substring(0, 200));

      // Post-process response using only the latest intents (from current message or kept from previous)
      // Use updated intents from session (may include confirmed clarification)
      const intentsForPostProcess = session.intents && session.intents.length > 0 
        ? session.intents 
        : latestIntents;
      aiResponse = await this.postProcessResponse(userMessage, aiResponse, session, intentsForPostProcess);
      
      console.log('✅ [AI RESPONSE] Final response after post-processing:', aiResponse.substring(0, 200));
      
      // Check if AI claimed scheduling without actually booking
      const claimedScheduled = /(scheduled|booked|confirmed|appointment is set)/i.test(aiResponse);
      const hasEventId = session.eventId;
      if (claimedScheduled && !hasEventId) {
        console.log('⚠️ [AI RESPONSE] WARNING: AI claimed scheduling but no event ID found - this may be a false claim');
        console.log('⚠️ [AI RESPONSE] Session state:', {
          hasSelectedSlot: !!session.selectedSlot,
          bookingConfirmationPending: session.bookingConfirmationPending,
          bookingConfirmed: session.bookingConfirmed,
          eventId: session.eventId
        });
      }

      // Add AI response to history
      sessionManager.addMessage(session.conversationId, 'assistant', aiResponse);

      // Log conversation
      await googleSheetsService.logConversationTurn(session.conversationId, phoneNumber, 'assistant', aiResponse, session);

      return aiResponse;
    } catch (error) {
      console.error('Error generating OpenAI response:', error);
      return 'I apologize, I am experiencing technical difficulties. Please try again later or contact our receptionist.';
    }
  }

  /**
   * Combined method: Detects intents and extracts information in a single AI call.
   * This reduces API calls from 2 to 1, improving performance while maintaining the same logic.
   * 
   * @param {string} message - User's message text
   * @param {Object} session - Current session object
   * @returns {Promise<Object>} Object with intents array and extracted information
   * @returns {string[]} returns.intents - Array of detected intents
   * @returns {Object} returns.extracted - Extracted information object
   * @private
   */
  async detectIntentsAndExtractInformation(message, session) {
    try {
      // Build context for AI
      const existingIntents = session.intents && session.intents.length > 0 
        ? `Current intents in conversation: ${session.intents.join(', ')}. ` 
        : '';
      
      const conversationContext = session.conversationHistory && session.conversationHistory.length > 0
        ? `Recent conversation context: ${session.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('; ')}. `
        : '';

      
      const contextInfo = [];
      if (session.treatmentType) {
        contextInfo.push(`Current treatment: ${session.treatmentType}`);
      }
      if (session.dentistName) {
        contextInfo.push(`Current dentist: ${session.dentistName}`);
      }
      if (session.patientName) {
        contextInfo.push(`Patient name: ${session.patientName}`);
      }
      
      // Check if user has existing appointment for context
      let appointmentContext = '';
      if (session.phone) {
        try {
          const existingBooking = await googleCalendarService.findBookingByPhone(session.phone);
          if (existingBooking) {
            appointmentContext = `IMPORTANT CONTEXT: User has an existing appointment with ${existingBooking.doctor} on ${existingBooking.startTime.toLocaleDateString()}. `;
            contextInfo.push(`Existing appointment: ${existingBooking.doctor} on ${existingBooking.startTime.toLocaleDateString()}`);
          }
        } catch (error) {
          // Ignore errors, continue without context
        }
      }

      const combinedPrompt = `You are an intent detection and information extraction system for a dental appointment chatbot. Analyze the user's message and perform TWO tasks:

TASK 1: Detect intent(s)
${appointmentContext}Available intents:
- "booking": User wants to book/make/schedule a NEW appointment (not checking existing one)
- "cancel": User wants to cancel an existing appointment
- "reschedule": User wants to change/move/reschedule an existing appointment to a different time
- "price_inquiry": User is asking about prices, costs, fees, or charges
- "appointment_inquiry": User wants to check/view their EXISTING appointment details (time, date, doctor). Examples: "when is my appointment", "what time is my appointment", "check my appointment", "tell me about my appointment", "when do I have an appointment"

Intent detection rules:
1. Detect ALL relevant intents in the message (can be multiple)
2. Ignore negations (e.g., "I don't want to cancel" = no cancel intent)
3. Ignore confirmations or simple responses like "yes", "ok", "sure" unless they contain new intent
4. If message is just confirming something (yes/no), return empty array
5. Consider conversation context - if user is already in a booking flow and says "yes", don't add new booking intent
6. CRITICAL: "appointment_inquiry" vs "booking" distinction:
   ${appointmentContext ? `   - USER HAS EXISTING APPOINTMENT (see context above). If user asks "when is my appointment", "what time is my appointment", "check my appointment" → ALWAYS use "appointment_inquiry", NOT "booking".` : ''}
   - If user asks "when is my appointment", "what time is my appointment", "check my appointment" → "appointment_inquiry" (checking existing)
   - If user says "I want to book", "schedule an appointment", "make an appointment" → "booking" (scheduling new)
   - If message contains "my appointment" + question words (when/what/where) → "appointment_inquiry"
7. DO NOT default to "booking" - if no intents detected, return empty array

TASK 2: Extract structured information
Available treatment types: ${VALID_TREATMENT_TYPES.join(', ')}
Available dentists: ${AVAILABLE_DENTISTS.join(', ')}

${contextInfo.length > 0 ? `Current session context: ${contextInfo.join(', ')}` : ''}

Extract the following information:
1. Patient name: Extract if mentioned (e.g., "I'm John", "my name is Jane Doe", "this is Mike")
2. Treatment type: One of: ${VALID_TREATMENT_TYPES.join(', ')} or null if not mentioned
   - IMPORTANT: Suggest treatment based on symptoms:
     * Symptoms like "toothache", "pain", "hurt", "ache", "sore", "discomfort", "sensitive", "swollen", "bleeding gums" → "Consultation"
     * "cleaning", "clean", "teeth cleaning", "dental cleaning", "hygiene" → "Cleaning"
     * "filling", "fill", "cavity", "cavities", "decay", "hole in tooth" → "Filling"
     * "braces", "braces maintenance", "orthodontic", "orthodontics", "wire adjustment", "bracket" → "Braces Maintenance"
   - If treatment is unclear from symptoms/description, default to "Consultation"
   - Only return null if absolutely no treatment-related information is present
3. Dentist name: One of the available dentists or null if not mentioned
   - Match variations: "GeneralA", "Dr GeneralA", "Dr. GeneralA", "General A" → "Dr GeneralA"
   - Same pattern for all dentists
4. Number of teeth: Integer 1-32 if mentioned (only relevant for fillings), null otherwise
5. Date/time text: Extract any date/time preferences as raw text (e.g., "tomorrow at 10am", "next Tuesday 1pm") or null

${existingIntents}${conversationContext}
User message: "${message}"

Return ONLY a valid JSON object with these exact keys:
{
  "intents": ["booking"] or ["price_inquiry", "booking"] or [] etc.,
  "patientName": string or null,
  "treatmentType": string or null,
  "dentistName": string or null,
  "numberOfTeeth": number or null,
  "dateTimeText": string or null
}

JSON object:`;

      const completion = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a precise intent detection and information extraction system. Always return ONLY a valid JSON object, no explanations, no markdown, just the JSON. Example: {"intents": ["booking"], "patientName": "John Doe", "treatmentType": "Cleaning", "dentistName": null, "numberOfTeeth": null, "dateTimeText": "tomorrow at 10am"}'
          },
          {
            role: 'user',
            content: combinedPrompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent, accurate detection
        max_tokens: 250, // Slightly more tokens for combined response
      });

      const response = completion.choices[0]?.message?.content?.trim();
      
      console.log('🔍 [COMBINED AI] AI Response:', response);
      
      if (!response) {
        console.log('⚠️ [COMBINED AI] No AI response, using fallbacks');
        return {
          intents: this.fallbackIntentDetection(message, session),
          extracted: { patientName: null, treatmentType: null, dentistName: null, numberOfTeeth: null, dateTimeText: null }
        };
      }

      // Parse JSON response
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON object found in response');
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Extract intents
        let intents = [];
        if (Array.isArray(parsed.intents)) {
          intents = parsed.intents;
        } else if (parsed.intent) {
          intents = [parsed.intent];
        }
        
        // Validate intents
        const filteredIntents = intents
          .filter(intent => typeof intent === 'string' && VALID_INTENTS.includes(intent))
          .filter((intent, index, self) => self.indexOf(intent) === index); // Remove duplicates
        
        console.log('🔍 [COMBINED AI] Parsed intents:', filteredIntents);
        
        // Extract information
        const extracted = {
          patientName: parsed.patientName || null,
          treatmentType: parsed.treatmentType || null,
          dentistName: parsed.dentistName || null,
          numberOfTeeth: parsed.numberOfTeeth || null,
          dateTimeText: parsed.dateTimeText || null,
        };
        
        console.log('📝 [COMBINED AI] Parsed extracted:', extracted);
        
        return {
          intents: filteredIntents,
          extracted: extracted
        };
      } catch (parseError) {
        console.warn('Failed to parse AI combined response, using fallbacks:', parseError);
        return {
          intents: this.fallbackIntentDetection(message, session),
          extracted: { patientName: null, treatmentType: null, dentistName: null, numberOfTeeth: null, dateTimeText: null }
        };
      }
    } catch (error) {
      console.error('Error in combined AI call, using fallbacks:', error);
      return {
        intents: this.fallbackIntentDetection(message, session),
        extracted: { patientName: null, treatmentType: null, dentistName: null, numberOfTeeth: null, dateTimeText: null }
      };
    }
  }

  /**
   * Detects user intents from message text using AI (OpenAI).
   * Can detect multiple intents in a single message. Uses AI for accurate detection
   * that handles context, negations, and natural language variations.
   * Falls back to keyword-based detection if AI fails.
   * 
   * Valid intents: 'booking', 'cancel', 'reschedule', 'price_inquiry'
   * 
   * Edge cases handled:
   * - Negations: "I don't want to cancel" → no cancel intent
   * - Confirmations: "Yes" → empty array (keeps existing intent)
   * - Multiple intents: "Check price and book" → ["price_inquiry", "booking"]
   * - Default booking: New requests without explicit intent default to "booking"
   * 
   * @param {string} message - User's message text
   * @param {Object} session - Current session object
   * @param {string[]} [session.intents] - Existing intents in session (for context)
   * @returns {Promise<string[]>} Array of detected intents (validated, duplicates removed)
   * 
   * @example
   * // Single intent:
   * await detectIntents("I want to cancel my appointment", { intents: [] })
   * // Output: ["cancel"]
   * 
   * @example
   * // Multiple intents:
   * await detectIntents("How much does cleaning cost and I want to book", { intents: [] })
   * // Output: ["price_inquiry", "booking"]
   * 
   * @example
   * // Confirmation (no new intent):
   * await detectIntents("Yes", { intents: ["booking"] })
   * // Output: [] (empty - keeps existing intent in session)
   * 
   * @example
   * // Negation (no intent):
   * await detectIntents("I don't want to cancel", { intents: [] })
   * // Output: [] (negation detected)
   * 
   * @example
   * // Default booking for new requests:
   * await detectIntents("Hello", { intents: [] })
   * // Output: ["booking"] (defaults to booking for new conversations)
   * 
   * @example
   * // AI failure - falls back to keyword detection:
   * // If OpenAI API fails, uses fallbackIntentDetection()
   * // Output: ["booking"] (from keyword matching)
   */
  async detectIntents(message, session) {
    try {
      // Build context for AI
      const existingIntents = session.intents && session.intents.length > 0 
        ? `Current intents in conversation: ${session.intents.join(', ')}. ` 
        : '';
      
      const conversationContext = session.conversationHistory && session.conversationHistory.length > 0
        ? `Recent conversation context: ${session.conversationHistory.slice(-3).map(m => `${m.role}: ${m.content}`).join('; ')}. `
        : '';

      const intentPrompt = `You are an intent detection system for a dental appointment chatbot. Analyze the user's message and detect their intent(s).

Available intents:
- "booking": User wants to book/make/schedule a new appointment
- "cancel": User wants to cancel an existing appointment
- "reschedule": User wants to change/move/reschedule an existing appointment to a different time
- "price_inquiry": User is asking about prices, costs, fees, or charges
- "appointment_inquiry": User wants to check/view their appointment details (time, date, doctor)

Rules:
1. Detect ALL relevant intents in the message (can be multiple)
2. Ignore negations (e.g., "I don't want to cancel" = no cancel intent)
3. Ignore confirmations or simple responses like "yes", "ok", "sure" unless they contain new intent
4. If message is just confirming something (yes/no), return empty array
5. Consider conversation context - if user is already in a booking flow and says "yes", don't add new booking intent
6. DO NOT default to "booking" - if no intents detected, return empty array

${existingIntents}${conversationContext}
User message: "${message}"

Return ONLY a valid JSON array of intent strings. Examples:
- ["booking"]
- ["price_inquiry", "booking"]
- ["cancel"]
- []
- ["reschedule"]

JSON array:`;

      const completion = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a precise intent detection system. Always return ONLY a valid JSON array of strings, no explanations, no markdown, just the array. Example: ["booking"] or ["price_inquiry", "booking"] or [].'
          },
          {
            role: 'user',
            content: intentPrompt
          }
        ],
        temperature: 0.1, // Low temperature for consistent, accurate detection
        max_tokens: 50, // Intent detection should be short
      });

      const response = completion.choices[0]?.message?.content?.trim();
      
      console.log('🔍 [INTENT DETECTION] AI Response:', response);
      console.log('🔍 [INTENT DETECTION] Existing intents:', session.intents);
      
      if (!response) {
        console.log('⚠️ [INTENT DETECTION] No AI response, using fallback');
        return this.fallbackIntentDetection(message, session);
      }

      // Parse JSON response - robust parsing handles various AI response formats
      let intents = [];
      try {
        // Try to find JSON array in response (handles markdown code blocks or plain JSON)
        // AI sometimes wraps JSON in markdown: ```json [...] ``` or just returns [...]
        const jsonMatch = response.match(/\[.*?\]/s);
        if (jsonMatch) {
          intents = JSON.parse(jsonMatch[0]);
        } else {
          // Try parsing entire response as JSON (handles object with intents array or single intent)
          const parsed = JSON.parse(response);
          if (Array.isArray(parsed)) {
            intents = parsed;
          } else if (parsed.intents && Array.isArray(parsed.intents)) {
            // AI returned { "intents": [...] }
            intents = parsed.intents;
          } else if (parsed.intent) {
            // AI returned { "intent": "booking" } (single intent as object)
            intents = [parsed.intent];
          }
        }

        console.log('🔍 [INTENT DETECTION] Parsed intents:', intents);

        // Validate intents format and content (defense in depth)
        // Filters out invalid types, non-string values, and duplicates
        const filteredIntents = intents
          .filter(intent => typeof intent === 'string' && VALID_INTENTS.includes(intent))
          .filter((intent, index, self) => self.indexOf(intent) === index); // Remove duplicates
        
        console.log('🔍 [INTENT DETECTION] Filtered intents:', filteredIntents);
        
        // DO NOT default to booking - return empty array if no intents detected
        // This allows the system to ask clarifying questions instead

        console.log('✅ [INTENT DETECTION] Final intents:', filteredIntents);
        return filteredIntents;
      } catch (parseError) {
        console.warn('Failed to parse AI intent response, using fallback:', parseError);
        return this.fallbackIntentDetection(message, session);
      }
    } catch (error) {
      console.error('Error in AI intent detection, using fallback:', error);
      return this.fallbackIntentDetection(message, session);
    }
  }

  /**
   * Detects confirmation or decline intent from user message using AI.
   * Understands natural language variations better than regex keyword matching.
   * 
   * @param {string} userMessage - User's message text
   * @param {Object} context - Context about what user is confirming/declining
   * @param {boolean} context.hasPendingSlot - Whether user has a pending appointment slot
   * @param {boolean} context.hasExistingBooking - Whether user has an existing booking to cancel
   * @returns {Promise<Object>} Object with isConfirmation, isDecline, and confidence
   * @private
   */
  async detectConfirmationOrDecline(userMessage, context = {}) {
    try {
      const contextDescription = [];
      if (context.hasPendingSlot) {
        contextDescription.push('User has a pending appointment slot waiting for confirmation');
      }
      if (context.hasPendingCancellation) {
        contextDescription.push('User is being asked to confirm cancellation of an existing appointment');
      }
      if (context.hasPendingReschedule) {
        contextDescription.push('User is being asked to confirm rescheduling of an existing appointment');
      }
      if (context.hasExistingBooking) {
        contextDescription.push('User has an existing appointment that can be cancelled');
      }
      
      const prompt = `Determine if the user is confirming or declining something.

Context: ${contextDescription.join('. ') || 'General conversation'}

User message: "${userMessage}"

Return ONLY a JSON object with:
- "isConfirmation": true/false (user is confirming/accepting)
- "isDecline": true/false (user is declining/rejecting)
- "confidence": 0.0-1.0 (confidence in the detection)

Examples:
- "yes", "ok", "sure", "that works", "sounds good" → isConfirmation: true
- "no", "nope", "maybe later", "I'll pass" → isDecline: true
- "maybe", "I'm not sure" → both false
- "I want to change it" → isDecline: true (declining current option)

JSON object:`;

      const completion = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a confirmation/decline detection system. Always return ONLY a valid JSON object, no explanations, no markdown, just the JSON. Example: {"isConfirmation": true, "isDecline": false, "confidence": 0.95}'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 50,
      });

      const response = completion.choices[0]?.message?.content?.trim();
      const result = JSON.parse(response);
      
      return {
        isConfirmation: result.isConfirmation === true,
        isDecline: result.isDecline === true,
        confidence: result.confidence || 0.5
      };
    } catch (error) {
      console.error('Error detecting confirmation/decline with AI, using fallback:', error);
      // Fallback to simple keyword matching
      const msg = userMessage.toLowerCase();
      const hasConfirmationKeyword = CONFIRMATION_KEYWORDS.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(msg);
      });
      const hasDeclineKeyword = DECLINE_KEYWORDS.some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        return regex.test(msg);
      });
      
      return {
        isConfirmation: hasConfirmationKeyword && !hasDeclineKeyword,
        isDecline: hasDeclineKeyword,
        confidence: 0.5
      };
    }
  }

  /**
   * Extracts date and time preferences from user message using AI.
   * AI understands natural language, then code calculates actual dates.
   * 
   * @param {string} userMessage - User's message text
   * @param {Date} referenceDate - Reference date for relative dates (defaults to now)
   * @returns {Promise<Object>} Object with extracted date/time information
   * @returns {Date|null} returns.date - Calculated date object (or null)
   * @returns {Object|null} returns.time - Time object with {hours, minutes} (or null)
   * @private
   */
  async extractDateTimeWithAI(userMessage, referenceDate = new Date()) {
    try {
      const referenceDateStr = referenceDate.toISOString().split('T')[0];
      const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][referenceDate.getDay()];
      
      const prompt = `Extract date and time preferences from this message: "${userMessage}"

Today is ${currentDay}, ${referenceDateStr}.

Return ONLY a JSON object with:
- "relative": string or null (e.g., "today", "tomorrow", "next Tuesday", "next week")
- "absoluteDate": string or null (e.g., "2025-12-18" if specific date mentioned)
- "time": string or null (e.g., "10:00", "14:30", "10am", "2pm", "afternoon", "morning")
- "timeRange": object or null (e.g., {"start": "14:00", "end": "17:00"} for "afternoon")

Examples:
- "tomorrow at 10am" → {"relative": "tomorrow", "time": "10:00"}
- "next Tuesday afternoon" → {"relative": "next Tuesday", "time": "afternoon"}
- "December 18 at 2pm" → {"absoluteDate": "2025-12-18", "time": "14:00"}
- "Monday morning" → {"relative": "Monday", "time": "morning"}

JSON object:`;

      const completion = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a date/time extraction system. Always return ONLY a valid JSON object, no explanations, no markdown, just the JSON. Extract date and time preferences from natural language.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 100,
      });

      const response = completion.choices[0]?.message?.content?.trim();
      const extracted = JSON.parse(response);
      
      // Convert AI extraction to format compatible with existing code
      const result = {
        date: null,
        time: null,
        dateRange: null
      };
      
      // Calculate date from relative or absolute
      if (extracted.absoluteDate) {
        // Specific date mentioned
        const dateParts = extracted.absoluteDate.split('-');
        result.date = new Date(Date.UTC(
          parseInt(dateParts[0], 10),
          parseInt(dateParts[1], 10) - 1,
          parseInt(dateParts[2], 10)
        ));
        result.date.setUTCHours(0, 0, 0, 0);
      } else if (extracted.relative) {
        // Relative date - use existing parseDateTimePreference logic for calculation
        // But we'll call it with the relative string
        const tempResult = parseDateTimePreference(extracted.relative, referenceDate);
        result.date = tempResult.date;
      }
      
      // Convert time string to {hours, minutes} format
      if (extracted.time) {
        const timeStr = extracted.time.toLowerCase();
        
        // Handle time ranges like "afternoon", "morning"
        if (timeStr === 'morning') {
          result.time = { hours: 9, minutes: 0 }; // Default morning time
        } else if (timeStr === 'afternoon') {
          result.time = { hours: 14, minutes: 0 }; // Default afternoon time
        } else if (timeStr === 'evening') {
          result.time = { hours: 17, minutes: 0 }; // Default evening time
        } else {
          // Parse time string (e.g., "10:00", "10am", "2pm")
          const timeMatch = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
          if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
            const period = timeMatch[3]?.toLowerCase();
            
            if (period === 'pm' && hours !== 12) {
              hours += 12;
            } else if (period === 'am' && hours === 12) {
              hours = 0;
            }
            
            result.time = { hours, minutes };
          }
        }
      }
      
      // Handle time ranges
      if (extracted.timeRange) {
        result.dateRange = extracted.timeRange;
      }
      
      return result;
    } catch (error) {
      console.error('Error extracting date/time with AI, using fallback:', error);
      // Fallback to existing parseDateTimePreference
      return parseDateTimePreference(userMessage, referenceDate);
    }
  }

  /**
   * Fallback keyword-based intent detection used when AI detection fails.
   * Simple pattern matching as backup. Only used when OpenAI API fails or returns
   * invalid/unparseable response. Less accurate than AI but provides reliability.
   * 
   * Detection rules:
   * - Cancel: "cancel" or "cancellation" (checks for negations)
   * - Reschedule: "reschedule", "change appointment", "move appointment"
   * - Price inquiry: "price", "cost", "how much"
   * - Booking: "book", "appointment", "schedule"
   * - Defaults to "booking" if no intents found and not a confirmation
   * 
   * @param {string} message - User's message text
   * @param {Object} session - Current session object
   * @param {string[]} [session.intents] - Existing intents (for context)
   * @returns {string[]} Array of detected intents
   * @private
   * 
   * @example
   * // Keyword detection:
   * fallbackIntentDetection("I want to cancel", { intents: [] })
   * // Output: ["cancel"]
   * 
   * @example
   * // Negation handling:
   * fallbackIntentDetection("I don't want to cancel", { intents: [] })
   * // Output: [] (negation detected)
   * 
   * @example
   * // Default booking:
   * fallbackIntentDetection("Hello", { intents: [] })
   * // Output: ["booking"] (default for new conversations)
   */
  fallbackIntentDetection(message, session) {
    const msg = message.toLowerCase().trim();
    const detectedIntents = [];
    
    // Simple keyword matching as fallback
    if ((msg.includes('cancel') || msg.includes('cancellation')) &&
        !msg.includes("don't") && !msg.includes('not')) {
      detectedIntents.push(INTENTS.CANCEL);
    }
    if ((msg.includes('reschedule') || msg.includes('change appointment') || msg.includes('move appointment')) &&
        !msg.includes("don't") && !msg.includes('not')) {
      detectedIntents.push(INTENTS.RESCHEDULE);
    }
    if ((msg.includes('price') || msg.includes('cost') || msg.includes('how much')) &&
        !msg.includes("don't") && !msg.includes('not')) {
      detectedIntents.push(INTENTS.PRICE_INQUIRY);
    }
    // Appointment inquiry: check appointment details, time, when is my appointment
    // Must check BEFORE booking to avoid false positives
    if ((msg.includes('check') && msg.includes('appointment')) ||
        (msg.includes('when') && msg.includes('appointment') && !msg.includes('book')) ||
        (msg.includes('what time') && msg.includes('appointment')) ||
        (msg.includes('my appointment') && (msg.includes('when') || msg.includes('time') || msg.includes('details')) && !msg.includes('book'))) {
      detectedIntents.push(INTENTS.APPOINTMENT_INQUIRY);
      // Don't add booking intent if appointment_inquiry is detected
      return detectedIntents; // Early return to prevent booking intent
    }
    if ((msg.includes('book') || msg.includes('appointment') || msg.includes('schedule')) &&
        !msg.includes("don't") && !msg.includes('not') &&
        msg.length > 3 && !/^(yes|ok|okay|sure)$/i.test(msg) &&
        !detectedIntents.includes(INTENTS.APPOINTMENT_INQUIRY)) {
      detectedIntents.push(INTENTS.BOOKING);
    }
    
    // DO NOT default to booking - return empty array if no intents detected
    // This allows the system to ask clarifying questions instead
    
    return detectedIntents;
  }

  /**
   * Extracts structured information from user message using AI.
   * Extracts patient name, treatment type, dentist selection, number of teeth, and date/time preferences.
   * Much more robust than regex patterns - handles edge cases and natural language variations.
   * All extracted data is validated for format, type, and allowed values before returning.
   * 
   * Validation rules:
   * - Patient name: 2-100 chars, alphanumeric with spaces/hyphens/apostrophes only
   * - Treatment type: Must match exactly: 'Consultation', 'Cleaning', 'Filling', 'Braces Maintenance'
   * - Dentist name: Must match exactly one of the available dentists
   * - Number of teeth: Integer 1-32 (only for fillings)
   * - Date/time text: 3-200 chars (raw text, parsed separately by dateParser)
   * 
   * @param {string} message - User's message text
   * @param {Object} session - Current session object for context
   * @param {string} [session.treatmentType] - Current treatment (for context)
   * @param {string} [session.dentistName] - Current dentist (for context)
   * @param {string} [session.patientName] - Current patient name (for context)
   * @returns {Promise<Object>} Extracted information object (all fields validated)
   * @returns {string|null} returns.patientName - Extracted patient name (validated format)
   * @returns {string|null} returns.treatmentType - Treatment type (must match allowed list)
   * @returns {string|null} returns.dentistName - Selected dentist name (must match available dentists)
   * @returns {number|null} returns.numberOfTeeth - Number of teeth 1-32 (for fillings only)
   * @returns {string|null} returns.dateTimeText - Raw date/time text for dateParser (validated length)
   * @private
   * 
   * @example
   * // Complete information extraction:
 * await extractInformation("Hi, I'm John Smith and I need a cleaning with Dr GeneralA next Tuesday at 1pm", {})
 * // Output:
 * {
 *   patientName: "John Smith",
 *   treatmentType: "Cleaning",
 *   dentistName: "Dr GeneralA",
   *   numberOfTeeth: null,
   *   dateTimeText: "next Tuesday at 1pm"
   * }
   * 
   * @example
   * // Partial information (filling with teeth count):
   * await extractInformation("I need fillings for 3 teeth", {})
   * // Output:
   * {
   *   patientName: null,
   *   treatmentType: "Filling",
   *   dentistName: null,
   *   numberOfTeeth: 3,
   *   dateTimeText: null
   * }
   * 
   * @example
   * // Invalid dentist name (not in allowed list):
   * await extractInformation("I want Dr. Unknown", {})
   * // Output:
   * {
   *   patientName: null,
   *   treatmentType: null,
   *   dentistName: null,  // Invalid dentist filtered out
   *   numberOfTeeth: null,
   *   dateTimeText: null
   * }
   * 
   * @example
   * // Invalid number of teeth (out of range):
   * await extractInformation("I need fillings for 50 teeth", {})
   * // Output:
   * {
   *   patientName: null,
   *   treatmentType: "Filling",
   *   dentistName: null,
   *   numberOfTeeth: null,  // 50 > 32, filtered out
   *   dateTimeText: null
   * }
   * 
   * @example
   * // AI extraction failure:
   * // If OpenAI API fails or returns invalid JSON:
   * // Output: { patientName: null, treatmentType: null, dentistName: null, numberOfTeeth: null, dateTimeText: null }
   */
  async extractInformation(message, session) {
    try {
      
      const contextInfo = [];
      if (session.treatmentType) {
        contextInfo.push(`Current treatment: ${session.treatmentType}`);
      }
      if (session.dentistName) {
        contextInfo.push(`Current dentist: ${session.dentistName}`);
      }
      if (session.patientName) {
        contextInfo.push(`Patient name: ${session.patientName}`);
      }

      const extractionPrompt = `You are an information extraction system for a dental appointment chatbot. Extract structured information from the user's message.

Available treatment types: ${VALID_TREATMENT_TYPES.join(', ')}
Available dentists: ${AVAILABLE_DENTISTS.join(', ')}

${contextInfo.length > 0 ? `Current session context: ${contextInfo.join(', ')}` : ''}

Extract the following information from the user message:
1. Patient name: Extract if mentioned (e.g., "I'm John", "my name is Jane Doe", "this is Mike")
2. Treatment type: One of: ${VALID_TREATMENT_TYPES.join(', ')} or null if not mentioned
   - IMPORTANT: Suggest treatment based on symptoms and descriptions:
     * Symptoms like "toothache", "pain", "hurt", "ache", "sore", "discomfort", "sensitive", "swollen", "bleeding gums" → "Consultation"
     * "cleaning", "clean", "teeth cleaning", "dental cleaning", "hygiene" → "Cleaning"
     * "filling", "fill", "cavity", "cavities", "decay", "hole in tooth" → "Filling"
     * "braces", "braces maintenance", "orthodontic", "orthodontics", "wire adjustment", "bracket" → "Braces Maintenance"
   - If treatment is unclear from symptoms/description, default to "Consultation"
   - Only return null if absolutely no treatment-related information is present
3. Dentist name: One of the available dentists or null if not mentioned
   - Match variations: "GeneralA", "Dr GeneralA", "Dr. GeneralA", "General A" → "Dr GeneralA"
   - Match variations: "BracesA", "Dr BracesA", "Dr. BracesA", "Braces A" → "Dr BracesA"
   - Same pattern for GeneralB and BracesB
4. Number of teeth: Integer 1-32 if mentioned (only relevant for fillings), null otherwise
5. Date/time text: Extract any date/time preferences as raw text (e.g., "tomorrow at 10am", "next Tuesday 1pm", "12/25 at 3pm", "morning", "afternoon", "anytime") or null

Rules:
- Only extract information that is explicitly mentioned or clearly implied
- For patient name, extract full name if given (first and last)
- For treatment, use exact treatment type names (map symptoms like "toothache" to "Consultation")
- For dentist, match exactly to available dentist names (handle "Dr" prefix variations)
- For number of teeth, only extract if clearly about fillings/treatment
- For date/time, extract the full phrase as user said it (will be parsed separately)

User message: "${message}"

Return ONLY a valid JSON object with these exact keys:
{
  "patientName": string or null,
  "treatmentType": string or null,
  "dentistName": string or null,
  "numberOfTeeth": number or null,
  "dateTimeText": string or null
}

JSON object:`;

      const completion = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are a precise information extraction system. Always return ONLY a valid JSON object, no explanations, no markdown, just the JSON. Example: {"patientName": "John Doe", "treatmentType": "Cleaning", "dentistName": null, "numberOfTeeth": null, "dateTimeText": "tomorrow at 10am"}'
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 200,
      });

      const response = completion.choices[0]?.message?.content?.trim();
      
      console.log('📝 [INFO EXTRACTION] AI Response:', response);
      console.log('📝 [INFO EXTRACTION] Current session:', {
        treatmentType: session.treatmentType,
        dentistName: session.dentistName,
        patientName: session.patientName
      });
      
      if (!response) {
        console.log('⚠️ [INFO EXTRACTION] No AI response, returning nulls');
        return { patientName: null, treatmentType: null, dentistName: null, numberOfTeeth: null, dateTimeText: null };
      }

      // Parse JSON response
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extracted = JSON.parse(jsonMatch[0]);
          console.log('📝 [INFO EXTRACTION] Raw extracted:', extracted);
          
          // Comprehensive validation and cleaning of extracted data
          const validated = {
            patientName: null,
            treatmentType: null,
            dentistName: null,
            numberOfTeeth: null,
            dateTimeText: null,
          };

          // Validate patient name: string, trimmed, reasonable length (2-100 chars), no special injection chars
          // Regex allows: letters, spaces, hyphens, apostrophes (for names like "Mary-Jane O'Brien")
          // Prevents injection attacks and invalid characters
          if (typeof extracted.patientName === 'string') {
            const cleaned = extracted.patientName.trim();
            if (cleaned.length >= 2 && cleaned.length <= 100 && /^[a-zA-Z\s'-]+$/.test(cleaned)) {
              validated.patientName = cleaned;
              console.log('✅ [INFO EXTRACTION] Validated patientName:', validated.patientName);
            } else {
              console.log('❌ [INFO EXTRACTION] Invalid patientName:', cleaned);
            }
          }

          // Validate treatment type: must be exact match from allowed list
          // Prevents invalid treatment types that could break business logic
          if (typeof extracted.treatmentType === 'string' && VALID_TREATMENT_TYPES.includes(extracted.treatmentType)) {
            validated.treatmentType = extracted.treatmentType;
            console.log('✅ [INFO EXTRACTION] Validated treatmentType:', validated.treatmentType);
          } else if (extracted.treatmentType) {
            console.log('❌ [INFO EXTRACTION] Invalid treatmentType:', extracted.treatmentType);
          }

          // Validate dentist name: must be exact match from available dentists
          // Prevents invalid dentist names that don't exist in calendar config
          if (typeof extracted.dentistName === 'string' && AVAILABLE_DENTISTS.includes(extracted.dentistName)) {
            validated.dentistName = extracted.dentistName;
            console.log('✅ [INFO EXTRACTION] Validated dentistName:', validated.dentistName);
          } else if (extracted.dentistName) {
            console.log('❌ [INFO EXTRACTION] Invalid dentistName:', extracted.dentistName);
          }

          // Validate number of teeth: integer, 1-32 range (human teeth count)
          // Only relevant for fillings, but validated for all cases
          if (typeof extracted.numberOfTeeth === 'number' && 
              Number.isInteger(extracted.numberOfTeeth) && 
              extracted.numberOfTeeth > 0 && 
              extracted.numberOfTeeth <= 32) {
            validated.numberOfTeeth = extracted.numberOfTeeth;
            console.log('✅ [INFO EXTRACTION] Validated numberOfTeeth:', validated.numberOfTeeth);
          } else if (extracted.numberOfTeeth !== null && extracted.numberOfTeeth !== undefined) {
            console.log('❌ [INFO EXTRACTION] Invalid numberOfTeeth:', extracted.numberOfTeeth);
          }

          // Validate date/time text: string, reasonable length (3-200 chars)
          // Raw text will be parsed by dateParser separately
          // Length limits prevent extremely long/invalid inputs
          if (typeof extracted.dateTimeText === 'string') {
            const cleaned = extracted.dateTimeText.trim();
            if (cleaned.length >= 3 && cleaned.length <= 200) {
              validated.dateTimeText = cleaned;
              console.log('✅ [INFO EXTRACTION] Validated dateTimeText:', validated.dateTimeText);
            } else {
              console.log('❌ [INFO EXTRACTION] Invalid dateTimeText length:', cleaned.length);
            }
          }

          console.log('✅ [INFO EXTRACTION] Final validated:', validated);
          return validated;
        }
      } catch (parseError) {
        console.warn('Failed to parse AI extraction response:', parseError);
      }

      return { patientName: null, treatmentType: null, dentistName: null, numberOfTeeth: null, dateTimeText: null };
    } catch (error) {
      console.error('Error in AI information extraction:', error);
      return { patientName: null, treatmentType: null, dentistName: null, numberOfTeeth: null, dateTimeText: null };
    }
  }

  /**
   * Builds the system prompt for OpenAI API with current conversation context.
   * Includes patient information, current intent, treatment details, and business rules.
   * Provides context to the AI model for generating appropriate, contextual responses.
   * 
   * Prompt includes:
   * - Role definition (AI receptionist)
   * - Guidelines (polite, professional, empathetic)
   * - Current conversation context (patient name, intents, treatment, dentist, selected slot)
   * - Available dentists (braces vs general)
   * - Treatment durations
   * - Business rules (confirm before booking)
   * 
   * @param {Object} session - Current session object
   * @param {string} [session.patientName] - Patient's name (if known)
   * @param {string[]} [session.intents] - Current intents array (latest only, not accumulated)
   * @param {string} [session.treatmentType] - Treatment type (if selected)
   * @param {string} [session.dentistName] - Dentist name (if selected)
   * @param {Object} [session.selectedSlot] - Selected appointment slot (if pending confirmation)
   * @param {Date} [session.selectedSlot.startTime] - Slot start time
   * @returns {string} Formatted system prompt string for OpenAI API
   * 
   * @example
   * // Full context:
   * buildSystemPrompt({
   *   patientName: "John Doe",
   *   intents: ["booking"],
   *   treatmentType: "Cleaning",
   *   dentistName: "Dr GeneralA",
   *   selectedSlot: { startTime: new Date("2024-01-16T10:00:00Z") }
   * })
   * // Output: Prompt with all context included
   * 
   * @example
   * // Minimal context (new conversation):
   * buildSystemPrompt({})
   * // Output: Prompt with only role definition and business rules (no context)
   * 
   * @example
   * // Partial context (treatment selected, no dentist):
   * buildSystemPrompt({
   *   treatmentType: "Braces Maintenance",
   *   intents: ["booking"]
   * })
   * // Output: Prompt includes treatment and intent, but no dentist/patient
   */
  buildSystemPrompt(session, actionResult = null) {
    let prompt = `You are a polite and professional AI receptionist for a dental clinic. Your role is to help patients book appointments, answer questions about treatments and pricing, and manage cancellations.

Guidelines:
- Always be polite, professional, and empathetic
- When users greet you (e.g., "hi", "hello", "hey"), acknowledge the greeting warmly first, then ask how you can help
- If no clear intent is detected from the user's message, politely ask clarifying questions to understand their needs
- Example for greetings: "Hello! How can I help you today? Would you like to book an appointment?"
- Ask clarifying questions when needed
- Confirm details before taking actions
- Keep responses concise and clear
- Use the patient's name when you know it
- NEVER claim an appointment is scheduled, booked, or confirmed unless you have actually created a calendar event
- If a slot is pending confirmation, ask the user to confirm - do not claim it's already scheduled
- Working hours are 9:00 AM - 6:00 PM, Monday-Friday only
- NEVER suggest appointment times outside working hours (before 9 AM or after 6 PM, or weekends)

Current conversation context:
`;

    // Include action results if any action was taken before AI call
    if (actionResult) {
      if (actionResult.type === ACTION_TYPES.BOOKING && actionResult.success) {
        prompt += `- ACTION RESULT: An appointment was just successfully booked.\n`;
        prompt += `  Details: Doctor ${actionResult.details.doctor}, ${actionResult.details.treatment}, ${actionResult.details.date} at ${actionResult.details.time}\n`;
        prompt += `  Your response should confirm the booking naturally and provide the details.\n`;
      } else if (actionResult.type === ACTION_TYPES.BOOKING && actionResult.requiresPatientName) {
        prompt += `- ACTION RESULT: Booking was attempted but patient name is required.\n`;
        prompt += `  Your response should politely ask for the patient's name.\n`;
      } else if (actionResult.type === ACTION_TYPES.BOOKING && actionResult.declined) {
        prompt += `- ACTION RESULT: User declined the appointment slot.\n`;
        prompt += `  Your response should acknowledge this and ask if they'd like to choose a different time.\n`;
      } else if (actionResult.type === ACTION_TYPES.BOOKING && actionResult.slotUnavailable) {
        prompt += `- ACTION RESULT: The selected time slot is no longer available.\n`;
        prompt += `  Your response should apologize and let them know you'll find alternative times.\n`;
      } else if (actionResult.type === ACTION_TYPES.BOOKING && !actionResult.success) {
        prompt += `- ACTION RESULT: Booking attempt failed: ${actionResult.message}\n`;
        prompt += `  Your response should apologize and explain the issue naturally.\n`;
      } else if (actionResult.type === ACTION_TYPES.CANCELLATION && actionResult.success) {
        prompt += `- ACTION RESULT: Appointment cancellation was processed successfully.\n`;
        prompt += `  Your response should confirm the cancellation naturally and politely.\n`;
      } else if (actionResult.type === ACTION_TYPES.CANCELLATION && actionResult.noBookingFound) {
        prompt += `- ACTION RESULT: No appointment was found to cancel.\n`;
        prompt += `  Your response should inform the user that no appointment was found and offer to help them.\n`;
      } else if (actionResult.type === ACTION_TYPES.CANCELLATION && actionResult.requiresConfirmation) {
        prompt += `- ACTION RESULT: Found an appointment for cancellation.\n`;
        prompt += `  Details: Doctor ${actionResult.details.doctor}, ${actionResult.details.date} at ${actionResult.details.time}\n`;
        prompt += `  Your response should present these details and ask the user to confirm cancellation.\n`;
      } else if (actionResult.type === ACTION_TYPES.CANCELLATION && !actionResult.success) {
        prompt += `- ACTION RESULT: Cancellation attempt failed: ${actionResult.message}\n`;
        prompt += `  Your response should apologize and explain the issue naturally.\n`;
      }
      prompt += `\n`;
    }

    if (session.patientName) {
      prompt += `- Patient name: ${session.patientName}\n`;
    }
    if (session.intents && session.intents.length > 0) {
      prompt += `- Current intents: ${session.intents.join(', ')}\n`;
    }
    if (session.treatmentType) {
      prompt += `- Treatment: ${session.treatmentType}\n`;
    }
    if (session.dentistName) {
      prompt += `- Dentist: ${session.dentistName}\n`;
    }
    if (session.selectedSlot && !actionResult) {
      // Only show pending slot if no action was taken (action would have cleared it)
      prompt += `- Selected slot (pending confirmation): ${session.selectedSlot.startTime.toLocaleString()}\n`;
      prompt += `- IMPORTANT: This slot is PENDING confirmation. Ask user to confirm, do NOT claim it's already scheduled.\n`;
    }
    if (session.bookingConfirmationPending && !actionResult) {
      prompt += `- Status: Waiting for user confirmation of the selected slot\n`;
    }

    prompt += `\nAvailable dentists for braces: Dr BracesA, Dr BracesB
Available dentists for general treatments: Dr GeneralA, Dr GeneralB

Treatment durations:
- Consultation: 15 minutes
- Cleaning: 30 minutes
- Braces Maintenance: 45 min (Dr BracesB), 15 min (Dr BracesA)
- Filling: 30 min for first tooth + 15 min per additional tooth

Working hours: 9:00 AM - 6:00 PM, Monday-Friday (weekends excluded)
Minimum appointment time: 9:00 AM
Maximum appointment time: 6:00 PM

IMPORTANT RULES:
- Patient name is MANDATORY - always ask for it before booking or confirming appointments
- If user doesn't specify a treatment type, assume they need a Consultation
- Do NOT ask users to choose a dentist - the system will automatically select the dentist with earliest availability
- Always check availability when user wants to book - don't suggest times without checking first
- If user doesn't specify a time preference, default to ASAP (earliest available slot)
- Never confirm or book an appointment without collecting the patient's name first
- Always confirm appointment details before booking. Only say an appointment is "scheduled" or "confirmed" after the system has actually created a calendar event.`;

    return prompt;
  }

  /**
   * Post-processes AI response - simplified to only handle availability checks.
   * Information extraction and critical actions (booking/cancellation) are handled before AI call.
   * 
   * Processing flow:
   * 1. Validates latestIntents format
   * 2. If booking intent + ready → check availability
   * 3. Handle price inquiry (if price_inquiry intent)
   * 4. Return AI response (or availability result)
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {string} userMessage - User's message text
   * @param {string} aiResponse - Initial AI-generated response
   * @param {Object} session - Current session object
   * @param {string[]} latestIntents - Latest intents from current message
   * @returns {Promise<string>} Final processed response message
   */
  async postProcessResponse(userMessage, aiResponse, session, latestIntents = []) {
    console.log('\n🔄 [POST-PROCESS] Starting post-processing');
    
    // Simplified: Only handle price inquiry and appointment inquiry
    // Intent validation already done earlier, so just use latestIntents directly
    
    // Handle price inquiry
    if (latestIntents.includes('price_inquiry')) {
      console.log('💰 [POST-PROCESS] Price inquiry detected');
      
      const fullPricing = await googleDocsService.getPricingInfo();
      
      // Use AI to extract only relevant information based on user's question
      const extractionPrompt = `Extract ONLY the pricing information relevant to this question: "${userMessage}"

Pricing document:
${fullPricing}

Return ONLY the relevant pricing information that answers the question. Be concise.`;

      const extractionCompletion = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'Extract only relevant pricing information based on the user\'s question. Be concise and focused.'
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500,
      });
      
      const relevantPricing = extractionCompletion.choices[0]?.message?.content || fullPricing.substring(0, 500);
      return aiResponse + '\n\n' + relevantPricing;
    }

    // Handle appointment inquiry
    if (latestIntents.includes('appointment_inquiry')) {
      console.log('📋 [POST-PROCESS] Appointment inquiry detected');
      
      if (!session.phone) {
        return aiResponse + '\n\nI need your phone number to look up your appointment. Could you please provide it?';
      }
      
      const booking = await googleCalendarService.findBookingByPhone(session.phone);
      
      if (booking) {
        const appointmentDetails = `Here are your appointment details:\n\n` +
          `**Doctor:** ${booking.doctor}\n` +
          `${booking.treatment ? `**Treatment:** ${booking.treatment}\n` : ''}` +
          `**Date:** ${booking.startTime.toLocaleDateString()}\n` +
          `**Time:** ${booking.startTime.toLocaleTimeString()} - ${booking.endTime.toLocaleTimeString()}\n` +
          `\nIs there anything else I can help you with?`;
        
        return aiResponse + '\n\n' + appointmentDetails;
      } else {
        return aiResponse + '\n\nI could not find an appointment for your phone number. Please contact our receptionist for assistance.';
      }
    }

    // Availability check moved to before AI (Phase 4)
    // Post-processing now only handles price inquiry and appointment inquiry
    
    console.log('✅ [POST-PROCESS] Returning AI response as-is');
    return aiResponse;
  }

  /**
   * Checks calendar availability and suggests appointment slots to the user.
   * Fetches available slots from Google Calendar, matches user date/time preferences,
   * calculates treatment duration, and presents the best matching slot for confirmation.
   * 
   * Matching logic:
   * 1. If user specified date/time preference, finds slots matching that preference
   * 2. If no preference match found, uses earliest available slot
   * 3. Ensures slot duration is sufficient for treatment
   * 4. Updates session with selected slot and treatment duration
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {Object} session - Current session object
   * @param {string} session.treatmentType - Treatment type (required for duration calculation)
   * @param {string} session.dentistName - Dentist name (required for slot filtering)
   * @param {number} [session.numberOfTeeth] - Number of teeth (for filling duration calculation)
   * @param {string} userMessage - User's message (may contain date/time preferences, e.g., "tomorrow at 10am")
   * @returns {Promise<string>} Response message with available slot details or error message
   * 
   * @example
   * // Preferred time match found:
   * await checkAvailability("+1234567890", {
   *   treatmentType: "Cleaning",
   *   dentistName: "Dr GeneralA",
   *   numberOfTeeth: null
   * }, "Tomorrow at 10am")
   * // Output: "I found an available slot:\n\nDoctor: Dr GeneralA\nDate: 1/16/2024\nTime: 10:00 AM - 10:30 AM\nDuration: 30 minutes\n\nWould you like to confirm this appointment?"
   * 
   * @example
   * // No preferred time match, uses earliest available:
   * await checkAvailability("+1234567890", {
   *   treatmentType: "Cleaning",
   *   dentistName: "Dr GeneralA",
   *   numberOfTeeth: null
   * }, "anytime")
   * // Output: "I found an available slot:\n\nDoctor: Dr GeneralA\nDate: [earliest date]\nTime: [earliest time]..."
   * 
   * @example
   * // Filling with multiple teeth (longer duration):
   * await checkAvailability("+1234567890", {
   *   treatmentType: "Filling",
   *   dentistName: "Dr GeneralA",
   *   numberOfTeeth: 3
   * }, "next Tuesday")
   * // Duration: 30 min (first tooth) + 15 min × 2 (additional teeth) = 60 minutes
   * // Output: Slot with 60+ minute duration
   * 
   * @example
   * // No slots available:
   * await checkAvailability("+1234567890", {
   *   treatmentType: "Cleaning",
   *   dentistName: "Dr GeneralA",
   *   numberOfTeeth: null
   * }, "tomorrow")
   * // Output: "I apologize, but I could not find an available slot at the moment. Would you like me to check for a different time, or would you prefer to contact our receptionist directly?"
   * 
   * @example
   * // Error handling:
   * // If Google Calendar API fails:
   * // Output: "I apologize, I am having trouble checking availability. Please try again or contact our receptionist."
   */
  async checkAvailability(conversationId, session, userMessage) {
    try {
      console.log('\n📅 [AVAILABILITY] Starting availability check');
      console.log('📅 [AVAILABILITY] Session:', {
        treatmentType: session.treatmentType,
        dentistName: session.dentistName,
        numberOfTeeth: session.numberOfTeeth
      });
      
      // REQUIREMENT: Always fetch fresh availability data (no caching)
      // This ensures availability data is always up-to-date on every check
      const availableDentists = getAvailableDentists(session.treatmentType);
      console.log('📅 [AVAILABILITY] Available dentists for treatment:', availableDentists);
      console.log('📅 [AVAILABILITY] Fetching fresh slots from API (no caching)...');
      
      const slots = await googleCalendarService.getAvailableSlots(session.treatmentType, availableDentists);
      console.log('\n📊 [AVAILABILITY SUMMARY] Total slots found across all doctors:', slots.length);
      
      // Log first free slot overall
      if (slots.length > 0) {
        const firstFreeSlot = slots[0];
        const slotDate = firstFreeSlot.startTime.toISOString().split('T')[0];
        const slotTime = firstFreeSlot.startTime.toISOString().split('T')[1].substring(0, 5);
        console.log(`🎯 [AVAILABILITY SUMMARY] The first free time slot overall is:`);
        console.log(`   Doctor: ${firstFreeSlot.doctor}`);
        console.log(`   Date: ${slotDate}`);
        console.log(`   Time: ${slotTime}`);
        console.log(`   Duration: ${firstFreeSlot.duration} minutes`);
      } else {
        console.log('❌ [AVAILABILITY SUMMARY] No available slots found for any doctor');
      }
      
      // Update session with fresh slots (for reference, but won't be used for caching)
      const now = Date.now();
      sessionManager.updateSession(session.conversationId, { 
        availableSlots: slots,
        availableSlotsTimestamp: now
      });
      session.availableSlots = slots;
      session.availableSlotsTimestamp = now;
      console.log('✅ [AVAILABILITY] Updated session with fresh slots:', new Date(now).toISOString());
      
      if (slots.length > 0) {
        console.log('📅 [AVAILABILITY] First few slots:', slots.slice(0, 3).map(s => ({
          doctor: s.doctor,
          startTime: s.startTime.toISOString(),
          duration: s.duration
        })));
      }

      // REQUIREMENT: Auto-select dentist if not specified - find earliest availability across all dentists
      let dentistToUse = session.dentistName;
      if (!dentistToUse) {
        console.log('📅 [AVAILABILITY] No dentist specified, will auto-select based on earliest availability');
      }

      // FIX 1: Calculate treatment duration using max duration for braces when dentist not specified
      // For braces maintenance, if dentist not specified, use maximum duration (45 min) to ensure we find slots
      // that work for both dentists. Duration will be recalculated correctly after dentist is selected.
      let treatmentDuration;
      if (session.treatmentType === TREATMENT_TYPES.BRACES_MAINTENANCE && !dentistToUse) {
        // Use maximum duration for braces (Dr BracesB = 45 min) when dentist not specified
        treatmentDuration = 45;
        console.log('📅 [AVAILABILITY] Dentist not specified for braces, using max duration (45 min) for slot filtering');
      } else {
        treatmentDuration = calculateTreatmentDuration(
          session.treatmentType,
          dentistToUse || session.dentistName, // Use dentistToUse if available, else session.dentistName
          session.numberOfTeeth
        );
      }
      console.log('📅 [AVAILABILITY] Calculated treatment duration:', treatmentDuration, 'minutes');

      // Try to find slot matching user preference
      let selectedSlot = null;
      
      // Extract date/time preference from user message using AI (language understanding)
      // Then code calculates actual dates (math)
      // Use stored preference ONLY if we're in reschedule flow (cancelledSlotToExclude exists)
      // This ensures we don't mix reschedule flow with normal booking flow
      const datePreference = session.cancelledSlotToExclude && session.dateTimePreference
        ? await this.extractDateTimeWithAI(session.dateTimePreference, new Date())
        : await this.extractDateTimeWithAI(userMessage, new Date());
      console.log('📅 [AVAILABILITY] Extracted date preference:', {
        date: datePreference.date ? datePreference.date.toISOString() : null,
        time: datePreference.time ? `${datePreference.time.hours}:${datePreference.time.minutes}` : null
      });
      
      // Filter slots within working hours (9 AM - 6 PM)
      const workingStartMinutes = 9 * 60; // 9:00 AM
      const workingEndMinutes = 18 * 60; // 6:00 PM
      
      // REQUIREMENT: If dentist not specified, consider all available dentists
      // Otherwise, filter by selected dentist
      const validSlots = slots.filter(slot => {
        // If dentist specified, only include that dentist's slots
        if (dentistToUse && slot.doctor !== dentistToUse) return false;
        // Filter by working hours
        const hour = slot.startTime.getHours();
        const minute = slot.startTime.getMinutes();
        const timeMinutes = hour * 60 + minute;
        if (timeMinutes < workingStartMinutes || timeMinutes >= workingEndMinutes) return false;
        
        // Exclude cancelled slot if rescheduling
        if (session.cancelledSlotToExclude) {
          const cancelled = session.cancelledSlotToExclude;
          const slotStart = slot.startTime.getTime();
          const slotEnd = slotStart + (slot.duration * 60 * 1000);
          const cancelledStart = cancelled.startTime instanceof Date 
            ? cancelled.startTime.getTime() 
            : new Date(cancelled.startTime).getTime();
          const cancelledEnd = cancelled.endTime instanceof Date 
            ? cancelled.endTime.getTime() 
            : new Date(cancelled.endTime).getTime();
          
          // Exclude if same doctor and overlapping time
          if (slot.doctor === cancelled.doctor && 
              slotStart < cancelledEnd && slotEnd > cancelledStart) {
            console.log('🚫 [AVAILABILITY] Excluding cancelled slot:', {
              cancelled: new Date(cancelledStart).toISOString(),
              slot: new Date(slotStart).toISOString()
            });
            return false;
          }
        }
        
        return true;
      });
      
      console.log('📅 [AVAILABILITY] Valid slots (dentist:', dentistToUse || 'any', ', within working hours):', validSlots.length);
      
      // If user specified a preference, try to match it
      if (datePreference.date || datePreference.time) {
        console.log('📅 [AVAILABILITY] User specified preference, matching slots...');
        // Find slots matching preference AND with sufficient duration AND within working hours
        // REQUIREMENT: Consider all dentists if none specified
        const matchingSlots = validSlots.filter(slot => {
          const matches = matchesDateTimePreference(slot.startTime, datePreference) &&
                         slot.duration >= treatmentDuration;
          if (matches) {
            console.log('✅ [AVAILABILITY] Matching slot found:', {
              doctor: slot.doctor,
              startTime: slot.startTime.toISOString(),
              hour: slot.startTime.getHours(),
              minute: slot.startTime.getMinutes(),
              duration: slot.duration
            });
          }
          return matches;
        });
        
        console.log('📅 [AVAILABILITY] Matching slots count:', matchingSlots.length);
        
        if (matchingSlots.length > 0) {
          // REQUIREMENT: Auto-select dentist with earliest matching slot
          selectedSlot = matchingSlots[0]; // Take first matching slot (best match)
          dentistToUse = selectedSlot.doctor; // Auto-select this dentist
          console.log('✅ [AVAILABILITY] Selected slot from preference match:', {
            doctor: selectedSlot.doctor,
            startTime: selectedSlot.startTime.toISOString(),
            duration: selectedSlot.duration
          });
        } else {
          console.log('⚠️ [AVAILABILITY] No slots matched preference');
        }
      }

      // REQUIREMENT: Fallback to ASAP (earliest available) if no preference match or no preference specified
      if (!selectedSlot) {
        console.log('📅 [AVAILABILITY] No preference match, finding earliest available slot (ASAP)...');
        console.log('📅 [AVAILABILITY] Valid slots available:', validSlots.length, 'Treatment duration needed:', treatmentDuration);
        
        if (validSlots.length === 0) {
          console.log('❌ [AVAILABILITY] No valid slots found (empty array)');
        } else {
          // REQUIREMENT: Find earliest across all dentists if none specified
          selectedSlot = googleCalendarService.findEarliestAvailableSlot(validSlots, treatmentDuration);
          if (selectedSlot) {
            // REQUIREMENT: Auto-select dentist with earliest availability
            dentistToUse = selectedSlot.doctor;
            console.log('✅ [AVAILABILITY] Selected earliest available slot (ASAP):', {
              doctor: selectedSlot.doctor,
              startTime: selectedSlot.startTime.toISOString(),
              duration: selectedSlot.duration
            });
          } else {
            console.log('❌ [AVAILABILITY] No slots found with sufficient duration');
            console.log('📅 [AVAILABILITY] Available slot durations:', validSlots.slice(0, 5).map(s => s.duration));
          }
        }
      }
      
      // REQUIREMENT: Update session with auto-selected dentist if not already set
      if (dentistToUse && !session.dentistName) {
        console.log('✅ [AVAILABILITY] Auto-selecting dentist:', dentistToUse);
        const dentistType = session.treatmentType === TREATMENT_TYPES.BRACES_MAINTENANCE ? DENTIST_TYPES.BRACES : DENTIST_TYPES.GENERAL;
        sessionManager.updateSession(session.conversationId, { 
          dentistName: dentistToUse,
          dentistType: dentistType
        });
        session.dentistName = dentistToUse;
        session.dentistType = dentistType;
      }

      if (selectedSlot) {
        // Selected slot already came from validSlots (filtered by working hours at line 2001)
        // No need to validate again - proceed directly to recalculating duration
        
        // FIX 1 (continued): Recalculate duration with actual selected dentist to ensure accuracy
        const finalTreatmentDuration = calculateTreatmentDuration(
          session.treatmentType,
          selectedSlot.doctor, // Use the actual selected dentist
          session.numberOfTeeth
        );
        console.log('📅 [AVAILABILITY] Recalculated treatment duration with selected dentist:', finalTreatmentDuration, 'minutes');
        
        const endTime = new Date(selectedSlot.startTime);
        endTime.setMinutes(endTime.getMinutes() + finalTreatmentDuration);

        console.log('✅ [AVAILABILITY] Setting selectedSlot in session:', {
          startTime: selectedSlot.startTime.toISOString(),
          endTime: endTime.toISOString(),
          doctor: selectedSlot.doctor,
          hour: selectedSlot.startTime.getHours(),
          minute: selectedSlot.startTime.getMinutes()
        });
        
        sessionManager.updateSession(session.conversationId, {
          selectedSlot: {
            ...selectedSlot,
            endTime,
          },
          treatmentDuration: finalTreatmentDuration, // Use recalculated duration
          bookingConfirmationPending: true,
        });
        
        // Update local session reference
        session.selectedSlot = {
          ...selectedSlot,
          endTime,
        };
        session.treatmentDuration = finalTreatmentDuration;
        session.bookingConfirmationPending = true;
        
        console.log('✅ [AVAILABILITY] Session updated, verification:', {
          hasSelectedSlot: !!session.selectedSlot,
          bookingConfirmationPending: session.bookingConfirmationPending,
          slotStartTime: session.selectedSlot?.startTime?.toISOString()
        });

        // REQUIREMENT: Check patient name before offering confirmation
        if (!session.patientName) {
          console.log('⚠️ [AVAILABILITY] Patient name missing, prompting before showing slot');
          return 'I found an available slot, but I need your name first. What is your name?';
        }

        return `I found an available slot:\n\nDoctor: ${selectedSlot.doctor}\nDate: ${selectedSlot.startTime.toLocaleDateString()}\nTime: ${selectedSlot.startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}\nDuration: ${finalTreatmentDuration} minutes\n\nWould you like to confirm this appointment?`;
      } else {
        console.log('❌ [AVAILABILITY] No slots available');
        console.log('📅 [AVAILABILITY] Debug info:', {
          totalSlots: slots.length,
          validSlots: validSlots.length,
          treatmentDuration,
          dentistToUse: dentistToUse || 'none (auto-select)'
        });
        return 'I apologize, but I could not find an available slot at the moment. Would you like me to check for a different time, or would you prefer to contact our receptionist directly?';
      }
    } catch (error) {
      console.error('Error checking availability:', error);
      return 'I apologize, I am having trouble checking availability. Please try again or contact our receptionist.';
    }
  }

  /**
   * Confirms and creates a calendar appointment booking.
   * Creates a calendar event with the appointment details, updates session status,
   * and logs the booking action. Returns confirmation message or error message.
   * 
   * Process:
   * 1. Validates calendar ID exists for dentist
   * 2. Creates calendar event via Google Calendar API
   * 3. Updates session with confirmation status and event ID
   * 4. Logs booking action to Google Sheets
   * 5. Returns confirmation message with appointment details
   * 
   * Error handling:
   * - Missing calendar ID: throws error, logs to sheets
   * - Calendar API failure: logs failure, returns error message
   * - All errors logged with "NEEDS FOLLOW-UP" status
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {Object} session - Current session object with appointment details
   * @param {string} session.dentistName - Dentist name (must match config.calendar.dentistCalendars key)
   * @param {string} session.treatmentType - Treatment type
   * @param {string} session.phone - Patient phone number
   * @param {string} [session.patientName] - Patient name (defaults to "Patient" if not set)
   * @param {Object} session.selectedSlot - Selected appointment slot (required)
   * @param {Date} session.selectedSlot.startTime - Appointment start time (required)
   * @param {Date} session.selectedSlot.endTime - Appointment end time (required)
   * @returns {Promise<string>} Confirmation message with appointment details or error message
   * 
   * @example
   * // Successful booking:
   * await confirmBooking("+1234567890", {
   *   dentistName: "Dr GeneralA",
   *   treatmentType: "Cleaning",
   *   phone: "+1234567890",
   *   patientName: "John Doe",
   *   selectedSlot: {
   *     startTime: new Date("2024-01-16T10:00:00Z"),
   *     endTime: new Date("2024-01-16T10:30:00Z")
   *   }
   * })
   * // Output: "✅ Appointment confirmed!\n\nDoctor: Dr GeneralA\nTreatment: Cleaning\nDate: 1/16/2024\nTime: 10:00 AM - 10:30 AM\n\nWe look forward to seeing you!"
   * // Session updated: bookingConfirmed=true, bookingConfirmationPending=false, eventId="[calendar event ID]"
   * 
   * @example
   * // Missing patient name (uses default):
   * await confirmBooking("+1234567890", {
   *   dentistName: "Dr GeneralA",
   *   treatmentType: "Cleaning",
   *   phone: "+1234567890",
   *   patientName: null,  // Not set
   *   selectedSlot: { startTime: ..., endTime: ... }
   * })
   * // Calendar event created with patientName="Patient"
   * 
   * @example
   * // Calendar API failure:
   * // If googleCalendarService.createAppointment() fails:
   * // Output: "I apologize, there was an error creating your appointment. Our receptionist will contact you shortly. Please call us if you need immediate assistance."
   * // Logged to sheets with status="NEEDS FOLLOW-UP***************"
   * 
   * @example
   * // Missing calendar ID:
   * await confirmBooking("+1234567890", {
   *   dentistName: "Dr. Unknown",  // Not in config
   *   ...
   * })
   * // Throws error, logs to sheets, returns error message
   */
  async confirmBooking(session) {
    try {
      // REQUIREMENT: Patient name is mandatory - defensive check
      if (!session.patientName || session.patientName.trim().length === 0) {
        console.log('❌ [BOOKING] Patient name is mandatory but missing');
        return { 
          success: false, 
          message: 'I apologize, but I need your name to confirm the appointment. What is your name?' 
        };
      }
      
      const calendarId = config.calendar.dentistCalendars[session.dentistName];
      if (!calendarId) {
        throw new Error(`Calendar ID not found for ${session.dentistName}`);
      }

      console.log('\n✅ [BOOKING] Starting booking confirmation');
      console.log('✅ [BOOKING] Selected slot:', {
        doctor: session.dentistName,
        startTime: session.selectedSlot.startTime.toISOString(),
        endTime: session.selectedSlot.endTime.toISOString()
      });

      // Re-validate slot is still available before creating (prevents conflicts)
      const treatmentDuration = calculateTreatmentDuration(
        session.treatmentType,
        session.dentistName,
        session.numberOfTeeth
      );
      console.log('✅ [BOOKING] Treatment duration:', treatmentDuration, 'minutes');
      
      // REQUIREMENT: Always re-validate with fresh API call before booking (safety check)
      // Don't use cache here - we need the absolute latest availability to prevent conflicts
      const availableDentists = getAvailableDentists(session.treatmentType);
      console.log('✅ [BOOKING] Re-checking availability with fresh API call (safety validation)...');
      const currentSlots = await googleCalendarService.getAvailableSlots(session.treatmentType, availableDentists);
      const dentistSlots = currentSlots.filter(slot => slot.doctor === session.dentistName);
      console.log('✅ [BOOKING] Current available slots for dentist:', dentistSlots.length);
      
      // Update cache with fresh data after re-validation
      sessionManager.updateSession(session.conversationId, { 
        availableSlots: currentSlots,
        availableSlotsTimestamp: Date.now()
      });
      session.availableSlots = currentSlots;
      session.availableSlotsTimestamp = Date.now();
      console.log('✅ [BOOKING] Cache updated with fresh slots');
      
      // Check if the selected slot is still available
      const slotStillAvailable = dentistSlots.some(slot => {
        const slotStart = new Date(slot.startTime).getTime();
        const slotEnd = new Date(slot.endTime).getTime();
        const selectedStart = new Date(session.selectedSlot.startTime).getTime();
        const selectedEnd = new Date(session.selectedSlot.endTime).getTime();
        
        // Slot is available if it fully contains the selected time range
        const available = slotStart <= selectedStart && slotEnd >= selectedEnd && slot.duration >= treatmentDuration;
        if (available) {
          console.log('✅ [BOOKING] Slot still available:', {
            slotStart: new Date(slotStart).toISOString(),
            slotEnd: new Date(slotEnd).toISOString(),
            selectedStart: new Date(selectedStart).toISOString(),
            selectedEnd: new Date(selectedEnd).toISOString()
          });
        }
        return available;
      });

      if (!slotStillAvailable) {
        console.log('❌ [BOOKING] Slot no longer available! Clearing and finding alternatives');
        // Slot is no longer available, clear it and ask user to choose again
        sessionManager.updateSession(session.conversationId, { 
          selectedSlot: null,
          bookingConfirmationPending: false,
          bookingConfirmed: false
        });
        session.selectedSlot = null;
        session.bookingConfirmationPending = false;
        session.bookingConfirmed = false;
        const alternativeSlots = await this.checkAvailability(session.conversationId, session, 'anytime');
        return { 
          success: false, 
          message: 'I apologize, but that time slot is no longer available. Let me check for other available times.\n\n' + alternativeSlots
        };
      }

      console.log('✅ [BOOKING] Slot validated, proceeding to create calendar event');

      // Note: Old booking cancellation for reschedule is handled in handleReschedule() before reaching here

      // FIX: Validate and ensure startTime and endTime are Date objects before using
      const startTime = session.selectedSlot?.startTime instanceof Date 
        ? session.selectedSlot.startTime 
        : new Date(session.selectedSlot?.startTime);
      const endTime = session.selectedSlot?.endTime instanceof Date 
        ? session.selectedSlot.endTime 
        : new Date(session.selectedSlot?.endTime);
      
      // Validate dates are valid
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        console.error('❌ [BOOKING] Invalid date values in selectedSlot:', {
          startTime: session.selectedSlot?.startTime,
          endTime: session.selectedSlot?.endTime
        });
        throw new Error('Invalid date values in selected slot');
      }

      const appointmentData = {
        patientName: session.patientName || 'Patient',
        doctor: session.dentistName,
        treatment: session.treatmentType,
        phone: session.phone,
        startTime: startTime,
        endTime: endTime,
      };

      console.log('✅ [BOOKING] Creating calendar event with data:', {
        calendarId,
        patientName: appointmentData.patientName,
        doctor: appointmentData.doctor,
        treatment: appointmentData.treatment,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });

      const result = await googleCalendarService.createAppointment(calendarId, appointmentData);

      if (result.success) {
        console.log('✅ [BOOKING] Calendar event created successfully:', {
          eventId: result.eventId
        });

        // FIX 4: Store selectedSlot values BEFORE clearing to prevent null reference errors
        // Store values in local variables for use in logging and return message
        const slotStartTime = session.selectedSlot?.startTime;
        const slotEndTime = session.selectedSlot?.endTime;
        const slotStartTimeISO = slotStartTime?.toISOString();
        const slotEndTimeISO = slotEndTime?.toISOString();
        const slotStartTimeLocale = slotStartTime?.toLocaleDateString();
        const slotStartTimeLocaleTime = slotStartTime?.toLocaleTimeString();
        const slotEndTimeLocaleTime = slotEndTime?.toLocaleTimeString();

        // FIX 4: Clear selectedSlot after successful booking to prevent post-processing from checking availability again
        // Also store booking details in session for cancellation flow
        // FIX 2: Ensure dates are Date objects (not strings) when storing in session
        const bookingDetails = {
          patientPhone: session.phone,
          patientName: session.patientName,
          doctor: session.dentistName,
          treatment: session.treatmentType,
          startTime: slotStartTime instanceof Date ? slotStartTime : new Date(slotStartTime),
          endTime: slotEndTime instanceof Date ? slotEndTime : new Date(slotEndTime),
          calendarEventId: result.eventId,
          calendarId: calendarId,
        };
        
        // Validate dates before storing
        if (isNaN(bookingDetails.startTime.getTime()) || isNaN(bookingDetails.endTime.getTime())) {
          console.error('❌ [BOOKING] Invalid dates in bookingDetails:', {
            startTime: slotStartTime,
            endTime: slotEndTime
          });
          throw new Error('Invalid date values in booking details');
        }
        
        sessionManager.updateSession(session.conversationId, {
          bookingConfirmed: true,
          bookingConfirmationPending: false,
          eventId: result.eventId,
          selectedSlot: null, // Clear to prevent re-checking availability
          existingBooking: bookingDetails, // Store for cancellation flow
          cancelledSlotToExclude: null // Clear cancelled slot exclusion after booking
        });
        
        // Update local session reference
        session.bookingConfirmed = true;
        session.bookingConfirmationPending = false;
        session.eventId = result.eventId;
        session.selectedSlot = null;
        session.existingBooking = bookingDetails;
        session.cancelledSlotToExclude = null;

        console.log('✅ [BOOKING] Session updated with confirmation');

        // Determine intent for logging (reschedule vs booking)
        // Check if this was a reschedule (old booking was cancelled)
        const isReschedule = session.existingBookingToReschedule !== null && session.existingBookingToReschedule !== undefined;
        const logIntent = isReschedule ? INTENTS.RESCHEDULE : INTENTS.BOOKING;
        const logAction = isReschedule ? 'appointment_rescheduled' : 'booking_created';

        // Log action (using stored values)
        await googleSheetsService.logAction({
          conversationId: session.conversationId,
          phone: session.phone,
          patientName: session.patientName,
          intent: logIntent,
          dentist: session.dentistName,
          treatment: session.treatmentType,
          dateTime: `${slotStartTimeISO} - ${slotEndTimeISO}`,
          eventId: result.eventId,
          status: 'confirmed',
          action: logAction,
        });

        console.log('✅ [BOOKING] Booking logged to Google Sheets');
        console.log('✅ [BOOKING] Booking complete!');

        return { 
          success: true, 
          message: `✅ Appointment confirmed!\n\nDoctor: ${session.dentistName}\nTreatment: ${session.treatmentType}\nDate: ${slotStartTimeLocale}\nTime: ${slotStartTimeLocaleTime} - ${slotEndTimeLocaleTime}\n\nWe look forward to seeing you!`
        };
      } else {
        console.log('❌ [BOOKING] Calendar event creation failed:', result.error);
        
        // Clear state on failure
        sessionManager.updateSession(session.conversationId, {
          selectedSlot: null,
          bookingConfirmationPending: false,
          bookingConfirmed: false
        });
        session.selectedSlot = null;
        session.bookingConfirmationPending = false;
        session.bookingConfirmed = false;
        
        // Determine intent for logging (reschedule vs booking)
        const isReschedule = session.existingBookingToReschedule !== null && session.existingBookingToReschedule !== undefined;
        const logIntent = isReschedule ? INTENTS.RESCHEDULE : INTENTS.BOOKING;
        const logAction = isReschedule ? 'reschedule_failed' : 'booking_failed';
        
        // Log failure
        await googleSheetsService.logAction({
          conversationId: session.conversationId,
          phone: session.phone,
          patientName: session.patientName,
          intent: logIntent,
          dentist: session.dentistName,
          treatment: session.treatmentType,
          status: 'NEEDS FOLLOW-UP***************',
          action: logAction,
        });

        return { 
          success: false, 
          message: 'I apologize, there was an error creating your appointment. Our receptionist will contact you shortly. Please call us if you need immediate assistance.' 
        };
      }
    } catch (error) {
      console.error('Error confirming booking:', error);
      
      // Clear state on error
      sessionManager.updateSession(session.conversationId, {
        selectedSlot: null,
        bookingConfirmationPending: false,
        bookingConfirmed: false
      });
      session.selectedSlot = null;
      session.bookingConfirmationPending = false;
      session.bookingConfirmed = false;
      
      await googleSheetsService.logAction({
        conversationId: session.conversationId,
        phone: session.phone,
        status: 'NEEDS FOLLOW-UP***************',
        action: 'booking_error',
      });

      return { 
        success: false, 
        message: 'I apologize, there was an error processing your booking. Our receptionist will contact you shortly.' 
      };
    }
  }

  /**
   * Handles appointment cancellation requests.
   * Two-phase process: first finds booking, then confirms cancellation.
   * Searches for existing booking by phone number, asks for confirmation,
   * and cancels the calendar event if confirmed. Logs all actions.
   * 
   * Flow:
   * 1. If booking not yet retrieved, searches by phone number
   * 2. If booking found, stores in session and asks for confirmation
   * 3. If booking not found, returns error message
   * 4. On confirmation ("yes", "confirm", "ok", "sure"), cancels calendar event
   * 5. On decline ("no", "cancel", "keep"), clears booking from session
   * 6. All actions logged to Google Sheets
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {Object} session - Current session object
   * @param {string} session.phone - Patient phone number (required for booking search)
   * @param {Object} [session.existingBooking] - Existing booking object (if already retrieved in previous call)
   * @param {string} userMessage - User's message (may contain confirmation: "yes", "no", etc.)
   * @returns {Promise<string>} Response message with booking details, confirmation request, or cancellation result
   * 
   * @example
   * // Phase 1 - First call (booking found):
   * await handleCancellation("+1234567890", {
   *   phone: "+1234567890",
   *   existingBooking: null
   * }, "I want to cancel")
   * // Searches for booking by phone, finds it
   * // Output: "I found your appointment:\n\nDoctor: Dr GeneralA\nDate: 1/16/2024\nTime: 10:00 AM\n\nWould you like to confirm cancellation?"
   * // Session updated: existingBooking={...}
   * 
   * @example
   * // Phase 2 - Second call (user confirms):
   * await handleCancellation("+1234567890", {
   *   phone: "+1234567890",
   *   existingBooking: {
   *     calendarId: "...",
   *     calendarEventId: "...",
   *     doctor: "Dr GeneralA",
   *     startTime: new Date("2024-01-16T10:00:00Z"),
   *     endTime: new Date("2024-01-16T10:30:00Z"),
   *     patientName: "John Doe"
   *   }
   * }, "Yes")
   * // Cancels calendar event
   * // Output: "✅ Your appointment has been cancelled successfully. We hope to see you again soon!"
   * // Session updated: existingBooking=null
   * // Logged to sheets: status="cancelled"
   * 
   * @example
   * // Phase 2 - User declines:
   * await handleCancellation("+1234567890", {
   *   phone: "+1234567890",
   *   existingBooking: {...}
   * }, "No")
   * // Output: "No problem. Your appointment remains scheduled. Is there anything else I can help you with?"
   * // Session updated: existingBooking=null
   * 
   * @example
   * // Booking not found:
   * await handleCancellation("+1234567890", {
   *   phone: "+1234567890",
   *   existingBooking: null
   * }, "I want to cancel")
   * // Searches for booking, none found
   * // Output: "I could not find an appointment for your phone number. Please contact our receptionist for assistance."
   * // Logged to sheets: status="NEEDS FOLLOW-UP***************", action="cancellation_not_found"
   * 
   * @example
   * // Cancellation API failure:
   * // If googleCalendarService.cancelAppointment() fails:
   * // Output: "I apologize, there was an error cancelling your appointment. Please contact our receptionist."
   * // Logged to sheets: status="NEEDS FOLLOW-UP***************", action="cancellation_failed"
   * 
   * @example
   * // Still waiting for confirmation (ambiguous response):
   * await handleCancellation("+1234567890", {
   *   phone: "+1234567890",
   *   existingBooking: {...}
   * }, "Maybe")
   * // Output: "I found your appointment:\n\nDoctor: ...\n\nWould you like to confirm cancellation?"
   * // (Repeats confirmation request)
   */
  async handleCancellation(session, userMessage) {
    try {
      // Phase 1: Find booking and ask for confirmation
      if (!session.cancellationConfirmationPending) {
        // Find booking by phone
        const booking = await googleCalendarService.findBookingByPhone(session.phone);
        
        if (!booking) {
          await googleSheetsService.logAction({
            conversationId: session.conversationId,
            phone: session.phone,
            status: 'NEEDS FOLLOW-UP***************',
            action: 'cancellation_not_found',
          });

          return { 
            success: false, 
            message: 'I could not find an appointment for your phone number. Please contact our receptionist for assistance.' 
          };
        }

        // Validate booking object structure
        const bookingStartTime = booking.startTime instanceof Date 
          ? booking.startTime 
          : new Date(booking.startTime);
        const bookingEndTime = booking.endTime instanceof Date 
          ? booking.endTime 
          : new Date(booking.endTime);
        
        // Validate doctor name
        let doctorName = booking.doctor;
        if (doctorName && doctorName.includes('@group.calendar.google.com')) {
          const calendarIdToDoctor = Object.fromEntries(
            Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
          );
          doctorName = calendarIdToDoctor[doctorName] || doctorName;
          console.log('⚠️ [CANCELLATION] Found calendar ID as doctor, mapped to:', doctorName);
        }
        
        // Validate dates
        if (isNaN(bookingStartTime.getTime()) || isNaN(bookingEndTime.getTime())) {
          console.error('❌ [CANCELLATION] Invalid dates in booking:', {
            startTime: booking.startTime,
            endTime: booking.endTime
          });
          return { 
            success: false, 
            message: 'I found your appointment, but there was an error reading the appointment details. Please contact our receptionist for assistance.' 
          };
        }

        // Store booking and ask for confirmation
        sessionManager.updateSession(session.conversationId, {
          existingBooking: booking,
          cancellationConfirmationPending: true
        });
        session.existingBooking = booking;
        session.cancellationConfirmationPending = true;

        const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
          month: 'numeric', 
          day: 'numeric', 
          year: 'numeric' 
        });
        const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });

        return {
          success: false, // Not cancelled yet, waiting for confirmation
          message: `I found your appointment:\n\nDoctor: ${doctorName}\nDate: ${formattedDate}\nTime: ${formattedStartTime}\n\nWould you like to confirm cancellation?`
        };
      }

      // Phase 2: User is confirming/declining
      if (!session.existingBooking) {
        // Should not happen, but handle gracefully
        sessionManager.updateSession(session.conversationId, {
          cancellationConfirmationPending: false
        });
        session.cancellationConfirmationPending = false;
        return {
          success: false,
          message: 'I could not find your appointment details. Please try again or contact our receptionist.'
        };
      }

      // Detect confirmation or decline
      const confirmationResult = await this.detectConfirmationOrDecline(userMessage, {
        hasPendingSlot: false,
        hasPendingCancellation: true
      });

      if (confirmationResult.isConfirmation) {
        // User confirmed - proceed with cancellation
        const booking = session.existingBooking;
        const bookingStartTime = booking.startTime instanceof Date 
          ? booking.startTime 
          : new Date(booking.startTime);
        const bookingEndTime = booking.endTime instanceof Date 
          ? booking.endTime 
          : new Date(booking.endTime);
        
        let doctorName = booking.doctor;
        if (doctorName && doctorName.includes('@group.calendar.google.com')) {
          const calendarIdToDoctor = Object.fromEntries(
            Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
          );
          doctorName = calendarIdToDoctor[doctorName] || doctorName;
        }

        console.log('🔄 [CANCELLATION] Cancelling appointment:', {
          calendarId: booking.calendarId,
          eventId: booking.calendarEventId,
          phone: session.phone
        });
        
        const cancelResult = await googleCalendarService.cancelAppointment(
          booking.calendarId,
          booking.calendarEventId
        );
        
        console.log('🔄 [CANCELLATION] Cancel result:', cancelResult);

        if (cancelResult.success) {
          await googleSheetsService.logAction({
            conversationId: session.conversationId,
            phone: session.phone,
            patientName: booking.patientName,
            intent: INTENTS.CANCEL,
            dentist: doctorName,
            dateTime: `${bookingStartTime.toISOString()} - ${bookingEndTime.toISOString()}`,
            eventId: booking.calendarEventId,
            status: 'cancelled',
            action: 'appointment_cancelled',
          });

          // Clear cancellation state
          sessionManager.updateSession(session.conversationId, { 
            existingBooking: null,
            cancellationConfirmationPending: false
          });
          session.existingBooking = null;
          session.cancellationConfirmationPending = false;
          
          return { 
            success: true, 
            message: '✅ Your appointment has been cancelled successfully. We hope to see you again soon!' 
          };
        } else {
          await googleSheetsService.logAction({
            conversationId: session.conversationId,
            phone: session.phone,
            status: 'NEEDS FOLLOW-UP***************',
            action: 'cancellation_failed',
          });

          return { 
            success: false, 
            message: 'I apologize, there was an error cancelling your appointment. Please contact our receptionist.' 
          };
        }
      } else if (confirmationResult.isDecline) {
        // User declined - clear cancellation state
        sessionManager.updateSession(session.conversationId, {
          existingBooking: null,
          cancellationConfirmationPending: false
        });
        session.existingBooking = null;
        session.cancellationConfirmationPending = false;

        return {
          success: false,
          message: 'No problem. Your appointment remains scheduled. Is there anything else I can help you with?'
        };
      } else {
        // Ambiguous response - re-ask confirmation
        const booking = session.existingBooking;
        const bookingStartTime = booking.startTime instanceof Date 
          ? booking.startTime 
          : new Date(booking.startTime);
        const bookingEndTime = booking.endTime instanceof Date 
          ? booking.endTime 
          : new Date(booking.endTime);
        
        let doctorName = booking.doctor;
        if (doctorName && doctorName.includes('@group.calendar.google.com')) {
          const calendarIdToDoctor = Object.fromEntries(
            Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
          );
          doctorName = calendarIdToDoctor[doctorName] || doctorName;
        }

        const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
          month: 'numeric', 
          day: 'numeric', 
          year: 'numeric' 
        });
        const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });

        return {
          success: false,
          message: `I found your appointment:\n\nDoctor: ${doctorName}\nDate: ${formattedDate}\nTime: ${formattedStartTime}\n\nWould you like to confirm cancellation?`
        };
      }
    } catch (error) {
      console.error('Error handling cancellation:', error);
      return { 
        success: false, 
        message: 'I apologize, I am having trouble processing your cancellation. Please contact our receptionist.' 
      };
    }
  }

  /**
   * Handles reschedule flow in two phases:
   * Phase 1: Find all existing bookings by phone, ask user which one to reschedule
   * Phase 2: User confirms → Cancel old booking → Proceed with booking flow for new slot
   * 
   * @param {Object} session - Current session object
   * @param {string} userMessage - User's message
   * @returns {Promise<Object>} { success: boolean, message: string, shouldProceedToBooking?: boolean }
   */
  async handleReschedule(session, userMessage) {
    try {
      // Phase 1: Find bookings and ask for confirmation
      if (!session.rescheduleConfirmationPending) {
        // Find all bookings by phone
        const allBookings = await googleCalendarService.getAllBookings();
        const normalizedSearchPhone = this.normalizePhoneNumber(session.phone);
        const bookings = allBookings.filter(booking => {
          const normalizedBookingPhone = this.normalizePhoneNumber(booking.patientPhone);
          return normalizedBookingPhone === normalizedSearchPhone || 
                 normalizedBookingPhone.endsWith(normalizedSearchPhone) ||
                 normalizedSearchPhone.endsWith(normalizedBookingPhone);
        });
        
        if (!bookings || bookings.length === 0) {
          await googleSheetsService.logAction({
            conversationId: session.conversationId,
            phone: session.phone,
            status: 'NEEDS FOLLOW-UP***************',
            action: 'reschedule_not_found',
          });

          return { 
            success: false, 
            message: 'I could not find any appointments for your phone number. Would you like to book a new appointment instead?',
            shouldProceedToBooking: false
          };
        }

        // If only one booking, auto-select it
        if (bookings.length === 1) {
          const booking = bookings[0];
          const bookingStartTime = booking.startTime instanceof Date 
            ? booking.startTime 
            : new Date(booking.startTime);
          const bookingEndTime = booking.endTime instanceof Date 
            ? booking.endTime 
            : new Date(booking.endTime);
          
          let doctorName = booking.doctor;
          if (doctorName && doctorName.includes('@group.calendar.google.com')) {
            const calendarIdToDoctor = Object.fromEntries(
              Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
            );
            doctorName = calendarIdToDoctor[doctorName] || doctorName;
          }

          const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
            month: 'numeric', 
            day: 'numeric', 
            year: 'numeric' 
          });
          const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          });

          // Store booking and ask for confirmation
          sessionManager.updateSession(session.conversationId, {
            existingBookingToReschedule: booking,
            rescheduleConfirmationPending: true
          });
          session.existingBookingToReschedule = booking;
          session.rescheduleConfirmationPending = true;

          return {
            success: false, // Not rescheduled yet, waiting for confirmation
            message: `I found your appointment:\n\nDoctor: ${doctorName}\nDate: ${formattedDate}\nTime: ${formattedStartTime}\n\nWould you like to reschedule this appointment?`,
            shouldProceedToBooking: false
          };
        }

        // Multiple bookings - list them and ask user to specify
        let message = 'I found multiple appointments:\n\n';
        bookings.forEach((booking, index) => {
          const bookingStartTime = booking.startTime instanceof Date 
            ? booking.startTime 
            : new Date(booking.startTime);
          const bookingEndTime = booking.endTime instanceof Date 
            ? booking.endTime 
            : new Date(booking.endTime);
          
          let doctorName = booking.doctor;
          if (doctorName && doctorName.includes('@group.calendar.google.com')) {
            const calendarIdToDoctor = Object.fromEntries(
              Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
            );
            doctorName = calendarIdToDoctor[doctorName] || doctorName;
          }

          const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
            month: 'numeric', 
            day: 'numeric', 
            year: 'numeric' 
          });
          const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          });

          message += `${index + 1}. Doctor: ${doctorName}, Date: ${formattedDate}, Time: ${formattedStartTime}\n`;
        });
        message += '\nWhich appointment would you like to reschedule? Please specify by number or date/time.';

        // Store all bookings for selection
        sessionManager.updateSession(session.conversationId, {
          existingBookings: bookings,
          rescheduleConfirmationPending: true
        });
        session.existingBookings = bookings;
        session.rescheduleConfirmationPending = true;

        return {
          success: false,
          message: message,
          shouldProceedToBooking: false
        };
      }

      // Phase 2: User is confirming/selecting booking to reschedule
      if (session.existingBookings && session.existingBookings.length > 1) {
        // User needs to select which booking to reschedule
        const selectedBooking = this.selectBookingFromMessage(userMessage, session.existingBookings);
        
        if (!selectedBooking) {
          // Could not determine which booking - re-ask
          let message = 'I found multiple appointments:\n\n';
          session.existingBookings.forEach((booking, index) => {
            const bookingStartTime = booking.startTime instanceof Date 
              ? booking.startTime 
              : new Date(booking.startTime);
            let doctorName = booking.doctor;
            if (doctorName && doctorName.includes('@group.calendar.google.com')) {
              const calendarIdToDoctor = Object.fromEntries(
                Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
              );
              doctorName = calendarIdToDoctor[doctorName] || doctorName;
            }
            const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
              month: 'numeric', 
              day: 'numeric', 
              year: 'numeric' 
            });
            const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            });
            message += `${index + 1}. Doctor: ${doctorName}, Date: ${formattedDate}, Time: ${formattedStartTime}\n`;
          });
          message += '\nWhich appointment would you like to reschedule? Please specify by number or date/time.';

          return {
            success: false,
            message: message,
            shouldProceedToBooking: false
          };
        }

        // Store selected booking
        sessionManager.updateSession(session.conversationId, {
          existingBookingToReschedule: selectedBooking,
          existingBookings: null
        });
        session.existingBookingToReschedule = selectedBooking;
        session.existingBookings = null;
      }

      // Now we have a selected booking (either from single booking or user selection)
      if (!session.existingBookingToReschedule) {
        sessionManager.updateSession(session.conversationId, {
          rescheduleConfirmationPending: false
        });
        session.rescheduleConfirmationPending = false;
        return {
          success: false,
          message: 'I could not find the appointment to reschedule. Please try again or contact our receptionist.',
          shouldProceedToBooking: false
        };
      }

      // Detect confirmation or decline
      const confirmationResult = await this.detectConfirmationOrDecline(userMessage, {
        hasPendingSlot: false,
        hasPendingCancellation: false,
        hasPendingReschedule: true
      });

      if (confirmationResult.isConfirmation) {
        // User confirmed - cancel old booking and proceed to booking flow
        const booking = session.existingBookingToReschedule;
        
        console.log('🔄 [RESCHEDULE] Cancelling old appointment:', {
          calendarId: booking.calendarId,
          eventId: booking.calendarEventId,
          phone: session.phone
        });
        
        const cancelResult = await googleCalendarService.cancelAppointment(
          booking.calendarId,
          booking.calendarEventId
        );
        
        if (!cancelResult.success) {
          console.error('⚠️ [RESCHEDULE] Failed to cancel old appointment:', cancelResult);
          // Continue anyway - we'll create new event and old one might need manual cleanup
        }

        // Store cancelled slot to exclude it from available slots
        const cancelledSlot = {
          startTime: booking.startTime instanceof Date ? booking.startTime : new Date(booking.startTime),
          endTime: booking.endTime instanceof Date ? booking.endTime : new Date(booking.endTime),
          doctor: booking.doctor
        };

        // Clear reschedule state and proceed to booking flow
        sessionManager.updateSession(session.conversationId, {
          existingBookingToReschedule: null,
          rescheduleConfirmationPending: false,
          eventId: null, // Clear old event ID
          bookingConfirmed: false, // Reset booking confirmed status
          cancelledSlotToExclude: cancelledSlot
        });
        session.existingBookingToReschedule = null;
        session.rescheduleConfirmationPending = false;
        session.eventId = null;
        session.bookingConfirmed = false;
        session.cancelledSlotToExclude = cancelledSlot;

        return {
          success: true,
          message: '✅ I\'ve cancelled your old appointment. Now let\'s find a new time slot for you.',
          shouldProceedToBooking: true
        };
      } else if (confirmationResult.isDecline) {
        // User declined - clear reschedule state
        sessionManager.updateSession(session.conversationId, {
          existingBookingToReschedule: null,
          rescheduleConfirmationPending: false,
          existingBookings: null
        });
        session.existingBookingToReschedule = null;
        session.rescheduleConfirmationPending = false;
        session.existingBookings = null;

        return {
          success: false,
          message: 'No problem. Your appointment remains scheduled. Is there anything else I can help you with?',
          shouldProceedToBooking: false
        };
      } else {
        // Ambiguous response - re-ask confirmation
        const booking = session.existingBookingToReschedule;
        const bookingStartTime = booking.startTime instanceof Date 
          ? booking.startTime 
          : new Date(booking.startTime);
        
        let doctorName = booking.doctor;
        if (doctorName && doctorName.includes('@group.calendar.google.com')) {
          const calendarIdToDoctor = Object.fromEntries(
            Object.entries(config.calendar.dentistCalendars).map(([doc, cal]) => [cal, doc])
          );
          doctorName = calendarIdToDoctor[doctorName] || doctorName;
        }

        const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
          month: 'numeric', 
          day: 'numeric', 
          year: 'numeric' 
        });
        const formattedStartTime = bookingStartTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });

        return {
          success: false,
          message: `I found your appointment:\n\nDoctor: ${doctorName}\nDate: ${formattedDate}\nTime: ${formattedStartTime}\n\nWould you like to reschedule this appointment?`,
          shouldProceedToBooking: false
        };
      }
    } catch (error) {
      console.error('Error handling reschedule:', error);
      return { 
        success: false, 
        message: 'I apologize, I am having trouble processing your reschedule request. Please contact our receptionist.',
        shouldProceedToBooking: false
      };
    }
  }

  /**
   * Helper function to select a booking from user message when multiple bookings exist
   * @param {string} userMessage - User's message
   * @param {Array} bookings - Array of booking objects
   * @returns {Object|null} Selected booking or null if cannot determine
   */
  selectBookingFromMessage(userMessage, bookings) {
    const message = userMessage.toLowerCase().trim();
    
    // Try to match by number (1, 2, 3, etc.)
    const numberMatch = message.match(/\b(\d+)\b/);
    if (numberMatch) {
      const index = parseInt(numberMatch[1]) - 1;
      if (index >= 0 && index < bookings.length) {
        return bookings[index];
      }
    }
    
    // Try to match by date/time keywords
    for (const booking of bookings) {
      const bookingStartTime = booking.startTime instanceof Date 
        ? booking.startTime 
        : new Date(booking.startTime);
      const formattedDate = bookingStartTime.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      const formattedTime = bookingStartTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      
      if (message.includes(formattedDate.toLowerCase()) || message.includes(formattedTime.toLowerCase())) {
        return booking;
      }
    }
    
    return null;
  }

  /**
   * Helper function to normalize phone numbers for comparison
   * @param {string} phone - Phone number to normalize
   * @returns {string} Normalized phone number
   */
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, ''); // Remove all non-digits
  }
}

export const openaiHandler = new OpenAIHandler();
