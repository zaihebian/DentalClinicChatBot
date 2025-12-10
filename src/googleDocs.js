/**
 * Google Docs Service module for retrieving pricing information.
 * 
 * Handles reading pricing data from a Google Document. Provides methods to
 * retrieve full pricing information or search for specific treatment pricing.
 * Uses read-only permissions (service account only needs to view the document).
 * 
 * Key features:
 * - Retrieves full pricing document content
 * - Searches for specific treatment pricing
 * - Returns formatted text for display to users
 * - Graceful error handling with user-friendly messages
 * 
 * @module googleDocs
 */

import { google } from 'googleapis';
import { config } from './config.js';

/**
 * GoogleDocsService class handles all Google Docs API operations.
 * 
 * This is a singleton class that manages authentication and provides methods
 * for retrieving pricing information from Google Docs. Uses service account
 * authentication with document read-only permissions.
 * 
 * Authentication:
 * - Uses JWT (JSON Web Token) with service account credentials
 * - Requires GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY
 * - Scopes: https://www.googleapis.com/auth/documents.readonly
 * 
 * @class GoogleDocsService
 */
class GoogleDocsService {
  /**
   * Initializes the GoogleDocsService.
   * Sets up authentication and Docs API client.
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
    this.docs = null;
    this.initializeAuth();
  }

  /**
   * Initializes Google Docs API authentication using JWT (JSON Web Token).
   * 
   * Sets up service account authentication with document read-only permissions.
   * Creates a JWT auth client using service account email and private key from config.
   * Initializes the Google Docs API client (v1) with the authenticated client.
   * 
   * Authentication requirements:
   * - GOOGLE_SERVICE_ACCOUNT_EMAIL: Service account email
   * - GOOGLE_PRIVATE_KEY: Private key (with \n characters preserved)
   * - Docs API must be enabled in Google Cloud Console
   * - Service account must have Viewer permission on the document
   * 
   * @throws {Error} If authentication initialization fails (logged to console)
   * 
   * @example
   * // Called automatically during construction
   * // Sets up this.auth (JWT client) and this.docs (API client)
   * // Ready for API calls after this
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
   * 
   * Extracts text content from the document and returns it as a string. Parses
   * the document structure (paragraphs, text runs) to extract all text content.
   * Returns user-friendly error message if retrieval fails.
   * 
   * Document parsing:
   * - Iterates through document body content
   * - Extracts text from paragraph elements
   * - Concatenates all text runs into single string
   * - Preserves line breaks and formatting
   * 
   * Edge cases:
   * - Empty document → returns empty string
   * - API error → returns error message (doesn't throw)
   * - Missing document ID → returns error message
   * - Permission denied → returns error message
   * 
   * @returns {Promise<string>} Full text content of the pricing document, or error message on failure
   * 
   * @example
   * // Successful retrieval:
   * await getPricingInfo()
   * // Output:
   * // "Cleaning: $50\nFilling: $100 per tooth\nBraces Maintenance: $75\nConsultation: $30"
   * 
   * @example
   * // API error (document not found):
   * await getPricingInfo()
   * // Output: "Sorry, I am unable to retrieve pricing information at the moment. Please contact the receptionist for details."
   * // Error logged to console
   * 
   * @example
   * // Permission error:
   * // If service account doesn't have access:
   * // Output: Error message (logged to console)
   * // Returns: "Sorry, I am unable to retrieve pricing information..."
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
   * 
   * Filters the document content to find lines containing the treatment type
   * or pricing keywords. Uses simple text matching (case-insensitive) to find
   * relevant lines. Returns first 500 characters of full document if no match found.
   * 
   * Search logic:
   * 1. Retrieves full document text
   * 2. Splits into lines
   * 3. Filters lines containing: treatment type (case-insensitive), "price", or "cost"
   * 4. Returns matching lines joined with newlines
   * 5. If no matches, returns first 500 characters of full document
   * 
   * Edge cases:
   * - Case-insensitive matching (e.g., "cleaning" matches "Cleaning")
   * - Multiple matches → all matching lines returned
   * - No matches → returns first 500 chars (fallback)
   * - Empty document → returns empty string
   * 
   * @param {string} treatmentType - Treatment type to search for (e.g., "Cleaning", "Filling")
   * @returns {Promise<string>} Relevant pricing text for the treatment, or first 500 chars of document
   * 
   * @example
   * // Treatment found:
   * await getTreatmentPricing("Cleaning")
   * // Output:
   * // "Cleaning: $50\nRegular cleaning includes scaling and polishing."
   * 
   * @example
   * // Multiple matching lines:
   * // If document has multiple lines mentioning "Cleaning":
   * // Output: All matching lines joined with newlines
   * 
   * @example
   * // Treatment not found (fallback):
   * await getTreatmentPricing("Unknown Treatment")
   * // Output: First 500 characters of the full document
   * 
   * @example
   * // Case-insensitive:
   * await getTreatmentPricing("cleaning")  // lowercase
   * // Output: Same as "Cleaning" (case-insensitive match)
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

