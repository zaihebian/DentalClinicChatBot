import React from 'react';
import './ConversationList.css';

export default function ConversationList({ conversations, selectedId, onSelect }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <h2>Conversations</h2>
        <span className="conversation-count">{conversations.length}</span>
      </div>
      <div className="conversation-items">
        {conversations.length === 0 ? (
          <div className="empty-state">No active conversations</div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.conversationId}
              className={`conversation-item ${selectedId === conv.conversationId ? 'active' : ''}`}
              onClick={() => onSelect(conv.conversationId)}
            >
              <div className="conversation-phone">{conv.phone || conv.conversationId}</div>
              {conv.patientName && (
                <div className="conversation-name">{conv.patientName}</div>
              )}
              <div className="conversation-time">{formatTime(conv.lastActivity)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

