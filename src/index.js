/**
 * Main application entry point for the AI Dental Receptionist.
 * 
 * Sets up Express server, webhook endpoints for WhatsApp, and handles all incoming messages.
 * This is the entry point that orchestrates all components: WhatsApp integration,
 * AI conversation handling, session management, and logging.
 * 
 * Server features:
 * - Express.js web server
 * - WhatsApp webhook endpoints (GET for verification, POST for messages)
 * - Health check endpoint
 * - Graceful shutdown handling
 * - Automatic initialization on startup
 * 
 * Request flow:
 * 1. WhatsApp sends webhook → POST /webhook
 * 2. Parse message → Extract phone number and text
 * 3. Log to Google Sheets → User message logged
 * 4. Generate AI response → openaiHandler.generateResponse()
 * 5. Send response → WhatsApp API
 * 6. Log to Google Sheets → Assistant response logged
 * 
 * @module index
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, validateConfig } from './config.js';
import { whatsappService } from './whatsapp.js';
import { openaiHandler } from './openaiHandler.js';
import { sessionManager } from './sessionManager.js';
import { googleSheetsService } from './googleSheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
// CORS - allow all origins (internal tool)
app.use(cors());
// Parse JSON request bodies (for webhook payloads)
app.use(express.json());
// Parse URL-encoded request bodies (for form data)
app.use(express.urlencoded({ extended: true }));

/**
 * Health check endpoint.
 * 
 * Returns server status and current timestamp. Useful for monitoring,
 * load balancer health checks, and uptime monitoring services.
 * Always returns 200 OK if server is running (doesn't check dependencies).
 * 
 * @route GET /health
 * @returns {Object} Status object with 'ok' status and ISO timestamp
 * @returns {string} returns.status - Always "ok" if endpoint is reachable
 * @returns {string} returns.timestamp - Current server time in ISO format
 * 
 * @example
 * // Request: GET /health
 * // Response (200 OK):
 * {
 *   "status": "ok",
 *   "timestamp": "2024-01-15T10:30:00.000Z"
 * }
 * 
 * @example
 * // Use case - Load balancer health check:
 * // Load balancer pings /health every 30 seconds
 * // If 200 OK, server is considered healthy
 * // If timeout/error, server is marked unhealthy
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Get all human-owned conversations
 * 
 * @route GET /api/conversations
 * @returns {Array} Array of conversation objects with owner === 'human'
 */
app.get('/api/conversations', (req, res) => {
  try {
    const allSessions = sessionManager.getAllSessions();
    console.log(`[DEBUG] /api/conversations - Total sessions in memory: ${allSessions.length}`);
    console.log(`[DEBUG] Session IDs:`, allSessions.map(s => s.conversationId));
    
    // Return ALL active conversations (both AI and human owned)
    const activeSessions = allSessions
      .filter(session => {
        const expired = sessionManager.isExpired(session);
        if (expired) {
          console.log(`[DEBUG] Session ${session.conversationId} is expired`);
        }
        return !expired;
      })
      .map(session => ({
        conversationId: session.conversationId,
        phone: session.phone,
        patientName: session.patientName,
        lastActivity: session.lastActivity,
        conversationHistory: session.conversationHistory,
        owner: session.owner || 'ai', // Default to 'ai' if not set
        handoverReason: session.handoverReason,
        handoverTimestamp: session.handoverTimestamp
      }))
      .sort((a, b) => b.lastActivity - a.lastActivity); // Most recent first
    
    console.log(`[DEBUG] Returning ${activeSessions.length} active sessions`);
    res.json(activeSessions);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Failed to fetch conversations', code: 'SERVER_ERROR' });
  }
});

/**
 * Get single conversation by ID
 * 
 * @route GET /api/conversations/:conversationId
 * @param {string} conversationId - Conversation ID (phone number)
 * @returns {Object} Conversation object or 404 if not found/expired
 */
app.get('/api/conversations/:conversationId', (req, res) => {
  try {
    const { conversationId } = req.params;
    const session = sessionManager.getSessionData(conversationId);
    
    if (!session) {
      return res.status(404).json({ error: 'Conversation not found', code: 'NOT_FOUND' });
    }
    
    if (sessionManager.isExpired(session)) {
      return res.status(404).json({ error: 'Conversation expired', code: 'EXPIRED' });
    }
    
    res.json({
      conversationId: session.conversationId,
      phone: session.phone,
      patientName: session.patientName,
      owner: session.owner,
      handoverReason: session.handoverReason,
      handoverTimestamp: session.handoverTimestamp,
      conversationHistory: session.conversationHistory,
      lastActivity: session.lastActivity,
      treatmentType: session.treatmentType,
      dentistName: session.dentistName,
      selectedSlot: session.selectedSlot
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: 'Failed to fetch conversation', code: 'SERVER_ERROR' });
  }
});

/**
 * Send human reply via WhatsApp
 * 
 * @route POST /api/human/reply
 * @param {string} conversationId - Conversation ID
 * @param {string} message - Message text to send
 * @returns {Object} Success response with messageId or error
 */
app.post('/api/human/reply', async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    
    if (!conversationId || !message) {
      return res.status(400).json({ error: 'Missing conversationId or message', code: 'BAD_REQUEST' });
    }
    
    const session = sessionManager.getSessionData(conversationId);
    
    if (!session) {
      return res.status(404).json({ error: 'Conversation not found', code: 'NOT_FOUND' });
    }
    
    if (sessionManager.isExpired(session)) {
      return res.status(404).json({ error: 'Conversation expired', code: 'EXPIRED' });
    }
    
    if (session.owner !== 'human') {
      return res.status(403).json({ error: 'Conversation not owned by human', code: 'FORBIDDEN' });
    }
    
    // Send message via WhatsApp
    const result = await whatsappService.sendMessage(session.phone || conversationId, message);
    
    if (!result.success) {
      return res.status(500).json({ 
        error: 'Failed to send message', 
        code: 'WHATSAPP_ERROR',
        details: result.error 
      });
    }
    
    // Add message to session history with owner: 'human'
    sessionManager.addMessage(conversationId, 'assistant', message, 'human');
    
    // Log to Google Sheets
    await googleSheetsService.logConversationTurn(
      conversationId,
      session.phone || conversationId,
      'assistant',
      message,
      session,
      'human'
    );
    
    res.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error('Error sending human reply:', error);
    res.status(500).json({ error: 'Failed to send reply', code: 'SERVER_ERROR' });
  }
});

/**
 * Handover conversation between AI and human
 * 
 * @route POST /api/handover
 * @param {string} conversationId - Conversation ID
 * @param {string} owner - New owner: 'ai' or 'human'
 * @param {string} [reason] - Optional reason for handover
 * @returns {Object} Updated session object
 */
app.post('/api/handover', async (req, res) => {
  try {
    const { conversationId, owner, reason } = req.body;
    
    if (!conversationId || !owner) {
      return res.status(400).json({ error: 'Missing conversationId or owner', code: 'BAD_REQUEST' });
    }
    
    if (owner !== 'ai' && owner !== 'human') {
      return res.status(400).json({ error: 'Invalid owner value. Must be "ai" or "human"', code: 'BAD_REQUEST' });
    }
    
    const session = sessionManager.getSessionData(conversationId);
    
    if (!session) {
      return res.status(404).json({ error: 'Conversation not found', code: 'NOT_FOUND' });
    }
    
    // Update session owner
    const handoverReason = reason || 'manual';
    sessionManager.updateSession(conversationId, {
      owner,
      handoverReason,
      handoverTimestamp: Date.now()
    });
    
    // Log handover to Google Sheets
    await googleSheetsService.logHandover(
      conversationId,
      session.phone || conversationId,
      owner,
      handoverReason,
      session
    );
    
    // Get updated session
    const updatedSession = sessionManager.getSessionData(conversationId);
    
    res.json({
      conversationId: updatedSession.conversationId,
      phone: updatedSession.phone,
      patientName: updatedSession.patientName,
      owner: updatedSession.owner,
      handoverReason: updatedSession.handoverReason,
      handoverTimestamp: updatedSession.handoverTimestamp
    });
  } catch (error) {
    console.error('Error handling handover:', error);
    res.status(500).json({ error: 'Failed to process handover', code: 'SERVER_ERROR' });
  }
});

/**
 * WhatsApp webhook verification endpoint.
 * 
 * Used by WhatsApp to verify the webhook URL during initial setup. This is
 * called once when configuring the webhook in WhatsApp Business API dashboard.
 * Returns the challenge string if verification token matches, otherwise 403.
 * 
   * Verification process:
   * 1. WhatsApp sends GET request with mode, verify_token, and challenge
   * 2. whatsappService.verifyWebhook() checks token
   * 3. If valid, returns challenge (200 OK)
   * 4. If invalid, returns 403 Forbidden
   * 
   * Security:
   * - Token must match WHATSAPP_VERIFY_TOKEN exactly
   * - Only 'subscribe' mode is accepted
   * - Challenge is returned as-is (no modification)
   * 
   * @route GET /webhook
   * @param {string} req.query['hub.mode'] - Webhook mode (should be 'subscribe')
   * @param {string} req.query['hub.verify_token'] - Verification token from WhatsApp
   * @param {string} req.query['hub.challenge'] - Challenge string to return if verified
   * @returns {string|403} Challenge string if verified (200 OK), 403 Forbidden if not
   * 
   * @example
   * // Valid verification:
   * // Request: GET /webhook?hub.mode=subscribe&hub.verify_token=my_token&hub.challenge=abc123
   * // Response (200 OK): "abc123"
   * // WhatsApp verifies challenge matches, webhook is active
   * 
   * @example
   * // Invalid token:
   * // Request: GET /webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=abc123
   * // Response (403 Forbidden): (empty body)
   * // WhatsApp rejects webhook, setup fails
   */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔍 Webhook verification attempt:', {
    mode,
    tokenReceived: token ? `***${token.slice(-4)}` : 'none',
    hasChallenge: !!challenge,
    timestamp: new Date().toISOString()
  });

  const verified = whatsappService.verifyWebhook(mode, token, challenge);
  
  if (verified) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

/**
 * WhatsApp webhook handler endpoint.
 * 
 * Receives incoming messages from WhatsApp, processes them through the AI handler,
 * and sends responses back to users. This is the main message processing endpoint.
 * Logs all conversations to Google Sheets for audit trail.
 * 
 * Processing flow:
 * 1. Verify webhook is from WhatsApp (check object === 'whatsapp_business_account')
 * 2. Parse message from webhook payload (extract phone number and text)
 * 3. Get or create session for phone number
 * 4. Log user message to Google Sheets
 * 5. Generate AI response (intent detection, information extraction, response generation)
 * 6. Send response via WhatsApp API
 * 7. Return 200 OK (always, even on errors, to prevent WhatsApp retries)
 * 
 * Error handling:
 * - Errors are caught and logged to console
 * - Always returns 200 OK (prevents WhatsApp from retrying)
 * - Failed messages are logged to Google Sheets with error status
 * - User receives error message if AI processing fails
 * 
 * Edge cases:
 * - Non-message webhooks (status updates, etc.) → Returns 200 OK, no processing
 * - Invalid webhook structure → Returns 200 OK, error logged
 * - WhatsApp API failure → Returns 200 OK, error logged, user may not receive response
 * 
 * @route POST /webhook
 * @param {Object} req.body - WhatsApp webhook payload
 * @param {string} req.body.object - Should be 'whatsapp_business_account' (verification)
 * @param {Object[]} req.body.entry - Webhook entry array with message data
 * @param {Object[]} [req.body.entry[0].changes] - Changes array
 * @param {Object} [req.body.entry[0].changes[0].value] - Change value with messages
 * @returns {200|500} 200 OK on success (always), 500 on critical error
 * 
 * @example
 * // Valid message webhook:
 * // Request body:
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
 * // Process: Parse → Log → AI Response → Send → 200 OK
 * 
 * @example
 * // Non-message webhook (status update):
 * // Request body: { "object": "whatsapp_business_account", "entry": [...] }
 * // No messages in payload
 * // Response: 200 OK (no processing, but acknowledged)
 * 
 * @example
 * // Error during processing:
 * // If AI API fails or WhatsApp send fails:
 * // Error logged to console
 * // Response: 200 OK (prevents WhatsApp retry)
 * // User may receive error message or no response
 */
app.post('/webhook', async (req, res) => {
  try {
    // Log full webhook payload for debugging
    console.log('📥 Webhook received:', {
      object: req.body.object,
      hasEntry: !!req.body.entry,
      entryCount: req.body.entry?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    // Log full payload structure (first 2000 chars to avoid huge logs)
    const payloadStr = JSON.stringify(req.body, null, 2);
    console.log('📋 Full webhook payload:', payloadStr.substring(0, 2000));
    
    // Verify it's from WhatsApp
    if (req.body.object === 'whatsapp_business_account') {
      const messageData = whatsappService.parseWebhookMessage(req.body);
      
      if (messageData) {
        const { phoneNumber, messageText } = messageData;
        console.log('💬 Message parsed successfully:', { phoneNumber, messageText });
        
        // Use phone number as conversation ID
        const conversationId = phoneNumber;
        
        // Log incoming message
        const session = sessionManager.getSession(conversationId);
        console.log(`[DEBUG] Webhook - Session created/retrieved for ${conversationId}`);
        console.log(`[DEBUG] Total sessions in memory: ${sessionManager.getAllSessions().length}`);
        await googleSheetsService.logConversationTurn(
          conversationId,
          phoneNumber,
          'user',
          messageText,
          session
        );

        // Check session owner - if human, skip AI processing
        if (session.owner === 'human') {
          console.log('👤 [HANDOVER] Session owned by human, skipping AI processing');
          // Just log the message, human will handle via inbox
          res.status(200).send('OK');
          return;
        }

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
        console.log('⚠️ Webhook received but no message data found');
        console.log('🔍 Debugging parseWebhookMessage:');
        console.log('  - entry exists:', !!req.body.entry?.[0]);
        console.log('  - changes exists:', !!req.body.entry?.[0]?.changes?.[0]);
        console.log('  - value exists:', !!req.body.entry?.[0]?.changes?.[0]?.value);
        console.log('  - messages exists:', !!req.body.entry?.[0]?.changes?.[0]?.value?.messages);
        console.log('  - first message:', req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]);
        res.status(200).send('OK'); // Not a message we handle
      }
    } else {
      console.log('⚠️ Webhook received but object is not whatsapp_business_account:', req.body.object);
      res.status(200).send('OK');
    }
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    console.error('Error stack:', error.stack);
    res.status(500).send('Error');
  }
});

/**
 * Initializes the application on startup.
 * 
 * Validates configuration, initializes Google Sheets, and prepares the system
 * for operation. Called automatically when the server starts listening.
 * 
 * Initialization steps:
 * 1. Logs startup message
 * 2. Validates configuration (checks required environment variables)
 * 3. Initializes Google Sheets (creates headers if sheet is empty)
 * 4. Logs ready message
 * 
 * Error handling:
 * - Configuration warnings are logged but don't stop startup
 * - Google Sheets initialization errors are logged but don't stop startup
 * - Critical errors exit process with code 1
 * 
 * @returns {Promise<void>} No return value
 * @throws {Error} Exits process with code 1 if critical initialization fails
 * 
 * @example
 * // Called automatically on server start
 * // Console output:
 * // "Initializing AI Dental Receptionist..."
 * // "Google Sheets initialized"
 * // "AI Dental Receptionist is ready!"
 * 
 * @example
 * // Missing configuration:
 * // Console output:
 * // "Initializing AI Dental Receptionist..."
 * // "Warning: Some configuration may be missing. Please check your .env file."
 * // "Google Sheets initialized"
 * // "AI Dental Receptionist is ready!"
 * // (Server still starts, but may have limited functionality)
 * 
 * @example
 * // Critical error (Google Sheets auth fails):
 * // Console output:
 * // "Initializing AI Dental Receptionist..."
 * // "Error during initialization: [error details]"
 * // Process exits with code 1
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

// Serve React build files in LOCAL DEVELOPMENT ONLY
// On Vercel, routing is handled by vercel.json, not Express
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  
  // Catch-all handler: send React app for non-API routes
  app.get('*', (req, res) => {
    // Skip API routes and webhook routes
    if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path === '/health') {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// Export app for Vercel serverless functions
export default app;

// Start server only if not in Vercel environment
// Vercel uses serverless functions and doesn't need app.listen()
if (!process.env.VERCEL) {
  const PORT = config.server.port;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initialize(); // Initialize Google Sheets and validate config
  });

  // Graceful shutdown handlers
  // Clean up resources when receiving termination signals
  // SIGTERM: Sent by process managers (PM2, Docker, etc.) to request shutdown
  // SIGINT: Sent by Ctrl+C in terminal
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    sessionManager.destroy(); // Stop cleanup interval, clear all sessions
    process.exit(0); // Exit successfully
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    sessionManager.destroy(); // Stop cleanup interval, clear all sessions
    process.exit(0); // Exit successfully
  });
} else {
  // Initialize for Vercel (runs on first request)
  // Note: This runs once per serverless function instance
  initialize().catch(err => {
    console.error('Initialization error (non-blocking):', err);
  });
}

