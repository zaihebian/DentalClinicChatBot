/**
 * Configuration module for the AI Dental Receptionist application.
 * Loads and manages all environment variables and application settings.
 * 
 * @module config
 */
import dotenv from 'dotenv';

dotenv.config();

/**
 * Main configuration object containing all application settings.
 * Loads from environment variables and provides defaults where applicable.
 * 
 * @type {Object}
 * @property {Object} openai - OpenAI API configuration
 * @property {Object} whatsapp - WhatsApp Business API configuration
 * @property {Object} google - Google Cloud service account configuration
 * @property {Object} calendar - Google Calendar configuration
 * @property {Object} sheets - Google Sheets configuration
 * @property {Object} docs - Google Docs configuration
 * @property {Object} session - Session management configuration
 * @property {Object} server - Server configuration
 */
export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  },
  whatsapp: {
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
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
 * Converts comma-separated "Dentist Name:Calendar ID" pairs into an object.
 * 
 * @param {string} calendarIdsString - Comma-separated string of "Dentist:CalendarID" pairs
 * @returns {Object} Object mapping dentist names to their calendar IDs
 * 
 * @example
 * // Input:
 * parseCalendarIds("Dr. [Braces Dentist 1]:cal1@group.calendar.google.com,Dr. [Braces Dentist 2]:cal2@group.calendar.google.com")
 * 
 * // Output:
 * {
 *   "Dr. [Braces Dentist 1]": "cal1@group.calendar.google.com",
 *   "Dr. [Braces Dentist 2]": "cal2@group.calendar.google.com"
 * }
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

