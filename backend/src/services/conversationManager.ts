import Anthropic from '@anthropic-ai/sdk';

const MAX_TOKENS_PER_MESSAGE = 100000; // Approximate max tokens per message
// const MAX_CONTEXT_TOKENS = 200000; // Claude Haiku 4.5 context window
const MAX_CONTEXT_TOKENS = 6500; // Claude Haiku 4.5 context window
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

  getPendingToolCall(toolCallId: string): any | undefined {
    return this.pendingToolCalls.get(toolCallId);
  }

  clearPendingToolCall(toolCallId: string) {
    this.pendingToolCalls.delete(toolCallId);
  }

  getPendingToolCalls(toolCallIds: string[]): any[] {
    return toolCallIds
      .map((id) => this.pendingToolCalls.get(id))
      .filter((call) => call !== undefined);
  }

  getAllPendingToolCalls(): any[] {
    return Array.from(this.pendingToolCalls.values());
  }

  hasPendingToolCalls(): boolean {
    return this.pendingToolCalls.size > 0;
  }

  clearPendingToolCalls(toolCallIds: string[]) {
    for (const id of toolCallIds) {
      this.pendingToolCalls.delete(id);
    }
  }

  async getMessagesForAPI(anthropic: Anthropic): Promise<Anthropic.MessageParam[]> {
    // First, estimate total tokens for all messages
    const totalTokens = this.estimateTotalTokens();
    const maxAllowedTokens = MAX_CONTEXT_TOKENS - RESERVE_TOKENS;
    
    console.log(`[Compaction] Total messages: ${this.messages.length}, Estimated tokens: ${totalTokens}, Max allowed: ${maxAllowedTokens}`);
    
    // If we're under the limit, no compaction needed
    if (totalTokens <= maxAllowedTokens) {
      console.log(`[Compaction] No compaction needed, returning all ${this.messages.length} messages`);
      return this.messages as Anthropic.MessageParam[];
    }

    console.log(`[Compaction] Token limit exceeded, starting compaction...`);

    // We need compaction - work backwards from the end
    let estimatedTokens = 0;
    const latestMessages: Message[] = [];
    const messagesToCheck = [...this.messages];
    
    // Work backwards, adding messages until we hit the token limit
    // validateToolUsePairs will handle keeping pairs together afterwards
    for (let i = messagesToCheck.length - 1; i >= 0; i--) {
      const msg = messagesToCheck[i];
      const msgTokens = this.estimateTokens(msg);
      
      // Add message if we have space
      if (estimatedTokens + msgTokens < maxAllowedTokens) {
        estimatedTokens += msgTokens;
        latestMessages.unshift(msg);
      } else {
        console.log(`[Compaction] Stopped at message ${i}, token limit reached (${estimatedTokens} + ${msgTokens} >= ${maxAllowedTokens})`);
        break;
      }
    }

    console.log(`[Compaction] Kept ${latestMessages.length} recent messages (${estimatedTokens} tokens)`);

    // Validate and fix: ensure no orphaned tool_use blocks
    // This will remove any tool_use/tool_result pairs that got broken up
    const validatedMessages = this.validateToolUsePairs(latestMessages);

    // Determine which messages were excluded (after validation)
    const excludedStartIndex = this.messages.length - validatedMessages.length;
    const excludedMessages = excludedStartIndex > 0 
      ? this.messages.slice(0, excludedStartIndex)
      : [];

    // If we excluded messages, generate a summary
    if (excludedMessages.length > 0) {
      console.log(`[Compaction] Generating summary for ${excludedMessages.length} excluded messages...`);
      const summaryMessage = await this.generateSummaryMessage(excludedMessages, anthropic);
      if (summaryMessage) {
        const summaryTokens = this.estimateTokens(summaryMessage);
        const finalTokens = validatedMessages.reduce((sum, msg) => sum + this.estimateTokens(msg), 0) + summaryTokens;
        console.log(`[Compaction] Summary generated (${summaryTokens} tokens), final message count: ${validatedMessages.length + 1}, final tokens: ${finalTokens}`);
        validatedMessages.unshift(summaryMessage);
      } else {
        console.warn(`[Compaction] Failed to generate summary for excluded messages`);
      }
    }

    const finalTokenCount = validatedMessages.reduce((sum, msg) => sum + this.estimateTokens(msg), 0);
    console.log(`[Compaction] Compaction complete: ${this.messages.length} -> ${validatedMessages.length} messages, ${totalTokens} -> ${finalTokenCount} tokens`);

    return validatedMessages as Anthropic.MessageParam[];
  }

  private getMessageType(message: Message): string {
    if (message.content && Array.isArray(message.content)) {
      return message.content[0].type;
    }
    return 'unknown';
  }

  private getMessageId(message: Message): string {
    switch (this.getMessageType(message)) {
      case 'tool_use':
        return message.content[0].id;
      case 'tool_result':
        return message.content[0].tool_use_id;
      default:
        return '';
    }
  }

  private validateToolUsePairs(messages: Message[]): Message[] {
    const validated: Message[] = [];
    let toolUsePairs = 0;
    let orphanedToolUse = 0;
    let orphanedToolResult = 0;
    
    console.log(`[Validation] Validating ${messages.length} messages for tool_use/tool_result pairs...`);
    console.log(`[Validation] Messages: ${JSON.stringify(messages, null, 2)}`);

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgType = this.getMessageType(msg);
      const msgId = this.getMessageId(msg);
      // If this is a tool_use, it must be followed by a tool_result with matching IDs
      if (msgType === 'tool_use') {
        const nextMsg = messages[i + 1];
        const nextMsgType = this.getMessageType(nextMsg);
        const nextMsgId = this.getMessageId(nextMsg);
        if (nextMsg && nextMsgType === 'tool_result' && msgId === nextMsgId) {
          // Valid pair with matching IDs - add both
          validated.push(msg);
          validated.push(nextMsg);
          toolUsePairs++;
          i++; // Skip next message since we already added it
          console.log(`[Validation] Valid tool_use/tool_result pair at index ${i-1}/${i} (id: ${msg})`);
        } else {
          // Orphaned tool_use or IDs don't match - skip it
          orphanedToolUse++;
          const reason = !nextMsg 
            ? 'no next message' 
            : nextMsgType !== 'tool_result' 
              ? `next message is type=${nextMsgType}, not tool_result`
              : `ID mismatch: tool_use.id=${msgId} != tool_result.tool_use_id=${nextMsgId}`;
          console.warn(`[Validation] Skipping orphaned tool_use at index ${i} (id: ${msgId}). Reason: ${reason}`);
        }
        continue;
      } else if (msgType === 'tool_result') {
        orphanedToolResult++;
        console.warn(`[Validation] Skipping orphaned tool_result at index ${i} (tool_use_id: ${msgId})`);
      } else if(msgType === 'text') {
        // Text message - add it
        validated.push(msg);
      } else {
        console.warn(`[Validation] Skipping unknown message type at index ${i} (type: ${msgType})`);
      }
    }
    
    console.log(`[Validation] Validation complete: ${validated.length} messages kept (${toolUsePairs} tool_use pairs, ${orphanedToolUse} orphaned tool_use, ${orphanedToolResult} orphaned tool_result)`);
    
    return validated;
  }

  private async generateSummaryMessage(
    messagesToSummarize: Message[],
    anthropic: Anthropic
  ): Promise<Message | null> {
    // Estimate tokens for messages to summarize and the prompt
    const promptTokens = 500; // Rough estimate for the prompt
    const messagesTokens = messagesToSummarize.reduce(
      (sum, msg) => sum + this.estimateTokens(msg),
      0
    );

    console.log(`[Summary] Attempting to summarize ${messagesToSummarize.length} messages (${messagesTokens} tokens)`);

    // Fit as many messages as possible within the context window
    let messagesForSummary: Message[] = [];
    let messagesForSummaryTokens = promptTokens + 4096; // Reserve for prompt and response
    
    for (const msg of messagesToSummarize) {
      const msgTokens = this.estimateTokens(msg);
      if (messagesForSummaryTokens + msgTokens <= MAX_CONTEXT_TOKENS - 1000) {
        messagesForSummaryTokens += msgTokens;
        messagesForSummary.push(msg);
      } else {
        break;
      }
    }
    // Prune any orphaned tool_use/tool_result pairs
    messagesForSummary = this.validateToolUsePairs(messagesForSummary);

    // Create the compaction prompt
    const compactionPrompt = `You have been working on the task described above but have not yet completed it. Write a continuation summary that will allow you (or another instance of yourself) to resume work efficiently in a future context window where the conversation history will be replaced with this summary. Your summary should be structured, concise, and actionable. Include:

1. **Task Overview**
   - The user's core request and success criteria
   - Any clarifications or constraints they specified

2. **Current State**
   - What has been completed so far
   - Files created, modified, or analyzed (with paths if relevant)
   - Key outputs or artifacts produced

3. **Important Discoveries**
   - Technical constraints or requirements uncovered
   - Decisions made and their rationale
   - Errors encountered and how they were resolved
   - What approaches were tried that didn't work (and why)

4. **Next Steps**
   - Specific actions needed to complete the task
   - Any blockers or open questions to resolve
   - Priority order if multiple steps remain

5. **Context to Preserve**
   - User preferences or style requirements
   - Domain-specific details that aren't obvious
   - Any promises made to the user

Be concise but complete—err on the side of including information that would prevent duplicate work or repeated mistakes. Write in a way that enables immediate resumption of the task.

Wrap your summary in <summary></summary> tags.`;

    try {
      console.log(`[Summary] Calling Anthropic API to generate summary...`);
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [
          ...(messagesForSummary as Anthropic.MessageParam[]),
          {
            role: 'user',
            content: compactionPrompt,
          },
        ],
      });

      // Extract the summary text from the response
      const summaryText = response.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n');

      if (!summaryText) {
        console.warn(`[Summary] API response contained no text content`);
        return null;
      }

      // If we summarized fewer messages than were excluded, note that in the summary
      const summaryContent = messagesForSummary.length < messagesToSummarize.length
        ? `[Note: This summary covers ${messagesForSummary.length} of ${messagesToSummarize.length} excluded messages]\n\n${summaryText}`
        : summaryText;

      const summaryTokens = this.estimateTokens({ role: 'user', content: summaryContent });
      console.log(`[Summary] Successfully generated summary (${summaryTokens} tokens, ${summaryText.length} chars)`);

      return {
        role: 'user',
        content: summaryContent,
      };
    } catch (error) {
      console.error(`[Summary] Error generating conversation summary:`, error);
      // Fallback to simple placeholder
      return {
        role: 'user',
        content: `[Previous conversation context: ${messagesToSummarize.length} messages about working with the spreadsheet]`,
      };
    }
  }

  private estimateTotalTokens(): number {
    return this.messages.reduce((total, msg) => total + this.estimateTokens(msg), 0);
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
