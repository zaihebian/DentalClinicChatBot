/**
 * Treatment Logic module for detecting and processing treatment-related information.
 * 
 * Handles treatment type detection, dentist assignment, duration calculations,
 * and validation of treatment-dentist compatibility. Provides business logic
 * for determining which dentists can handle which treatments and how long
 * treatments take.
 * 
 * Key features:
 * - Keyword-based treatment detection (fallback when AI extraction unavailable)
 * - Dentist type categorization (braces vs general)
 * - Treatment duration calculation (including variable durations for fillings)
 * - Dentist-treatment compatibility validation
 * 
 * Note: This module provides fallback/helper functions. Primary treatment detection
 * is now handled by AI in openaiHandler.js, but these functions remain for
 * validation and fallback scenarios.
 * 
 * @module treatmentLogic
 */

import { TREATMENT_TYPES, DENTIST_ASSIGNMENTS } from './config.js';

/**
 * Detects treatment type from user message using keyword matching.
 * 
 * Analyzes the message text to identify the type of dental treatment requested.
 * Uses simple keyword matching as a fallback when AI extraction is unavailable.
 * This is a less sophisticated method than AI extraction but provides reliability.
 * 
 * Detection priority:
 * 1. "cleaning" or "clean" → Cleaning
 * 2. "filling" or "fill" → Filling
 * 3. "braces" or "brace" → Braces Maintenance
 * 4. Default → Consultation
 * 
 * Edge cases:
 * - Case-insensitive matching
 * - Partial word matching (e.g., "cleaning" matches "clean")
 * - Defaults to Consultation if no keywords found
 * 
 * @param {string} userMessage - User's message text
 * @returns {string} Treatment type constant from TREATMENT_TYPES
 * 
 * @example
 * // Cleaning detection:
 * detectTreatmentType("I need a cleaning")
 * // Output: "Cleaning"
 * 
 * @example
 * // Braces detection:
 * detectTreatmentType("I want braces maintenance")
 * // Output: "Braces Maintenance"
 * 
 * @example
 * // Filling detection:
 * detectTreatmentType("I need a filling")
 * // Output: "Filling"
 * 
 * @example
 * // Default (no keywords found):
 * detectTreatmentType("I have a toothache")
 * // Output: "Consultation" (default fallback)
 * 
 * @example
 * // Case insensitive:
 * detectTreatmentType("I NEED CLEANING")
 * // Output: "Cleaning"
 * 
 * @example
 * // Partial match:
 * detectTreatmentType("I want to clean my teeth")
 * // Output: "Cleaning" (matches "clean")
 */
export function detectTreatmentType(userMessage) {
  const message = userMessage.toLowerCase();
  
  if (message.includes('cleaning') || message.includes('clean')) {
    return TREATMENT_TYPES.CLEANING;
  }
  
  if (message.includes('filling') || message.includes('fill')) {
    return TREATMENT_TYPES.FILLING;
  }
  
  if (message.includes('braces') || message.includes('brace')) {
    return TREATMENT_TYPES.BRACES_MAINTENANCE;
  }
  
  // Default to consultation if unsure
  return TREATMENT_TYPES.CONSULTATION;
}

/**
 * Determines dentist category (braces or general) based on treatment type.
 * 
 * Used to filter which dentists can handle a specific treatment. This is a
 * business rule: braces treatments require braces specialists, while all other
 * treatments can be handled by general dentists.
 * 
 * Mapping:
 * - Braces Maintenance → 'braces'
 * - All other treatments (Cleaning, Filling, Consultation) → 'general'
 * 
 * @param {string} treatmentType - Treatment type constant from TREATMENT_TYPES
 * @returns {string} 'braces' or 'general'
 * 
 * @example
 * // Braces treatment:
 * getDentistType("Braces Maintenance")
 * // Output: "braces"
 * 
 * @example
 * // General treatments:
 * getDentistType("Cleaning")
 * // Output: "general"
 * 
 * @example
 * getDentistType("Filling")
 * // Output: "general"
 * 
 * @example
 * getDentistType("Consultation")
 * // Output: "general"
 */
export function getDentistType(treatmentType) {
  if (treatmentType === TREATMENT_TYPES.BRACES_MAINTENANCE) {
    return 'braces';
  }
  return 'general';
}

/**
 * Gets the list of available dentists for a specific treatment type.
 * 
 * Returns dentists that are qualified to handle the given treatment based on
 * the dentist category (braces vs general). This is used to filter available
 * options when presenting dentist choices to users.
 * 
 * Logic:
 * 1. Determines dentist type (braces or general) from treatment type
 * 2. Returns corresponding dentist list from DENTIST_ASSIGNMENTS
 * 3. Returns empty array if treatment type is invalid
 * 
 * @param {string} treatmentType - Treatment type constant from TREATMENT_TYPES
 * @returns {string[]} Array of dentist names that can handle this treatment
 * 
 * @example
 * // Braces treatment:
 * getAvailableDentists("Braces Maintenance")
 * // Output: ["Dr BracesA", "Dr BracesB"]
 * 
 * @example
 * // General treatments:
 * getAvailableDentists("Cleaning")
 * // Output: ["Dr GeneralA", "Dr GeneralB"]
 * 
 * @example
 * getAvailableDentists("Filling")
 * // Output: ["Dr GeneralA", "Dr GeneralB"]
 * 
 * @example
 * // Invalid treatment type:
 * getAvailableDentists("Unknown")
 * // Output: [] (empty array, no dentists available)
 */
export function getAvailableDentists(treatmentType) {
  const dentistType = getDentistType(treatmentType);
  return DENTIST_ASSIGNMENTS[dentistType] || [];
}

/**
 * Calculates treatment duration in minutes based on treatment type, dentist, and number of teeth.
 * 
 * Implements business rules for different treatment durations. This is critical
 * for scheduling as it determines how long an appointment slot needs to be.
 * 
 * Duration rules:
 * - Consultation: 15 minutes (fixed)
 * - Cleaning: 30 minutes (fixed)
 * - Braces Maintenance: 45 min (Dr BracesB), 15 min (Dr BracesA)
 * - Filling: 30 min (first tooth) + 15 min per additional tooth
 * - Default: 15 minutes (fallback)
 * 
 * Edge cases:
 * - Filling with null/undefined numberOfTeeth defaults to 15 minutes
 * - Invalid treatment type defaults to 15 minutes
 * - Dentist name only matters for Braces Maintenance
 * 
 * @param {string} treatmentType - Treatment type constant from TREATMENT_TYPES
 * @param {string} dentistName - Name of the dentist (only used for Braces Maintenance)
 * @param {number|null} [numberOfTeeth=null] - Number of teeth (for fillings only), null for other treatments
 * @returns {number} Duration in minutes (always positive integer)
 * 
 * @example
 * // Consultation (fixed duration):
 * calculateTreatmentDuration("Consultation", "Dr GeneralA")
 * // Output: 15
 * 
 * @example
 * // Cleaning (fixed duration):
 * calculateTreatmentDuration("Cleaning", "Dr GeneralB")
 * // Output: 30
 * 
 * @example
 * // Braces Maintenance - Dr BracesB (longer duration):
 * calculateTreatmentDuration("Braces Maintenance", "Dr BracesB")
 * // Output: 45
 * 
 * @example
 * // Braces Maintenance - Dr BracesA (shorter duration):
 * calculateTreatmentDuration("Braces Maintenance", "Dr BracesA")
 * // Output: 15
 * 
 * @example
 * // Filling - 1 tooth (base duration):
 * calculateTreatmentDuration("Filling", "Dr GeneralA", 1)
 * // Output: 30
 * 
 * @example
 * // Filling - 3 teeth (base + additional):
 * calculateTreatmentDuration("Filling", "Dr GeneralA", 3)
 * // Output: 60 (30 + (3-1)*15 = 30 + 30)
 * 
 * @example
 * // Filling - 5 teeth:
 * calculateTreatmentDuration("Filling", "Dr GeneralA", 5)
 * // Output: 90 (30 + (5-1)*15 = 30 + 60)
 * 
 * @example
 * // Filling without numberOfTeeth (defaults):
 * calculateTreatmentDuration("Filling", "Dr GeneralA", null)
 * // Output: 15 (default when teeth count not specified)
 * 
 * @example
 * // Invalid treatment type (defaults):
 * calculateTreatmentDuration("Unknown", "Dr GeneralA")
 * // Output: 15 (default fallback)
 */
export function calculateTreatmentDuration(treatmentType, dentistName, numberOfTeeth = null) {
  switch (treatmentType) {
    case TREATMENT_TYPES.CONSULTATION:
      return 15;
    
    case TREATMENT_TYPES.CLEANING:
      return 30;
    
    case TREATMENT_TYPES.BRACES_MAINTENANCE:
      if (dentistName === 'Dr BracesB') {
        return 45;
      } else if (dentistName === 'Dr BracesA') {
        return 15;
      }
      return 15; // Default
    
    case TREATMENT_TYPES.FILLING:
      if (numberOfTeeth === null || numberOfTeeth === undefined) {
        return 15; // Default if not specified
      }
      if (numberOfTeeth === 1) {
        return 30;
      }
      return 30 + (numberOfTeeth - 1) * 15;
    
    default:
      return 15;
  }
}

/**
 * Extracts the number of teeth from a user message.
 * 
 * Looks for numeric values in the message and validates they're within reasonable
 * range (1-32, human teeth count). Uses simple regex pattern matching to find
 * the first number in the message.
 * 
 * Validation:
 * - Must be a positive integer
 * - Must be between 1 and 32 (human teeth range)
 * - Returns null if no number found or outside range
 * 
 * Note: This is a fallback method. Primary extraction is now handled by AI
 * in openaiHandler.js, but this remains for validation and fallback scenarios.
 * 
 * Edge cases:
 * - Returns first number found (may not be teeth-related)
 * - Returns null if number is 0 or negative
 * - Returns null if number > 32
 * - Returns null if no number found
 * 
 * @param {string} message - User's message text
 * @returns {number|null} Number of teeth if found and valid (1-32), null otherwise
 * 
 * @example
 * // Valid number in range:
 * extractNumberOfTeeth("I need fillings for 3 teeth")
 * // Output: 3
 * 
 * @example
 * // Number at start of message:
 * extractNumberOfTeeth("2 teeth need filling")
 * // Output: 2
 * 
 * @example
 * // No number found:
 * extractNumberOfTeeth("I need a filling")
 * // Output: null
 * 
 * @example
 * // Number outside range (> 32):
 * extractNumberOfTeeth("50 teeth")
 * // Output: null (exceeds human teeth count)
 * 
 * @example
 * // Number at lower bound:
 * extractNumberOfTeeth("1 tooth")
 * // Output: 1
 * 
 * @example
 * // Number at upper bound:
 * extractNumberOfTeeth("32 teeth")
 * // Output: 32
 * 
 * @example
 * // Zero (invalid):
 * extractNumberOfTeeth("0 teeth")
 * // Output: null (must be > 0)
 */
export function extractNumberOfTeeth(message) {
  const numbers = message.match(/\d+/);
  if (numbers) {
    const num = parseInt(numbers[0], 10);
    if (num > 0 && num <= 32) { // Reasonable range
      return num;
    }
  }
  return null;
}

/**
 * Validates if a dentist is qualified to handle a specific treatment type.
 * 
 * Checks if the dentist is in the list of available dentists for that treatment.
 * This ensures business rules are enforced: braces dentists can only do braces
 * treatments, and general dentists can only do general treatments.
 * 
 * Validation logic:
 * 1. Gets available dentists for the treatment type
 * 2. Checks if dentist name is in that list
 * 3. Returns true if found, false otherwise
 * 
 * Use cases:
 * - Validating AI-extracted dentist names
 * - Preventing invalid dentist-treatment combinations
 * - Filtering dentist options in UI
 * 
 * @param {string} dentistName - Name of the dentist to validate
 * @param {string} treatmentType - Treatment type constant from TREATMENT_TYPES
 * @returns {boolean} True if dentist can handle the treatment, false otherwise
 * 
 * @example
 * // Valid braces dentist for braces treatment:
 * isValidDentistForTreatment("Dr BracesA", "Braces Maintenance")
 * // Output: true
 * 
 * @example
 * // Invalid: general dentist for braces treatment:
 * isValidDentistForTreatment("Dr GeneralA", "Braces Maintenance")
 * // Output: false (general dentists can't do braces)
 * 
 * @example
 * // Valid general dentist for general treatment:
 * isValidDentistForTreatment("Dr GeneralA", "Cleaning")
 * // Output: true
 * 
 * @example
 * // Invalid: braces dentist for general treatment:
 * isValidDentistForTreatment("Dr BracesA", "Cleaning")
 * // Output: false (braces dentists can't do general treatments)
 * 
 * @example
 * // Unknown dentist:
 * isValidDentistForTreatment("Dr. Unknown", "Cleaning")
 * // Output: false (not in available dentists list)
 */
export function isValidDentistForTreatment(dentistName, treatmentType) {
  const availableDentists = getAvailableDentists(treatmentType);
  return availableDentists.includes(dentistName);
}

