/**
 * Google Sheets Service module for logging conversations and actions.
 * Handles all logging operations to Google Sheets for audit and tracking purposes.
 * 
 * @module googleSheets
 */

import { google } from 'googleapis';
import { config } from './config.js';

/**
 * GoogleSheetsService class handles all Google Sheets API operations.
 * Manages authentication and provides methods for logging conversations and actions.
 */
class GoogleSheetsService {
  /**
   * Initializes the GoogleSheetsService.
   * Sets up authentication and Sheets API client.
   */
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.initializeAuth();
  }

  /**
   * Initializes Google Sheets API authentication using JWT (JSON Web Token).
   * Sets up service account authentication with spreadsheet read/write permissions.
   * 
   * @throws {Error} If authentication initialization fails
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
   * Appends a new row with all conversation/action details.
   * 
   * @param {Object} conversationData - Data object containing conversation/action details
   * @param {string} [conversationData.conversationId] - Conversation ID (phone number)
   * @param {string} [conversationData.phone] - Patient phone number
   * @param {string} [conversationData.patientName] - Patient name
   * @param {string} [conversationData.role] - Message role: 'user', 'assistant', or 'system'
   * @param {string} [conversationData.message] - Message content
   * @param {string} [conversationData.intent] - User intent: 'booking', 'cancel', etc.
   * @param {string} [conversationData.dentist] - Dentist name
   * @param {string} [conversationData.treatment] - Treatment type
   * @param {string} [conversationData.dateTime] - Appointment date/time
   * @param {string} [conversationData.eventId] - Calendar event ID
   * @param {string} [conversationData.status] - Status (e.g., 'active', 'confirmed', 'NEEDS FOLLOW-UP***************')
   * @param {string} [conversationData.action] - Action type (e.g., 'conversation', 'booking_created')
   * @returns {Promise<void>}
   * 
   * @example
   * // Input:
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
   * 
   * // Adds a row to Google Sheets with all the provided data
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
   * Wrapper around logMessage that sets role to 'system' automatically.
   * 
   * @param {Object} actionData - Action data object (same structure as conversationData)
   * @param {string} [actionData.action] - Action type (defaults to 'action' if not provided)
   * @returns {Promise<void>}
   * 
   * @example
   * // Input:
   * await logAction({
   *   conversationId: "+1234567890",
   *   phone: "+1234567890",
   *   patientName: "John Doe",
   *   intent: "booking",
   *   dentist: "Dr. Jinho",
   *   treatment: "Cleaning",
   *   eventId: "event123",
   *   status: "confirmed",
   *   action: "booking_created"
   * })
   * 
   * // Logs with role automatically set to 'system'
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
   * Extracts relevant information from session data and formats it for logging.
   * 
   * @param {string} conversationId - Conversation ID (phone number)
   * @param {string} phone - Patient phone number
   * @param {string} role - Message role: 'user' or 'assistant'
   * @param {string} message - Message content
   * @param {Object} [sessionData={}] - Session data object containing additional context
   * @param {string} [sessionData.patientName] - Patient name from session
   * @param {string} [sessionData.intent] - Intent from session
   * @param {string} [sessionData.dentistName] - Dentist name from session
   * @param {string} [sessionData.treatmentType] - Treatment type from session
   * @param {Object} [sessionData.selectedSlot] - Selected appointment slot
   * @param {string} [sessionData.eventId] - Calendar event ID
   * @param {string} [sessionData.status] - Session status
   * @returns {Promise<void>}
   * 
   * @example
   * // Input:
   * await logConversationTurn(
   *   "+1234567890",
   *   "+1234567890",
   *   "assistant",
   *   "I found an available slot...",
   *   {
   *     patientName: "John Doe",
   *     intent: "booking",
   *     dentistName: "Dr. Jinho",
   *     treatmentType: "Cleaning",
   *     selectedSlot: {
   *       startTime: Date(2024-01-15T10:00:00Z),
   *       endTime: Date(2024-01-15T10:30:00Z)
   *     }
   *   }
   * )
   * 
   * // Logs conversation turn with all session context
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

