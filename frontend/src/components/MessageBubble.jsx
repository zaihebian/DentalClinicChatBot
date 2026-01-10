import React from 'react';
import './MessageBubble.css';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const owner = message.owner || 'ai'; // Default to 'ai' for backward compatibility
  const isHuman = owner === 'human';

  return (
    <div className={`message-bubble ${isUser ? 'message-user' : 'message-assistant'}`}>
      <div className="message-content">
        {message.content}
      </div>
      {!isUser && (
        <div className="message-badge">
          {isHuman ? 'Human' : 'AI'}
        </div>
      )}
      <div className="message-time">
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

