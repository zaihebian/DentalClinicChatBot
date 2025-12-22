# DentalCare AI Assistant

A comprehensive AI-powered WhatsApp chatbot solution for dental clinics to automate patient communication, appointment scheduling, and administrative tasks.

## Features

- **Appointment Booking**: AI-powered booking with automatic dentist matching and availability checking
- **Schedule Management**: Check, cancel, and reschedule appointments via WhatsApp
- **Pricing Information**: Instant access to treatment costs and pricing information
- **Google Calendar Integration**: Automatic calendar event creation and management
- **Google Sheets Integration**: Conversation logging and analytics
- **Multi-language Support**: Natural language processing for patient queries

## Requirements

- Node.js 18+
- Google Cloud Platform account with Calendar and Sheets APIs enabled
- OpenAI API key
- WhatsApp Business API integration

## Installation

```bash
npm install
```

## Configuration

Copy `config.example.js` to `config.js` and configure:

- OpenAI API settings
- Google Cloud credentials
- Calendar IDs for each dentist
- WhatsApp integration settings

## Usage

```javascript
import { openaiHandler } from './src/openaiHandler.js';

// Handle patient messages
const response = await openaiHandler.generateResponse(
  conversationId,
  userMessage,
  phoneNumber
);
```

## Architecture

- **openaiHandler.js**: Main conversation logic and AI integration
- **googleCalendar.js**: Calendar management and availability checking
- **googleSheets.js**: Data logging and analytics
- **sessionManager.js**: Conversation state management

## License

Proprietary - Contact for licensing information.