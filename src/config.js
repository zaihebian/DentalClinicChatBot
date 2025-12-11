/**
 * Configuration module for the AI Dental Receptionist application.
 * 
 * Loads and manages all environment variables and application settings.
 * Provides centralized configuration access throughout the application.
 * Uses dotenv to load environment variables from .env file.
 * 
 * Configuration sections:
 * - OpenAI: API key and model selection
 * - WhatsApp: Business API credentials and webhook settings
 * - Google: Service account authentication
 * - Calendar: Dentist calendar ID mappings
 * - Sheets: Logging spreadsheet configuration
 * - Docs: Pricing document configuration
 * - Session: Timeout and session management
 * - Server: Port and environment settings
 * 
 * @module config
 */
import dotenv from 'dotenv';

dotenv.config();

/**
 * Main configuration object containing all application settings.
 * 
 * Loads from environment variables and provides defaults where applicable.
 * All sensitive data (API keys, tokens) should be in .env file, never hardcoded.
 * 
 * Configuration structure:
 * - Each section corresponds to a service/module
 * - Values are loaded from process.env
 * - Defaults provided for non-critical settings
 * - Calendar IDs are parsed from comma-separated string
 * 
 * @type {Object}
 * @property {Object} openai - OpenAI API configuration
 * @property {string} openai.apiKey - OpenAI API key (required)
 * @property {string} openai.model - Model name (default: 'gpt-4o-mini')
 * @property {Object} whatsapp - WhatsApp Business API configuration
 * @property {string} whatsapp.apiUrl - API base URL (default: 'https://graph.facebook.com/v18.0')
 * @property {string} whatsapp.phoneNumberId - Phone number ID (required)
 * @property {string} whatsapp.accessToken - Access token (required)
 * @property {string} whatsapp.verifyToken - Webhook verify token (required)
 * @property {Object} google - Google Cloud service account configuration
 * @property {string} google.serviceAccountEmail - Service account email (required)
 * @property {string} google.privateKey - Private key (required, with \n preserved)
 * @property {string} google.projectId - Google Cloud project ID (required)
 * @property {Object} calendar - Google Calendar configuration
 * @property {Object} calendar.dentistCalendars - Map of dentist names to calendar IDs
 * @property {Object} sheets - Google Sheets configuration
 * @property {string} sheets.sheetId - Google Sheet ID (required)
 * @property {string} sheets.sheetName - Sheet name (default: 'Conversations')
 * @property {Object} docs - Google Docs configuration
 * @property {string} docs.docId - Google Document ID (required)
 * @property {Object} session - Session management configuration
 * @property {number} session.timeoutMinutes - Session timeout in minutes (default: 10)
 * @property {Object} server - Server configuration
 * @property {number} server.port - Server port (default: 3000)
 * @property {string} server.nodeEnv - Node environment (default: 'development')
 */
export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v22.0',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  },
  google: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    projectId: process.env.GOOGLE_PROJECT_ID,
  },
  calendar: {
    // Parse calendar IDs from environment variable
    // Format: "Dr. [Braces Dentist 1]:cal_id_1,Dr. [Braces Dentist 2]:cal_id_2,..."
    dentistCalendars: parseCalendarIds(process.env.GOOGLE_CALENDAR_IDS || ''),
  },
  sheets: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    sheetName: process.env.GOOGLE_SHEET_NAME || 'Conversations',
  },
  docs: {
    docId: process.env.GOOGLE_DOC_ID,
  },
  session: {
    timeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '10', 10),
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};

/**
 * Parses calendar ID string from environment variable into a dictionary.
 * 
 * Converts comma-separated "Dentist Name:Calendar ID" pairs into an object.
 * Used to map dentist names to their Google Calendar IDs for appointment management.
 * 
 * Parsing logic:
 * 1. Splits string by comma to get individual entries
 * 2. Splits each entry by colon to separate dentist name and calendar ID
 * 3. Trims whitespace from both parts
 * 4. Only includes entries where both parts are present
 * 5. Returns object mapping dentist names to calendar IDs
 * 
 * Edge cases:
 * - Empty string → returns empty object {}
 * - Invalid format (no colon) → entry skipped
 * - Missing dentist name or calendar ID → entry skipped
 * - Whitespace trimmed from both parts
 * 
 * @param {string} calendarIdsString - Comma-separated string of "Dentist:CalendarID" pairs
 * @returns {Object} Object mapping dentist names to their calendar IDs
 * 
 * @example
 * // Valid format:
 * parseCalendarIds("Dr. [Braces Dentist 1]:cal1@group.calendar.google.com,Dr. [Braces Dentist 2]:cal2@group.calendar.google.com")
 * // Output:
 * // {
 * //   "Dr. [Braces Dentist 1]": "cal1@group.calendar.google.com",
 * //   "Dr. [Braces Dentist 2]": "cal2@group.calendar.google.com"
 * // }
 * 
 * @example
 * // Empty string:
 * parseCalendarIds("")
 * // Output: {} (empty object)
 * 
 * @example
 * // Invalid entries (skipped):
 * parseCalendarIds("Dr. [Braces Dentist 1]:cal1,invalid_entry,Dr. [Braces Dentist 2]:cal2")
 * // Output:
 * // {
 * //   "Dr. [Braces Dentist 1]": "cal1",
 * //   "Dr. [Braces Dentist 2]": "cal2"
 * // }
 * // Note: "invalid_entry" skipped (no colon)
 * 
 * @example
 * // Whitespace handling:
 * parseCalendarIds("  Dr. [Braces Dentist 1]  :  cal1  ")
 * // Output:
 * // {
 * //   "Dr. [Braces Dentist 1]": "cal1"  // Whitespace trimmed
 * // }
 */
function parseCalendarIds(calendarIdsString) {
  const calendars = {};
  if (!calendarIdsString) return calendars;
  
  calendarIdsString.split(',').forEach(entry => {
    const [dentist, calendarId] = entry.split(':').map(s => s.trim());
    if (dentist && calendarId) {
      calendars[dentist] = calendarId;
    }
  });
  
  return calendars;
}

/**
 * Dentist assignments by treatment type.
 * Maps treatment categories to available dentists.
 * 
 * @type {Object}
 * @property {string[]} braces - Dentists available for braces treatment
 * @property {string[]} general - Dentists available for general treatments
 * 
 * @example
 * // Usage:
 * DENTIST_ASSIGNMENTS.braces // Returns: ['Dr. [Braces Dentist 1]', 'Dr. [Braces Dentist 2]']
 * DENTIST_ASSIGNMENTS.general // Returns: ['Dr. [General Dentist 1]', 'Dr. [General Dentist 2]', 'Dr. [General Dentist 3]', 'Dr. [General Dentist 4]']
 */
export const DENTIST_ASSIGNMENTS = {
  braces: ['Dr. [Braces Dentist 1]', 'Dr. [Braces Dentist 2]'],
  general: ['Dr. [General Dentist 1]', 'Dr. [General Dentist 2]', 'Dr. [General Dentist 3]', 'Dr. [General Dentist 4]'],
};

/**
 * Treatment type constants.
 * Standard treatment types used throughout the application.
 * 
 * @type {Object}
 * @property {string} CONSULTATION - General consultation appointment
 * @property {string} CLEANING - Teeth cleaning appointment
 * @property {string} FILLING - Dental filling appointment
 * @property {string} BRACES_MAINTENANCE - Braces maintenance appointment
 * @property {string} OTHER - Other/unspecified treatment
 * 
 * @example
 * // Usage:
 * TREATMENT_TYPES.CLEANING // Returns: 'Cleaning'
 * TREATMENT_TYPES.FILLING // Returns: 'Filling'
 */
export const TREATMENT_TYPES = {
  CONSULTATION: 'Consultation',
  CLEANING: 'Cleaning',
  FILLING: 'Filling',
  BRACES_MAINTENANCE: 'Braces Maintenance',
  OTHER: 'Other',
};

/**
 * Validates that all required environment variables are set.
 * Checks for presence of critical configuration values needed for the application to function.
 * 
 * @returns {boolean} True if all required variables are present, false otherwise
 * 
 * @example
 * // If all variables are set:
 * validateConfig() // Returns: true
 * 
 * // If some variables are missing:
 * // Console output: "Warning: Missing environment variables: OPENAI_API_KEY, WHATSAPP_ACCESS_TOKEN"
 * validateConfig() // Returns: false
 */
export function validateConfig() {
  const required = [
    'OPENAI_API_KEY',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_PROJECT_ID',
    'GOOGLE_SHEET_ID',
    'GOOGLE_DOC_ID',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
  }
  
  return missing.length === 0;
}

