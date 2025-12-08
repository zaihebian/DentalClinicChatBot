/**
 * Main application entry point for the AI Dental Receptionist.
 * Sets up Express server, webhook endpoints for WhatsApp, and handles all incoming messages.
 * 
 * @module index
 */

import express from 'express';
import { config, validateConfig } from './config.js';
import { whatsappService } from './whatsapp.js';
import { openaiHandler } from './openaiHandler.js';
import { sessionManager } from './sessionManager.js';
import { googleSheetsService } from './googleSheets.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Health check endpoint.
 * Returns server status and current timestamp.
 * Useful for monitoring and load balancer health checks.
 * 
 * @route GET /health
 * @returns {Object} Status object with 'ok' status and ISO timestamp
 * 
 * @example
 * // Request: GET /health
 * // Response:
 * {
 *   "status": "ok",
 *   "timestamp": "2024-01-15T10:30:00.000Z"
 * }
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * WhatsApp webhook verification endpoint.
 * Used by WhatsApp to verify the webhook URL during initial setup.
 * Returns the challenge string if verification token matches.
 * 
 * @route GET /webhook
 * @param {string} req.query['hub.mode'] - Webhook mode (should be 'subscribe')
 * @param {string} req.query['hub.verify_token'] - Verification token from WhatsApp
 * @param {string} req.query['hub.challenge'] - Challenge string to return if verified
 * @returns {string|403} Challenge string if verified, 403 status if not
 * 
 * @example
 * // Request: GET /webhook?hub.mode=subscribe&hub.verify_token=my_token&hub.challenge=abc123
 * // Response (if token matches): "abc123"
 * // Response (if token doesn't match): 403 Forbidden
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verified = whatsappService.verifyWebhook(mode, token, challenge);
  
  if (verified) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/**
 * WhatsApp webhook handler endpoint.
 * Receives incoming messages from WhatsApp, processes them through the AI handler,
 * and sends responses back to users. Logs all conversations to Google Sheets.
 * 
 * @route POST /webhook
 * @param {Object} req.body - WhatsApp webhook payload
 * @param {string} req.body.object - Should be 'whatsapp_business_account'
 * @param {Object} req.body.entry - Webhook entry array with message data
 * @returns {200|500} 200 OK on success, 500 on error
 * 
 * @example
 * // Request body from WhatsApp:
 * {
 *   "object": "whatsapp_business_account",
 *   "entry": [{
 *     "changes": [{
 *       "value": {
 *         "messages": [{
 *           "from": "+1234567890",
 *           "text": { "body": "I want braces maintenance" },
 *           "id": "msg123"
 *         }]
 *       }
 *     }]
 *   }]
 * }
 * 
 * // Process flow:
 * // 1. Parse message from webhook
 * // 2. Log to Google Sheets
 * // 3. Generate AI response
 * // 4. Send response via WhatsApp
 * // 5. Return 200 OK
 */
app.post('/webhook', async (req, res) => {
  try {
    // Verify it's from WhatsApp
    if (req.body.object === 'whatsapp_business_account') {
      const messageData = whatsappService.parseWebhookMessage(req.body);
      
      if (messageData) {
        const { phoneNumber, messageText } = messageData;
        
        // Use phone number as conversation ID
        const conversationId = phoneNumber;
        
        // Log incoming message
        const session = sessionManager.getSession(conversationId);
        await googleSheetsService.logConversationTurn(
          conversationId,
          phoneNumber,
          'user',
          messageText,
          session
        );

        // Generate AI response
        const response = await openaiHandler.generateResponse(
          conversationId,
          messageText,
          phoneNumber
        );

        // Send response via WhatsApp
        await whatsappService.sendMessage(phoneNumber, response);

        res.status(200).send('OK');
      } else {
        res.status(200).send('OK'); // Not a message we handle
      }
    } else {
      res.status(200).send('OK');
    }
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error');
  }
});

/**
 * Initializes the application on startup.
 * Validates configuration, initializes Google Sheets, and prepares the system for operation.
 * Called automatically when the server starts.
 * 
 * @returns {Promise<void>}
 * @throws {Error} Exits process if initialization fails
 * 
 * @example
 * // Called automatically on server start
 * // Console output:
 * // "Initializing AI Dental Receptionist..."
 * // "Google Sheets initialized"
 * // "AI Dental Receptionist is ready!"
 */
async function initialize() {
  try {
    console.log('Initializing AI Dental Receptionist...');
    
    // Validate configuration
    if (!validateConfig()) {
      console.warn('Warning: Some configuration may be missing. Please check your .env file.');
    }

    // Initialize Google Sheets
    await googleSheetsService.initializeSheet();
    console.log('Google Sheets initialized');

    console.log('AI Dental Receptionist is ready!');
  } catch (error) {
    console.error('Error during initialization:', error);
    process.exit(1);
  }
}

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initialize();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  sessionManager.destroy();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  sessionManager.destroy();
  process.exit(0);
});

