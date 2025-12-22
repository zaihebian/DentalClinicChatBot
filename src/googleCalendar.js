/**
 * Google Calendar Service module for managing dental appointments.
 * 
 * Handles all Google Calendar API operations including fetching availability,
 * creating appointments, canceling appointments, and retrieving existing bookings.
 * Uses service account authentication with JWT (JSON Web Token) for secure API access.
 * 
 * Key features:
 * - Fetches available slots for next 1 month
 * - Identifies gaps between existing appointments
 * - Creates calendar events for confirmed bookings
 * - Cancels appointments by deleting calendar events
 * - Retrieves all AI-booked appointments for 2 months
 * - Finds bookings by patient phone number
 * 
 * Working hours: 9:00 AM - 6:00 PM, Monday-Friday (weekends excluded)
 * Minimum slot duration: 15 minutes
 * 
 * @module googleCalendar
 */

import { google } from 'googleapis';
import { config } from './config.js';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

/**
 * GoogleCalendarService class handles all Google Calendar API operations.
 * 
 * This is a singleton class that manages authentication and provides methods
 * for calendar event management. Uses service account authentication with
 * calendar read/write permissions.
 * 
 * Authentication:
 * - Uses JWT (JSON Web Token) with service account credentials
 * - Requires GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY
 * - Scopes: https://www.googleapis.com/auth/calendar
 * 
 * @class GoogleCalendarService
 */
class GoogleCalendarService {
  /**
   * Initializes the GoogleCalendarService.
   * Sets up authentication and calendar API client.
   * 
   * Automatically calls initializeAuth() to set up JWT authentication.
   * If authentication fails, an error is thrown and logged.
   * 
   * @throws {Error} If authentication initialization fails
   * 
   * @example
   * // Called automatically when module is imported
   * // Creates new instance, sets up auth, ready for API calls
   */
  constructor() {
    this.auth = null;
    this.calendar = null;
    this.initializeAuth();
  }

  /**
   * Initializes Google Calendar API authentication using JWT (JSON Web Token).
   * 
   * Sets up service account authentication with calendar read/write permissions.
   * Creates a JWT auth client using service account email and private key from config.
   * Initializes the Google Calendar API client (v3) with the authenticated client.
   * 
   * Authentication requirements:
   * - GOOGLE_SERVICE_ACCOUNT_EMAIL: Service account email
   * - GOOGLE_PRIVATE_KEY: Private key (with \n characters preserved)
   * - Calendar API must be enabled in Google Cloud Console
   * 
   * @throws {Error} If authentication initialization fails (logged to console)
   * 
   * @example
   * // Called automatically during construction
   * // Sets up this.auth (JWT client) and this.calendar (API client)
   * // Ready for API calls after this
   * 
   * @example
   * // On error (invalid credentials):
   * // Console: "Error initializing Google Calendar auth: [error details]"
   * // Throws error, prevents service from starting
   */
  initializeAuth() {
    try {
      this.auth = new google.auth.JWT(
        config.google.serviceAccountEmail,
        null,
        config.google.privateKey,
        ['https://www.googleapis.com/auth/calendar']
      );
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
    } catch (error) {
      console.error('Error initializing Google Calendar auth:', error);
      throw error;
    }
  }

  /**
   * Gets all available time slots for specified dentists for the next 1 month.
   * 
   * Fetches calendar events from Google Calendar, identifies busy periods,
   * and calculates available gaps between appointments. Returns slots that
   * are free and can accommodate appointments.
   * 
   * Process:
   * 1. For each dentist, fetches calendar events for next 1 month
   * 2. Parses events into busy time slots
   * 3. Finds gaps between busy slots (working hours: 9 AM - 6 PM, Mon-Fri)
   * 4. Filters gaps to minimum 15-minute duration
   * 5. Returns all available slots sorted by start time
   * 
   * Edge cases:
   * - Skips weekends (Saturday, Sunday)
   * - Only includes slots within working hours (9 AM - 6 PM)
   * - Minimum slot duration: 15 minutes
   * - If calendar fetch fails for a dentist, that dentist is skipped (others continue)
   * - Returns empty array if no slots found
   * 
   * @param {string} treatmentType - Treatment type (currently not used, reserved for future filtering)
   * @param {string[]} dentistNames - Array of dentist names to check availability for
   * @returns {Promise<Array>} Array of available slot objects, sorted by start time
   * @returns {string} returns[].doctor - Dentist name
   * @returns {Date} returns[].startTime - Slot start time
   * @returns {Date} returns[].endTime - Slot end time
   * @returns {number} returns[].duration - Slot duration in minutes
   * @returns {string} returns[].weekday - Weekday name (e.g., "Monday")
   * 
   * @example
   * // Get slots for multiple dentists:
 * await getAvailableSlots("Cleaning", ["Dr GeneralA", "Dr GeneralB"])
 * // Output:
 * // [
 * //   {
 * //     doctor: "Dr GeneralA",
 * //     startTime: Date(2024-01-15T09:00:00.000Z),
 * //     endTime: Date(2024-01-15T10:00:00.000Z),
 * //     duration: 60,
 * //     weekday: "Monday"
 * //   },
 * //   {
 * //     doctor: "Dr GeneralB",
   * //     startTime: Date(2024-01-15T13:00:00.000Z),
   * //     endTime: Date(2024-01-15T14:00:00.000Z),
   * //     duration: 60,
   * //     weekday: "Monday"
   * //   }
   * // ]
   * 
   * @example
   * // No available slots:
 * await getAvailableSlots("Cleaning", ["Dr GeneralA"])
 * // Output: [] (empty array if all slots are booked)
 * 
 * @example
 * // Calendar fetch error for one dentist:
 * // If Dr GeneralA calendar fails, Dr GeneralB still returns slots
   * // Error logged to console, but doesn't stop other dentists
   */
  async getAvailableSlots(treatmentType, dentistNames) {
    const slots = [];
    const now = new Date();
    const oneMonthLater = new Date(now);
    oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);

    // Get calendars for specified dentists
    const calendarsToCheck = dentistNames
      .map(name => ({ name, calendarId: config.calendar.dentistCalendars[name] }))
      .filter(d => d.calendarId);

    for (const { name: doctor, calendarId } of calendarsToCheck) {
      try {
        console.log(`\n🔍 [CALENDAR CHECK] Now checking calendar of ${doctor}...`);
        
        const events = await this.calendar.events.list({
          calendarId,
          timeMin: now.toISOString(),
          timeMax: oneMonthLater.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });

        const busySlots = this.parseBusySlots(events.data.items);
        const availableSlots = this.findAvailableSlots(busySlots, now, oneMonthLater, doctor, now);
        
        // Log first free time slot for this doctor
        if (availableSlots.length > 0) {
          const firstSlot = availableSlots[0];
          const slotDate = firstSlot.startTime.toISOString().split('T')[0];
          const slotTime = firstSlot.startTime.toISOString().split('T')[1].substring(0, 5);
          console.log(`✅ [CALENDAR CHECK] ${doctor} - Found ${availableSlots.length} available slot(s)`);
          console.log(`   📍 First free time slot: ${slotDate} at ${slotTime} (Duration: ${firstSlot.duration} minutes)`);
        } else {
          console.log(`⚠️  [CALENDAR CHECK] ${doctor} - No available slots found`);
        }
        
        slots.push(...availableSlots);
      } catch (error) {
        console.error(`❌ [CALENDAR CHECK] Error fetching calendar for ${doctor}:`, error);
      }
    }

    // Sort by start time
    slots.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    
    return slots;
  }

  /**
   * Parses Google Calendar events into busy time slot objects.
   * Extracts start time, end time, and event ID from calendar events.
   * 
   * @param {Array} events - Array of Google Calendar event objects
   * @returns {Array} Array of busy slot objects with start, end, and id
   * 
   * @example
   * // Input:
   * parseBusySlots([
   *   {
   *     id: "event123",
   *     start: { dateTime: "2024-01-15T10:00:00Z" },
   *     end: { dateTime: "2024-01-15T11:00:00Z" }
   *   }
   * ])
   * 
   * // Output:
   * [
   *   {
   *     start: Date(2024-01-15T10:00:00.000Z),
   *     end: Date(2024-01-15T11:00:00.000Z),
   *     id: "event123"
   *   }
   * ]
   */
  parseBusySlots(events) {
    return events.map(event => ({
      start: new Date(event.start.dateTime || event.start.date),
      end: new Date(event.end.dateTime || event.end.date),
      id: event.id,
    }));
  }

  /**
   * Finds available time slots between busy periods for a specific doctor.
   * Assumes working hours are 9:00-18:00, Monday-Friday.
   * Identifies gaps between existing appointments and returns slots with minimum 15-minute duration.
   * For today, starts from the current time instead of 9 AM to avoid offering past time slots.
   * 
   * @param {Array} busySlots - Array of busy slot objects with start and end times
   * @param {Date} startDate - Start date for searching available slots
   * @param {Date} endDate - End date for searching available slots
   * @param {string} doctor - Doctor name to associate with the slots
   * @param {Date} currentTime - Current time (used to filter out past slots for today)
   * @returns {Array} Array of available slot objects (all slots start at or after currentTime)
   * 
   * @example
   * // Input (if today is 2024-01-15 at 2 PM):
   * findAvailableSlots(
   *   [
   *     { start: Date(2024-01-15T10:00:00Z), end: Date(2024-01-15T11:00:00Z) }
   *   ],
   *   Date(2024-01-15),
   *   Date(2024-01-16),
   *   "Dr GeneralA",
   *   Date(2024-01-15T14:00:00Z) // Current time: 2 PM
   * )
   * 
   * // Output (starts from 2 PM, not 9 AM):
   * [
   *   {
   *     doctor: "Dr GeneralA",
   *     startTime: Date(2024-01-15T14:00:00Z), // Current time, not 9 AM
   *     endTime: Date(2024-01-15T18:00:00Z),
   *     duration: 240,
   *     weekday: "Monday"
   *   }
   * ]
   */
  findAvailableSlots(busySlots, startDate, endDate, doctor, currentTime) {
    const availableSlots = [];
    const workingHours = { start: 9, end: 18 }; // 9 AM to 6 PM
    const slotDuration = 15; // Minimum slot duration in minutes

    let currentDate = new Date(startDate);
    const now = new Date(currentTime);
    
    while (currentDate < endDate) {
      // Skip weekends
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(workingHours.start, 0, 0, 0);
        continue;
      }

      // Check each day
      const dayStart = new Date(currentDate);
      dayStart.setHours(workingHours.start, 0, 0, 0);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(workingHours.end, 0, 0, 0);

      // Get busy slots for this day
      const dayBusySlots = busySlots.filter(slot => 
        slot.start.toDateString() === dayStart.toDateString()
      );

      // Find gaps between busy slots
      // If this is today, start from current time instead of 9 AM
      const isToday = dayStart.toDateString() === now.toDateString();
      let slotStartTime = isToday ? new Date(Math.max(dayStart, now)) : new Date(dayStart);
      
      for (const busySlot of dayBusySlots.sort((a, b) => a.start - b.start)) {
        if (slotStartTime < busySlot.start) {
          const gapDuration = (busySlot.start - slotStartTime) / (1000 * 60); // minutes
          if (gapDuration >= slotDuration) {
            availableSlots.push({
              doctor,
              startTime: new Date(slotStartTime),
              endTime: new Date(busySlot.start),
              duration: gapDuration,
              weekday: this.getWeekdayName(dayOfWeek),
            });
          }
        }
        slotStartTime = new Date(Math.max(slotStartTime, busySlot.end));
      }

      // Check gap from last busy slot to end of day
      if (slotStartTime < dayEnd) {
        const gapDuration = (dayEnd - slotStartTime) / (1000 * 60);
        if (gapDuration >= slotDuration) {
          availableSlots.push({
            doctor,
            startTime: new Date(slotStartTime),
            endTime: new Date(dayEnd),
            duration: gapDuration,
            weekday: this.getWeekdayName(dayOfWeek),
          });
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(workingHours.start, 0, 0, 0);
    }

    // Final safety filter: Remove any slots that start before current time
    // This ensures we never return past time slots, even if there's a logic error
    const filteredSlots = availableSlots.filter(slot => {
      const slotStart = new Date(slot.startTime);
      return slotStart >= now;
    });

    return filteredSlots;
  }

  /**
   * Converts day of week number to weekday name string.
   * 
   * @param {number} dayOfWeek - Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
   * @returns {string} Weekday name
   * 
   * @example
   * // Input:
   * getWeekdayName(0)
   * // Output: "Sunday"
   * 
   * @example
   * // Input:
   * getWeekdayName(1)
   * // Output: "Monday"
   */
  getWeekdayName(dayOfWeek) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  }

  /**
   * Finds the earliest available slot that has sufficient duration for the treatment.
   * Returns the first slot that meets or exceeds the required duration.
   * 
   * @param {Array} availableSlots - Array of available slot objects
   * @param {number} treatmentDurationMinutes - Required duration in minutes
   * @returns {Object|undefined} Earliest available slot object, or undefined if none found
   * 
   * @example
   * // Input:
   * findEarliestAvailableSlot(
   *   [
   *     { startTime: Date(...), duration: 30 },
   *     { startTime: Date(...), duration: 60 },
   *     { startTime: Date(...), duration: 45 }
   *   ],
   *   45
   * )
   * 
   * // Output: Second slot (duration 60 >= 45)
   * { startTime: Date(...), duration: 60, ... }
   */
  findEarliestAvailableSlot(availableSlots, treatmentDurationMinutes) {
    return availableSlots.find(slot => slot.duration >= treatmentDurationMinutes);
  }

  /**
   * Finds available slots that fall within a preferred time range.
   * Filters slots to only include those that start and end within the preferred range,
   * and have sufficient duration for the treatment.
   * 
   * @param {Array} availableSlots - Array of available slot objects
   * @param {Date|string} preferredStart - Preferred start time
   * @param {Date|string} preferredEnd - Preferred end time
   * @param {number} treatmentDurationMinutes - Required duration in minutes
   * @returns {Array} Array of slots within the preferred range
   * 
   * @example
   * // Input:
   * findSlotsInRange(
   *   [
   *     { startTime: Date(2024-01-15T09:00Z), endTime: Date(2024-01-15T10:00Z), duration: 60 },
   *     { startTime: Date(2024-01-15T10:00Z), endTime: Date(2024-01-15T11:00Z), duration: 60 },
   *     { startTime: Date(2024-01-15T14:00Z), endTime: Date(2024-01-15T15:00Z), duration: 60 }
   *   ],
   *   Date(2024-01-15T10:00Z),
   *   Date(2024-01-15T12:00Z),
   *   60
   * )
   * 
   * // Output:
   * [
   *   { startTime: Date(2024-01-15T10:00Z), endTime: Date(2024-01-15T11:00Z), duration: 60 }
   * ]
   */
  findSlotsInRange(availableSlots, preferredStart, preferredEnd, treatmentDurationMinutes) {
    const preferredStartTime = new Date(preferredStart);
    const preferredEndTime = new Date(preferredEnd);
    
    return availableSlots.filter(slot => {
      const slotStart = new Date(slot.startTime);
      const slotEnd = new Date(slot.endTime);
      
      // Check if slot overlaps with preferred range and has enough duration
      return (
        slotStart >= preferredStartTime &&
        slotEnd <= preferredEndTime &&
        slot.duration >= treatmentDurationMinutes
      );
    });
  }

  /**
   * Creates a calendar event for a confirmed appointment.
   * 
   * Creates a new calendar event in the specified dentist's calendar with
   * appointment details. Event title follows a specific format for easy
   * identification and parsing: "##AI Booked## [Doctor] [Patient] [Treatment] [Phone]"
   * 
   * Event details:
   * - Title: "##AI Booked## [Doctor] [Patient] [Treatment] [Phone]"
   * - Description: Includes patient name, treatment, and phone number
   * - Start/End: UTC timezone, ISO format
   * - Timezone: UTC (converted from local time if needed)
   * 
   * Error handling:
   * - If calendar API fails, returns { success: false, error: message }
   * - Errors are logged to console but don't throw (graceful failure)
   * - Common errors: invalid calendar ID, permission denied, time conflict
   * 
   * @param {string} calendarId - Google Calendar ID for the dentist (from config)
   * @param {Object} appointmentData - Appointment details object
   * @param {string} appointmentData.patientName - Patient's name (defaults to "Patient" if not set)
   * @param {string} appointmentData.doctor - Doctor's name (must match calendar owner)
   * @param {string} appointmentData.treatment - Treatment type
   * @param {string} appointmentData.phone - Patient's phone number
   * @param {Date} appointmentData.startTime - Appointment start time (Date object)
   * @param {Date} appointmentData.endTime - Appointment end time (Date object)
   * @returns {Promise<Object>} Result object with success status and event ID
   * @returns {boolean} returns.success - True if event created successfully
   * @returns {string} [returns.eventId] - Google Calendar event ID (if successful)
   * @returns {Object} [returns.event] - Full Google Calendar event object (if successful)
   * @returns {string} [returns.error] - Error message (if failed)
   * 
   * @example
   * // Successful booking:
   * await createAppointment(
   *   "cal123@group.calendar.google.com",
   *   {
   *     patientName: "John Doe",
   *     doctor: "Dr GeneralA",
   *     treatment: "Cleaning",
   *     phone: "+1234567890",
   *     startTime: new Date("2024-01-15T10:00:00Z"),
   *     endTime: new Date("2024-01-15T10:30:00Z")
   *   }
   * )
   * // Output:
   * // {
   * //   success: true,
   * //   eventId: "abc123xyz",
   * //   event: { id: "abc123xyz", summary: "##AI Booked## ...", ... }
   * // }
   * 
   * @example
   * // Calendar API error (invalid calendar ID):
   * await createAppointment("invalid_calendar_id", {...})
   * // Output:
   * // {
   * //   success: false,
   * //   error: "Calendar not found"
   * // }
   * 
   * @example
   * // Permission error (service account doesn't have access):
   * // Output:
   * // {
   * //   success: false,
   * //   error: "Insufficient permissions"
   * // }
   */
  async createAppointment(calendarId, appointmentData) {
    const { patientName, doctor, treatment, phone, startTime, endTime } = appointmentData;
    
    const eventTitle = `##AI Booked## ${doctor} ${patientName} ${treatment} ${phone}`;
    
    const event = {
      summary: eventTitle,
      description: `AI Booked Appointment\nPatient: ${patientName}\nTreatment: ${treatment}\nPhone: ${phone}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC',
      },
    };

    try {
      const response = await this.calendar.events.insert({
        calendarId,
        resource: event,
      });
      
      return {
        success: true,
        eventId: response.data.id,
        event: response.data,
      };
    } catch (error) {
      console.error('Error creating calendar event:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Deletes a calendar event to cancel an appointment.
   * Permanently removes the event from the calendar.
   * 
   * @param {string} calendarId - Google Calendar ID for the dentist
   * @param {string} eventId - Google Calendar event ID to delete
   * @returns {Promise<Object>} Result object with success status
   * 
   * @example
   * // Input:
   * await cancelAppointment("cal123@group.calendar.google.com", "event456")
   * 
   * // Output:
   * {
   *   success: true
   * }
   * 
   * @example
   * // On error:
   * {
   *   success: false,
   *   error: "Event not found"
   * }
   */
  async cancelAppointment(calendarId, eventId) {
    try {
      await this.calendar.events.delete({
        calendarId,
        eventId,
      });
      return { success: true };
    } catch (error) {
      console.error('Error canceling calendar event:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extracts phone number from text using pattern matching.
   * Supports multiple formats: +1234567890, 1234567890, (123) 456-7890, etc.
   * 
   * @param {string} text - Text to search for phone number
   * @returns {string|null} Phone number if found, null otherwise
   * @private
   */
  extractPhoneNumber(text) {
    if (!text) return null;
    
    // Pattern 1: +1234567890 or +1 234 567 8900 (with country code)
    const pattern1 = /\+?\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/g;
    // Pattern 2: (123) 456-7890 or (123)456-7890
    const pattern2 = /\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/g;
    // Pattern 3: Simple 10+ digit number
    const pattern3 = /\d{10,}/g;
    
    // Try patterns in order of specificity
    let match = text.match(pattern1) || text.match(pattern2) || text.match(pattern3);
    if (match && match[0]) {
      // Normalize: remove spaces, dashes, parentheses, keep + if present
      const normalized = match[0].replace(/[\s\-\(\)]/g, '');
      return normalized.length >= 10 ? normalized : null;
    }
    
    return null;
  }

  /**
   * Parses appointment information from calendar event.
   * Handles both AI-booked format and general event formats.
   * 
   * @param {Object} event - Google Calendar event object
   * @param {string} calendarId - Calendar ID
   * @param {string} defaultDoctor - Default doctor name for this calendar
   * @returns {Object|null} Booking object if phone found, null otherwise
   * @private
   */
  async parseEventToBooking(event, calendarId, defaultDoctor) {
    const title = event.summary || '';
    const description = event.description || '';

    try {
      const response = await openai.chat.completions.create({
        model: config.openai.model,
        messages: [{
          role: 'user',
          content: `Extract appointment info from this calendar event. Return ONLY valid JSON, no markdown, no explanations.

Title: "${title}"
Description: "${description}"

Available doctors: Dr BracesA, Dr BracesB, Dr GeneralA, Dr GeneralB
Available treatments: Cleaning, Braces Maintenance, Consultation, Filling, Root Canal, Extraction

Return format: {"doctor":"Dr Name", "patientName":"Patient Name", "treatment":"Treatment", "phone":"1234567890"}

Use null if not found.`
        }],
        temperature: 0,
        max_tokens: 100
      });

      const extracted = JSON.parse(response.choices[0].message.content);

      // Must have phone number to be a valid booking
      if (!extracted.phone) return null;

      return {
        patientPhone: extracted.phone,
        patientName: extracted.patientName || 'Patient',
        doctor: extracted.doctor || defaultDoctor,
        treatment: extracted.treatment,
        startTime: new Date(event.start.dateTime || event.start.date),
        endTime: new Date(event.end.dateTime || event.end.date),
        calendarEventId: event.id,
        calendarId,
      };
    } catch (error) {
      console.error('AI extraction failed:', error);
      return null; // Gracefully fail
    }
  }

  /**
   * Retrieves all appointments for the next 2 months from all calendars.
   * Searches ALL calendar events (not just AI-booked) and extracts appointments
   * by finding phone numbers in event titles/descriptions.
   * 
   * @returns {Promise<Array>} Array of booking objects with patient and appointment details
   * 
   * @example
   * // Output:
   * [
   *   {
   *     patientPhone: "+1234567890",
   *     patientName: "John Doe",
   *     doctor: "Dr GeneralA",
   *     treatment: "Cleaning",
   *     startTime: Date(2024-01-15T10:00:00Z),
   *     endTime: Date(2024-01-15T10:30:00Z),
   *     calendarEventId: "event123",
   *     calendarId: "cal123@group.calendar.google.com"
   *   }
   * ]
   */
  async getAllBookings() {
    const bookings = [];
    const now = new Date();
    const twoMonthsLater = new Date(now);
    twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);

    for (const [doctor, calendarId] of Object.entries(config.calendar.dentistCalendars)) {
      try {
        const events = await this.calendar.events.list({
          calendarId,
          timeMin: now.toISOString(),
          timeMax: twoMonthsLater.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });

        for (const event of events.data.items) {
          const booking = this.parseEventToBooking(event, calendarId, doctor);
          if (booking) {
            bookings.push(booking);
          }
        }
      } catch (error) {
        console.error(`Error fetching bookings for ${doctor}:`, error);
      }
    }

    return bookings;
  }

  /**
   * Normalizes phone number for comparison (removes formatting differences).
   * 
   * @param {string} phone - Phone number in any format
   * @returns {string} Normalized phone number (digits only, with + prefix if present)
   * @private
   */
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    // Remove spaces, dashes, parentheses, keep + if present
    const normalized = phone.replace(/[\s\-\(\)]/g, '');
    return normalized;
  }

  /**
   * Finds a booking by patient's phone number.
   * 
   * Searches through ALL appointments (AI-booked and manually booked) from all dentists
   * to find a match for the given phone number. Uses pattern matching to extract phone
   * numbers from event titles and descriptions.
   * 
   * Process:
   * 1. Calls getAllBookings() to fetch all appointments (searches all events)
   * 2. Normalizes phone numbers for comparison (handles format differences)
   * 3. Returns first booking with matching phone number
   * 4. Returns undefined if no match found
   * 
   * Edge cases:
   * - Returns first match if multiple bookings exist
   * - Phone number matching handles format differences (+1234567890 vs 1234567890)
   * - Searches ALL calendar events, not just AI-booked
   * - Returns undefined if no bookings found (not null)
   * 
   * @param {string} phone - Patient's phone number (any format: +1234567890, 1234567890, etc.)
   * @returns {Promise<Object|undefined>} Booking object if found, undefined if not found
   * @returns {string} [returns.patientPhone] - Patient phone number
   * @returns {string} [returns.patientName] - Patient name
   * @returns {string} [returns.doctor] - Doctor name
   * @returns {string} [returns.treatment] - Treatment type (if available)
   * @returns {Date} [returns.startTime] - Appointment start time
   * @returns {Date} [returns.endTime] - Appointment end time
   * @returns {string} [returns.calendarEventId] - Google Calendar event ID
   * @returns {string} [returns.calendarId] - Google Calendar ID
   * 
   * @example
   * // Booking found:
   * await findBookingByPhone("+1234567890")
   * // Output: Booking object with appointment details
   * 
   * @example
   * // No booking found:
   * await findBookingByPhone("+9999999999")
   * // Output: undefined
   * 
   * @example
   * // Format differences handled:
   * await findBookingByPhone("1234567890")  // Missing +
   * // Still matches if event has "+1234567890"
   */
  async findBookingByPhone(phone) {
    const normalizedSearchPhone = this.normalizePhoneNumber(phone);
    const bookings = await this.getAllBookings();
    
    // Find booking with matching phone (normalized comparison)
    return bookings.find(booking => {
      const normalizedBookingPhone = this.normalizePhoneNumber(booking.patientPhone);
      return normalizedBookingPhone === normalizedSearchPhone || 
             normalizedBookingPhone.endsWith(normalizedSearchPhone) ||
             normalizedSearchPhone.endsWith(normalizedBookingPhone);
    });
  }
}

export const googleCalendarService = new GoogleCalendarService();

