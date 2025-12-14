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
      confirmationStatus: session.confirmationStatus,
      eventId: session.eventId
    });
    
    // Update phone if not set
    if (!session.phone) {
      sessionManager.updateSession(conversationId, { phone: phoneNumber });
    }

    // Add user message to history
    sessionManager.addMessage(conversationId, 'user', userMessage);

    // Detect intents and update session
    const detectedIntents = await this.detectIntents(userMessage, session);
    
    // Validate output format and content (defense in depth)
    // Ensures AI response is valid array of strings matching allowed intents
    const validIntents = ['booking', 'cancel', 'reschedule', 'price_inquiry'];
    const validatedIntents = Array.isArray(detectedIntents)
      ? detectedIntents.filter(intent => 
          typeof intent === 'string' && validIntents.includes(intent)
        )
      : [];
    
    // Intent management strategy: Replace old intents with new ones (don't accumulate)
    // Edge case: If no new intents detected (e.g., "Yes" confirmation), keep existing intents for context
    // This allows confirmations to work with ongoing booking flows
    const latestIntents = validatedIntents.length > 0 
      ? validatedIntents 
      : (session.intents || []); // Keep existing if no new ones detected
    
    // Only update session if new intents were detected (prevents unnecessary updates)
    if (validatedIntents.length > 0) {
      sessionManager.updateSession(conversationId, { intents: validatedIntents });
    }
    // Note: latestIntents contains only the latest intents (either new ones or kept from previous)

    // Build system prompt with context
    const systemPrompt = this.buildSystemPrompt(session);
    
    // Build conversation history for OpenAI
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
      // Get fresh session state before post-processing (session may have been updated)
      const currentSession = sessionManager.getSession(conversationId);
      aiResponse = await this.postProcessResponse(conversationId, userMessage, aiResponse, currentSession, latestIntents);
      
      console.log('✅ [AI RESPONSE] Final response after post-processing:', aiResponse.substring(0, 200));
      
      // Check if AI claimed scheduling without actually booking
      const claimedScheduled = /(scheduled|booked|confirmed|appointment is set)/i.test(aiResponse);
      const finalSession = sessionManager.getSession(conversationId);
      const hasEventId = finalSession.eventId;
      if (claimedScheduled && !hasEventId) {
        console.log('⚠️ [AI RESPONSE] WARNING: AI claimed scheduling but no event ID found - this may be a false claim');
        console.log('⚠️ [AI RESPONSE] Session state:', {
          hasSelectedSlot: !!finalSession.selectedSlot,
          confirmationStatus: finalSession.confirmationStatus,
          eventId: finalSession.eventId
        });
      }

      // Add AI response to history
      sessionManager.addMessage(conversationId, 'assistant', aiResponse);

      // Log conversation
      await googleSheetsService.logConversationTurn(conversationId, phoneNumber, 'assistant', aiResponse, session);

      return aiResponse;
    } catch (error) {
      console.error('Error generating OpenAI response:', error);
      return 'I apologize, I am experiencing technical difficulties. Please try again later or contact our receptionist.';
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

Rules:
1. Detect ALL relevant intents in the message (can be multiple)
2. Ignore negations (e.g., "I don't want to cancel" = no cancel intent)
3. Ignore confirmations or simple responses like "yes", "ok", "sure" unless they contain new intent
4. If message is just confirming something (yes/no), return empty array
5. Consider conversation context - if user is already in a booking flow and says "yes", don't add new booking intent
6. Default to "booking" ONLY if no intents detected AND this appears to be a new request (not a confirmation)

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
        const validIntents = ['booking', 'cancel', 'reschedule', 'price_inquiry'];
        const filteredIntents = intents
          .filter(intent => typeof intent === 'string' && validIntents.includes(intent))
          .filter((intent, index, self) => self.indexOf(intent) === index); // Remove duplicates
        
        console.log('🔍 [INTENT DETECTION] Filtered intents:', filteredIntents);
        
        // Default to booking if no intents and this seems like a new request
        // Edge case: Don't default if message is just a confirmation (yes/no)
        // This prevents false booking intents on confirmations
        if (filteredIntents.length === 0 && 
            (!session.intents || session.intents.length === 0)) {
          const isConfirmation = /^(yes|ok|okay|sure|yep|yeah|alright|confirm|confirmed|no|nope)$/i.test(message.trim());
          if (!isConfirmation && message.trim().length > 2) {
            filteredIntents.push('booking');
            console.log('🔍 [INTENT DETECTION] No intents found, defaulting to booking');
          } else {
            console.log('🔍 [INTENT DETECTION] Message is confirmation, not defaulting to booking');
          }
        }

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
      detectedIntents.push('cancel');
    }
    if ((msg.includes('reschedule') || msg.includes('change appointment') || msg.includes('move appointment')) &&
        !msg.includes("don't") && !msg.includes('not')) {
      detectedIntents.push('reschedule');
    }
    if ((msg.includes('price') || msg.includes('cost') || msg.includes('how much')) &&
        !msg.includes("don't") && !msg.includes('not')) {
      detectedIntents.push('price_inquiry');
    }
    if ((msg.includes('book') || msg.includes('appointment') || msg.includes('schedule')) &&
        !msg.includes("don't") && !msg.includes('not') &&
        msg.length > 3 && !/^(yes|ok|okay|sure)$/i.test(msg)) {
      detectedIntents.push('booking');
    }
    
    if (detectedIntents.length === 0 && 
        (!session.intents || session.intents.length === 0) &&
        !/^(yes|ok|okay|sure|yep|yeah|alright|confirm|confirmed)$/i.test(msg)) {
      detectedIntents.push('booking');
    }
    
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
      const availableDentists = [
        'Dr BracesA', 'Dr BracesB',
        'Dr GeneralA', 'Dr GeneralB'
      ];
      
      const treatmentTypes = ['Consultation', 'Cleaning', 'Filling', 'Braces Maintenance'];
      
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

Available treatment types: ${treatmentTypes.join(', ')}
Available dentists: ${availableDentists.join(', ')}

${contextInfo.length > 0 ? `Current session context: ${contextInfo.join(', ')}` : ''}

Extract the following information from the user message:
1. Patient name: Extract if mentioned (e.g., "I'm John", "my name is Jane Doe", "this is Mike")
2. Treatment type: One of: ${treatmentTypes.join(', ')} or null if not mentioned
   - Map symptoms to treatment: "toothache", "pain", "hurt", "ache", "sore" → "Consultation"
   - "cleaning", "clean", "teeth cleaning" → "Cleaning"
   - "filling", "fill", "cavity", "cavities" → "Filling"
   - "braces", "braces maintenance", "orthodontic", "orthodontics" → "Braces Maintenance"
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
          if (typeof extracted.treatmentType === 'string' && treatmentTypes.includes(extracted.treatmentType)) {
            validated.treatmentType = extracted.treatmentType;
            console.log('✅ [INFO EXTRACTION] Validated treatmentType:', validated.treatmentType);
          } else if (extracted.treatmentType) {
            console.log('❌ [INFO EXTRACTION] Invalid treatmentType:', extracted.treatmentType);
          }

          // Validate dentist name: must be exact match from available dentists
          // Prevents invalid dentist names that don't exist in calendar config
          if (typeof extracted.dentistName === 'string' && availableDentists.includes(extracted.dentistName)) {
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
  buildSystemPrompt(session) {
    let prompt = `You are a polite and professional AI receptionist for a dental clinic. Your role is to help patients book appointments, answer questions about treatments and pricing, and manage cancellations.

Guidelines:
- Always be polite, professional, and empathetic
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
    if (session.selectedSlot) {
      prompt += `- Selected slot (pending confirmation): ${session.selectedSlot.startTime.toLocaleString()}\n`;
      prompt += `- IMPORTANT: This slot is PENDING confirmation. Ask user to confirm, do NOT claim it's already scheduled.\n`;
    }
    if (session.confirmationStatus === 'pending') {
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
   * Post-processes AI response and handles business logic based on user message and session state.
   * This is the core business logic orchestrator. Extracts information, validates data,
   * updates session, triggers availability checks, handles confirmations, cancellations, and price inquiries.
   * 
   * Processing flow:
   * 1. Validates latestIntents format (defense in depth)
   * 2. Extracts information using AI (patient name, treatment, dentist, teeth, date/time)
   * 3. Validates extracted information (format, type, allowed values)
   * 4. Routes validated information to appropriate flows:
   *    - Patient name → update session
   *    - Treatment type → update session, ask for teeth if filling
   *    - Dentist name → validate availability for treatment, update session
   *    - Number of teeth → update session (for fillings)
   *    - Date/time → parse and check availability
   * 5. Handles confirmations (if slot pending)
   * 6. Handles cancellations (if cancel intent)
   * 7. Handles price inquiries (if price_inquiry intent)
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {string} userMessage - User's message text
   * @param {string} aiResponse - Initial AI-generated response
   * @param {Object} session - Current session object
   * @param {string[]} latestIntents - Latest intents from current message (validated, duplicates removed)
   * @returns {Promise<string>} Final processed response message
   * 
   * @example
   * // Treatment detection (filling without teeth count):
   * await postProcessResponse("+1234567890", "I need a filling", "I can help you with that.", { treatmentType: null }, [])
   * // Output: "I can help you with that.\n\nHow many teeth need filling?"
   * 
   * @example
   * // Complete booking flow (all info provided):
   * await postProcessResponse("+1234567890", "Tomorrow at 10am", "Great!", {
   *   treatmentType: "Cleaning",
   *   dentistName: "Dr GeneralA",
   *   selectedSlot: null
   * }, ["booking"])
   * // Output: "I found an available slot:\n\nDoctor: Dr GeneralA\nDate: 1/16/2024\nTime: 10:00 AM - 10:30 AM\nDuration: 30 minutes\n\nWould you like to confirm this appointment?"
   * 
   * @example
   * // Confirmation (slot pending):
   * await postProcessResponse("+1234567890", "Yes", "Would you like to confirm?", {
   *   selectedSlot: { startTime: new Date("2024-01-16T10:00:00Z") },
   *   confirmationStatus: "pending",
   *   treatmentType: "Cleaning",
   *   dentistName: "Dr GeneralA"
   * }, ["booking"])
   * // Output: "✅ Appointment confirmed!\n\nDoctor: Dr GeneralA\nTreatment: Cleaning\n..."
   * 
   * @example
   * // Partial information (date/time but missing treatment/dentist):
   * await postProcessResponse("+1234567890", "I'm John and I need cleaning tomorrow", "I can help you.", {
   *   treatmentType: null,
   *   dentistName: null
   * }, ["booking"])
   * // Extracts: patientName="John", treatmentType="Cleaning", dateTimeText="tomorrow"
   * // Updates session with treatment, asks for dentist
   * // Output: "Which dentist would you like? Available options: ..."
   * 
   * @example
   * // Cancellation intent:
   * await postProcessResponse("+1234567890", "I want to cancel", "I can help with that.", {
   *   phone: "+1234567890",
   *   existingBooking: null
   * }, ["cancel"])
   * // Output: "I found your appointment:\n\nDoctor: ...\n\nWould you like to confirm cancellation?"
   * 
   * @example
   * // Price inquiry intent:
   * await postProcessResponse("+1234567890", "How much does cleaning cost?", "Here's our pricing:", {}, ["price_inquiry"])
   * // Output: "Here's our pricing:\n\n[Pricing information from Google Docs]"
   * 
   * @example
   * // Invalid extracted data (filtered out):
   * // If AI extracts invalid dentist name or out-of-range teeth count:
   * // Validation filters it out, only valid data updates session
   */
  async postProcessResponse(conversationId, userMessage, aiResponse, session, latestIntents = []) {
    const msg = userMessage.toLowerCase();

    console.log('\n🔄 [POST-PROCESS] Starting post-processing');
    console.log('🔄 [POST-PROCESS] User message:', userMessage);
    console.log('🔄 [POST-PROCESS] Latest intents:', latestIntents);
    console.log('🔄 [POST-PROCESS] Current session state:', {
      treatmentType: session.treatmentType,
      dentistName: session.dentistName,
      patientName: session.patientName,
      selectedSlot: session.selectedSlot ? `${session.selectedSlot.startTime.toISOString()}` : null,
      confirmationStatus: session.confirmationStatus
    });

    // Validate latestIntents format (defense in depth)
    const validIntents = ['booking', 'cancel', 'reschedule', 'price_inquiry'];
    const validatedLatestIntents = Array.isArray(latestIntents)
      ? latestIntents
          .filter(intent => typeof intent === 'string' && validIntents.includes(intent))
          .filter((intent, index, self) => self.indexOf(intent) === index) // Remove duplicates
      : [];

    console.log('🔄 [POST-PROCESS] Validated intents:', validatedLatestIntents);

    // Extract all information using AI (much more robust than regex)
    const extracted = await this.extractInformation(userMessage, session);

    // Validate extracted information format (defense in depth)
    const availableDentists = [
      'Dr BracesA', 'Dr BracesB',
      'Dr GeneralA', 'Dr GeneralB'
    ];
    const treatmentTypes = ['Consultation', 'Cleaning', 'Filling', 'Braces Maintenance'];
    
    // Validate and sanitize extracted data before use
    const validated = {
      patientName: (typeof extracted.patientName === 'string' && extracted.patientName.trim().length >= 2 && extracted.patientName.trim().length <= 100) 
        ? extracted.patientName.trim() 
        : null,
      treatmentType: (typeof extracted.treatmentType === 'string' && treatmentTypes.includes(extracted.treatmentType))
        ? extracted.treatmentType
        : null,
      dentistName: (typeof extracted.dentistName === 'string' && availableDentists.includes(extracted.dentistName))
        ? extracted.dentistName
        : null,
      numberOfTeeth: (typeof extracted.numberOfTeeth === 'number' && 
                      Number.isInteger(extracted.numberOfTeeth) && 
                      extracted.numberOfTeeth > 0 && 
                      extracted.numberOfTeeth <= 32)
        ? extracted.numberOfTeeth
        : null,
      dateTimeText: (typeof extracted.dateTimeText === 'string' && extracted.dateTimeText.trim().length >= 3 && extracted.dateTimeText.trim().length <= 200)
        ? extracted.dateTimeText.trim()
        : null,
    };

    // Route validated information to appropriate flows
    console.log('🔄 [POST-PROCESS] Routing validated information...');
    
    // 1. Patient name → update session
    if (validated.patientName && !session.patientName) {
      console.log('✅ [POST-PROCESS] Updating patientName:', validated.patientName);
      sessionManager.updateSession(conversationId, { patientName: validated.patientName });
    }

    // 2. Treatment type → update session
    // Edge case: Only update if not already set (prevents overwriting user's previous choice)
    // REQUIREMENT: If no treatment type specified, default to Consultation
    if (validated.treatmentType && !session.treatmentType) {
      console.log('✅ [POST-PROCESS] Updating treatmentType:', validated.treatmentType);
      sessionManager.updateSession(conversationId, { treatmentType: validated.treatmentType });
      
      // Special handling for fillings: require number of teeth
      // If filling and number of teeth already extracted, update session
      if (validated.treatmentType === 'Filling' && validated.numberOfTeeth) {
        console.log('✅ [POST-PROCESS] Updating numberOfTeeth for filling:', validated.numberOfTeeth);
        sessionManager.updateSession(conversationId, { numberOfTeeth: validated.numberOfTeeth });
      } else if (validated.treatmentType === 'Filling' && !session.numberOfTeeth) {
        // Ask about number of teeth if not provided (required for duration calculation)
        console.log('⚠️ [POST-PROCESS] Filling requires numberOfTeeth, asking user');
        return aiResponse + '\n\nHow many teeth need filling?';
      }
    } else if (!session.treatmentType && !validated.treatmentType && validatedLatestIntents.includes('booking')) {
      // REQUIREMENT: Default to Consultation if user wants to book but hasn't specified treatment
      console.log('✅ [POST-PROCESS] No treatment specified, defaulting to Consultation');
      sessionManager.updateSession(conversationId, { treatmentType: 'Consultation' });
    }

    // 3. Dentist selection → update session (with validation)
    // Edge case: Validate dentist is available for current treatment type
    // Braces dentists can't do general treatments and vice versa
    if (validated.dentistName && !session.dentistName) {
      // Check dentist availability for current treatment (use session or newly extracted)
      const currentTreatment = session.treatmentType || validated.treatmentType;
      if (currentTreatment) {
        const availableDentistsForTreatment = getAvailableDentists(currentTreatment);
        console.log('🔄 [POST-PROCESS] Checking dentist availability:', {
          dentist: validated.dentistName,
          treatment: currentTreatment,
          availableDentists: availableDentistsForTreatment
        });
        // Only update if dentist is valid for this treatment type
        if (availableDentistsForTreatment.includes(validated.dentistName)) {
          console.log('✅ [POST-PROCESS] Dentist valid, updating session');
          sessionManager.updateSession(conversationId, { 
            dentistName: validated.dentistName,
            dentistType: currentTreatment === 'Braces Maintenance' ? 'braces' : 'general',
          });
        } else {
          console.log('❌ [POST-PROCESS] Dentist not available for treatment type');
        }
        // Note: If dentist not available for treatment, silently ignore (don't update session)
      }
    // REQUIREMENT: Don't require dentist selection - auto-select based on earliest availability
    // Removed: Prompt user to choose dentist - we'll auto-select in checkAvailability

    // 4. Number of teeth (for fillings) → update session
    if (validated.numberOfTeeth && session.treatmentType === 'Filling' && !session.numberOfTeeth) {
      console.log('✅ [POST-PROCESS] Updating numberOfTeeth:', validated.numberOfTeeth);
      sessionManager.updateSession(conversationId, { numberOfTeeth: validated.numberOfTeeth });
    }

    // REQUIREMENT: Always check availability for bookings, even without date/time
    // REQUIREMENT: Auto-select dentist with earliest availability
    // REQUIREMENT: Default to ASAP (earliest available) if no time preference
    // REQUIREMENT: Patient name is mandatory - prompt if missing
    
    // Get current session state (may have been updated above)
    const currentSession = sessionManager.getSession(conversationId);
    const hasTreatment = currentSession.treatmentType || validated.treatmentType;
    const hasBookingIntent = validatedLatestIntents.includes('booking');
    const noSlotPending = !currentSession.selectedSlot;
    const hasPatientName = currentSession.patientName || validated.patientName;
    
    // REQUIREMENT: Check for patient name before proceeding with booking
    if (hasBookingIntent && !hasPatientName && !validated.patientName) {
      console.log('⚠️ [POST-PROCESS] Patient name is mandatory but missing, prompting user');
      return 'To book your appointment, I need your name. What is your name?';
    }
    
    // If booking intent and treatment is set (or defaulted to Consultation), check availability
    if (hasBookingIntent && hasTreatment && noSlotPending && hasPatientName) {
      console.log('🔄 [POST-PROCESS] Booking intent detected, checking availability');
      
      // Ensure treatment is set in session
      if (!currentSession.treatmentType) {
        const treatmentToUse = validated.treatmentType || 'Consultation';
        console.log('✅ [POST-PROCESS] Setting treatment in session:', treatmentToUse);
        sessionManager.updateSession(conversationId, { treatmentType: treatmentToUse });
      }
      
      // Use date/time preference if provided, otherwise use 'anytime' for ASAP
      const dateTimePreference = validated.dateTimeText || 'anytime';
      console.log('🔄 [POST-PROCESS] Checking availability with preference:', dateTimePreference);
      
      // Get fresh session after updates
      const updatedSession = sessionManager.getSession(conversationId);
      return await this.checkAvailability(conversationId, updatedSession, dateTimePreference);
    }

    // Handle confirmation - More robust detection
    console.log('🔄 [POST-PROCESS] Checking confirmation conditions...');
    console.log('🔄 [POST-PROCESS] Session state:', {
      hasSelectedSlot: !!session.selectedSlot,
      confirmationStatus: session.confirmationStatus,
      selectedSlotDetails: session.selectedSlot ? {
        startTime: session.selectedSlot.startTime?.toISOString(),
        doctor: session.selectedSlot.doctor
      } : null
    });
    
    // Check for confirmation keywords (case-insensitive, whole word or standalone)
    const confirmationKeywords = ['yes', 'ok', 'okay', 'sure', 'confirm', 'confirmed', 'yep', 'yeah', 'alright', 'sounds good', 'that works', 'perfect', 'great'];
    const declineKeywords = ['no', 'nope', 'cancel', 'change', 'different', 'not', "don't", 'decline'];
    
    const isConfirmation = confirmationKeywords.some(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(userMessage);
    });
    const isDecline = declineKeywords.some(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(userMessage);
    });
    
    console.log('🔄 [POST-PROCESS] Confirmation detection:', {
      isConfirmation,
      isDecline,
      message: userMessage
    });
    
    if (session.selectedSlot && session.confirmationStatus === 'pending') {
      if (isConfirmation) {
        // REQUIREMENT: Patient name is mandatory before confirming booking
        const currentSessionForBooking = sessionManager.getSession(conversationId);
        if (!currentSessionForBooking.patientName && !validated.patientName) {
          console.log('⚠️ [POST-PROCESS] Patient name missing before confirmation, prompting');
          return 'Before I confirm your appointment, I need your name. What is your name?';
        }
        
        // Update patient name if extracted in this message
        if (validated.patientName && !currentSessionForBooking.patientName) {
          console.log('✅ [POST-PROCESS] Updating patientName before booking:', validated.patientName);
          sessionManager.updateSession(conversationId, { patientName: validated.patientName });
        }
        
        console.log('✅ [POST-PROCESS] User confirmed, proceeding to booking');
        const finalSession = sessionManager.getSession(conversationId);
        return await this.confirmBooking(conversationId, finalSession);
      } else if (isDecline) {
        console.log('❌ [POST-PROCESS] User declined, clearing selectedSlot');
        sessionManager.updateSession(conversationId, { 
          selectedSlot: null,
          confirmationStatus: null 
        });
        return 'No problem. Would you like to choose a different time?';
      }
    } else if (isConfirmation && latestIntents.includes('booking') && !session.selectedSlot) {
      // Fallback: User confirmed but no slot selected - need to check availability first
      console.log('⚠️ [POST-PROCESS] User confirmed but no slot selected, checking availability...');
      
      // REQUIREMENT: Patient name is mandatory
      if (!session.patientName && !validated.patientName) {
        console.log('⚠️ [POST-PROCESS] Patient name missing, prompting');
        return 'Before I can book your appointment, I need your name. What is your name?';
      }
      
      // REQUIREMENT: Default to Consultation if treatment not specified
      const treatmentToUse = session.treatmentType || 'Consultation';
      if (!session.treatmentType) {
        sessionManager.updateSession(conversationId, { treatmentType: 'Consultation' });
      }
      
      // Update patient name if extracted
      if (validated.patientName && !session.patientName) {
        sessionManager.updateSession(conversationId, { patientName: validated.patientName });
      }
      
      const updatedSession = sessionManager.getSession(conversationId);
      // REQUIREMENT: Auto-select dentist, don't require user to specify
      return await this.checkAvailability(conversationId, updatedSession, 'anytime');
    }

    // Handle cancellation (only if cancel intent exists in validated latest intents)
    if (validatedLatestIntents.includes('cancel')) {
      return await this.handleCancellation(conversationId, session, userMessage);
    }

    // Handle price inquiry (only if price_inquiry intent exists in validated latest intents)
    if (validatedLatestIntents.includes('price_inquiry')) {
      const pricing = await googleDocsService.getPricingInfo();
      return aiResponse + '\n\n' + pricing.substring(0, 1000); // Limit response length
    }

    // Final check: If AI claimed scheduling but no booking happened, warn and don't claim it
    const finalSessionCheck = sessionManager.getSession(conversationId);
    const aiClaimedScheduled = /(scheduled|booked|confirmed|appointment is set|I have scheduled)/i.test(aiResponse);
    const actuallyScheduled = !!finalSessionCheck.eventId;
    
    if (aiClaimedScheduled && !actuallyScheduled && !finalSessionCheck.selectedSlot) {
      console.log('⚠️ [POST-PROCESS] AI falsely claimed scheduling - removing claim from response');
      // Don't let AI claim scheduling if no slot is selected
      aiResponse = aiResponse.replace(/(I have scheduled|scheduled|booked|confirmed|appointment is set)/gi, 'I can help you schedule');
    }

    console.log('✅ [POST-PROCESS] Final response ready');
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
      
      const treatmentDuration = calculateTreatmentDuration(
        session.treatmentType,
        session.dentistName,
        session.numberOfTeeth
      );
      console.log('📅 [AVAILABILITY] Calculated treatment duration:', treatmentDuration, 'minutes');

      // CACHING STRATEGY: Check if we have fresh cached slots (< 2 minutes old)
      const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
      const now = Date.now();
      const cacheAge = session.availableSlotsTimestamp ? (now - session.availableSlotsTimestamp) : Infinity;
      const hasCachedSlots = session.availableSlots && Array.isArray(session.availableSlots) && session.availableSlots.length > 0;
      const cacheIsFresh = cacheAge < CACHE_TTL_MS;
      
      console.log('📅 [AVAILABILITY] Cache check:', {
        hasCachedSlots,
        cacheAge: cacheAge < Infinity ? `${Math.round(cacheAge / 1000)}s` : 'N/A',
        cacheIsFresh,
        cachedSlotsCount: session.availableSlots?.length || 0
      });
      
      let slots;
      if (hasCachedSlots && cacheIsFresh) {
        // Use cached slots - they're fresh enough
        slots = session.availableSlots;
        console.log('✅ [AVAILABILITY] Using cached slots (fresh, age:', Math.round(cacheAge / 1000), 'seconds)');
      } else {
        // Fetch fresh slots from API
        const availableDentists = getAvailableDentists(session.treatmentType);
        console.log('📅 [AVAILABILITY] Available dentists for treatment:', availableDentists);
        console.log('📅 [AVAILABILITY] Fetching fresh slots from API...');
        
        slots = await googleCalendarService.getAvailableSlots(session.treatmentType, availableDentists);
        console.log('📅 [AVAILABILITY] Total slots found:', slots.length);
        
        // Cache the slots with timestamp
        sessionManager.updateSession(conversationId, { 
          availableSlots: slots,
          availableSlotsTimestamp: now
        });
        console.log('✅ [AVAILABILITY] Cached slots with timestamp:', new Date(now).toISOString());
      }
      
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

      // Try to find slot matching user preference
      let selectedSlot = null;
      
      // Parse date/time preference from user message (e.g., "tomorrow at 10am", "next Tuesday")
      const datePreference = parseDateTimePreference(userMessage);
      console.log('📅 [AVAILABILITY] Parsed date preference:', {
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
        return timeMinutes >= workingStartMinutes && timeMinutes < workingEndMinutes;
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
          console.log('❌ [AVAILABILITY] No available slots found');
        }
      }
      
      // REQUIREMENT: Update session with auto-selected dentist if not already set
      if (dentistToUse && !session.dentistName) {
        console.log('✅ [AVAILABILITY] Auto-selecting dentist:', dentistToUse);
        const dentistType = session.treatmentType === 'Braces Maintenance' ? 'braces' : 'general';
        sessionManager.updateSession(conversationId, { 
          dentistName: dentistToUse,
          dentistType: dentistType
        });
      }

      if (selectedSlot) {
        // Validate slot is within working hours (9 AM - 6 PM)
        const slotHour = selectedSlot.startTime.getHours();
        const slotMinute = selectedSlot.startTime.getMinutes();
        const slotTimeMinutes = slotHour * 60 + slotMinute;
        const workingStartMinutes = 9 * 60; // 9:00 AM
        const workingEndMinutes = 18 * 60; // 6:00 PM
        
        if (slotTimeMinutes < workingStartMinutes || slotTimeMinutes >= workingEndMinutes) {
          console.log('❌ [AVAILABILITY] Selected slot outside working hours:', {
            slotTime: `${slotHour}:${slotMinute}`,
            workingHours: '9:00 - 18:00'
          });
          // Find next available slot within working hours
          const validSlots = dentistSlots.filter(slot => {
            const hour = slot.startTime.getHours();
            const minute = slot.startTime.getMinutes();
            const timeMinutes = hour * 60 + minute;
            return timeMinutes >= workingStartMinutes && timeMinutes < workingEndMinutes && slot.duration >= treatmentDuration;
          });
          
          if (validSlots.length > 0) {
            selectedSlot = validSlots[0];
            console.log('✅ [AVAILABILITY] Found valid slot within working hours:', {
              startTime: selectedSlot.startTime.toISOString()
            });
          } else {
            console.log('❌ [AVAILABILITY] No valid slots within working hours');
            return 'I apologize, but I could not find an available slot during working hours (9:00 AM - 6:00 PM, Monday-Friday). Would you like me to check for a different time, or would you prefer to contact our receptionist directly?';
          }
        }
        
        const endTime = new Date(selectedSlot.startTime);
        endTime.setMinutes(endTime.getMinutes() + treatmentDuration);

        console.log('✅ [AVAILABILITY] Setting selectedSlot in session:', {
          startTime: selectedSlot.startTime.toISOString(),
          endTime: endTime.toISOString(),
          doctor: selectedSlot.doctor,
          hour: selectedSlot.startTime.getHours(),
          minute: selectedSlot.startTime.getMinutes()
        });

        // Get fresh session to ensure we have latest state
        const updatedSession = sessionManager.getSession(conversationId);
        
        sessionManager.updateSession(conversationId, {
          selectedSlot: {
            ...selectedSlot,
            endTime,
          },
          treatmentDuration,
          confirmationStatus: 'pending',
        });
        
        // Verify update was successful
        const verifySession = sessionManager.getSession(conversationId);
        console.log('✅ [AVAILABILITY] Session updated, verification:', {
          hasSelectedSlot: !!verifySession.selectedSlot,
          confirmationStatus: verifySession.confirmationStatus,
          slotStartTime: verifySession.selectedSlot?.startTime?.toISOString()
        });

        // REQUIREMENT: Check patient name before offering confirmation
        if (!verifySession.patientName) {
          console.log('⚠️ [AVAILABILITY] Patient name missing, prompting before showing slot');
          return 'I found an available slot, but I need your name first. What is your name?';
        }

        return `I found an available slot:\n\nDoctor: ${selectedSlot.doctor}\nDate: ${selectedSlot.startTime.toLocaleDateString()}\nTime: ${selectedSlot.startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}\nDuration: ${treatmentDuration} minutes\n\nWould you like to confirm this appointment?`;
      } else {
        console.log('❌ [AVAILABILITY] No slots available, returning error message');
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
   * // Session updated: confirmationStatus="confirmed", eventId="[calendar event ID]"
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
  async confirmBooking(conversationId, session) {
    try {
      // REQUIREMENT: Patient name is mandatory - defensive check
      if (!session.patientName || session.patientName.trim().length === 0) {
        console.log('❌ [BOOKING] Patient name is mandatory but missing');
        return 'I apologize, but I need your name to confirm the appointment. What is your name?';
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
      sessionManager.updateSession(conversationId, { 
        availableSlots: currentSlots,
        availableSlotsTimestamp: Date.now()
      });
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
        sessionManager.updateSession(conversationId, { 
          selectedSlot: null,
          confirmationStatus: null 
        });
        const alternativeSlots = await this.checkAvailability(conversationId, session, 'anytime');
        return 'I apologize, but that time slot is no longer available. Let me check for other available times.\n\n' + alternativeSlots;
      }

      console.log('✅ [BOOKING] Slot validated, proceeding to create calendar event');

      const appointmentData = {
        patientName: session.patientName || 'Patient',
        doctor: session.dentistName,
        treatment: session.treatmentType,
        phone: session.phone,
        startTime: session.selectedSlot.startTime,
        endTime: session.selectedSlot.endTime,
      };

      console.log('✅ [BOOKING] Creating calendar event with data:', {
        calendarId,
        patientName: appointmentData.patientName,
        doctor: appointmentData.doctor,
        treatment: appointmentData.treatment,
        startTime: appointmentData.startTime.toISOString(),
        endTime: appointmentData.endTime.toISOString()
      });

      const result = await googleCalendarService.createAppointment(calendarId, appointmentData);

      if (result.success) {
        console.log('✅ [BOOKING] Calendar event created successfully:', {
          eventId: result.eventId
        });

        sessionManager.updateSession(conversationId, {
          confirmationStatus: 'confirmed',
          eventId: result.eventId,
        });

        console.log('✅ [BOOKING] Session updated with confirmation');

        // Log action
        await googleSheetsService.logAction({
          conversationId,
          phone: session.phone,
          patientName: session.patientName,
          intent: 'booking',
          dentist: session.dentistName,
          treatment: session.treatmentType,
          dateTime: `${session.selectedSlot.startTime.toISOString()} - ${session.selectedSlot.endTime.toISOString()}`,
          eventId: result.eventId,
          status: 'confirmed',
          action: 'booking_created',
        });

        console.log('✅ [BOOKING] Booking logged to Google Sheets');
        console.log('✅ [BOOKING] Booking complete!');

        return `✅ Appointment confirmed!\n\nDoctor: ${session.dentistName}\nTreatment: ${session.treatmentType}\nDate: ${session.selectedSlot.startTime.toLocaleDateString()}\nTime: ${session.selectedSlot.startTime.toLocaleTimeString()} - ${session.selectedSlot.endTime.toLocaleTimeString()}\n\nWe look forward to seeing you!`;
      } else {
        console.log('❌ [BOOKING] Calendar event creation failed:', result.error);
        // Log failure
        await googleSheetsService.logAction({
          conversationId,
          phone: session.phone,
          patientName: session.patientName,
          intent: 'booking',
          dentist: session.dentistName,
          treatment: session.treatmentType,
          status: 'NEEDS FOLLOW-UP***************',
          action: 'booking_failed',
        });

        return 'I apologize, there was an error creating your appointment. Our receptionist will contact you shortly. Please call us if you need immediate assistance.';
      }
    } catch (error) {
      console.error('Error confirming booking:', error);
      
      await googleSheetsService.logAction({
        conversationId,
        phone: session.phone,
        status: 'NEEDS FOLLOW-UP***************',
        action: 'booking_error',
      });

      return 'I apologize, there was an error processing your booking. Our receptionist will contact you shortly.';
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
  async handleCancellation(conversationId, session, userMessage) {
    try {
      const msg = userMessage.toLowerCase();
      
      // If booking not yet retrieved, fetch it
      if (!session.existingBooking) {
        const booking = await googleCalendarService.findBookingByPhone(session.phone);
        
        if (!booking) {
          await googleSheetsService.logAction({
            conversationId,
            phone: session.phone,
            status: 'NEEDS FOLLOW-UP***************',
            action: 'cancellation_not_found',
          });

          return 'I could not find an appointment for your phone number. Please contact our receptionist for assistance.';
        }

        // Store booking in session for confirmation
        sessionManager.updateSession(conversationId, { existingBooking: booking });
        return `I found your appointment:\n\nDoctor: ${booking.doctor}\nDate: ${booking.startTime.toLocaleDateString()}\nTime: ${booking.startTime.toLocaleTimeString()}\n\nWould you like to confirm cancellation?`;
      }

      // Check if user confirmed cancellation
      const booking = session.existingBooking;
      if (msg.includes('yes') || msg.includes('confirm') || msg.includes('ok') || msg.includes('sure')) {
        // User confirmed cancellation
        const cancelResult = await googleCalendarService.cancelAppointment(
          booking.calendarId,
          booking.calendarEventId
        );

        if (cancelResult.success) {
          await googleSheetsService.logAction({
            conversationId,
            phone: session.phone,
            patientName: booking.patientName,
            intent: 'cancel',
            dentist: booking.doctor,
            dateTime: `${booking.startTime.toISOString()} - ${booking.endTime.toISOString()}`,
            eventId: booking.calendarEventId,
            status: 'cancelled',
            action: 'appointment_cancelled',
          });

          // Clear the booking from session
          sessionManager.updateSession(conversationId, { existingBooking: null });
          
          return '✅ Your appointment has been cancelled successfully. We hope to see you again soon!';
        } else {
          await googleSheetsService.logAction({
            conversationId,
            phone: session.phone,
            status: 'NEEDS FOLLOW-UP***************',
            action: 'cancellation_failed',
          });

          return 'I apologize, there was an error cancelling your appointment. Please contact our receptionist.';
        }
      } else if (msg.includes('no') || msg.includes('cancel') || msg.includes('keep')) {
        // User declined cancellation
        sessionManager.updateSession(conversationId, { existingBooking: null });
        return 'No problem. Your appointment remains scheduled. Is there anything else I can help you with?';
      }

      // Still waiting for confirmation
      return `I found your appointment:\n\nDoctor: ${booking.doctor}\nDate: ${booking.startTime.toLocaleDateString()}\nTime: ${booking.startTime.toLocaleTimeString()}\n\nWould you like to confirm cancellation?`;
    } catch (error) {
      console.error('Error handling cancellation:', error);
      return 'I apologize, I am having trouble processing your cancellation. Please contact our receptionist.';
    }
  }
}

export const openaiHandler = new OpenAIHandler();
