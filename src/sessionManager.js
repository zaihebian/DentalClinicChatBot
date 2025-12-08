/**
 * Session Management module for maintaining conversation state.
 * Manages in-memory sessions for each conversation, tracks conversation history,
 * and automatically cleans up expired sessions.
 * 
 * @module sessionManager
 */

import { config } from './config.js';

/**
 * SessionManager class handles all session-related operations.
 * Maintains conversation state per phone number (conversation ID).
 * Sessions automatically expire after a configured timeout period.
 */
class SessionManager {
  /**
   * Initializes the SessionManager.
   * Sets up the sessions Map and starts the cleanup interval timer.
   */
  constructor() {
    this.sessions = new Map();
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60000); // Check every minute
  }

  /**
   * Gets an existing session or creates a new one for the given conversation ID.
   * If session exists but is expired, it creates a new session.
   * Updates lastActivity timestamp for existing valid sessions.
   * 
   * @param {string} conversationId - Unique identifier for the conversation (typically phone number)
   * @returns {Object} Session object containing conversation state
   * 
   * @example
   * // First call - creates new session:
   * const session = sessionManager.getSession("+1234567890");
   * // Returns: { conversationId: "+1234567890", phone: null, patientName: null, ... }
   * 
   * // Subsequent calls - returns existing session:
   * const sameSession = sessionManager.getSession("+1234567890");
   * // Returns: same session object with updated lastActivity timestamp
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
   * Initializes all session properties to null or empty arrays.
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @returns {Object} New session object with initialized properties
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
   *   intents: [],
   *   dentistType: null,
   *   dentistName: null,
   *   treatmentType: null,
   *   treatmentDuration: null,
   *   numberOfTeeth: null,
   *   selectedSlot: null,
   *   confirmationStatus: 'pending',
   *   availableSlots: [],
   *   existingBookings: [],
   *   conversationHistory: [],
   *   createdAt: 1234567890000,
   *   lastActivity: 1234567890000
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
      availableSlots: [], // Array of available slots for 1 month
      existingBookings: [], // Array of existing bookings for 2 months
      conversationHistory: [], // Array of { role: 'user'|'assistant', content: string, timestamp: Date }
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
  }

  /**
   * Updates session properties with new values.
   * Merges the updates object into the existing session and updates lastActivity timestamp.
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @param {Object} updates - Object containing properties to update
   * @returns {Object} Updated session object
   * 
   * @example
   * // Input:
   * updateSession("+1234567890", { patientName: "John Doe", treatmentType: "Cleaning" })
   * 
   * // Output: Session object with updated properties
   * {
   *   conversationId: "+1234567890",
   *   patientName: "John Doe",  // Updated
   *   treatmentType: "Cleaning", // Updated
   *   lastActivity: 1234567890123 // Updated timestamp
   *   // ... other properties
   * }
   */
  updateSession(conversationId, updates) {
    const session = this.getSession(conversationId);
    Object.assign(session, updates);
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Adds a message to the conversation history.
   * Appends a new message entry to the session's conversationHistory array.
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @param {string} role - Message role: 'user' or 'assistant'
   * @param {string} content - Message content/text
   * 
   * @example
   * // Input:
   * addMessage("+1234567890", "user", "I want braces maintenance")
   * 
   * // Session conversationHistory now contains:
   * [
   *   {
   *     role: "user",
   *     content: "I want braces maintenance",
   *     timestamp: 2024-01-15T10:30:00.000Z
   *   }
   * ]
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
   * Compares lastActivity timestamp with current time against configured timeout.
   * 
   * @param {Object} session - Session object to check
   * @returns {boolean} True if session is expired, false otherwise
   * 
   * @example
   * // Session with lastActivity 5 minutes ago (timeout is 10 minutes):
   * isExpired(session) // Returns: false
   * 
   * // Session with lastActivity 15 minutes ago (timeout is 10 minutes):
   * isExpired(session) // Returns: true
   */
  isExpired(session) {
    const timeoutMs = config.session.timeoutMinutes * 60 * 1000;
    return Date.now() - session.lastActivity > timeoutMs;
  }

  /**
   * Removes all expired sessions from memory.
   * Called automatically every minute by the cleanup interval timer.
   * Checks all sessions and deletes those that exceed the timeout period.
   * 
   * @example
   * // If sessions exist:
   * // Session 1: lastActivity 5 minutes ago → Kept
   * // Session 2: lastActivity 15 minutes ago → Deleted
   * cleanupExpiredSessions()
   * // Console output: "Cleaning up expired session: +1234567890"
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
   * Used when explicitly terminating a conversation.
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @returns {Object|null} The ended session object, or null if not found
   * 
   * @example
   * // Input:
   * endSession("+1234567890")
   * 
   * // Output: Session object that was removed
   * // Session is no longer in memory
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
   * Useful for read-only access to session information.
   * 
   * @param {string} conversationId - Unique identifier for the conversation
   * @returns {Object|undefined} Session object if found, undefined otherwise
   * 
   * @example
   * // Input:
   * getSessionData("+1234567890")
   * 
   * // Output: Session object (if exists)
   * // Note: lastActivity is NOT updated
   */
  getSessionData(conversationId) {
    return this.sessions.get(conversationId);
  }

  /**
   * Destroys the SessionManager instance.
   * Clears the cleanup interval and removes all sessions from memory.
   * Should be called during application shutdown.
   * 
   * @example
   * destroy()
   * // All sessions cleared, cleanup interval stopped
   */
  destroy() {
    clearInterval(this.cleanupInterval);
    this.sessions.clear();
  }
}

export const sessionManager = new SessionManager();

