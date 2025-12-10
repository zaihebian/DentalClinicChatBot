/**
 * Date Parser utilities for extracting date and time preferences from user messages.
 * Provides functions to parse natural language date/time expressions and match them with calendar slots.
 * 
 * @module dateParser
 */

/**
 * Parses date and time preferences from a user's message.
 * Extracts relative dates (today, tomorrow, next week), day-of-week references (Monday, next Tuesday),
 * specific dates (MM/DD, YYYY-MM-DD), and times (10am, 2:30pm, etc.) from natural language input.
 * 
 * Supported date formats:
 * - Relative: "today", "tomorrow", "next week"
 * - Day of week: "Monday", "this Tuesday", "next Friday"
 * - Specific dates: "12/25", "2024-12-25"
 * 
 * Supported time formats:
 * - "10am", "2pm", "10:30am", "2:30pm"
 * - "10 o'clock", "2 o'clock"
 * 
 * Edge cases handled:
 * - "next [day]" always refers to next week's occurrence (not this week)
 * - "this [day]" or just "[day]" refers to next occurrence (this week if not passed, else next week)
 * - If current day is Tuesday and user says "next Tuesday", returns Tuesday of next week
 * - If current day is Wednesday and user says "Tuesday", returns Tuesday of next week (already passed)
 * 
 * @param {string} message - User's message text
 * @param {Date} [referenceDate=new Date()] - Reference date for relative date calculations (defaults to now)
 * @returns {Object} Object containing parsed date and time preferences
 * @returns {Date|null} returns.date - Parsed date object (time set to 00:00:00), or null if not found
 * @returns {Object|null} returns.time - Parsed time object with {hours, minutes}, or null if not found
 * @returns {null} returns.dateRange - Reserved for future use (always null)
 * 
 * @example
 * // Relative date with time:
 * parseDateTimePreference("I want an appointment tomorrow at 10am")
 * // Output:
 * {
 *   date: Date(2024-01-16T00:00:00.000Z),  // Tomorrow
 *   time: { hours: 10, minutes: 0 },        // 10am
 *   dateRange: null
 * }
 * 
 * @example
 * // Next week with time:
 * parseDateTimePreference("Next week at 2:30pm")
 * // Output:
 * {
 *   date: Date(2024-01-22T00:00:00.000Z),  // 7 days from now
 *   time: { hours: 14, minutes: 30 },        // 2:30pm
 *   dateRange: null
 * }
 * 
 * @example
 * // Specific date with time:
 * parseDateTimePreference("12/25 at 3pm")
 * // Output:
 * {
 *   date: Date(2024-12-25T00:00:00.000Z),   // December 25 (current year)
 *   time: { hours: 15, minutes: 0 },         // 3pm
 *   dateRange: null
 * }
 * 
 * @example
 * // Day of week - "next Tuesday" (always next week):
 * // If today is Wednesday, "next Tuesday" = Tuesday of next week
 * parseDateTimePreference("next Tuesday at 1pm")
 * // Output:
 * {
 *   date: Date(2024-01-23T00:00:00.000Z),  // Next week's Tuesday
 *   time: { hours: 13, minutes: 0 },
 *   dateRange: null
 * }
 * 
 * @example
 * // Day of week - just "Tuesday" (next occurrence):
 * // If today is Wednesday, "Tuesday" = Tuesday of next week (already passed this week)
 * // If today is Monday, "Tuesday" = Tomorrow (this week)
 * parseDateTimePreference("Tuesday at 10am")
 * // Output: Next occurrence of Tuesday
 * 
 * @example
 * // Time only (no date):
 * parseDateTimePreference("at 10:30am")
 * // Output:
 * {
 *   date: null,
 *   time: { hours: 10, minutes: 30 },
 *   dateRange: null
 * }
 * 
 * @example
 * // Date only (no time):
 * parseDateTimePreference("tomorrow")
 * // Output:
 * {
 *   date: Date(2024-01-16T00:00:00.000Z),
 *   time: null,
 *   dateRange: null
 * }
 * 
 * @example
 * // No date/time found:
 * parseDateTimePreference("Hello")
 * // Output:
 * {
 *   date: null,
 *   time: null,
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
  } else {
    // Parse day of week (Monday, Tuesday, etc.)
    const dayNames = {
      'sunday': 0, 'sun': 0,
      'monday': 1, 'mon': 1,
      'tuesday': 2, 'tue': 2, 'tues': 2,
      'wednesday': 3, 'wed': 3,
      'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
      'friday': 5, 'fri': 5,
      'saturday': 6, 'sat': 6
    };

    let targetDay = null;
    let isNextWeek = false;

    // Check for "next [day]" pattern
    for (const [dayName, dayNum] of Object.entries(dayNames)) {
      const nextPattern = new RegExp(`next\\s+${dayName}`, 'i');
      if (nextPattern.test(msg)) {
        targetDay = dayNum;
        isNextWeek = true;
        break;
      }
    }

    // Check for "this [day]" pattern
    if (!targetDay) {
      for (const [dayName, dayNum] of Object.entries(dayNames)) {
        const thisPattern = new RegExp(`this\\s+${dayName}`, 'i');
        if (thisPattern.test(msg)) {
          targetDay = dayNum;
          isNextWeek = false;
          break;
        }
      }
    }

    // Check for just "[day]" (assume next occurrence)
    if (!targetDay) {
      for (const [dayName, dayNum] of Object.entries(dayNames)) {
        const dayPattern = new RegExp(`\\b${dayName}\\b`, 'i');
        if (dayPattern.test(msg)) {
          targetDay = dayNum;
          isNextWeek = false;
          break;
        }
      }
    }

    // Calculate the target date
    if (targetDay !== null) {
      const currentDate = new Date(referenceDate);
      const currentDay = currentDate.getDay();
      let daysToAdd = targetDay - currentDay;

      if (isNextWeek) {
        // "next Tuesday" - always next week's occurrence (not this week)
        // First find days to this week's occurrence
        if (daysToAdd <= 0) {
          daysToAdd += 7; // If this week's day already passed, go to next week's occurrence
        } else {
          // If this week's day hasn't passed yet, add 7 to skip to next week
          daysToAdd += 7;
        }
      } else {
        // "this Tuesday" or just "Tuesday" - next occurrence (could be this week or next)
        if (daysToAdd <= 0) {
          daysToAdd += 7; // Next week if already passed this week
        }
      }

      result.date = new Date(referenceDate);
      result.date.setDate(result.date.getDate() + daysToAdd);
      result.date.setHours(0, 0, 0, 0);
    }
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
 * Matching rules:
 * - Date: Must match exactly (same day, month, year)
 * - Time: Allows ±1 hour flexibility (e.g., 10am preference matches 9am-11am slots)
 * - If no preference specified, any slot matches (returns true)
 * - If only date preference, matches any time on that date
 * - If only time preference, matches that time on any date
 * 
 * @param {Date} slotDate - Calendar slot start date/time
 * @param {Object} preference - Parsed preference object from parseDateTimePreference
 * @param {Date|null} [preference.date] - Preferred date (compared by day/month/year only)
 * @param {Object|null} [preference.time] - Preferred time with {hours, minutes} (allows ±1 hour)
 * @returns {boolean} True if slot matches preference, false otherwise
 * 
 * @example
 * // Exact match (date and time):
 * matchesDateTimePreference(
 *   new Date("2024-01-16T10:00:00Z"),  // Slot: Jan 16, 10:00 AM
 *   {
 *     date: new Date("2024-01-16T00:00:00Z"),  // Preference: Jan 16
 *     time: { hours: 10, minutes: 0 }          // Preference: 10am
 *   }
 * )
 * // Output: true (date matches exactly, time matches exactly)
 * 
 * @example
 * // Time within ±1 hour flexibility:
 * matchesDateTimePreference(
 *   new Date("2024-01-16T10:30:00Z"),  // Slot: Jan 16, 10:30 AM
 *   {
 *     date: new Date("2024-01-16T00:00:00Z"),  // Preference: Jan 16
 *     time: { hours: 10, minutes: 0 }          // Preference: 10am
 *   }
 * )
 * // Output: true (date matches, time within ±1 hour)
 * 
 * @example
 * // Time outside ±1 hour range:
 * matchesDateTimePreference(
 *   new Date("2024-01-16T14:00:00Z"),  // Slot: Jan 16, 2:00 PM
 *   {
 *     date: new Date("2024-01-16T00:00:00Z"),  // Preference: Jan 16
 *     time: { hours: 10, minutes: 0 }          // Preference: 10am
 *   }
 * )
 * // Output: false (date matches, but time difference > 1 hour)
 * 
 * @example
 * // Date mismatch:
 * matchesDateTimePreference(
 *   new Date("2024-01-17T10:00:00Z"),  // Slot: Jan 17, 10:00 AM
 *   {
 *     date: new Date("2024-01-16T00:00:00Z"),  // Preference: Jan 16
 *     time: { hours: 10, minutes: 0 }          // Preference: 10am
 *   }
 * )
 * // Output: false (date doesn't match)
 * 
 * @example
 * // No preference (matches any slot):
 * matchesDateTimePreference(
 *   new Date("2024-01-16T10:00:00Z"),
 *   { date: null, time: null }
 * )
 * // Output: true (any slot works if no preference)
 * 
 * @example
 * // Date only (matches any time on that date):
 * matchesDateTimePreference(
 *   new Date("2024-01-16T14:00:00Z"),  // Slot: Jan 16, 2:00 PM
 *   {
 *     date: new Date("2024-01-16T00:00:00Z"),  // Preference: Jan 16
 *     time: null                              // No time preference
 *   }
 * )
 * // Output: true (date matches, no time constraint)
 * 
 * @example
 * // Time only (matches that time on any date):
 * matchesDateTimePreference(
 *   new Date("2024-01-17T10:00:00Z"),  // Slot: Jan 17, 10:00 AM
 *   {
 *     date: null,                       // No date preference
 *     time: { hours: 10, minutes: 0 }   // Preference: 10am
 *   }
 * )
 * // Output: true (time matches, no date constraint)
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

