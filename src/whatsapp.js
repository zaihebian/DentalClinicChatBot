/**
 * WhatsApp Service module for sending and receiving WhatsApp messages.
 * 
 * Handles WhatsApp Business API integration for messaging operations. Provides
 * methods for sending messages, verifying webhooks, and parsing incoming webhook
 * payloads. Uses WhatsApp Graph API (v18.0) for all operations.
 * 
 * Key features:
 * - Sends text messages to phone numbers
 * - Verifies webhook during setup
 * - Parses incoming webhook messages
 * - Error handling with detailed logging
 * 
 * API requirements:
 * - WhatsApp Business API account
 * - Phone Number ID
 * - Access Token (with messages.send permission)
 * - Verify Token (for webhook verification)
 * 
 * @module whatsapp
 */

import axios from 'axios';
import { config } from './config.js';

/**
 * WhatsAppService class handles all WhatsApp Business API operations.
 * 
 * This is a singleton class that manages API configuration and provides methods
 * for sending messages and parsing webhooks. Uses WhatsApp Graph API for all
 * communication with WhatsApp Business API.
 * 
 * Configuration:
 * - API URL: https://graph.facebook.com/v18.0 (default)
 * - Phone Number ID: From WhatsApp Business API
 * - Access Token: OAuth token with messages.send permission
 * - Verify Token: Custom token for webhook verification
 * 
 * @class WhatsAppService
 */
class WhatsAppService {
  /**
   * Initializes the WhatsAppService.
   * Sets up API URL, phone number ID, and access token from configuration.
   * 
   * Reads configuration from config.whatsapp object. These values are set
   * from environment variables during application startup.
   * 
   * @example
   * // Called automatically when module is imported
   * // Sets up API configuration, ready for sending messages
   */
  constructor() {
    this.apiUrl = config.whatsapp.apiUrl;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.accessToken = config.whatsapp.accessToken;
  }

  /**
   * Sends a text message to a phone number via WhatsApp Business API.
   * 
   * Uses the WhatsApp Graph API to send text messages. Sends POST request to
   * `/v18.0/{phone-number-id}/messages` endpoint with message payload.
   * Returns success status and message ID for tracking.
   * 
   * Message format:
   * - Type: 'text'
   * - Body: Plain text message (no formatting)
   * - Recipient: Phone number with country code (e.g., "+1234567890")
   * 
   * Error handling:
   * - API errors are caught and returned as { success: false, error: ... }
   * - Errors are logged to console with full details
   * - Common errors: invalid phone number, rate limiting, expired token
   * 
   * @param {string} phoneNumber - Recipient's phone number (with country code, e.g., "+1234567890")
   * @param {string} message - Message text to send (plain text, no markdown)
   * @returns {Promise<Object>} Result object with success status and message ID
   * @returns {boolean} returns.success - True if message sent successfully
   * @returns {string} [returns.messageId] - WhatsApp message ID (if successful, e.g., "wamid.ABC123...")
   * @returns {Object|string} [returns.error] - Error details (if failed)
   * 
   * @example
   * // Successful send:
   * await sendMessage("+1234567890", "Hello! How can I help you?")
   * // Output:
   * // {
   * //   success: true,
   * //   messageId: "wamid.ABC123XYZ..."
   * // }
   * 
   * @example
   * // Invalid phone number:
   * await sendMessage("invalid", "Hello")
   * // Output:
   * // {
   * //   success: false,
   * //   error: { message: "Invalid phone number", ... }
   * // }
   * // Error logged to console
   * 
   * @example
   * // Expired access token:
   * // Output:
   * // {
   * //   success: false,
   * //   error: { message: "Invalid OAuth access token", ... }
   * // }
   * 
   * @example
   * // Rate limiting:
   * // Output:
   * // {
   * //   success: false,
   * //   error: { message: "Rate limit exceeded", ... }
   * // }
   */
  async sendMessage(phoneNumber, message) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'text',
          text: {
            body: message,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.messages[0]?.id,
      };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Verifies WhatsApp webhook during initial setup.
   * 
   * Validates the verify token matches the configured token and returns the challenge.
   * Used by WhatsApp to verify the webhook endpoint is valid during webhook setup.
   * This is part of the webhook verification flow required by WhatsApp Business API.
   * 
   * Verification process:
   * 1. WhatsApp sends GET request with mode, token, and challenge
   * 2. This method checks if mode is 'subscribe' and token matches
   * 3. If valid, returns challenge string (WhatsApp verifies this)
   * 4. If invalid, returns null (WhatsApp rejects webhook)
   * 
   * Security:
   * - Token must match WHATSAPP_VERIFY_TOKEN exactly
   * - Mode must be 'subscribe' (other modes ignored)
   * - Challenge is returned as-is (no modification)
   * 
   * @param {string} mode - Webhook mode (should be 'subscribe' for verification)
   * @param {string} token - Verify token from WhatsApp (query parameter)
   * @param {string} challenge - Challenge string from WhatsApp to return if verified
   * @returns {string|null} Challenge string if verified, null if verification fails
   * 
   * @example
   * // Valid verification:
   * verifyWebhook("subscribe", "my_verify_token", "challenge123")
   * // Output: "challenge123" (returned to WhatsApp, webhook verified)
   * 
   * @example
   * // Invalid token:
   * verifyWebhook("subscribe", "wrong_token", "challenge123")
   * // Output: null (webhook rejected)
   * 
   * @example
   * // Wrong mode:
   * verifyWebhook("unsubscribe", "my_verify_token", "challenge123")
   * // Output: null (only 'subscribe' mode is accepted)
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Parses incoming WhatsApp webhook message payload.
   * 
   * Extracts phone number, message text, message ID, and timestamp from webhook body.
   * Handles the nested structure of WhatsApp webhook payloads using optional chaining
   * to safely access nested properties. Returns null if message structure is invalid.
   * 
   * Webhook structure:
   * - body.entry[0].changes[0].value.messages[0] contains the message
   * - Only text messages are supported (other types ignored)
   * - Extracts: from (phone), text.body (message), id (message ID), timestamp
   * 
   * Edge cases:
   * - Missing message → returns null
   * - Invalid structure → returns null (error logged)
   * - Non-text messages → returns null (only text supported)
   * - Multiple messages → returns first message only
   * 
   * @param {Object} body - Webhook request body from WhatsApp
   * @param {Object} [body.entry] - Webhook entry array (usually has 1 entry)
   * @param {Object} [body.entry[0].changes] - Changes array (usually has 1 change)
   * @param {Object} [body.entry[0].changes[0].value] - Change value object
   * @param {Object[]} [body.entry[0].changes[0].value.messages] - Messages array
   * @param {Object} [body.entry[0].changes[0].value.messages[0]] - First message object
   * @param {string} [body.entry[0].changes[0].value.messages[0].from] - Sender phone number
   * @param {Object} [body.entry[0].changes[0].value.messages[0].text] - Text message object
   * @param {string} [body.entry[0].changes[0].value.messages[0].text.body] - Message text
   * @param {string} [body.entry[0].changes[0].value.messages[0].id] - Message ID
   * @param {string} [body.entry[0].changes[0].value.messages[0].timestamp] - Message timestamp
   * @returns {Object|null} Parsed message object, or null if parsing fails
   * @returns {string} [returns.phoneNumber] - Sender's phone number (with country code)
   * @returns {string} [returns.messageText] - Message text content
   * @returns {string} [returns.messageId] - WhatsApp message ID
   * @returns {string} [returns.timestamp] - Message timestamp (Unix timestamp string)
   * 
   * @example
   * // Valid webhook payload:
   * parseWebhookMessage({
   *   entry: [{
   *     changes: [{
   *       value: {
   *         messages: [{
   *           from: "+1234567890",
   *           text: { body: "Hello" },
   *           id: "msg123",
   *           timestamp: "1234567890"
   *         }]
   *       }
   *     }]
   *   }]
   * })
   * // Output:
   * // {
   * //   phoneNumber: "+1234567890",
   * //   messageText: "Hello",
   * //   messageId: "msg123",
   * //   timestamp: "1234567890"
   * // }
   * 
   * @example
   * // No message in payload:
   * parseWebhookMessage({ entry: [] })
   * // Output: null (no message to parse)
   * 
   * @example
   * // Invalid structure:
   * parseWebhookMessage({})
   * // Output: null (error logged to console)
   * 
   * @example
   * // Non-text message (image, video, etc.):
   * // If messages[0] has no 'text' property:
   * // Output: null (only text messages supported)
   */
  parseWebhookMessage(body) {
    try {
      console.log('🔍 parseWebhookMessage - Starting parsing...');
      const entry = body.entry?.[0];
      console.log('  - entry:', entry ? 'exists' : 'missing');
      
      const changes = entry?.changes?.[0];
      console.log('  - changes:', changes ? 'exists' : 'missing');
      
      const value = changes?.value;
      console.log('  - value:', value ? 'exists' : 'missing');
      if (value) {
        console.log('  - value keys:', Object.keys(value));
      }
      
      const message = value?.messages?.[0];
      console.log('  - message:', message ? 'exists' : 'missing');
      
      if (message) {
        console.log('  - message keys:', Object.keys(message));
        console.log('  - message type:', message.type);
        console.log('  - has text:', !!message.text);
      }

      if (!message) {
        console.log('⚠️ No message found in webhook payload');
        return null;
      }

      const phoneNumber = message.from;
      const messageText = message.text?.body || '';
      const messageId = message.id;
      const timestamp = message.timestamp;

      console.log('✅ Message parsed:', { phoneNumber, messageText, messageId, timestamp });

      return {
        phoneNumber,
        messageText,
        messageId,
        timestamp,
      };
    } catch (error) {
      console.error('❌ Error parsing webhook message:', error);
      console.error('Error stack:', error.stack);
      return null;
    }
  }
}

export const whatsappService = new WhatsAppService();

