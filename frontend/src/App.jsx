import React, { useState, useEffect } from 'react';
import ConversationList from './components/ConversationList';
import ChatWindow from './components/ChatWindow';
import { api } from './services/api';
import './App.css';

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConversations = async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchConversation = async (conversationId) => {
    try {
      const data = await api.getConversation(conversationId);
      setSelectedConversation(data);
    } catch (err) {
      console.error('Error fetching conversation:', err);
      setSelectedConversation(null);
    }
  };

  useEffect(() => {
    fetchConversations();
    
    // Poll every 3 seconds
    const interval = setInterval(fetchConversations, 3000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchConversation(selectedId);
      // Also poll the selected conversation
      const interval = setInterval(() => fetchConversation(selectedId), 3000);
      return () => clearInterval(interval);
    } else {
      setSelectedConversation(null);
    }
  }, [selectedId]);

  const handleSelect = (conversationId) => {
    setSelectedId(conversationId);
  };

  const handleHandover = () => {
    // Refresh conversations and selected conversation after handover
    fetchConversations();
    if (selectedId) {
      fetchConversation(selectedId);
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div>Loading conversations...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        onSelect={handleSelect}
      />
      <ChatWindow
        conversationId={selectedId}
        conversation={selectedConversation}
        onHandover={handleHandover}
      />
      {error && (
        <div className="app-error">
          Error: {error}
        </div>
      )}
    </div>
  );
}

