import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ByoKeyProvider } from '../../../src/ai/providers/byoKeyProvider';
import type { AiTurnContext } from '../../../src/ai/types';

describe('ByoKeyProvider', () => {
  const baseContext: AiTurnContext = {
    archetypeId: 'angry_pm',
    npcProfile: {
      name: 'Kovács Péter',
      role: 'PM',
      coreConflict: 'Release deadline',
      personality: 'Angry',
    },
    turnIndex: 0,
    currentMetrics: { escalation: 65, grounding: 100, confusion: 0 },
    momentum: 0,
    history: [],
    locale: 'hu',
  };

  const sampleValidNodeJson = JSON.stringify({
    npcReaction: 'Péter elcsendesedik.',
    nextStatement: 'De mi a terv a holnapra?',
    nextTone: 'TENSE',
    cards: [
      { category: 'PACING', text: 'Látom a feszültséget.', debriefHint: 'H1' },
      { category: 'META_MODEL', text: 'Pontosan mi hiányzik?', debriefHint: 'H2' },
      { category: 'ATTACK', text: 'Te miért nem segítettél?', debriefHint: 'H3' },
    ],
  });

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('checks availability based on apiKey presence and service type', async () => {
    const emptyGemini = new ByoKeyProvider({ service: 'gemini', apiKey: '   ' });
    expect(await emptyGemini.isAvailable()).toBe(false);

    const validGemini = new ByoKeyProvider({ service: 'gemini', apiKey: 'valid-gemini-key' });
    expect(await validGemini.isAvailable()).toBe(true);
    expect(validGemini.name).toContain('Google Gemini');

    const ollama = new ByoKeyProvider({ service: 'ollama', apiKey: '' });
    expect(await ollama.isAvailable()).toBe(true);
    expect(ollama.name).toContain('Ollama Local');

    const claude = new ByoKeyProvider({ service: 'claude', apiKey: 'sk-ant-test' });
    expect(claude.name).toContain('Anthropic Claude');

    const openai = new ByoKeyProvider({ service: 'openai', apiKey: 'sk-test' });
    expect(openai.name).toContain('OpenAI');

    const openrouter = new ByoKeyProvider({ service: 'openrouter', apiKey: 'sk-or-test' });
    expect(openrouter.name).toContain('OpenRouter');
  });

  it('successfully calls Google Gemini API with structured schema', async () => {
    const provider = new ByoKeyProvider({
      service: 'gemini',
      apiKey: 'test-key',
      modelName: 'gemini-3.8-flash',
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: sampleValidNodeJson }] } }],
      }),
    } as Response);

    const node = await provider.generateNextNode(baseContext);
    expect(node.npcReaction).toBe('Péter elcsendesedik.');
    expect(node.cards).toHaveLength(3);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=test-key'),
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('handles Gemini API errors and empty candidates gracefully', async () => {
    const provider = new ByoKeyProvider({ service: 'gemini', apiKey: 'test-key' });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Invalid API key',
    } as Response);

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('Gemini API error (400): Invalid API key');

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [] }),
    } as Response);

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('Gemini API returned empty response candidate');
  });

  it('successfully calls Anthropic Claude API', async () => {
    const provider = new ByoKeyProvider({
      service: 'claude',
      apiKey: 'sk-ant-key',
      modelName: 'claude-5-5-sonnet',
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: sampleValidNodeJson }],
      }),
    } as Response);

    const node = await provider.generateNextNode(baseContext);
    expect(node.nextStatement).toBe('De mi a terv a holnapra?');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-key',
          'anthropic-dangerous-direct-browser-access': 'true',
        }),
      })
    );
  });

  it('handles Claude API errors and empty content', async () => {
    const provider = new ByoKeyProvider({ service: 'claude', apiKey: 'sk-ant-key' });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    } as Response);

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('Claude API error (500)');

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [] }),
    } as Response);

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('Claude API returned empty message content');
  });

  it('successfully calls OpenAI and OpenRouter APIs', async () => {
    const openaiProvider = new ByoKeyProvider({ service: 'openai', apiKey: 'sk-openai' });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: sampleValidNodeJson } }],
      }),
    } as Response);

    const node = await openaiProvider.generateNextNode(baseContext);
    expect(node.nextTone).toBe('TENSE');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-openai',
        }),
      })
    );

    const openrouterProvider = new ByoKeyProvider({
      service: 'openrouter',
      apiKey: 'sk-or-key',
    });
    await openrouterProvider.generateNextNode(baseContext);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.any(Object)
    );
  });

  it('handles OpenAI API errors and empty choices', async () => {
    const provider = new ByoKeyProvider({ service: 'openai', apiKey: 'sk-test' });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('OpenAI-compatible API error (401)');

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [] }),
    } as Response);

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('OpenAI API returned empty response choice');
  });

  it('successfully calls Ollama API', async () => {
    const provider = new ByoKeyProvider({
      service: 'ollama',
      apiKey: '',
      baseUrl: 'http://localhost:11434',
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: sampleValidNodeJson },
      }),
    } as Response);

    const node = await provider.generateNextNode(baseContext);
    expect(node.npcReaction).toBe('Péter elcsendesedik.');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('handles Ollama errors and empty message', async () => {
    const provider = new ByoKeyProvider({ service: 'ollama', apiKey: '' });

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    } as Response);

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('Ollama API error (503)');

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('Ollama API returned empty message content');
  });

  it('handles network timeouts', async () => {
    const provider = new ByoKeyProvider({
      service: 'openai',
      apiKey: 'sk-test',
      timeoutMs: 10,
    });

    globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    await expect(provider.generateNextNode(baseContext)).rejects.toThrow('AI request timed out after 10ms');
  });
});
