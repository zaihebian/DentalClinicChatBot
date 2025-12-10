/**
 * Google Sheets Service module for logging conversations and actions.
 * 
 * Handles all logging operations to Google Sheets for audit and tracking purposes.
 * Logs every conversation message, system action (booking, cancellation, etc.),
 * and tracks status changes. Provides comprehensive audit trail for all interactions.
 * 
 * Key features:
 * - Logs all user and assistant messages
 * - Logs system actions (booking created, cancelled, etc.)
 * - Tracks status (active, confirmed, NEEDS FOLLOW-UP, etc.)
 * - Stores event IDs for calendar integration
 * - Auto-initializes sheet with headers on first run
 * 
 * Sheet columns:
 * Timestamp, Conversation ID, Phone, Patient Name, Role, Message, Intent,
 * Dentist, Treatment, Date/Time, Event ID, Status, Action
 * 
 * @module googleSheets
 */

import { google } from 'googleapis';
import { config } from './config.js';

/**
 * GoogleSheetsService class handles all Google Sheets API operations.
 * 
 * This is a singleton class that manages authentication and provides methods
 * for logging conversations and actions to Google Sheets. Uses service account
 * authentication with spreadsheet read/write permissions.
 * 
 * Authentication:
 * - Uses JWT (JSON Web Token) with service account credentials
 * - Requires GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY
 * - Scopes: https://www.googleapis.com/auth/spreadsheets
 * 
 * @class GoogleSheetsService
 */
class GoogleSheetsService {
  /**
   * Initializes the GoogleSheetsService.
   * Sets up authentication and Sheets API client.
   * 
   * Automatically calls initializeAuth() to set up JWT authentication.
   * If authentication fails, an error is thrown and logged.
   * 
   * @throws {Error} If authentication initialization fails
   * 
   * @example
   * // Called automatically when module is imported
   * // Creates new instance, sets up auth, ready for logging
   */
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initializeAuth();
  }

  /**
   * Initializes Google Sheets API authentication using JWT (JSON Web Token).
   * 
   * Sets up service account authentication with spreadsheet read/write permissions.
   * Creates a JWT auth client using service account email and private key from config.
   * Initializes the Google Sheets API client (v4) with the authenticated client.
   * 
   * Authentication requirements:
   * - GOOGLE_SERVICE_ACCOUNT_EMAIL: Service account email
   * - GOOGLE_PRIVATE_KEY: Private key (with \n characters preserved)
   * - Sheets API must be enabled in Google Cloud Console
   * - Service account must have Editor permission on the sheet
   * 
   * @throws {Error} If authentication initialization fails (logged to console)
   * 
   * @example
   * // Called automatically during construction
   * // Sets up this.auth (JWT client) and this.sheets (API client)
   * // Ready for API calls after this
   */
  initializeAuth() {
    try {
      this.auth = new google.auth.JWT(
        config.google.serviceAccountEmail,
        null,
        config.google.privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    } catch (error) {
      console.error('Error initializing Google Sheets auth:', error);
      throw error;
    }
  }

  /**
   * Initializes the Google Sheet with column headers if the sheet is empty.
   * Checks if headers exist, and if not, creates them with standard column names.
   * Should be called once during application startup.
   * 
   * @returns {Promise<void>}
   * 
   * @example
   * // First run - creates headers:
   * await initializeSheet()
   * // Sheet now has headers: Timestamp, Conversation ID, Phone, Patient Name, etc.
   * 
   * // Subsequent runs - headers already exist, no action taken
   */
  async initializeSheet() {
    try {
      // Check if headers exist
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: config.sheets.sheetId,
        range: `${config.sheets.sheetName}!A1:Z1`,
      });

      if (!response.data.values || response.data.values.length === 0) {
        // Add headers
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: config.sheets.sheetId,
          range: `${config.sheets.sheetName}!A1`,
          valueInputOption: 'RAW',
          resource: {
            values: [[
              'Timestamp',
              'Conversation ID',
              'Phone',
              'Patient Name',
              'Role',
              'Message',
              'Intent',
              'Dentist',
              'Treatment',
              'Date/Time',
              'Event ID',
              'Status',
              'Action',
            ]],
          },
        });
      }
    } catch (error) {
      console.error('Error initializing sheet:', error);
    }
  }

  /**
   * Logs a conversation message or action to Google Sheets.
   * 
   * Appends a new row to the configured Google Sheet with all conversation/action
   * details. This is the core logging method used by all other logging functions.
   * Handles errors gracefully (logs to console but doesn't throw).
   * 
   * Row format:
   * [Timestamp, Conversation ID, Phone, Patient Name, Role, Message, Intent,
   *  Dentist, Treatment, Date/Time, Event ID, Status, Action]
   * 
   * Edge cases:
   * - Empty/null values are converted to empty strings
   * - Timestamp is automatically set to current ISO time
   * - Errors are logged but don't stop execution (graceful failure)
   * - If sheet doesn't exist or permission denied, error is logged
   * 
   * @param {Object} conversationData - Data object containing conversation/action details
   * @param {string} [conversationData.conversationId] - Conversation ID (phone number)
   * @param {string} [conversationData.phone] - Patient phone number
   * @param {string} [conversationData.patientName] - Patient name
   * @param {string} [conversationData.role] - Message role: 'user', 'assistant', or 'system'
   * @param {string} [conversationData.message] - Message content
   * @param {string} [conversationData.intent] - User intent: 'booking', 'cancel', etc. (can be comma-separated)
   * @param {string} [conversationData.dentist] - Dentist name
   * @param {string} [conversationData.treatment] - Treatment type
   * @param {string} [conversationData.dateTime] - Appointment date/time (ISO format or range)
   * @param {string} [conversationData.eventId] - Calendar event ID
   * @param {string} [conversationData.status] - Status: 'active', 'confirmed', 'cancelled', 'NEEDS FOLLOW-UP***************'
   * @param {string} [conversationData.action] - Action type: 'conversation', 'booking_created', 'appointment_cancelled', etc.
   * @returns {Promise<void>} No return value (errors are logged, not thrown)
   * 
   * @example
   * // Log user message:
   * await logMessage({
   *   conversationId: "+1234567890",
   *   phone: "+1234567890",
   *   patientName: "John Doe",
   *   role: "user",
   *   message: "I want braces maintenance",
   *   intent: "booking",
   *   status: "active",
   *   action: "conversation"
   * })
   * // Adds row: [2024-01-15T10:30:00Z, +1234567890, +1234567890, John Doe, user, I want braces maintenance, booking, , , , , active, conversation]
   * 
   * @example
   * // Log system action (booking created):
   * await logMessage({
   *   conversationId: "+1234567890",
   *   phone: "+1234567890",
   *   patientName: "John Doe",
   *   role: "system",
   *   intent: "booking",
   *   dentist: "Dr. [General Dentist 1]",
   *   treatment: "Cleaning",
   *   dateTime: "2024-01-16T10:00:00Z - 2024-01-16T10:30:00Z",
   *   eventId: "event123",
   *   status: "confirmed",
   *   action: "booking_created"
   * })
   * // Adds row with booking details
   * 
   * @example
   * // Log error/follow-up needed:
   * await logMessage({
   *   conversationId: "+1234567890",
   *   phone: "+1234567890",
   *   status: "NEEDS FOLLOW-UP***************",
   *   action: "booking_failed"
   * })
   * // Marks row for manual follow-up
   */
  async logMessage(conversationData) {
    const {
      conversationId,
      phone,
      patientName,
      role,
      message,
      intent,
      dentist,
      treatment,
      dateTime,
      eventId,
      status,
      action,
    } = conversationData;

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: config.sheets.sheetId,
        range: `${config.sheets.sheetName}!A:Z`,
        valueInputOption: 'RAW',
        resource: {
          values: [[
            new Date().toISOString(),
            conversationId || '',
            phone || '',
            patientName || '',
            role || '',
            message || '',
            intent || '',
            dentist || '',
            treatment || '',
            dateTime || '',
            eventId || '',
            status || '',
            action || '',
          ]],
        },
      });
    } catch (error) {
      console.error('Error logging to Google Sheets:', error);
    }
  }

  /**
   * Logs a system action (booking, cancellation, etc.) to Google Sheets.
   * 
   * Wrapper around logMessage that sets role to 'system' automatically.
   * Used for logging non-conversation events like booking creation, cancellations,
   * errors, and status changes. All system actions are marked with role='system'.
   * 
   * Common action types:
   * - 'booking_created': Appointment successfully booked
   * - 'appointment_cancelled': Appointment cancelled
   * - 'booking_failed': Booking attempt failed
   * - 'cancellation_not_found': Cancellation requested but booking not found
   * - 'cancellation_failed': Cancellation attempt failed
   * - 'booking_error': Error during booking process
   * 
   * @param {Object} actionData - Action data object (same structure as conversationData)
   * @param {string} [actionData.conversationId] - Conversation ID
   * @param {string} [actionData.phone] - Patient phone number
   * @param {string} [actionData.patientName] - Patient name
   * @param {string} [actionData.intent] - Intent: 'booking', 'cancel', etc.
   * @param {string} [actionData.dentist] - Dentist name
   * @param {string} [actionData.treatment] - Treatment type
   * @param {string} [actionData.dateTime] - Appointment date/time
   * @param {string} [actionData.eventId] - Calendar event ID
   * @param {string} [actionData.status] - Status: 'confirmed', 'cancelled', 'NEEDS FOLLOW-UP***************'
   * @param {string} [actionData.action='action'] - Action type (defaults to 'action' if not provided)
   * @returns {Promise<void>} No return value (errors are logged, not thrown)
   * 
   * @example
   * // Log successful booking:
   * await logAction({
   *   conversationId: "+1234567890",
   *   phone: "+1234567890",
   *   patientName: "John Doe",
   *   intent: "booking",
   *   dentist: "Dr. [General Dentist 1]",
   *   treatment: "Cleaning",
   *   eventId: "event123",
   *   status: "confirmed",
   *   action: "booking_created"
   * })
   * // Logs with role='system' automatically
   * 
   * @example
   * // Log cancellation:
   * await logAction({
   *   conversationId: "+1234567890",
   *   phone: "+1234567890",
   *   patientName: "John Doe",
   *   intent: "cancel",
   *   dentist: "Dr. [General Dentist 1]",
   *   dateTime: "2024-01-16T10:00:00Z - 2024-01-16T10:30:00Z",
   *   eventId: "event123",
   *   status: "cancelled",
   *   action: "appointment_cancelled"
   * })
   * 
   * @example
   * // Log error (follow-up needed):
   * await logAction({
   *   conversationId: "+1234567890",
   *   phone: "+1234567890",
   *   status: "NEEDS FOLLOW-UP***************",
   *   action: "booking_failed"
   * })
   * // Marks for manual review
   */
  async logAction(actionData) {
    await this.logMessage({
      ...actionData,
      role: 'system',
      action: actionData.action || 'action',
    });
  }

  /**
   * Logs a conversation turn (user or assistant message) to Google Sheets.
   * 
   * Extracts relevant information from session data and formats it for logging.
   * This is a convenience wrapper that formats session data (intents array, selectedSlot,
   * etc.) into the format expected by logMessage(). Used for logging individual
   * conversation messages with full context.
   * 
   * Data extraction:
   * - intents: Converts array to comma-separated string (e.g., ["booking", "price_inquiry"] → "booking, price_inquiry")
   * - selectedSlot: Formats date/time range from startTime and endTime
   * - Other fields: Passed through directly from sessionData
   * 
   * Edge cases:
   * - Empty intents array → empty string
   * - No selectedSlot → empty dateTime field
   * - Missing sessionData fields → empty strings (graceful handling)
   * 
   * @param {string} conversationId - Conversation ID (phone number)
   * @param {string} phone - Patient phone number
   * @param {string} role - Message role: 'user' or 'assistant'
   * @param {string} message - Message content/text
   * @param {Object} [sessionData={}] - Session data object containing additional context
   * @param {string} [sessionData.patientName] - Patient name from session
   * @param {string[]} [sessionData.intents] - Array of latest intents from session
   * @param {string} [sessionData.dentistName] - Dentist name from session
   * @param {string} [sessionData.treatmentType] - Treatment type from session
   * @param {Object} [sessionData.selectedSlot] - Selected appointment slot object
   * @param {Date} [sessionData.selectedSlot.startTime] - Slot start time
   * @param {Date} [sessionData.selectedSlot.endTime] - Slot end time
   * @param {string} [sessionData.eventId] - Calendar event ID
   * @param {string} [sessionData.status] - Session status: 'active', 'confirmed', etc.
   * @returns {Promise<void>} No return value (errors are logged, not thrown)
   * 
   * @example
   * // Log assistant response with full context:
   * await logConversationTurn(
   *   "+1234567890",
   *   "+1234567890",
   *   "assistant",
   *   "I found an available slot...",
   *   {
   *     patientName: "John Doe",
   *     intents: ["booking"],
   *     dentistName: "Dr. [General Dentist 1]",
   *     treatmentType: "Cleaning",
   *     selectedSlot: {
   *       startTime: new Date("2024-01-15T10:00:00Z"),
   *       endTime: new Date("2024-01-15T10:30:00Z")
   *     }
   *   }
   * )
   * // Logs: role=assistant, intent="booking", dateTime="2024-01-15T10:00:00Z - 2024-01-15T10:30:00Z"
   * 
   * @example
   * // Log user message (minimal session data):
   * await logConversationTurn(
   *   "+1234567890",
   *   "+1234567890",
   *   "user",
   *   "I want braces maintenance",
   *   { intents: ["booking"] }
   * )
   * // Logs: role=user, intent="booking", other fields empty
   * 
   * @example
   * // Multiple intents:
   * await logConversationTurn(
   *   "+1234567890",
   *   "+1234567890",
   *   "user",
   *   "How much does cleaning cost and I want to book",
   *   { intents: ["price_inquiry", "booking"] }
   * )
   * // Logs: intent="price_inquiry, booking" (comma-separated)
   */
  async logConversationTurn(conversationId, phone, role, message, sessionData = {}) {
    await this.logMessage({
      conversationId,
      phone,
      patientName: sessionData.patientName,
      role,
      message,
      intent: sessionData.intents && sessionData.intents.length > 0 
        ? sessionData.intents.join(', ') 
        : '',
      dentist: sessionData.dentistName,
      treatment: sessionData.treatmentType,
      dateTime: sessionData.selectedSlot 
        ? `${sessionData.selectedSlot.startTime.toISOString()} - ${sessionData.selectedSlot.endTime.toISOString()}`
        : '',
      eventId: sessionData.eventId,
      status: sessionData.status || 'active',
      action: 'conversation',
    });
  }
}

export const googleSheetsService = new GoogleSheetsService();

