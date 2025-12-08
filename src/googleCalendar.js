/**
 * Google Calendar Service module for managing dental appointments.
 * Handles calendar operations including fetching availability, creating appointments,
 * canceling appointments, and retrieving existing bookings.
 * 
 * @module googleCalendar
 */

import { google } from 'googleapis';
import { config } from './config.js';

/**
 * GoogleCalendarService class handles all Google Calendar API operations.
 * Manages authentication and provides methods for calendar event management.
 */
class GoogleCalendarService {
  /**
   * Initializes the GoogleCalendarService.
   * Sets up authentication and calendar API client.
   */
  constructor() {
    this.auth = null;
    this.calendar = null;
    this.initializeAuth();
  }

  /**
   * Initializes Google Calendar API authentication using JWT (JSON Web Token).
   * Sets up service account authentication with calendar read/write permissions.
   * 
   * @throws {Error} If authentication initialization fails
   * 
   * @example
   * // Called automatically during construction
   * // Sets up this.auth and this.calendar for API calls
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
   * Fetches calendar events, identifies busy periods, and calculates available gaps.
   * Returns slots sorted by start time.
   * 
   * @param {string} treatmentType - Treatment type (used for filtering, not directly used here)
   * @param {string[]} dentistNames - Array of dentist names to check availability for
   * @returns {Promise<Array>} Array of available slot objects
   * 
   * @example
   * // Input:
 * await getAvailableSlots("Cleaning", ["Dr. [General Dentist 1]", "Dr. [General Dentist 2]"])
 * 
 * // Output:
 * [
 *   {
 *     doctor: "Dr. [General Dentist 1]",
 *     startTime: 2024-01-15T09:00:00.000Z,
 *     endTime: 2024-01-15T10:00:00.000Z,
 *     duration: 60,
 *     weekday: "Monday"
 *   },
 *   {
 *     doctor: "Dr. [General Dentist 2]",
   *     startTime: 2024-01-15T13:00:00.000Z,
   *     endTime: 2024-01-15T14:00:00.000Z,
   *     duration: 60,
   *     weekday: "Monday"
   *   }
   * ]
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
        const events = await this.calendar.events.list({
          calendarId,
          timeMin: now.toISOString(),
          timeMax: oneMonthLater.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
        });

        const busySlots = this.parseBusySlots(events.data.items);
        const availableSlots = this.findAvailableSlots(busySlots, now, oneMonthLater, doctor);
        
        slots.push(...availableSlots);
      } catch (error) {
        console.error(`Error fetching calendar for ${doctor}:`, error);
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
   * 
   * @param {Array} busySlots - Array of busy slot objects with start and end times
   * @param {Date} startDate - Start date for searching available slots
   * @param {Date} endDate - End date for searching available slots
   * @param {string} doctor - Doctor name to associate with the slots
   * @returns {Array} Array of available slot objects
   * 
   * @example
   * // Input:
   * findAvailableSlots(
   *   [
   *     { start: Date(2024-01-15T10:00:00Z), end: Date(2024-01-15T11:00:00Z) }
   *   ],
   *   Date(2024-01-15),
   *   Date(2024-01-16),
   *   "Dr. [General Dentist 1]"
   * )
   * 
   * // Output:
   * [
   *   {
   *     doctor: "Dr. [General Dentist 1]",
   *     startTime: Date(2024-01-15T09:00:00Z),
   *     endTime: Date(2024-01-15T10:00:00Z),
   *     duration: 60,
   *     weekday: "Monday"
   *   },
   *   {
   *     doctor: "Dr. [General Dentist 1]",
   *     startTime: Date(2024-01-15T11:00:00Z),
   *     endTime: Date(2024-01-15T18:00:00Z),
   *     duration: 420,
   *     weekday: "Monday"
   *   }
   * ]
   */
  findAvailableSlots(busySlots, startDate, endDate, doctor) {
    const availableSlots = [];
    const workingHours = { start: 9, end: 18 }; // 9 AM to 6 PM
    const slotDuration = 15; // Minimum slot duration in minutes

    let currentDate = new Date(startDate);
    
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
      let currentTime = new Date(dayStart);
      
      for (const busySlot of dayBusySlots.sort((a, b) => a.start - b.start)) {
        if (currentTime < busySlot.start) {
          const gapDuration = (busySlot.start - currentTime) / (1000 * 60); // minutes
          if (gapDuration >= slotDuration) {
            availableSlots.push({
              doctor,
              startTime: new Date(currentTime),
              endTime: new Date(busySlot.start),
              duration: gapDuration,
              weekday: this.getWeekdayName(dayOfWeek),
            });
          }
        }
        currentTime = new Date(Math.max(currentTime, busySlot.end));
      }

      // Check gap from last busy slot to end of day
      if (currentTime < dayEnd) {
        const gapDuration = (dayEnd - currentTime) / (1000 * 60);
        if (gapDuration >= slotDuration) {
          availableSlots.push({
            doctor,
            startTime: new Date(currentTime),
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

    return availableSlots;
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
   * Event title follows format: "##AI Booked## [Doctor] [Patient] [Treatment] [Phone]"
   * 
   * @param {string} calendarId - Google Calendar ID for the dentist
   * @param {Object} appointmentData - Appointment details object
   * @param {string} appointmentData.patientName - Patient's name
   * @param {string} appointmentData.doctor - Doctor's name
   * @param {string} appointmentData.treatment - Treatment type
   * @param {string} appointmentData.phone - Patient's phone number
   * @param {Date} appointmentData.startTime - Appointment start time
   * @param {Date} appointmentData.endTime - Appointment end time
   * @returns {Promise<Object>} Result object with success status and event ID
   * 
   * @example
   * // Input:
   * await createAppointment(
   *   "cal123@group.calendar.google.com",
   *   {
   *     patientName: "John Doe",
   *     doctor: "Dr. [General Dentist 1]",
   *     treatment: "Cleaning",
   *     phone: "+1234567890",
   *     startTime: Date(2024-01-15T10:00:00Z),
   *     endTime: Date(2024-01-15T10:30:00Z)
   *   }
   * )
   * 
   * // Output:
   * {
   *   success: true,
   *   eventId: "abc123xyz",
   *   event: { ... Google Calendar event object ... }
   * }
   * 
   * @example
   * // On error:
   * {
   *   success: false,
   *   error: "Error message"
   * }
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
   * Retrieves all existing AI-booked appointments for the next 2 months.
   * Fetches events from all dentist calendars and parses appointment information
   * from event titles that match the "##AI Booked##" format.
   * 
   * @returns {Promise<Array>} Array of booking objects with patient and appointment details
   * 
   * @example
   * // Output:
   * [
   *   {
   *     patientPhone: "+1234567890",
   *     patientName: "John Doe",
   *     doctor: "Dr. [General Dentist 1]",
   *     startTime: Date(2024-01-15T10:00:00Z),
   *     endTime: Date(2024-01-15T10:30:00Z),
   *     calendarEventId: "event123",
   *     calendarId: "cal123@group.calendar.google.com"
   *   },
   *   {
   *     patientPhone: "+0987654321",
   *     patientName: "Jane Smith",
   *     doctor: "Dr. [Braces Dentist 2]",
   *     startTime: Date(2024-01-16T14:00:00Z),
   *     endTime: Date(2024-01-16T14:45:00Z),
   *     calendarEventId: "event456",
   *     calendarId: "cal456@group.calendar.google.com"
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
          // Parse patient info from event title
          const title = event.summary || '';
          if (title.includes('##AI Booked##')) {
            const match = title.match(/##AI Booked##\s+(.+?)\s+(.+?)\s+(.+?)\s+(.+)/);
            if (match) {
              const [, doctorName, patientName, treatment, phone] = match;
              bookings.push({
                patientPhone: phone.trim(),
                patientName: patientName.trim(),
                doctor: doctorName.trim(),
                startTime: new Date(event.start.dateTime || event.start.date),
                endTime: new Date(event.end.dateTime || event.end.date),
                calendarEventId: event.id,
                calendarId,
              });
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching bookings for ${doctor}:`, error);
      }
    }

    return bookings;
  }

  /**
   * Finds a booking by patient's phone number.
   * Searches through all bookings to find a match for the given phone number.
   * 
   * @param {string} phone - Patient's phone number
   * @returns {Promise<Object|undefined>} Booking object if found, undefined otherwise
   * 
   * @example
   * // Input:
   * await findBookingByPhone("+1234567890")
   * 
   * // Output:
   * {
   *   patientPhone: "+1234567890",
   *   patientName: "John Doe",
   *   doctor: "Dr. [General Dentist 1]",
   *   startTime: Date(2024-01-15T10:00:00Z),
   *   endTime: Date(2024-01-15T10:30:00Z),
   *   calendarEventId: "event123",
   *   calendarId: "cal123@group.calendar.google.com"
   * }
   * 
   * @example
   * // If not found:
   * await findBookingByPhone("+9999999999")
   * // Output: undefined
   */
  async findBookingByPhone(phone) {
    const bookings = await this.getAllBookings();
    return bookings.find(booking => booking.patientPhone === phone);
  }
}

export const googleCalendarService = new GoogleCalendarService();

