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

  // Track if "this" pattern was found (for day of week logic)
  let wasThisPattern = false;

  // Parse relative dates
  if (msg.includes('today')) {
    result.date = new Date(referenceDate);
    result.date.setUTCHours(0, 0, 0, 0);
  } else if (msg.includes('tomorrow')) {
    result.date = new Date(referenceDate);
    result.date.setUTCDate(result.date.getUTCDate() + 1);
    result.date.setUTCHours(0, 0, 0, 0);
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

    // FIX 6: Check for "next week [day]" pattern FIRST (before checking "next week" alone)
    // This handles "next week Tuesday" correctly
    for (const [dayName, dayNum] of Object.entries(dayNames)) {
      const nextWeekDayPattern = new RegExp(`next\\s+week\\s+${dayName}`, 'i');
      if (nextWeekDayPattern.test(msg)) {
        targetDay = dayNum;
        isNextWeek = true;
        break;
      }
    }

    // Check for "next [day]" pattern (without "week")
    if (!targetDay) {
      for (const [dayName, dayNum] of Object.entries(dayNames)) {
        const nextPattern = new RegExp(`next\\s+${dayName}`, 'i');
        if (nextPattern.test(msg)) {
          targetDay = dayNum;
          isNextWeek = true;
          break;
        }
      }
    }
    
    // Check for "this [day]" pattern
    if (!targetDay) {
      for (const [dayName, dayNum] of Object.entries(dayNames)) {
        const thisPattern = new RegExp(`this\\s+${dayName}`, 'i');
        if (thisPattern.test(msg)) {
          targetDay = dayNum;
          isNextWeek = false;
          wasThisPattern = true; // Mark that "this" was found
          break;
        }
      }
    }

    // Check for just "[day]" (assume next occurrence)
    // If today is that day, go to next week (not today)
    if (!targetDay) {
      for (const [dayName, dayNum] of Object.entries(dayNames)) {
        const dayPattern = new RegExp(`\\b${dayName}\\b`, 'i');
        if (dayPattern.test(msg)) {
          targetDay = dayNum;
          isNextWeek = false; // Will be handled in calculation
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
        // "next [day]" - always next week's occurrence (not this week)
        // Add 7 days to get next week's occurrence
        daysToAdd += 7;
        // If daysToAdd was negative (day already passed), we've added 7, which gives us next week
        // If daysToAdd was positive (day hasn't passed), adding 7 skips to next week
        // If daysToAdd was 0 (today), adding 7 gives us next week
      } else {
        // "this [day]" or just "[day]" - next occurrence
        // For "this [day]": if daysToAdd === 0, return today
        // For just "[day]" (not "this"): if daysToAdd === 0, go to next week (not today)
        // Check if it was "this [day]" by checking if we found "this" pattern
        const wasThisPattern = msg.match(/\bthis\s+\w+/i);
        
        if (daysToAdd < 0) {
          daysToAdd += 7; // Next week if already passed this week
        } else if (daysToAdd === 0 && !wasThisPattern) {
          // Just "[day]" and it's today - go to next week
          daysToAdd = 7;
        }
        // If daysToAdd > 0, use this week's occurrence (no change needed)
        // If daysToAdd === 0 and wasThisPattern, it's today (no change needed)
      }

      result.date = new Date(referenceDate);
      result.date.setUTCDate(result.date.getUTCDate() + daysToAdd);
      result.date.setUTCHours(0, 0, 0, 0);
    } else if (!targetDay && msg.includes('next week')) {
      // Handle generic "next week" (no specific day mentioned)
      result.date = new Date(referenceDate);
      result.date.setUTCDate(result.date.getUTCDate() + 7);
      result.date.setUTCHours(0, 0, 0, 0);
    }
  }

  // Parse time (simple patterns)
  // IMPORTANT: Check more specific patterns FIRST (with minutes) before simple patterns
  // Pattern 1: "10:30am", "2:30pm" - hours:minutes and am/pm (MUST check first)
  const timeWithMinutesPattern = /(\d{1,2}):(\d{2})\s*(am|pm)/i;
  let match = message.match(timeWithMinutesPattern);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3]?.toLowerCase();

    if (period === 'pm' && hours !== 12) {
      hours += 12;
    } else if (period === 'am' && hours === 12) {
      hours = 0;
    }

    result.time = { hours, minutes };
  } else {
    // Pattern 2: "10am", "2pm" - hours and am/pm
    const simpleTimePattern = /(\d{1,2})\s*(am|pm)/i;
    match = message.match(simpleTimePattern);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = 0;
      const period = match[2]?.toLowerCase();

      if (period === 'pm' && hours !== 12) {
        hours += 12;
      } else if (period === 'am' && hours === 12) {
        hours = 0;
      }

      result.time = { hours, minutes };
    } else {
      // Pattern 3: "10 o'clock", "10 oclock" - hours only
      const oclockPattern = /(\d{1,2})\s*(o'clock|oclock)/i;
      match = message.match(oclockPattern);
      if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = 0;
        result.time = { hours, minutes };
      } else {
        // Pattern 4: "around 10", "at 10", "morning around 10" - just a number
        // Only match if it's clearly a time context (not part of a date)
        // Check for time-related words before/after the number
        const timeContextPattern = /(?:at|around|by|before|after|morning|afternoon|evening|noon|midnight)\s*(\d{1,2})\b/i;
        match = message.match(timeContextPattern);
        if (match) {
          let hours = parseInt(match[1], 10);
          // Only parse if it's a reasonable hour (1-12)
          if (hours >= 1 && hours <= 12) {
            const minutes = 0;
            // Default to AM for morning hours (1-11), PM for 12
            // But this is ambiguous, so we'll default to AM for now
            if (hours === 12) {
              hours = 12; // Noon
            }
            result.time = { hours, minutes };
          }
        }
      }
    }
  }

  // Parse specific dates (MM/DD, DD/MM, etc.)
  // IMPORTANT: Parse dates AFTER time to avoid conflicts
  // But only if date wasn't already set by relative/day parsing
  if (!result.date) {
    // Month names mapping
    const monthNames = {
      'january': 0, 'jan': 0,
      'february': 1, 'feb': 1,
      'march': 2, 'mar': 2,
      'april': 3, 'apr': 3,
      'may': 4,
      'june': 5, 'jun': 5,
      'july': 6, 'jul': 6,
      'august': 7, 'aug': 7,
      'september': 8, 'sep': 8, 'sept': 8,
      'october': 9, 'oct': 9,
      'november': 10, 'nov': 10,
      'december': 11, 'dec': 11
    };

    // Pattern 1: "July 21st", "July 21", "21st of July", "July 21, 2024"
    let monthNameMatch = null;
    let dayMatch = null;
    let yearMatch = null;

    // Check for month name patterns
    for (const [monthName, monthNum] of Object.entries(monthNames)) {
      // Pattern: "July 21st" or "July 21"
      const pattern1 = new RegExp(`${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,\\s*(\\d{4}))?`, 'i');
      let match = message.match(pattern1);
      if (match) {
        monthNameMatch = monthNum;
        dayMatch = parseInt(match[1], 10);
        yearMatch = match[2] ? parseInt(match[2], 10) : referenceDate.getUTCFullYear();
        break;
      }

      // Pattern: "21st of July" or "21 of July"
      const pattern2 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+of\\s+${monthName}(?:,\\s*(\\d{4}))?`, 'i');
      match = message.match(pattern2);
      if (match) {
        monthNameMatch = monthNum;
        dayMatch = parseInt(match[1], 10);
        yearMatch = match[2] ? parseInt(match[2], 10) : referenceDate.getUTCFullYear();
        break;
      }
    }

    if (monthNameMatch !== null && dayMatch !== null) {
      const year = yearMatch || referenceDate.getUTCFullYear();
      result.date = new Date(Date.UTC(year, monthNameMatch, dayMatch));
    } else {
      // Pattern 2: Numeric formats (MM/DD, YYYY-MM-DD)
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
            const year = referenceDate.getUTCFullYear();
            result.date = new Date(Date.UTC(year, month, day));
          } else {
            // YYYY-MM-DD
            const year = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1;
            const day = parseInt(match[3], 10);
            result.date = new Date(Date.UTC(year, month, day));
          }
          break;
        }
      }
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
    slotDateOnly.setUTCHours(0, 0, 0, 0);
    const prefDateOnly = new Date(preference.date);
    prefDateOnly.setUTCHours(0, 0, 0, 0);
    // Compare dates by year, month, day only (ignore time)
    matches = matches && 
              slotDateOnly.getUTCFullYear() === prefDateOnly.getUTCFullYear() &&
              slotDateOnly.getUTCMonth() === prefDateOnly.getUTCMonth() &&
              slotDateOnly.getUTCDate() === prefDateOnly.getUTCDate();
  }

  if (preference.time) {
    const slotHours = slotDate.getUTCHours();
    const slotMinutes = slotDate.getUTCMinutes();
    // Allow ±1 hour flexibility (compare hours only, minutes don't matter)
    const hourDiff = Math.abs(slotHours - preference.time.hours);
    matches = matches && (hourDiff <= 1);
  }

  return matches;
}

