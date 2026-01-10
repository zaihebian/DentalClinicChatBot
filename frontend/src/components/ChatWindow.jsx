import React, { useState, useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import { api } from '../services/api';
import './ChatWindow.css';

export default function ChatWindow({ conversationId, conversation, onHandover }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation?.conversationHistory]);

  const handleSend = async () => {
    if (!message.trim() || sending) return;

    setSending(true);
    setError(null);

    try {
      await api.sendReply(conversationId, message);
      setMessage('');
      // Conversation will be updated via polling
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTakeOver = async () => {
    try {
      await api.handover(conversationId, 'human', 'manual');
      onHandover();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReturnToAI = async () => {
    try {
      await api.handover(conversationId, 'ai', 'manual');
      onHandover();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!conversation) {
    return (
      <div className="chat-window empty">
        <div className="empty-message">Select a conversation to start</div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div>
          <div className="chat-phone">{conversation.phone || conversation.conversationId}</div>
          {conversation.patientName && (
            <div className="chat-name">{conversation.patientName}</div>
          )}
        </div>
        <div className="chat-actions">
          {conversation.owner === 'ai' ? (
            <button className="btn-takeover" onClick={handleTakeOver}>
              Take Over
            </button>
          ) : (
            <button className="btn-return" onClick={handleReturnToAI}>
              Return to AI
            </button>
          )}
        </div>
      </div>

      <div className="chat-messages">
        {conversation.conversationHistory && conversation.conversationHistory.length > 0 ? (
          conversation.conversationHistory.map((msg, index) => (
            <MessageBubble key={index} message={msg} />
          ))
        ) : (
          <div className="empty-messages">No messages yet</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="chat-error">{error}</div>
      )}

      {conversation.owner === 'human' && (
        <div className="chat-input-container">
          <textarea
            className="chat-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            rows={2}
            disabled={sending}
          />
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={!message.trim() || sending}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      )}

      {conversation.owner === 'ai' && (
        <div className="chat-info">
          AI is handling this conversation. Click "Take Over" to reply.
        </div>
      )}
    </div>
  );
}

