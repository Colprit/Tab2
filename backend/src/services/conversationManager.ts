import Anthropic from '@anthropic-ai/sdk';

const MAX_TOKENS_PER_MESSAGE = 100000; // Approximate max tokens per message
const MAX_CONTEXT_TOKENS = 200000; // Claude Haiku 4.5 context window
const RESERVE_TOKENS = 4096; // Reserve for response

interface Message {
  role: 'user' | 'assistant';
  content: any;
}

export class Conversation {
  public id: string;
  public spreadsheetId: string;
  private messages: Message[] = [];
  private pendingToolCalls: Map<string, any> = new Map();

  constructor(id: string, spreadsheetId: string) {
    this.id = id;
    this.spreadsheetId = spreadsheetId;
  }

  addMessage(message: Message) {
    this.messages.push(message);
  }

  addPendingToolCall(toolCall: any) {
    this.pendingToolCalls.set(toolCall.id, toolCall);
  }

  getPendingToolCalls(toolCallIds: string[]): any[] {
    return toolCallIds
      .map((id) => this.pendingToolCalls.get(id))
      .filter((call) => call !== undefined);
  }

  clearPendingToolCalls(toolCallIds: string[]) {
    for (const id of toolCallIds) {
      this.pendingToolCalls.delete(id);
    }
  }

  getMessagesForAPI(): Anthropic.MessageParam[] {
    // Estimate token usage and compact if needed
    let messages = this.compactMessages();
    
    // Validate and fix: ensure no orphaned tool_use blocks
    messages = this.validateToolUsePairs(messages);
    
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  private validateToolUsePairs(messages: Message[]): Message[] {
    const validated: Message[] = [];
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const hasToolUse = this.hasToolUseBlocks(msg);
      
      if (hasToolUse) {
        // This message has tool_use blocks - check if next message has corresponding tool_result
        const nextMsg = i < messages.length - 1 ? messages[i + 1] : null;
        const nextHasToolResult = nextMsg && this.hasToolResultBlocks(nextMsg);
        
        if (!nextHasToolResult) {
          // Orphaned tool_use - skip this message to avoid API error
          console.warn(`Skipping orphaned tool_use message at index ${i} - no corresponding tool_result found`);
          continue;
        }
        
        // Valid pair - add both and skip next iteration
        validated.push(msg);
        validated.push(nextMsg);
        i++; // Skip next message since we already added it
        continue;
      }
      
      // Check if this is an orphaned tool_result (shouldn't happen if compaction works correctly)
      if (this.hasToolResultBlocks(msg)) {
        const prevMsg = i > 0 ? validated[validated.length - 1] : null;
        const prevHasToolUse = prevMsg && this.hasToolUseBlocks(prevMsg);
        
        if (!prevHasToolUse) {
          // Orphaned tool_result - skip it
          console.warn(`Skipping orphaned tool_result message at index ${i} - no corresponding tool_use found`);
          continue;
        }
      }
      
      // Regular message or valid tool_result - add it
      validated.push(msg);
    }
    
    return validated;
  }

  private compactMessages(): Message[] {
    // Simple token estimation (rough approximation)
    let estimatedTokens = 0;
    const compactedMessages: Message[] = [];

    // Work backwards from the end to ensure tool_use/tool_result pairs stay together
    // Start with more messages and work backwards until we hit token limit
    const startIndex = Math.max(0, this.messages.length - 20);
    const messagesToCheck = this.messages.slice(startIndex);
    
    // Work backwards, ensuring pairs stay together
    for (let i = messagesToCheck.length - 1; i >= 0; i--) {
      const msg = messagesToCheck[i];
      const msgTokens = this.estimateTokens(msg);
      
      // Check if this message has tool_result blocks - if so, we MUST include previous assistant message
      if (this.hasToolResultBlocks(msg) && i > 0) {
        const prevMsg = messagesToCheck[i - 1];
        if (this.hasToolUseBlocks(prevMsg)) {
          // This is a tool_result message following a tool_use message
          // We must include both or neither
          const prevMsgTokens = this.estimateTokens(prevMsg);
          const totalTokens = msgTokens + prevMsgTokens;
          
          if (estimatedTokens + totalTokens > MAX_CONTEXT_TOKENS - RESERVE_TOKENS) {
            // Can't fit the pair, stop here
            break;
          }
          
          // Add both messages (prev first, then current)
          estimatedTokens += prevMsgTokens;
          compactedMessages.unshift(prevMsg);
          estimatedTokens += msgTokens;
          compactedMessages.unshift(msg);
          i--; // Skip previous message since we already added it
          continue;
        }
      }
      
      // Check if this message has tool_use blocks - if so, ensure next message is included
      if (this.hasToolUseBlocks(msg) && i < messagesToCheck.length - 1) {
        const nextMsg = messagesToCheck[i + 1];
        if (this.hasToolResultBlocks(nextMsg)) {
          // This is a tool_use message followed by tool_result
          // We must include both or neither
          const nextMsgTokens = this.estimateTokens(nextMsg);
          const totalTokens = msgTokens + nextMsgTokens;
          
          if (estimatedTokens + totalTokens > MAX_CONTEXT_TOKENS - RESERVE_TOKENS) {
            // Can't fit the pair, stop here
            break;
          }
          
          // Add both messages (current first, then next)
          estimatedTokens += msgTokens;
          compactedMessages.unshift(msg);
          estimatedTokens += nextMsgTokens;
          compactedMessages.unshift(nextMsg);
          i--; // Skip next message since we already added it
          continue;
        }
      }
      
      // Regular message - add if we have space
      if (estimatedTokens + msgTokens > MAX_CONTEXT_TOKENS - RESERVE_TOKENS) {
        break;
      }
      estimatedTokens += msgTokens;
      compactedMessages.unshift(msg);
    }

    // If we have room, try to add older messages (but skip tool_use/tool_result pairs)
    if (compactedMessages.length < this.messages.length) {
      const olderMessages = this.messages.slice(0, startIndex);
      
      // Add a summary of older messages if we have space
      if (olderMessages.length > 0 && estimatedTokens < MAX_CONTEXT_TOKENS - RESERVE_TOKENS - 500) {
        const summary: Message = {
          role: 'user',
          content: `[Previous conversation context: ${olderMessages.length} messages about working with the spreadsheet]`,
        };
        compactedMessages.unshift(summary);
      }
    }

    return compactedMessages.length > 0 ? compactedMessages : this.messages.slice(-10);
  }

  private hasToolUseBlocks(message: Message): boolean {
    if (!Array.isArray(message.content)) {
      return false;
    }
    return message.content.some((item: any) => item.type === 'tool_use');
  }

  private hasToolResultBlocks(message: Message): boolean {
    if (!Array.isArray(message.content)) {
      return false;
    }
    return message.content.some((item: any) => item.type === 'tool_result');
  }

  private estimateTokens(message: Message): number {
    // Rough token estimation
    let tokens = 50; // Base overhead
    
    if (typeof message.content === 'string') {
      tokens += Math.ceil(message.content.length / 4);
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        if (item.type === 'text') {
          tokens += Math.ceil(item.text.length / 4);
        } else if (item.type === 'tool_use') {
          tokens += 100; // Base for tool use
          tokens += Math.ceil(JSON.stringify(item.input).length / 4);
        } else if (item.type === 'tool_result') {
          tokens += 50; // Base for tool result
          if (typeof item.content === 'string') {
            tokens += Math.ceil(item.content.length / 4);
          }
        }
      }
    }

    return tokens;
  }

  getAllMessages(): Message[] {
    return [...this.messages];
  }
}

export class ConversationManager {
  private conversations: Map<string, Conversation> = new Map();

  getOrCreateConversation(id: string, spreadsheetId: string): Conversation {
    if (!this.conversations.has(id)) {
      this.conversations.set(id, new Conversation(id, spreadsheetId));
    }
    return this.conversations.get(id)!;
  }

  getConversation(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  clearConversation(id: string) {
    this.conversations.delete(id);
  }
}
