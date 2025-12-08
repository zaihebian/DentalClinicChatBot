/**
 * Treatment Logic module for detecting and processing treatment-related information.
 * Handles treatment type detection, dentist assignment, and duration calculations.
 * 
 * @module treatmentLogic
 */

import { TREATMENT_TYPES, DENTIST_ASSIGNMENTS } from './config.js';

/**
 * Detects treatment type from user message using keyword matching.
 * Analyzes the message text to identify the type of dental treatment requested.
 * 
 * @param {string} userMessage - User's message text
 * @returns {string} Treatment type constant (from TREATMENT_TYPES)
 * 
 * @example
 * // Input:
 * detectTreatmentType("I need a cleaning")
 * // Output: "Cleaning"
 * 
 * @example
 * // Input:
 * detectTreatmentType("I want braces maintenance")
 * // Output: "Braces Maintenance"
 * 
 * @example
 * // Input:
 * detectTreatmentType("I need a filling")
 * // Output: "Filling"
 * 
 * @example
 * // Input:
 * detectTreatmentType("I have a toothache")
 * // Output: "Consultation" (default)
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
 * Used to filter which dentists can handle a specific treatment.
 * 
 * @param {string} treatmentType - Treatment type constant
 * @returns {string} 'braces' or 'general'
 * 
 * @example
 * // Input:
 * getDentistType("Braces Maintenance")
 * // Output: "braces"
 * 
 * @example
 * // Input:
 * getDentistType("Cleaning")
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
 * Returns dentists that are qualified to handle the given treatment.
 * 
 * @param {string} treatmentType - Treatment type constant
 * @returns {string[]} Array of dentist names
 * 
 * @example
 * // Input:
 * getAvailableDentists("Braces Maintenance")
 * // Output: ["Dr. Denis", "Dr. Maria Gorete"]
 * 
 * @example
 * // Input:
 * getAvailableDentists("Cleaning")
 * // Output: ["Dr. Jinho", "Dr. Harry", "Dr. Grace", "Dr. Vicky"]
 */
export function getAvailableDentists(treatmentType) {
  const dentistType = getDentistType(treatmentType);
  return DENTIST_ASSIGNMENTS[dentistType] || [];
}

/**
 * Calculates treatment duration in minutes based on treatment type, dentist, and number of teeth.
 * Implements business rules for different treatment durations.
 * 
 * @param {string} treatmentType - Treatment type constant
 * @param {string} dentistName - Name of the dentist
 * @param {number|null} numberOfTeeth - Number of teeth (for fillings), null for other treatments
 * @returns {number} Duration in minutes
 * 
 * @example
 * // Consultation:
 * calculateTreatmentDuration("Consultation", "Dr. Jinho")
 * // Output: 15
 * 
 * @example
 * // Cleaning:
 * calculateTreatmentDuration("Cleaning", "Dr. Harry")
 * // Output: 30
 * 
 * @example
 * // Braces Maintenance - Dr. Maria Gorete:
 * calculateTreatmentDuration("Braces Maintenance", "Dr. Maria Gorete")
 * // Output: 45
 * 
 * @example
 * // Braces Maintenance - Dr. Denis:
 * calculateTreatmentDuration("Braces Maintenance", "Dr. Denis")
 * // Output: 15
 * 
 * @example
 * // Filling - 1 tooth:
 * calculateTreatmentDuration("Filling", "Dr. Grace", 1)
 * // Output: 30
 * 
 * @example
 * // Filling - 3 teeth:
 * calculateTreatmentDuration("Filling", "Dr. Grace", 3)
 * // Output: 60 (30 + (3-1)*15)
 */
export function calculateTreatmentDuration(treatmentType, dentistName, numberOfTeeth = null) {
  switch (treatmentType) {
    case TREATMENT_TYPES.CONSULTATION:
      return 15;
    
    case TREATMENT_TYPES.CLEANING:
      return 30;
    
    case TREATMENT_TYPES.BRACES_MAINTENANCE:
      if (dentistName === 'Dr. Maria Gorete') {
        return 45;
      } else if (dentistName === 'Dr. Denis') {
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
 * Looks for numeric values in the message and validates they're within reasonable range (1-32).
 * 
 * @param {string} message - User's message text
 * @returns {number|null} Number of teeth if found and valid, null otherwise
 * 
 * @example
 * // Input:
 * extractNumberOfTeeth("I need fillings for 3 teeth")
 * // Output: 3
 * 
 * @example
 * // Input:
 * extractNumberOfTeeth("2 teeth need filling")
 * // Output: 2
 * 
 * @example
 * // Input:
 * extractNumberOfTeeth("I need a filling")
 * // Output: null (no number found)
 * 
 * @example
 * // Input:
 * extractNumberOfTeeth("50 teeth")
 * // Output: null (outside valid range 1-32)
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
 * Checks if the dentist is in the list of available dentists for that treatment.
 * 
 * @param {string} dentistName - Name of the dentist
 * @param {string} treatmentType - Treatment type constant
 * @returns {boolean} True if dentist can handle the treatment, false otherwise
 * 
 * @example
 * // Input:
 * isValidDentistForTreatment("Dr. Denis", "Braces Maintenance")
 * // Output: true
 * 
 * @example
 * // Input:
 * isValidDentistForTreatment("Dr. Jinho", "Braces Maintenance")
 * // Output: false
 * 
 * @example
 * // Input:
 * isValidDentistForTreatment("Dr. Grace", "Cleaning")
 * // Output: true
 */
export function isValidDentistForTreatment(dentistName, treatmentType) {
  const availableDentists = getAvailableDentists(treatmentType);
  return availableDentists.includes(dentistName);
}

