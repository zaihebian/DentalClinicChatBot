/**
 * OpenAI Handler module for managing AI conversations and business logic.
 * Orchestrates AI responses, intent detection, treatment processing, and appointment management.
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
 * Handles intent detection, response generation, treatment processing, and appointment management.
 */
class OpenAIHandler {
  /**
   * Generates an AI response based on conversation context and user message.
   * Main entry point for processing user messages. Updates session, detects intent,
   * calls OpenAI API, post-processes response, and logs conversation.
   * 
   * @param {string} conversationId - Unique conversation identifier (phone number)
   * @param {string} userMessage - User's message text
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<string>} AI-generated response message
   * 
   * @example
   * // Input:
   * await generateResponse("+1234567890", "I want braces maintenance", "+1234567890")
   * 
   * // Output:
   * "Which dentist would you like? Available options: Dr. Denis, Dr. Maria Gorete"
   * 
   * @example
   * // On error:
   * "I apologize, I am experiencing technical difficulties. Please try again later or contact our receptionist."
   */
  async generateResponse(conversationId, userMessage, phoneNumber) {
    const session = sessionManager.getSession(conversationId);
    
    // Update phone if not set
    if (!session.phone) {
      sessionManager.updateSession(conversationId, { phone: phoneNumber });
    }

    // Add user message to history
    sessionManager.addMessage(conversationId, 'user', userMessage);

    // Detect intents and update session
    const detectedIntents = await this.detectIntents(userMessage, session);
    if (detectedIntents.length > 0) {
      // Merge new intents with existing ones, avoiding duplicates
      const currentIntents = session.intents || [];
      const allIntents = [...new Set([...currentIntents, ...detectedIntents])];
      if (allIntents.length !== currentIntents.length || 
          allIntents.some((intent, idx) => intent !== currentIntents[idx])) {
        sessionManager.updateSession(conversationId, { intents: allIntents });
      }
    }

    // Build system prompt with context
    const systemPrompt = this.buildSystemPrompt(session);
    
    // Build conversation history for OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...session.conversationHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
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

      // Post-process response based on intent and session state
      aiResponse = await this.postProcessResponse(conversationId, userMessage, aiResponse, session);

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
   * Can detect multiple intents in a single message (e.g., "I want to check price and book").
   * Identifies whether user wants to book, cancel, reschedule, or inquire about pricing.
   * Uses AI for accurate intent detection that handles context, negations, and variations.
   * 
   * @param {string} message - User's message text
   * @param {Object} session - Current session object
   * @param {string[]} [session.intents] - Existing intents in session
   * @returns {Promise<string[]>} Array of detected intents: 'booking', 'cancel', 'reschedule', or 'price_inquiry'
   * 
   * @example
   * // Input:
   * await detectIntents("I want to cancel my appointment", { intents: [] })
   * // Output: ["cancel"]
   * 
   * @example
   * // Input:
   * await detectIntents("How much does cleaning cost and I want to book", { intents: [] })
   * // Output: ["price_inquiry", "booking"]
   * 
   * @example
   * // Input (no new intent detected, returns empty array):
   * await detectIntents("Yes", { intents: ["booking"] })
   * // Output: []
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
      
      if (!response) {
        return this.fallbackIntentDetection(message, session);
      }

      // Parse JSON response - try to extract array from response
      let intents = [];
      try {
        // Try to find JSON array in response (handle markdown code blocks or plain JSON)
        const jsonMatch = response.match(/\[.*?\]/s);
        if (jsonMatch) {
          intents = JSON.parse(jsonMatch[0]);
        } else {
          // Try parsing entire response as JSON
          const parsed = JSON.parse(response);
          if (Array.isArray(parsed)) {
            intents = parsed;
          } else if (parsed.intents && Array.isArray(parsed.intents)) {
            intents = parsed.intents;
          } else if (parsed.intent) {
            intents = [parsed.intent];
          }
        }

        // Validate intents are valid
        const validIntents = ['booking', 'cancel', 'reschedule', 'price_inquiry'];
        const filteredIntents = intents.filter(intent => validIntents.includes(intent));
        
        // Default to booking if no intents and this seems like a new request
        if (filteredIntents.length === 0 && 
            (!session.intents || session.intents.length === 0)) {
          const isConfirmation = /^(yes|ok|okay|sure|yep|yeah|alright|confirm|confirmed|no|nope)$/i.test(message.trim());
          if (!isConfirmation && message.trim().length > 2) {
            filteredIntents.push('booking');
          }
        }

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
   * Simple pattern matching as backup.
   * 
   * @param {string} message - User's message text
   * @param {Object} session - Current session object
   * @returns {string[]} Array of detected intents
   * @private
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
   * Builds the system prompt for OpenAI API with current conversation context.
   * Includes patient information, current intent, treatment details, and business rules.
   * Provides context to the AI model for generating appropriate responses.
   * 
   * @param {Object} session - Current session object
   * @param {string} [session.patientName] - Patient's name
   * @param {string[]} [session.intents] - Current intents array
   * @param {string} [session.treatmentType] - Treatment type
   * @param {string} [session.dentistName] - Dentist name
   * @param {Object} [session.selectedSlot] - Selected appointment slot
   * @returns {string} Formatted system prompt string
   * 
   * @example
   * // Input:
   * buildSystemPrompt({
   *   patientName: "John Doe",
   *   intent: "booking",
   *   treatmentType: "Cleaning",
   *   dentistName: "Dr. Jinho"
   * })
   * 
   * // Output:
   * "You are a polite and professional AI receptionist...
   * Current conversation context:
   * - Patient name: John Doe
   * - Current intent: booking
   * - Treatment: Cleaning
   * - Dentist: Dr. Jinho
   * ..."
   */
  buildSystemPrompt(session) {
    let prompt = `You are a polite and professional AI receptionist for a dental clinic. Your role is to help patients book appointments, answer questions about treatments and pricing, and manage cancellations.

Guidelines:
- Always be polite, professional, and empathetic
- Ask clarifying questions when needed
- Confirm details before taking actions
- Keep responses concise and clear
- Use the patient's name when you know it

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
      prompt += `- Selected slot: ${session.selectedSlot.startTime.toLocaleString()}\n`;
    }

    prompt += `\nAvailable dentists for braces: Dr. Denis, Dr. Maria Gorete
Available dentists for general treatments: Dr. Jinho, Dr. Harry, Dr. Grace, Dr. Vicky

Treatment durations:
- Consultation: 15 minutes
- Cleaning: 30 minutes
- Braces Maintenance: 45 min (Dr. Maria Gorete), 15 min (Dr. Denis)
- Filling: 30 min for first tooth + 15 min per additional tooth

Always confirm appointment details before booking.`;

    return prompt;
  }

  /**
   * Post-processes AI response and handles business logic based on user message and session state.
   * Extracts information (patient name, treatment, dentist, number of teeth),
   * triggers availability checks, handles confirmations, cancellations, and price inquiries.
   * This is where the actual business logic is executed.
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {string} userMessage - User's message text
   * @param {string} aiResponse - Initial AI-generated response
   * @param {Object} session - Current session object
   * @returns {Promise<string>} Final processed response message
   * 
   * @example
   * // Treatment detection:
   * // Input: userMessage="I need a filling", session.treatmentType=null
   * // Output: aiResponse + "\n\nHow many teeth need filling?"
   * 
   * @example
   * // Availability check:
   * // Input: userMessage="Tomorrow at 10am", session.treatmentType="Cleaning", session.dentistName="Dr. Jinho"
   * // Output: "I found an available slot:\n\nDoctor: Dr. Jinho\nDate: 1/16/2024\nTime: 10:00 AM - 10:30 AM\nDuration: 30 minutes\n\nWould you like to confirm this appointment?"
   * 
   * @example
   * // Confirmation:
   * // Input: userMessage="Yes", session.selectedSlot exists, session.confirmationStatus="pending"
   * // Output: "✅ Appointment confirmed!\n\nDoctor: Dr. Jinho\nTreatment: Cleaning\n..."
   */
  async postProcessResponse(conversationId, userMessage, aiResponse, session) {
    const msg = userMessage.toLowerCase();

    // Extract patient name if mentioned
    if (!session.patientName) {
      // Simple name extraction - look for "I'm", "my name is", etc.
      const namePatterns = [
        /(?:my name is|i'm|i am|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
        /(?:name is|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      ];
      
      for (const pattern of namePatterns) {
        const match = userMessage.match(pattern);
        if (match && match[1]) {
          sessionManager.updateSession(conversationId, { patientName: match[1].trim() });
          break;
        }
      }
    }

    // Handle treatment detection
    if (!session.treatmentType && (msg.includes('treatment') || msg.includes('appointment') || msg.includes('need'))) {
      const treatmentType = detectTreatmentType(userMessage);
      if (treatmentType) {
        sessionManager.updateSession(conversationId, { treatmentType });
        
        // If filling, check for number of teeth
        if (treatmentType === 'Filling') {
          const numTeeth = extractNumberOfTeeth(userMessage);
          if (numTeeth) {
            sessionManager.updateSession(conversationId, { numberOfTeeth: numTeeth });
          } else {
            // Ask about number of teeth
            return aiResponse + '\n\nHow many teeth need filling?';
          }
        }
      }
    }

    // Handle dentist selection
    if (session.treatmentType && !session.dentistName) {
      const availableDentists = getAvailableDentists(session.treatmentType);
      const selectedDentist = availableDentists.find(d => 
        userMessage.toLowerCase().includes(d.toLowerCase())
      );
      
      if (selectedDentist) {
        sessionManager.updateSession(conversationId, { 
          dentistName: selectedDentist,
          dentistType: session.treatmentType === 'Braces Maintenance' ? 'braces' : 'general',
        });
      } else if (msg.includes('dentist') || msg.includes('doctor')) {
        // Ask which dentist
        return `Which dentist would you like? Available options: ${availableDentists.join(', ')}`;
      }
    }

    // Handle number of teeth for fillings
    if (session.treatmentType === 'Filling' && !session.numberOfTeeth && /\d+/.test(userMessage)) {
      const numTeeth = extractNumberOfTeeth(userMessage);
      if (numTeeth) {
        sessionManager.updateSession(conversationId, { numberOfTeeth: numTeeth });
      }
    }

    // Handle time/date preferences
    if (session.treatmentType && session.dentistName && !session.selectedSlot) {
      if (msg.includes('time') || msg.includes('date') || msg.includes('when') || msg.includes('tomorrow') || msg.includes('today')) {
        // Trigger availability check
        return await this.checkAvailability(conversationId, session, userMessage);
      }
    }

    // Handle confirmation
    if (session.selectedSlot && session.confirmationStatus === 'pending') {
      if (msg.includes('yes') || msg.includes('confirm') || msg.includes('ok') || msg.includes('sure')) {
        return await this.confirmBooking(conversationId, session);
      } else if (msg.includes('no') || msg.includes('cancel') || msg.includes('change')) {
        sessionManager.updateSession(conversationId, { selectedSlot: null });
        return 'No problem. Would you like to choose a different time?';
      }
    }

    // Handle cancellation (if cancel intent exists)
    if (session.intents && session.intents.includes('cancel')) {
      return await this.handleCancellation(conversationId, session, userMessage);
    }

    // Handle price inquiry (if price_inquiry intent exists)
    if (session.intents && session.intents.includes('price_inquiry')) {
      const pricing = await googleDocsService.getPricingInfo();
      return aiResponse + '\n\n' + pricing.substring(0, 1000); // Limit response length
    }

    return aiResponse;
  }

  /**
   * Checks calendar availability and suggests appointment slots to the user.
   * Fetches available slots, matches user preferences, calculates treatment duration,
   * and presents the best matching slot for confirmation.
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {Object} session - Current session object
   * @param {string} userMessage - User's message (may contain date/time preferences)
   * @returns {Promise<string>} Response message with available slot details or error message
   * 
   * @example
   * // Input:
   * await checkAvailability(
   *   "+1234567890",
   *   {
   *     treatmentType: "Cleaning",
   *     dentistName: "Dr. Jinho",
   *     numberOfTeeth: null
   *   },
   *   "Tomorrow at 10am"
   * )
   * 
   * // Output:
   * "I found an available slot:\n\nDoctor: Dr. Jinho\nDate: 1/16/2024\nTime: 10:00 AM - 10:30 AM\nDuration: 30 minutes\n\nWould you like to confirm this appointment?"
   * 
   * @example
   * // If no slots found:
   * "I apologize, but I could not find an available slot at the moment. Would you like me to check for a different time, or would you prefer to contact our receptionist directly?"
   */
  async checkAvailability(conversationId, session, userMessage) {
    try {
      const treatmentDuration = calculateTreatmentDuration(
        session.treatmentType,
        session.dentistName,
        session.numberOfTeeth
      );

      const availableDentists = getAvailableDentists(session.treatmentType);
      const slots = await googleCalendarService.getAvailableSlots(session.treatmentType, availableDentists);
      
      sessionManager.updateSession(conversationId, { availableSlots: slots });

      // Try to find slot matching user preference
      let selectedSlot = null;
      
      // Parse date/time preference from user message
      const datePreference = parseDateTimePreference(userMessage);
      
      if (datePreference.date || datePreference.time) {
        // Find slots matching preference
        const matchingSlots = slots.filter(slot => 
          matchesDateTimePreference(slot.startTime, datePreference) &&
          slot.duration >= treatmentDuration
        );
        
        if (matchingSlots.length > 0) {
          selectedSlot = matchingSlots[0]; // Take first matching slot
        }
      }

      // If no preference match, use earliest available
      if (!selectedSlot) {
        selectedSlot = googleCalendarService.findEarliestAvailableSlot(slots, treatmentDuration);
      }

      if (selectedSlot) {
        const endTime = new Date(selectedSlot.startTime);
        endTime.setMinutes(endTime.getMinutes() + treatmentDuration);

        sessionManager.updateSession(conversationId, {
          selectedSlot: {
            ...selectedSlot,
            endTime,
          },
          treatmentDuration,
        });

        return `I found an available slot:\n\nDoctor: ${selectedSlot.doctor}\nDate: ${selectedSlot.startTime.toLocaleDateString()}\nTime: ${selectedSlot.startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}\nDuration: ${treatmentDuration} minutes\n\nWould you like to confirm this appointment?`;
      } else {
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
   * @param {string} conversationId - Unique conversation identifier
   * @param {Object} session - Current session object with appointment details
   * @param {string} session.dentistName - Dentist name
   * @param {string} session.treatmentType - Treatment type
   * @param {string} session.phone - Patient phone number
   * @param {string} [session.patientName] - Patient name (defaults to "Patient" if not set)
   * @param {Object} session.selectedSlot - Selected appointment slot
   * @param {Date} session.selectedSlot.startTime - Appointment start time
   * @param {Date} session.selectedSlot.endTime - Appointment end time
   * @returns {Promise<string>} Confirmation message or error message
   * 
   * @example
   * // Input:
   * await confirmBooking("+1234567890", {
   *   dentistName: "Dr. Jinho",
   *   treatmentType: "Cleaning",
   *   phone: "+1234567890",
   *   patientName: "John Doe",
   *   selectedSlot: {
   *     startTime: Date(2024-01-16T10:00:00Z),
   *     endTime: Date(2024-01-16T10:30:00Z)
   *   }
   * })
   * 
   * // Output:
   * "✅ Appointment confirmed!\n\nDoctor: Dr. Jinho\nTreatment: Cleaning\nDate: 1/16/2024\nTime: 10:00 AM - 10:30 AM\n\nWe look forward to seeing you!"
   * 
   * @example
   * // On error:
   * "I apologize, there was an error creating your appointment. Our receptionist will contact you shortly. Please call us if you need immediate assistance."
   */
  async confirmBooking(conversationId, session) {
    try {
      const calendarId = config.calendar.dentistCalendars[session.dentistName];
      if (!calendarId) {
        throw new Error(`Calendar ID not found for ${session.dentistName}`);
      }

      const appointmentData = {
        patientName: session.patientName || 'Patient',
        doctor: session.dentistName,
        treatment: session.treatmentType,
        phone: session.phone,
        startTime: session.selectedSlot.startTime,
        endTime: session.selectedSlot.endTime,
      };

      const result = await googleCalendarService.createAppointment(calendarId, appointmentData);

      if (result.success) {
        sessionManager.updateSession(conversationId, {
          confirmationStatus: 'confirmed',
          eventId: result.eventId,
        });

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

        return `✅ Appointment confirmed!\n\nDoctor: ${session.dentistName}\nTreatment: ${session.treatmentType}\nDate: ${session.selectedSlot.startTime.toLocaleDateString()}\nTime: ${session.selectedSlot.startTime.toLocaleTimeString()} - ${session.selectedSlot.endTime.toLocaleTimeString()}\n\nWe look forward to seeing you!`;
      } else {
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
   * Searches for existing booking by phone number, asks for confirmation,
   * and cancels the calendar event if confirmed. Logs all actions.
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {Object} session - Current session object
   * @param {string} session.phone - Patient phone number
   * @param {Object} [session.existingBooking] - Existing booking object (if already retrieved)
   * @param {string} userMessage - User's message (may contain confirmation)
   * @returns {Promise<string>} Response message with booking details, confirmation request, or cancellation result
   * 
   * @example
   * // First call - booking found:
   * await handleCancellation("+1234567890", { phone: "+1234567890", existingBooking: null }, "I want to cancel")
   * 
   * // Output:
   * "I found your appointment:\n\nDoctor: Dr. Jinho\nDate: 1/16/2024\nTime: 10:00 AM\n\nWould you like to confirm cancellation?"
   * 
   * @example
   * // Second call - user confirms:
   * await handleCancellation("+1234567890", { phone: "+1234567890", existingBooking: {...} }, "Yes")
   * 
   * // Output:
   * "✅ Your appointment has been cancelled successfully. We hope to see you again soon!"
   * 
   * @example
   * // If booking not found:
   * "I could not find an appointment for your phone number. Please contact our receptionist for assistance."
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

