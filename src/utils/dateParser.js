/**
 * Date Parser utilities for extracting date and time preferences from user messages.
 * Provides functions to parse natural language date/time expressions and match them with calendar slots.
 * 
 * @module dateParser
 */

/**
 * Parses date and time preferences from a user's message.
 * Extracts relative dates (today, tomorrow, next week), specific dates (MM/DD, YYYY-MM-DD),
 * and times (10am, 2:30pm, etc.) from natural language input.
 * 
 * @param {string} message - User's message text
 * @param {Date} [referenceDate=new Date()] - Reference date for relative date calculations
 * @returns {Object} Object containing parsed date and time preferences
 * @returns {Date|null} returns.date - Parsed date object, or null if not found
 * @returns {Object|null} returns.time - Parsed time object with hours and minutes, or null if not found
 * @returns {null} returns.dateRange - Reserved for future use (always null)
 * 
 * @example
 * // Input:
 * parseDateTimePreference("I want an appointment tomorrow at 10am")
 * 
 * // Output:
 * {
 *   date: Date(2024-01-16T00:00:00.000Z),  // Tomorrow
 *   time: { hours: 10, minutes: 0 },        // 10am
 *   dateRange: null
 * }
 * 
 * @example
 * // Input:
 * parseDateTimePreference("Next week at 2:30pm")
 * 
 * // Output:
 * {
 *   date: Date(2024-01-22T00:00:00.000Z),  // 7 days from now
 *   time: { hours: 14, minutes: 30 },        // 2:30pm
 *   dateRange: null
 * }
 * 
 * @example
 * // Input:
 * parseDateTimePreference("12/25 at 3pm")
 * 
 * // Output:
 * {
 *   date: Date(2024-12-25T00:00:00.000Z),   // December 25
 *   time: { hours: 15, minutes: 0 },         // 3pm
 *   dateRange: null
 * }
 */
export function parseDateTimePreference(message, referenceDate = new Date()) {
  const msg = message.toLowerCase();
  const result = {
    date: null,
    time: null,
    dateRange: null,
  };

  // Parse relative dates
  if (msg.includes('today')) {
    result.date = new Date(referenceDate);
    result.date.setHours(0, 0, 0, 0);
  } else if (msg.includes('tomorrow')) {
    result.date = new Date(referenceDate);
    result.date.setDate(result.date.getDate() + 1);
    result.date.setHours(0, 0, 0, 0);
  } else if (msg.includes('next week')) {
    result.date = new Date(referenceDate);
    result.date.setDate(result.date.getDate() + 7);
    result.date.setHours(0, 0, 0, 0);
  }

  // Parse time (simple patterns)
  const timePatterns = [
    /(\d{1,2})\s*(am|pm)/i,
    /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
    /(\d{1,2})\s*(o'clock|oclock)/i,
  ];

  for (const pattern of timePatterns) {
    const match = message.match(pattern);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const period = match[3]?.toLowerCase() || match[4]?.toLowerCase();

      if (period === 'pm' && hours !== 12) {
        hours += 12;
      } else if (period === 'am' && hours === 12) {
        hours = 0;
      }

      result.time = { hours, minutes };
      break;
    }
  }

  // Parse specific dates (MM/DD, DD/MM, etc.)
  const datePatterns = [
    /(\d{1,2})\/(\d{1,2})/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
  ];

  for (const pattern of datePatterns) {
    const match = message.match(pattern);
    if (match) {
      if (pattern === datePatterns[0]) {
        // MM/DD or DD/MM - assume MM/DD
        const month = parseInt(match[1], 10) - 1;
        const day = parseInt(match[2], 10);
        result.date = new Date(referenceDate.getFullYear(), month, day);
      } else {
        // YYYY-MM-DD
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        result.date = new Date(year, month, day);
      }
      break;
    }
  }

  return result;
}

/**
 * Checks if a calendar slot date/time matches the user's date/time preference.
 * Compares slot date and time against parsed preferences with some flexibility.
 * 
 * @param {Date} slotDate - Calendar slot start date/time
 * @param {Object} preference - Parsed preference object from parseDateTimePreference
 * @param {Date|null} [preference.date] - Preferred date
 * @param {Object|null} [preference.time] - Preferred time with hours and minutes
 * @returns {boolean} True if slot matches preference, false otherwise
 * 
 * @example
 * // Input:
 * matchesDateTimePreference(
 *   Date(2024-01-16T10:00:00Z),  // Slot date/time
 *   {
 *     date: Date(2024-01-16T00:00:00Z),  // Tomorrow
 *     time: { hours: 10, minutes: 0 }     // 10am
 *   }
 * )
 * // Output: true (date matches, time matches within ±1 hour)
 * 
 * @example
 * // Input:
 * matchesDateTimePreference(
 *   Date(2024-01-16T14:00:00Z),  // Slot at 2pm
 *   {
 *     date: Date(2024-01-16T00:00:00Z),  // Tomorrow
 *     time: { hours: 10, minutes: 0 }     // 10am
 *   }
 * )
 * // Output: false (time doesn't match - more than 1 hour difference)
 * 
 * @example
 * // Input (no preference):
 * matchesDateTimePreference(
 *   Date(2024-01-16T10:00:00Z),
 *   { date: null, time: null }
 * )
 * // Output: true (any slot works if no preference)
 */
export function matchesDateTimePreference(slotDate, preference) {
  if (!preference.date && !preference.time) {
    return true; // No preference, any slot works
  }

  let matches = true;

  if (preference.date) {
    const slotDateOnly = new Date(slotDate);
    slotDateOnly.setHours(0, 0, 0, 0);
    const prefDateOnly = new Date(preference.date);
    prefDateOnly.setHours(0, 0, 0, 0);
    matches = matches && slotDateOnly.getTime() === prefDateOnly.getTime();
  }

  if (preference.time) {
    const slotHours = slotDate.getHours();
    const slotMinutes = slotDate.getMinutes();
    // Allow ±1 hour flexibility
    const hourDiff = Math.abs(slotHours - preference.time.hours);
    matches = matches && (hourDiff <= 1);
  }

  return matches;
}

