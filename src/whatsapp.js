/**
 * WhatsApp Service module for sending and receiving WhatsApp messages.
 * Handles WhatsApp Business API integration for messaging operations.
 * 
 * @module whatsapp
 */

import axios from 'axios';
import { config } from './config.js';

/**
 * WhatsAppService class handles all WhatsApp Business API operations.
 * Manages API configuration and provides methods for sending messages and parsing webhooks.
 */
class WhatsAppService {
  /**
   * Initializes the WhatsAppService.
   * Sets up API URL, phone number ID, and access token from configuration.
   */
  constructor() {
    this.apiUrl = config.whatsapp.apiUrl;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.accessToken = config.whatsapp.accessToken;
  }

  /**
   * Sends a text message to a phone number via WhatsApp Business API.
   * Uses the WhatsApp Graph API to send messages.
   * 
   * @param {string} phoneNumber - Recipient's phone number (with country code, e.g., "+1234567890")
   * @param {string} message - Message text to send
   * @returns {Promise<Object>} Result object with success status and message ID
   * 
   * @example
   * // Input:
   * await sendMessage("+1234567890", "Hello! How can I help you?")
   * 
   * // Output:
   * {
   *   success: true,
   *   messageId: "wamid.ABC123..."
   * }
   * 
   * @example
   * // On error:
   * {
   *   success: false,
   *   error: { ... error details ... }
   * }
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
   * Validates the verify token matches the configured token and returns the challenge.
   * Used by WhatsApp to verify the webhook endpoint is valid.
   * 
   * @param {string} mode - Webhook mode (should be 'subscribe')
   * @param {string} token - Verify token from WhatsApp
   * @param {string} challenge - Challenge string from WhatsApp to return if verified
   * @returns {string|null} Challenge string if verified, null otherwise
   * 
   * @example
   * // Input (valid):
   * verifyWebhook("subscribe", "my_verify_token", "challenge123")
   * // Output: "challenge123"
   * 
   * @example
   * // Input (invalid token):
   * verifyWebhook("subscribe", "wrong_token", "challenge123")
   * // Output: null
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
      return challenge;
    }
    return null;
  }

  /**
   * Parses incoming WhatsApp webhook message payload.
   * Extracts phone number, message text, message ID, and timestamp from webhook body.
   * 
   * @param {Object} body - Webhook request body from WhatsApp
   * @param {Object} [body.entry] - Webhook entry array
   * @param {Object} [body.entry[0].changes] - Changes array
   * @param {Object} [body.entry[0].changes[0].value.messages] - Messages array
   * @returns {Object|null} Parsed message object, or null if parsing fails
   * 
   * @example
   * // Input:
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
   * 
   * // Output:
   * {
   *   phoneNumber: "+1234567890",
   *   messageText: "Hello",
   *   messageId: "msg123",
   *   timestamp: "1234567890"
   * }
   * 
   * @example
   * // If no message found:
   * parseWebhookMessage({ entry: [] })
   * // Output: null
   */
  parseWebhookMessage(body) {
    try {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (!message) {
        return null;
      }

      const phoneNumber = message.from;
      const messageText = message.text?.body || '';
      const messageId = message.id;
      const timestamp = message.timestamp;

      return {
        phoneNumber,
        messageText,
        messageId,
        timestamp,
      };
    } catch (error) {
      console.error('Error parsing webhook message:', error);
      return null;
    }
  }
}

export const whatsappService = new WhatsAppService();

