/**
 * Google Docs Service module for retrieving pricing information.
 * Handles reading pricing data from a Google Document.
 * 
 * @module googleDocs
 */

import { google } from 'googleapis';
import { config } from './config.js';

/**
 * GoogleDocsService class handles all Google Docs API operations.
 * Manages authentication and provides methods for retrieving pricing information.
 */
class GoogleDocsService {
  /**
   * Initializes the GoogleDocsService.
   * Sets up authentication and Docs API client.
   */
  constructor() {
    this.auth = null;
    this.docs = null;
    this.initializeAuth();
  }

  /**
   * Initializes Google Docs API authentication using JWT (JSON Web Token).
   * Sets up service account authentication with document read-only permissions.
   * 
   * @throws {Error} If authentication initialization fails
   */
  initializeAuth() {
    try {
      this.auth = new google.auth.JWT(
        config.google.serviceAccountEmail,
        null,
        config.google.privateKey,
        ['https://www.googleapis.com/auth/documents.readonly']
      );
      this.docs = google.docs({ version: 'v1', auth: this.auth });
    } catch (error) {
      console.error('Error initializing Google Docs auth:', error);
      throw error;
    }
  }

  /**
   * Retrieves all pricing information from the configured Google Document.
   * Extracts text content from the document and returns it as a string.
   * 
   * @returns {Promise<string>} Full text content of the pricing document, or error message on failure
   * 
   * @example
   * // Input:
   * await getPricingInfo()
   * 
   * // Output:
   * "Cleaning: $50\nFilling: $100 per tooth\nBraces Maintenance: $75\nConsultation: $30"
   * 
   * @example
   * // On error:
   * "Sorry, I am unable to retrieve pricing information at the moment. Please contact the receptionist for details."
   */
  async getPricingInfo() {
    try {
      const response = await this.docs.documents.get({
        documentId: config.docs.docId,
      });

      // Extract text content from the document
      const content = response.data.body.content || [];
      let text = '';

      for (const element of content) {
        if (element.paragraph) {
          for (const textElement of element.paragraph.elements || []) {
            if (textElement.textRun) {
              text += textElement.textRun.content;
            }
          }
        }
      }

      return text;
    } catch (error) {
      console.error('Error fetching pricing from Google Docs:', error);
      return 'Sorry, I am unable to retrieve pricing information at the moment. Please contact the receptionist for details.';
    }
  }

  /**
   * Searches for pricing information related to a specific treatment type.
   * Filters the document content to find lines containing the treatment type or pricing keywords.
   * Returns relevant lines if found, otherwise returns first 500 characters of full document.
   * 
   * @param {string} treatmentType - Treatment type to search for (e.g., "Cleaning", "Filling")
   * @returns {Promise<string>} Relevant pricing text for the treatment, or first 500 chars of document
   * 
   * @example
   * // Input:
   * await getTreatmentPricing("Cleaning")
   * 
   * // Output:
   * "Cleaning: $50\nRegular cleaning includes scaling and polishing."
   * 
   * @example
   * // If treatment not found, returns first 500 chars:
   * await getTreatmentPricing("Unknown Treatment")
   * // Output: First 500 characters of the full document
   */
  async getTreatmentPricing(treatmentType) {
    const fullText = await this.getPricingInfo();
    
    // Simple search for treatment type in the document
    const treatmentLower = treatmentType.toLowerCase();
    const lines = fullText.split('\n');
    
    const relevantLines = lines.filter(line => 
      line.toLowerCase().includes(treatmentLower) || 
      line.toLowerCase().includes('price') ||
      line.toLowerCase().includes('cost')
    );

    if (relevantLines.length > 0) {
      return relevantLines.join('\n');
    }

    return fullText.substring(0, 500); // Return first 500 chars if no specific match
  }
}

export const googleDocsService = new GoogleDocsService();

