/**
 * Session Management module for maintaining conversation state.
 * 
 * Manages in-memory sessions for each conversation, tracks conversation history,
 * and automatically cleans up expired sessions. Sessions are keyed by phone number
 * (conversation ID) and store all conversation context including patient info,
 * intents, treatment details, selected slots, and conversation history.
 * 
 * Key features:
 * - Automatic session expiration (configurable timeout, default 10 minutes)
 * - Automatic cleanup of expired sessions (runs every minute)
 * - Session data includes conversation history for AI context
 * - Thread-safe operations (single instance, singleton pattern)
 * 
 * @module sessionManager
 */

import { config } from './config.js';

/**
 * SessionManager class handles all session-related operations.
 * 
 * This is a singleton class that maintains conversation state per phone number.
 * Sessions automatically expire after a configured timeout period of inactivity.
 * Provides methods for creating, updating, retrieving, and managing sessions.
 * 
 * Session lifecycle:
 * 1. Created on first message from a phone number
 * 2. Updated with each interaction (lastActivity timestamp refreshed)
 * 3. Expires after timeout period of inactivity
 * 4. Automatically cleaned up by background interval
 * 
 * @class SessionManager
 */
class SessionManager {
  /**
   * Initializes the SessionManager.
   * Sets up the sessions Map and starts the cleanup interval timer.
   * 
   * The cleanup interval runs every 60 seconds to remove expired sessions,
   * preventing memory leaks from abandoned conversations.
   * 
   * @example
   * // Automatically called when module is imported
   * // Creates new Map() and starts cleanup interval
   */
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60000); // Check every minute
  }

  /**
   * Gets an existing session or creates a new one for the given conversation ID.
   * 
   * This is the primary method for accessing session data. It handles:
   * - Retrieving existing valid sessions (updates lastActivity)
   * - Detecting and removing expired sessions
   * - Creating new sessions if none exists or if expired
   * 
   * Edge cases:
   * - If session exists but is expired, it's deleted and a new one is created
   * - If session exists and is valid, lastActivity is updated to current time
   * - Always returns a valid session object (never null/undefined)
   * 
   * @param {string} conversationId - Unique identifier for the conversation (typically phone number)
   * @returns {Object} Session object containing conversation state (always valid, never null)
   * 
   * @example
   * // First call - creates new session:
   * const session = sessionManager.getSession("+1234567890");
   * // Returns: { conversationId: "+1234567890", phone: null, patientName: null, intents: [], ... }
   * // Session created with current timestamp
   * 
   * @example
   * // Subsequent calls - returns existing session:
   * const sameSession = sessionManager.getSession("+1234567890");
   * // Returns: same session object with updated lastActivity timestamp
   * // Note: lastActivity is automatically updated to current time
   * 
   * @example
   * // Expired session - creates new one:
   * // If session.lastActivity is 15 minutes ago (timeout is 10 minutes):
   * const newSession = sessionManager.getSession("+1234567890");
   * // Old session deleted, new session created
   * // Returns: Fresh session object with all fields reset to defaults
   */
  getSession(conversationId) {
    const session = this.sessions.get(conversationId);
    
    if (session && !this.isExpired(session)) {
      session.lastActivity = Date.now();
      return session;
    }
    
    if (session && this.isExpired(session)) {
      this.sessions.delete(conversationId);
    }
    
    // Create new session
    const newSession = this.createNewSession(conversationId);
    this.sessions.set(conversationId, newSession);
    return newSession;
  }

  /**
   * Creates a new session object with default values.
   * 
   * Initializes all session properties to null or empty arrays. This is the
   * template for a fresh conversation session. All fields start empty and are
   * populated as the conversation progresses.
   * 
   * Session structure:
   * - Identity: conversationId, phone
   * - Patient info: patientName
   * - Intent tracking: intents (array of latest intents)
   * - Treatment details: treatmentType, dentistName, dentistType, numberOfTeeth
   * - Appointment: selectedSlot, confirmationStatus, availableSlots
   * - History: conversationHistory (array of message objects)
   * - Metadata: createdAt, lastActivity (timestamps)
   * 
   * @param {string} conversationId - Unique identifier for the conversation (typically phone number)
   * @returns {Object} New session object with all properties initialized to defaults
   * 
   * @example
   * // Input:
   * createNewSession("+1234567890")
   * 
   * // Output:
   * {
   *   conversationId: "+1234567890",
   *   phone: null,
   *   patientName: null,
   *   intent: null,  // Legacy field (use intents array instead)
   *   intents: [],   // Array of latest intents: ['booking', 'cancel', etc.]
   *   dentistType: null,  // 'braces' or 'general'
   *   dentistName: null,
   *   treatmentType: null,
   *   treatmentDuration: null,
   *   numberOfTeeth: null,  // For fillings only
   *   selectedSlot: null,  // { startTime, endTime, doctor, weekday, duration }
   *   confirmationStatus: 'pending',  // 'pending' or 'confirmed'
   *   availableSlots: [],  // Array of available appointment slots (cached)
   *   availableSlotsTimestamp: null,  // Timestamp when slots were fetched (for cache freshness)
   *   existingBookings: [],  // Array of existing bookings
   *   existingBooking: null,  // Single booking object (for cancellation flow)
   *   conversationHistory: [],  // Array of { role, content, timestamp }
   *   createdAt: 1234567890000,  // Timestamp when session was created
   *   lastActivity: 1234567890000,  // Timestamp of last interaction
   *   eventId: null  // Google Calendar event ID after booking
   * }
   */
  createNewSession(conversationId) {
    return {
      conversationId,
      phone: null,
      patientName: null,
      intent: null, // 'booking', 'cancel', 'reschedule', 'price_inquiry'
      dentistType: null, // 'braces' or 'general'
      dentistName: null,
      treatmentType: null,
      treatmentDuration: null,
      numberOfTeeth: null, // For fillings
      selectedSlot: null, // { start, end, doctor, weekday }
      confirmationStatus: 'pending', // 'pending' or 'confirmed'
      availableSlots: [], // Array of available slots for 1 month (cached)
      availableSlotsTimestamp: null, // Timestamp when slots were fetched (for cache freshness)
      existingBookings: [], // Array of existing bookings for 2 months
      conversationHistory: [], // Array of { role: 'user'|'assistant', content: string, timestamp: Date }
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
  }

  /**
   * Updates session properties with new values.
   * 
   * Merges the updates object into the existing session using Object.assign(),
   * which allows partial updates (only specified fields are changed). Automatically
   * updates lastActivity timestamp to current time to prevent expiration.
   * 
   * Edge cases:
   * - If session doesn't exist, creates a new one first
   * - Partial updates are supported (only update specified fields)
   * - lastActivity is always updated (even if not in updates object)
   * - Can update nested objects (e.g., selectedSlot)
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @param {Object} updates - Object containing properties to update (partial updates supported)
   * @param {string} [updates.patientName] - Patient name to set
   * @param {string[]} [updates.intents] - Array of latest intents to set
   * @param {string} [updates.treatmentType] - Treatment type to set
   * @param {string} [updates.dentistName] - Dentist name to set
   * @param {Object} [updates.selectedSlot] - Selected appointment slot object
   * @param {string} [updates.confirmationStatus] - Confirmation status ('pending' or 'confirmed')
   * @param {string} [updates.eventId] - Google Calendar event ID
   * @returns {Object} Updated session object (same reference, modified in place)
   * 
   * @example
   * // Partial update - only patient name:
   * updateSession("+1234567890", { patientName: "John Doe" })
   * // Only patientName and lastActivity are updated, other fields unchanged
   * 
   * @example
   * // Multiple fields update:
   * updateSession("+1234567890", { 
   *   patientName: "John Doe", 
   *   treatmentType: "Cleaning",
   *   intents: ["booking"]
   * })
   * // All specified fields updated, lastActivity refreshed
   * 
   * @example
   * // Nested object update:
   * updateSession("+1234567890", {
   *   selectedSlot: {
   *     startTime: new Date("2024-01-16T10:00:00Z"),
   *     endTime: new Date("2024-01-16T10:30:00Z"),
   *     doctor: "Dr GeneralA"
   *   }
   * })
   * // selectedSlot object replaced entirely (not merged)
   * 
   * @example
   * // Session doesn't exist - creates new one first:
   * updateSession("+9999999999", { patientName: "New User" })
   * // New session created, then updated with patientName
   */
  updateSession(conversationId, updates) {
    const session = this.getSession(conversationId);
    Object.assign(session, updates);
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Adds a message to the conversation history.
   * 
   * Appends a new message entry to the session's conversationHistory array.
   * This history is used by the AI to maintain conversation context. Each
   * message includes role, content, and timestamp. Automatically updates
   * lastActivity timestamp.
   * 
   * Message format:
   * - role: 'user' (from patient) or 'assistant' (from AI)
   * - content: Full message text
   * - timestamp: Date object of when message was added
   * 
   * Edge cases:
   * - If session doesn't exist, creates a new one first
   * - Messages are appended in chronological order
   * - History grows unbounded (consider limiting in future)
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @param {string} role - Message role: 'user' or 'assistant'
   * @param {string} content - Message content/text
   * @returns {void} Modifies session in place, no return value
   * 
   * @example
   * // Add user message:
   * addMessage("+1234567890", "user", "I want braces maintenance")
   * // Session conversationHistory now contains:
   * // [
   * //   {
   * //     role: "user",
   * //     content: "I want braces maintenance",
   * //     timestamp: Date(2024-01-15T10:30:00.000Z)
   * //   }
   * // ]
   * 
   * @example
   * // Add assistant response:
   * addMessage("+1234567890", "assistant", "Which dentist would you like?")
   * // conversationHistory now has 2 messages (user + assistant)
   * 
   * @example
   * // Conversation flow:
   * addMessage("+1234567890", "user", "Hello")
   * addMessage("+1234567890", "assistant", "Hi! How can I help?")
   * addMessage("+1234567890", "user", "I need cleaning")
   * // History contains 3 messages in chronological order
   */
  addMessage(conversationId, role, content) {
    const session = this.getSession(conversationId);
    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });
    session.lastActivity = Date.now();
  }

  /**
   * Checks if a session has expired based on inactivity timeout.
   * 
   * Compares lastActivity timestamp with current time against configured timeout
   * period. A session expires if no activity has occurred for longer than the
   * timeout duration (default 10 minutes, configurable via SESSION_TIMEOUT_MINUTES).
   * 
   * Expiration logic:
   * - Calculates time difference: currentTime - lastActivity
   * - Compares against timeout: timeoutMs = timeoutMinutes * 60 * 1000
   * - Returns true if difference > timeoutMs
   * 
   * @param {Object} session - Session object to check
   * @param {number} session.lastActivity - Timestamp of last activity (milliseconds since epoch)
   * @returns {boolean} True if session is expired (inactive longer than timeout), false otherwise
   * 
   * @example
   * // Active session (5 minutes ago, timeout is 10 minutes):
   * isExpired({ lastActivity: Date.now() - 5 * 60 * 1000 })
   * // Returns: false (still within timeout period)
   * 
   * @example
   * // Expired session (15 minutes ago, timeout is 10 minutes):
   * isExpired({ lastActivity: Date.now() - 15 * 60 * 1000 })
   * // Returns: true (exceeded timeout period)
   * 
   * @example
   * // Just expired (exactly 10 minutes ago, timeout is 10 minutes):
   * isExpired({ lastActivity: Date.now() - 10 * 60 * 1000 })
   * // Returns: true (>= timeout, considered expired)
   */
  isExpired(session) {
    const timeoutMs = config.session.timeoutMinutes * 60 * 1000;
    return Date.now() - session.lastActivity > timeoutMs;
  }

  /**
   * Removes all expired sessions from memory.
   * 
   * Called automatically every minute by the cleanup interval timer. Iterates
   * through all sessions and deletes those that have exceeded the timeout period.
   * This prevents memory leaks from abandoned conversations.
   * 
   * Cleanup process:
   * 1. Iterates through all sessions in the Map
   * 2. Checks each session using isExpired()
   * 3. Deletes expired sessions from the Map
   * 4. Logs cleanup actions to console
   * 
   * Performance:
   * - Runs every 60 seconds (non-blocking)
   * - O(n) complexity where n = number of sessions
   * - Typically very fast (sessions are in-memory Map)
   * 
   * @returns {void} Modifies sessions Map in place, no return value
   * 
   * @example
   * // Before cleanup:
   * // Session 1: lastActivity 5 minutes ago → Valid (kept)
   * // Session 2: lastActivity 15 minutes ago → Expired (will be deleted)
   * // Session 3: lastActivity 2 minutes ago → Valid (kept)
   * 
   * cleanupExpiredSessions()
   * // Console output: "Cleaning up expired session: +1234567890"
   * // Session 2 deleted, Sessions 1 and 3 remain
   * 
   * @example
   * // All sessions active:
   * cleanupExpiredSessions()
   * // No console output, no sessions deleted
   * 
   * @example
   * // All sessions expired:
   * cleanupExpiredSessions()
   * // Console output for each expired session
   * // All sessions deleted, Map is empty
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const timeoutMs = config.session.timeoutMinutes * 60 * 1000;
    
    for (const [conversationId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > timeoutMs) {
        console.log(`Cleaning up expired session: ${conversationId}`);
        this.sessions.delete(conversationId);
      }
    }
  }

  /**
   * Manually ends a session by removing it from memory.
   * 
   * Used when explicitly terminating a conversation (e.g., after booking completion,
   * cancellation, or user request). Immediately removes the session from the Map,
   * regardless of expiration status. Useful for cleanup after conversation completion.
   * 
   * Edge cases:
   * - If session doesn't exist, returns null (no error thrown)
   * - Session is permanently deleted (cannot be recovered)
   * - Does not affect cleanup interval (it will skip this session)
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @returns {Object|null} The ended session object if found, null if session doesn't exist
   * 
   * @example
   * // End existing session:
   * const endedSession = endSession("+1234567890")
   * // Returns: Session object that was removed
   * // Session is no longer accessible via getSession()
   * 
   * @example
   * // End non-existent session:
   * const result = endSession("+9999999999")
   * // Returns: null (session didn't exist)
   * 
   * @example
   * // Use case - after booking completion:
   * // After successful booking, end session to force fresh start next time
   * endSession(conversationId)
   * // Next message from this user will create a new session
   */
  endSession(conversationId) {
    const session = this.sessions.get(conversationId);
    if (session) {
      this.sessions.delete(conversationId);
      return session;
    }
    return null;
  }

  /**
   * Retrieves session data without updating lastActivity timestamp.
   * 
   * Useful for read-only access to session information when you don't want to
   * reset the expiration timer. Unlike getSession(), this method does NOT:
   * - Update lastActivity timestamp
   * - Create a new session if it doesn't exist
   * - Remove expired sessions
   * 
   * Use cases:
   * - Reading session data for logging/reporting
   * - Checking session state without affecting expiration
   * - Debugging session contents
   * 
   * Edge cases:
   * - Returns undefined if session doesn't exist (not null)
   * - Returns expired sessions (doesn't check expiration)
   * - Direct access to Map (no validation)
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @returns {Object|undefined} Session object if found, undefined if not found
   * 
   * @example
   * // Read session without updating activity:
   * const session = getSessionData("+1234567890")
   * // Returns: Session object (if exists)
   * // Note: lastActivity is NOT updated, session may expire sooner
   * 
   * @example
   * // Check if session exists:
   * const session = getSessionData("+1234567890")
   * if (session) {
   *   console.log("Session exists:", session.patientName)
   * } else {
   *   console.log("No session found")
   * }
   * 
   * @example
   * // Read-only access for logging:
   * const session = getSessionData(conversationId)
   * logSessionState(session)  // Read session without affecting expiration
   */
  getSessionData(conversationId) {
    return this.sessions.get(conversationId);
  }

  /**
   * Destroys the SessionManager instance.
   * 
   * Clears the cleanup interval timer and removes all sessions from memory.
   * Should be called during application shutdown to ensure clean teardown.
   * Prevents memory leaks and ensures background timers are stopped.
   * 
   * Cleanup actions:
   * 1. Stops the cleanup interval timer (prevents further cleanup runs)
   * 2. Clears all sessions from the Map (frees memory)
   * 
   * This is typically called by:
   * - Graceful shutdown handlers (SIGTERM, SIGINT)
   * - Application exit handlers
   * - Testing cleanup
   * 
   * @returns {void} No return value
   * 
   * @example
   * // During graceful shutdown:
   * process.on('SIGTERM', () => {
   *   sessionManager.destroy()
   *   process.exit(0)
   * })
   * // All sessions cleared, cleanup interval stopped, ready for exit
   * 
   * @example
   * // Manual cleanup (testing):
   * sessionManager.destroy()
   * // All sessions cleared, cleanup interval stopped
   * // getSession() will create new sessions after this
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}

export const sessionManager = new SessionManager();

