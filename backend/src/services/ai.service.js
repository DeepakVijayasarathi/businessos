const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const config = require('../config');
const { decrypt } = require('../utils/helpers');

const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS) || 30000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms)),
  ]);
}

async function callAI({ messages, system, companyAnthropicKey, companyOpenaiKey, companyProvider, maxTokens = 1024 }) {
  const provider = companyProvider || config.ai.provider;
  const tokens = maxTokens || config.ai.maxTokens;

  if (provider === 'openai') {
    const rawKey = (companyOpenaiKey ? decrypt(companyOpenaiKey) : null) || config.ai.openaiKey;
    if (!rawKey) throw new Error('OpenAI API key not configured');
    const client = new OpenAI({ apiKey: rawKey });
    const chatMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const response = await withTimeout(
      client.chat.completions.create({ model: config.ai.openaiModel, max_tokens: tokens, messages: chatMessages }),
      AI_TIMEOUT_MS
    );
    return { text: response.choices[0].message.content, model: config.ai.openaiModel, provider: 'openai' };
  }

  const rawKey = (companyAnthropicKey ? decrypt(companyAnthropicKey) : null) || config.ai.anthropicKey;
  if (!rawKey) throw new Error('Anthropic API key not configured');
  const client = new Anthropic({ apiKey: rawKey });
  const response = await withTimeout(
    client.messages.create({ model: config.ai.claudeModel, max_tokens: tokens, ...(system && { system }), messages }),
    AI_TIMEOUT_MS
  );
  return { text: response.content[0].text, model: config.ai.claudeModel, provider: 'claude' };
}

/**
 * Generates an image from a text prompt via OpenAI's DALL-E. Image generation
 * has no Claude equivalent, so this always uses an OpenAI key regardless of
 * the company's chat provider preference.
 */
async function generateImage({ prompt, companyOpenaiKey, size = '1024x1024' }) {
  const rawKey = (companyOpenaiKey ? decrypt(companyOpenaiKey) : null) || config.ai.openaiKey;
  if (!rawKey) throw new Error('AI image generation requires an OpenAI API key — add one in Settings > AI Config');

  const client = new OpenAI({ apiKey: rawKey });
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    size,
    n: 1,
    quality: 'standard',
  });
  return { url: response.data[0].url };
}

module.exports = { callAI, generateImage };
