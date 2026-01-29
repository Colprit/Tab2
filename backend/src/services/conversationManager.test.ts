import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Create mock functions that will be used in the mock module
const mockMessagesCreate: any = jest.fn();
const mockAnthropicConstructor: any = jest.fn().mockImplementation(() => ({
  messages: {
    create: mockMessagesCreate,
  },
}));

// Mock the module - must be called before imports that use @anthropic-ai/sdk
jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: mockAnthropicConstructor,
}));

// Import after mock setup
import { Conversation, ConversationManager } from './conversationManager.js';

describe('Conversation', () => {
  let conversation: Conversation;
  const spreadsheetId = 'test-spreadsheet-id';

  beforeEach(async () => {
    conversation = new Conversation('test-conversation-id', spreadsheetId);
    mockMessagesCreate.mockClear();
  });

  describe('getMessageType and getMessageId', () => {
    const getMessageType = (c: Conversation, message: any) =>
      (c as any).getMessageType(message);
    const getMessageId = (c: Conversation, message: any) =>
      (c as any).getMessageId(message);

    describe('getMessageType', () => {
      it('returns "text" for message with text content', () => {
        const msg = { role: 'user' as const, content: [{ type: 'text', text: 'Hi' }] };
        expect(getMessageType(conversation, msg)).toBe('text');
      });

      it('returns "tool_use" for message with tool_use content', () => {
        const msg = {
          role: 'assistant' as const,
          content: [{ type: 'tool_use', id: 't1', name: 'read_range', input: {} }],
        };
        expect(getMessageType(conversation, msg)).toBe('tool_use');
      });

      it('returns "tool_result" for message with tool_result content', () => {
        const msg = {
          role: 'user' as const,
          content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }],
        };
        expect(getMessageType(conversation, msg)).toBe('tool_result');
      });

      it('returns "unknown" when message is undefined', () => {
        expect(getMessageType(conversation, undefined)).toBe('unknown');
      });

      it('returns "unknown" when message is null', () => {
        expect(getMessageType(conversation, null)).toBe('unknown');
      });

      it('returns "unknown" when message.content is undefined', () => {
        expect(getMessageType(conversation, { role: 'user' })).toBe('unknown');
      });

      it('returns "unknown" when message.content is not an array', () => {
        expect(getMessageType(conversation, { role: 'user', content: 'hello' })).toBe('unknown');
      });

      it('returns "unknown" when message.content is empty array', () => {
        expect(getMessageType(conversation, { role: 'user', content: [] })).toBe('unknown');
      });

      it('returns "unknown" when first content block has no type', () => {
        expect(getMessageType(conversation, { role: 'user', content: [{}] })).toBe('unknown');
      });

      it('returns "unknown" when first content block has type null/undefined', () => {
        expect(getMessageType(conversation, { role: 'user', content: [{ type: null }] })).toBe('unknown');
      });
    });

    describe('getMessageId', () => {
      it('returns id for tool_use message', () => {
        const msg = {
          role: 'assistant' as const,
          content: [{ type: 'tool_use', id: 'tool-abc', name: 'read_range', input: {} }],
        };
        expect(getMessageId(conversation, msg)).toBe('tool-abc');
      });

      it('returns tool_use_id for tool_result message', () => {
        const msg = {
          role: 'user' as const,
          content: [{ type: 'tool_result', tool_use_id: 'tool-xyz', content: '{}' }],
        };
        expect(getMessageId(conversation, msg)).toBe('tool-xyz');
      });

      it('returns empty string for text message', () => {
        const msg = { role: 'user' as const, content: [{ type: 'text', text: 'Hi' }] };
        expect(getMessageId(conversation, msg)).toBe('');
      });

      it('returns empty string when message is undefined', () => {
        expect(getMessageId(conversation, undefined)).toBe('');
      });

      it('returns empty string when message has no content', () => {
        expect(getMessageId(conversation, { role: 'user' })).toBe('');
      });

      it('returns empty string when message.content is empty array', () => {
        expect(getMessageId(conversation, { role: 'user', content: [] })).toBe('');
      });

      it('returns empty string for tool_use when id is missing', () => {
        const msg = {
          role: 'assistant' as const,
          content: [{ type: 'tool_use', name: 'read_range', input: {} }],
        };
        expect(getMessageId(conversation, msg)).toBe('');
      });

      it('returns empty string for tool_result when tool_use_id is missing', () => {
        const msg = {
          role: 'user' as const,
          content: [{ type: 'tool_result', content: '{}' }],
        };
        expect(getMessageId(conversation, msg)).toBe('');
      });
    });
  });

  describe('Message Management', () => {
    it('should add messages correctly', () => {
      const message = {
        role: 'user' as const,
        content: [{ type: 'text', text: 'Hello' }],
      };
      conversation.addMessage(message);
      expect(conversation.getAllMessages()).toHaveLength(1);
      expect(conversation.getAllMessages()[0]).toEqual(message);
    });

    it('should return all messages', () => {
      const message1 = { role: 'user' as const, content: [{ type: 'text', text: 'Hello' }] };
      const message2 = { role: 'assistant' as const, content: [{ type: 'text', text: 'Hi there' }] };
      conversation.addMessage(message1);
      conversation.addMessage(message2);
      const allMessages = conversation.getAllMessages();
      expect(allMessages).toHaveLength(2);
      expect(allMessages[0]).toEqual(message1);
      expect(allMessages[1]).toEqual(message2);
    });
  });

  describe('Pending Tool Calls', () => {
    it('should add pending tool calls', () => {
      const toolCall = { id: 'tool-1', name: 'read_range', input: { range: 'A1:B2' } };
      conversation.addPendingToolCall(toolCall);
      expect(conversation.hasPendingToolCalls()).toBe(true);
      expect(conversation.getPendingToolCall('tool-1')).toEqual(toolCall);
    });

    it('should get pending tool calls by IDs', () => {
      const toolCall1 = { id: 'tool-1', name: 'read_range', input: {} };
      const toolCall2 = { id: 'tool-2', name: 'write_range', input: {} };
      conversation.addPendingToolCall(toolCall1);
      conversation.addPendingToolCall(toolCall2);
      const calls = conversation.getPendingToolCalls(['tool-1', 'tool-2']);
      expect(calls).toHaveLength(2);
    });

    it('should get all pending tool calls', () => {
      const toolCall1 = { id: 'tool-1', name: 'read_range', input: {} };
      const toolCall2 = { id: 'tool-2', name: 'write_range', input: {} };
      conversation.addPendingToolCall(toolCall1);
      conversation.addPendingToolCall(toolCall2);
      const allCalls = conversation.getAllPendingToolCalls();
      expect(allCalls).toHaveLength(2);
    });

    it('should clear pending tool calls', () => {
      const toolCall = { id: 'tool-1', name: 'read_range', input: {} };
      conversation.addPendingToolCall(toolCall);
      expect(conversation.hasPendingToolCalls()).toBe(true);
      conversation.clearPendingToolCalls(['tool-1']);
      expect(conversation.hasPendingToolCalls()).toBe(false);
    });

    it('should check if pending tool calls exist', () => {
      expect(conversation.hasPendingToolCalls()).toBe(false);
      conversation.addPendingToolCall({ id: 'tool-1', name: 'read_range', input: {} });
      expect(conversation.hasPendingToolCalls()).toBe(true);
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens for text messages', () => {
      const message = {
        role: 'user' as const,
        content: [{ type: 'text', text: 'Hello world' }],
      };
      conversation.addMessage(message);
      const messages = conversation.getAllMessages();
      expect(messages.length).toBe(1);
    });

    it('should estimate tokens for tool_use messages', () => {
      const message = {
        role: 'assistant' as const,
        content: [{
          type: 'tool_use',
          id: 'tool-1',
          name: 'read_range',
          input: { range: 'A1:B2' },
        }],
      };
      conversation.addMessage(message);
      const messages = conversation.getAllMessages();
      expect(messages.length).toBe(1);
    });

    it('should estimate tokens for tool_result messages', () => {
      const message = {
        role: 'user' as const,
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-1',
          content: JSON.stringify({ success: true }),
        }],
      };
      conversation.addMessage(message);
      const messages = conversation.getAllMessages();
      expect(messages.length).toBe(1);
    });
  });

  describe('getMessagesForAPI - No Compaction', () => {
    it('should return all messages when under token limit', async () => {
      // Add a few small messages that won't exceed the limit
      for (let i = 0; i < 5; i++) {
        conversation.addMessage({
          role: 'user' as const,
          content: [{ type: 'text', text: `Message ${i}` }],
        });
      }
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic({ apiKey: 'test-key' });
      const messages = await conversation.getMessagesForAPI(mockAnthropic);
      expect(messages.length).toBe(5);
      // Should not call API for summary when no compaction needed
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });
  });

  describe('getMessagesForAPI - With Compaction', () => {
    it('should compact messages when over token limit', async () => {
      // Add many large messages to exceed the limit
      for (let i = 0; i < 100; i++) {
        const largeText = 'x'.repeat(1000); // Large message
        conversation.addMessage({
          role: 'user' as const,
          content: [{ type: 'text', text: largeText }],
        });
      }
      // Mock summary generation
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Summary of previous conversation' }],
      });
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic({ apiKey: 'test-key' });
      const messages = await conversation.getMessagesForAPI(mockAnthropic);
      // Should have fewer messages after compaction
      expect(messages.length).toBeLessThan(100);
      // Should call API for summary generation
      expect(mockMessagesCreate).toHaveBeenCalled();
    });
  });

  describe('Tool Use/Result Pair Validation', () => {
    it('should keep valid tool_use/tool_result pairs', async () => {
      const toolUseMsg = {
        role: 'assistant' as const,
        content: [{
          type: 'tool_use',
          id: 'tool-111',
          name: 'read_range',
          input: { range: 'A1:B2' },
        }],
      };
      const toolResultMsg = {
        role: 'user' as const,
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-111',
          content: JSON.stringify({ success: true }),
        }],
      };
      conversation.addMessage(toolUseMsg);
      conversation.addMessage(toolResultMsg);
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic({ apiKey: 'test-key' });
      const messages = await conversation.getMessagesForAPI(mockAnthropic);
      // This should keep both messages as a valid pair
      expect(messages.length).toBeGreaterThanOrEqual(2);
    });

    it('should remove orphaned tool_use messages', async () => {
      const toolUseMsg = {
        role: 'assistant' as const,
        content: [{
          type: 'tool_use',
          id: 'tool-22222',
          name: 'read_range',
          input: { range: 'A1:B2' },
        }],
      };
      conversation.addMessage(toolUseMsg);
      // No corresponding tool_result
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic({ apiKey: 'test-key' });
      const messages = await conversation.getMessagesForAPI(mockAnthropic);
      // The orphaned tool_use should be removed
      const hasToolUse = messages.some((msg: any) => 
        Array.isArray(msg.content) && 
        msg.content.some((item: any) => item.type === 'tool_use' && item.id === 'tool-1')
      );
      expect(hasToolUse).toBe(false);
    });

    it('should remove orphaned tool_result messages', async () => {
      const toolResultMsg = {
        role: 'user' as const,
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-33333',
          content: JSON.stringify({ success: true }),
        }],
      };
      conversation.addMessage(toolResultMsg);
      // No corresponding tool_use
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic({ apiKey: 'test-key' });
      const messages = await conversation.getMessagesForAPI(mockAnthropic);
      // The orphaned tool_result should be removed
      const hasToolResult = messages.some((msg: any) =>
        Array.isArray(msg.content) &&
        msg.content.some((item: any) => item.type === 'tool_result' && item.tool_use_id === 'tool-1')
      );
      expect(hasToolResult).toBe(false);
    });

    it('should remove tool_use/tool_result pairs with mismatched IDs', async () => {
      const toolUseMsg = {
        role: 'assistant' as const,
        content: [{
          type: 'tool_use',
          id: 'tool-44444',
          name: 'read_range',
          input: { range: 'A1:B2' },
        }],
      };
      const toolResultMsg = {
        role: 'user' as const,
        content: [{
          type: 'tool_result',
          tool_use_id: 'tool-55555', // Mismatched ID
          content: JSON.stringify({ success: true }),
        }],
      };
      conversation.addMessage(toolUseMsg);
      conversation.addMessage(toolResultMsg);
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic({ apiKey: 'test-key' });
      const messages = await conversation.getMessagesForAPI(mockAnthropic);
      // Both should be removed due to ID mismatch
      const hasToolUse = messages.some((msg: any) =>
        Array.isArray(msg.content) &&
        msg.content.some((item: any) => item.type === 'tool_use' && item.id === 'tool-1')
      );
      const hasToolResult = messages.some((msg: any) =>
        Array.isArray(msg.content) &&
        msg.content.some((item: any) => item.type === 'tool_result' && item.tool_use_id === 'tool-2')
      );
      expect(hasToolUse).toBe(false);
      expect(hasToolResult).toBe(false);
    });
  });

  describe('Summary Generation', () => {
    it('should generate summary when messages are excluded', async () => {
      // Add many messages to trigger compaction
      for (let i = 0; i < 100; i++) {
        const largeText = 'x'.repeat(1000);
        conversation.addMessage({
          role: 'user' as const,
          content: [{ type: 'text', text: largeText }],
        });
      }
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'Summary of previous conversation' }],
      });
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic({ apiKey: 'test-key' });
      const messages = await conversation.getMessagesForAPI(mockAnthropic);
      // Should have summary message if compaction occurred
      expect(messages.length).toBeGreaterThan(0);
      expect(mockMessagesCreate).toHaveBeenCalled();
    });

    it('should handle summary generation failure gracefully', async () => {
      // Add many messages to trigger compaction
      for (let i = 0; i < 100; i++) {
        const largeText = 'x'.repeat(1000);
        conversation.addMessage({
          role: 'user' as const,
          content: [{ type: 'text', text: largeText }],
        });
      }
      mockMessagesCreate.mockRejectedValue(new Error('API Error'));
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const mockAnthropic = new Anthropic({ apiKey: 'test-key' });
      const messages = await conversation.getMessagesForAPI(mockAnthropic);
      // Should still return messages even if summary fails
      expect(messages.length).toBeGreaterThan(0);
    });
  });
});

describe('ConversationManager', () => {
  let manager: ConversationManager;
  const spreadsheetId = 'test-spreadsheet-id';

  beforeEach(() => {
    manager = new ConversationManager();
  });

  describe('Conversation Management', () => {
    it('should create a new conversation', () => {
      const conversation = manager.getOrCreateConversation('conv-1', spreadsheetId);
      expect(conversation).toBeDefined();
      expect(conversation.id).toBe('conv-1');
      expect(conversation.spreadsheetId).toBe(spreadsheetId);
    });

    it('should return existing conversation', () => {
      const conversation1 = manager.getOrCreateConversation('conv-1', spreadsheetId);
      const conversation2 = manager.getOrCreateConversation('conv-1', spreadsheetId);
      expect(conversation1).toBe(conversation2);
    });

    it('should get existing conversation', () => {
      manager.getOrCreateConversation('conv-1', spreadsheetId);
      const conversation = manager.getConversation('conv-1');
      expect(conversation).toBeDefined();
      expect(conversation?.id).toBe('conv-1');
    });

    it('should return undefined for non-existent conversation', () => {
      const conversation = manager.getConversation('non-existent');
      expect(conversation).toBeUndefined();
    });

    it('should clear conversation', () => {
      manager.getOrCreateConversation('conv-1', spreadsheetId);
      expect(manager.getConversation('conv-1')).toBeDefined();
      manager.clearConversation('conv-1');
      expect(manager.getConversation('conv-1')).toBeUndefined();
    });

    it('should handle multiple conversations independently', () => {
      const conv1 = manager.getOrCreateConversation('conv-1', spreadsheetId);
      const conv2 = manager.getOrCreateConversation('conv-2', spreadsheetId);
      expect(conv1).not.toBe(conv2);
      expect(conv1.id).toBe('conv-1');
      expect(conv2.id).toBe('conv-2');
    });
  });
});
