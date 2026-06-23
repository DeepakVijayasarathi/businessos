const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: '{"result": "ok"}' }],
      }),
    },
  }));
});

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: '{"result": "ok"}' } }],
        }),
      },
    },
    images: {
      generate: jest.fn().mockResolvedValue({
        data: [{ url: 'https://example.com/image.png' }],
      }),
    },
  }));
});

jest.mock('../../src/config', () => ({
  ai: {
    provider: 'claude',
    anthropicKey: 'test-anthropic-key',
    openaiKey: 'test-openai-key',
    claudeModel: 'claude-sonnet-4-6',
    openaiModel: 'gpt-4o',
    maxTokens: 1024,
  },
  encryptionKey: null,
}));

jest.mock('../../src/utils/helpers', () => ({
  decrypt: (v) => v,
  encrypt: (v) => v,
}));

const { callAI, generateImage } = require('../../src/services/ai.service');

describe('AI Service — callAI', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls Anthropic when provider is claude', async () => {
    const result = await callAI({
      messages: [{ role: 'user', content: 'Hello' }],
      system: 'You are a helper',
      companyProvider: 'claude',
    });
    expect(result.provider).toBe('claude');
    expect(result.text).toBe('{"result": "ok"}');
  });

  it('calls OpenAI when provider is openai', async () => {
    const result = await callAI({
      messages: [{ role: 'user', content: 'Hello' }],
      companyProvider: 'openai',
    });
    expect(result.provider).toBe('openai');
    expect(result.text).toBe('{"result": "ok"}');
  });

  it('throws when OpenAI key missing — no company or global key', async () => {
    // Directly test the service with no global key by re-requiring with reset modules
    jest.resetModules();
    jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: jest.fn() } })));
    jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: jest.fn() } } })));
    jest.mock('../../src/config', () => ({
      ai: { provider: 'openai', openaiKey: null, anthropicKey: null, claudeModel: 'c', openaiModel: 'g', maxTokens: 100 },
      encryptionKey: null,
    }));
    jest.mock('../../src/utils/helpers', () => ({ decrypt: (v) => v }));
    const { callAI: freshCallAI } = require('../../src/services/ai.service');

    await expect(freshCallAI({
      messages: [{ role: 'user', content: 'test' }],
      companyProvider: 'openai',
      companyOpenaiKey: null,
    })).rejects.toThrow('OpenAI API key not configured');
  });

  it('throws when Anthropic key missing — no company or global key', async () => {
    jest.resetModules();
    jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: jest.fn() } })));
    jest.mock('openai', () => jest.fn().mockImplementation(() => ({ chat: { completions: { create: jest.fn() } } })));
    jest.mock('../../src/config', () => ({
      ai: { provider: 'claude', openaiKey: null, anthropicKey: null, claudeModel: 'c', openaiModel: 'g', maxTokens: 100 },
      encryptionKey: null,
    }));
    jest.mock('../../src/utils/helpers', () => ({ decrypt: (v) => v }));
    const { callAI: freshCallAI } = require('../../src/services/ai.service');

    await expect(freshCallAI({
      messages: [{ role: 'user', content: 'test' }],
      companyProvider: 'claude',
      companyAnthropicKey: null,
    })).rejects.toThrow('Anthropic API key not configured');
  });

  it('times out after AI_TIMEOUT_MS', async () => {
    jest.resetModules();
    jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({
      messages: { create: jest.fn(() => new Promise(r => setTimeout(r, 5000))) },
    })));
    jest.mock('openai', () => jest.fn());
    jest.mock('../../src/config', () => ({
      ai: { provider: 'claude', anthropicKey: 'test-key', openaiKey: null, claudeModel: 'c', openaiModel: 'g', maxTokens: 100 },
      encryptionKey: null,
    }));
    jest.mock('../../src/utils/helpers', () => ({ decrypt: (v) => v }));

    process.env.AI_TIMEOUT_MS = '50';
    const { callAI: freshCallAI } = require('../../src/services/ai.service');

    await expect(freshCallAI({
      messages: [{ role: 'user', content: 'test' }],
      companyProvider: 'claude',
      companyAnthropicKey: 'key',
    })).rejects.toThrow(/timed out/i);

    delete process.env.AI_TIMEOUT_MS;
  }, 10000);
});

describe('AI Service — generateImage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('generates image via DALL-E 3', async () => {
    const result = await generateImage({
      prompt: 'A futuristic office',
      companyOpenaiKey: 'test-key',
    });
    expect(result.url).toBe('https://example.com/image.png');
  });

  it('throws when no OpenAI key available', async () => {
    jest.resetModules();
    jest.mock('@anthropic-ai/sdk', () => jest.fn());
    jest.mock('openai', () => jest.fn());
    jest.mock('../../src/config', () => ({
      ai: { provider: 'claude', openaiKey: null, anthropicKey: null, claudeModel: 'c', openaiModel: 'g', maxTokens: 100 },
      encryptionKey: null,
    }));
    jest.mock('../../src/utils/helpers', () => ({ decrypt: (v) => v }));
    const { generateImage: freshGenImg } = require('../../src/services/ai.service');

    await expect(freshGenImg({ prompt: 'Test', companyOpenaiKey: null })).rejects.toThrow('OpenAI API key');
  });
});
