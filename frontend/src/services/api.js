const API_BASE = '/api';

export const api = {
  async getConversations() {
    const response = await fetch(`${API_BASE}/conversations`);
    if (!response.ok) {
      throw new Error('Failed to fetch conversations');
    }
    return response.json();
  },

  async getConversation(conversationId) {
    const response = await fetch(`${API_BASE}/conversations/${encodeURIComponent(conversationId)}`);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Conversation not found');
      }
      throw new Error('Failed to fetch conversation');
    }
    return response.json();
  },

  async sendReply(conversationId, message) {
    const response = await fetch(`${API_BASE}/human/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId, message }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send reply');
    }
    
    return response.json();
  },

  async handover(conversationId, owner, reason) {
    const response = await fetch(`${API_BASE}/handover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId, owner, reason }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to process handover');
    }
    
    return response.json();
  },
};

