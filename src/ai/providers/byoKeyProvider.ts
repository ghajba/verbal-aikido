import { buildTurnPrompt } from '../prompts';
import { AI_NODE_JSON_SCHEMA, validateAiNode } from '../schema';
import type { AiGeneratedNode, AiProvider, AiTurnContext, ByoServiceId } from '../types';

export interface ByoKeyProviderOptions {
  service: ByoServiceId;
  apiKey: string;
  modelName?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class ByoKeyProvider implements AiProvider {
  readonly id = 'byokey' as const;
  readonly name: string;

  private service: ByoServiceId;
  private apiKey: string;
  private modelName: string;
  private baseUrl?: string;
  private timeoutMs: number;

  constructor(options: ByoKeyProviderOptions) {
    this.service = options.service;
    this.apiKey = options.apiKey.trim();
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs ?? 15000;

    switch (this.service) {
      case 'gemini':
        this.name = 'Google Gemini (BYO-Key)';
        this.modelName = options.modelName || 'gemini-3.8-flash';
        break;
      case 'claude':
        this.name = 'Anthropic Claude (BYO-Key)';
        this.modelName = options.modelName || 'claude-5-5-sonnet';
        break;
      case 'openai':
        this.name = 'OpenAI (BYO-Key)';
        this.modelName = options.modelName || 'gpt-5-mini';
        break;
      case 'openrouter':
        this.name = 'OpenRouter (BYO-Key)';
        this.modelName = options.modelName || 'meta-llama/llama-4';
        break;
      case 'ollama':
        this.name = 'Ollama Local (BYO-AI)';
        this.modelName = options.modelName || 'qwen3:8b';
        break;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.service === 'ollama') {
      return true;
    }
    return Boolean(this.apiKey);
  }

  async testConnection(): Promise<{ success: boolean; message: string; model: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      if (this.service !== 'ollama' && !this.apiKey) {
        return { success: false, message: 'Missing API key', model: this.modelName };
      }

      switch (this.service) {
        case 'gemini': {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: 'Ping' }] }],
            }),
          });
          if (!res.ok) {
            const err = await res.text();
            return {
              success: false,
              message: `HTTP ${res.status}: ${err.slice(0, 100)}`,
              model: this.modelName,
            };
          }
          return { success: true, message: 'OK', model: this.modelName };
        }
        case 'claude': {
          const url = 'https://api.anthropic.com/v1/messages';
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: this.modelName,
              max_tokens: 5,
              messages: [{ role: 'user', content: 'Ping' }],
            }),
          });
          if (!res.ok) {
            const err = await res.text();
            return {
              success: false,
              message: `HTTP ${res.status}: ${err.slice(0, 100)}`,
              model: this.modelName,
            };
          }
          return { success: true, message: 'OK', model: this.modelName };
        }
        case 'openai':
        case 'openrouter': {
          const defaultBase =
            this.service === 'openai'
              ? 'https://api.openai.com/v1'
              : 'https://openrouter.ai/api/v1';
          const baseUrl = this.baseUrl || defaultBase;
          const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
              model: this.modelName,
              max_tokens: 5,
              messages: [{ role: 'user', content: 'Ping' }],
            }),
          });
          if (!res.ok) {
            const err = await res.text();
            return {
              success: false,
              message: `HTTP ${res.status}: ${err.slice(0, 100)}`,
              model: this.modelName,
            };
          }
          return { success: true, message: 'OK', model: this.modelName };
        }
        case 'ollama': {
          const baseUrl = this.baseUrl || 'http://localhost:11434';
          const url = `${baseUrl.replace(/\/$/, '')}/api/tags`;
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) {
            return {
              success: false,
              message: `Ollama HTTP ${res.status}`,
              model: this.modelName,
            };
          }
          return { success: true, message: 'Ollama reachable', model: this.modelName };
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg, model: this.modelName };
    } finally {
      clearTimeout(timer);
    }
  }

  async generateNextNode(ctx: AiTurnContext): Promise<AiGeneratedNode> {
    const { systemPrompt, userPrompt } = buildTurnPrompt(ctx);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let rawJsonText: string;

      switch (this.service) {
        case 'gemini':
          rawJsonText = await this.callGemini(systemPrompt, userPrompt, controller.signal);
          break;
        case 'claude':
          rawJsonText = await this.callClaude(systemPrompt, userPrompt, controller.signal);
          break;
        case 'openai':
        case 'openrouter':
          rawJsonText = await this.callOpenAiCompatible(
            systemPrompt,
            userPrompt,
            controller.signal
          );
          break;
        case 'ollama':
          rawJsonText = await this.callOllama(systemPrompt, userPrompt, controller.signal);
          break;
      }

      const parsed = JSON.parse(rawJsonText);
      return validateAiNode(parsed);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`AI request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private async callGemini(
    systemPrompt: string,
    userPrompt: string,
    signal: AbortSignal
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: AI_NODE_JSON_SCHEMA,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidate) {
      throw new Error('Gemini API returned empty response candidate');
    }
    return candidate;
  }

  private async callClaude(
    systemPrompt: string,
    userPrompt: string,
    signal: AbortSignal
  ): Promise<string> {
    const url = 'https://api.anthropic.com/v1/messages';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      signal,
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: `${userPrompt}\nOutput MUST be valid JSON only.` }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data?.content?.[0]?.text;
    if (!content) {
      throw new Error('Claude API returned empty message content');
    }
    return content;
  }

  private async callOpenAiCompatible(
    systemPrompt: string,
    userPrompt: string,
    signal: AbortSignal
  ): Promise<string> {
    const defaultUrl =
      this.service === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
    const url = this.baseUrl || defaultUrl;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model: this.modelName,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI-compatible API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI API returned empty response choice');
    }
    return content;
  }

  private async callOllama(
    systemPrompt: string,
    userPrompt: string,
    signal: AbortSignal
  ): Promise<string> {
    const url = `${this.baseUrl || 'http://localhost:11434'}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: this.modelName,
        format: 'json',
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data?.message?.content;
    if (!content) {
      throw new Error('Ollama API returned empty message content');
    }
    return content;
  }
}
