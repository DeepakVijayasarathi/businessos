const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const config = require('../config');
const { decrypt } = require('../utils/helpers');

async function callAI({ messages, system, companyAnthropicKey, companyOpenaiKey, companyProvider, maxTokens = 1024 }) {
  const provider = companyProvider || config.ai.provider;
  const tokens = maxTokens || config.ai.maxTokens;

  if (provider === 'openai') {
    const rawKey = (companyOpenaiKey ? decrypt(companyOpenaiKey) : null) || config.ai.openaiKey;
    if (!rawKey) throw new Error('OpenAI API key not configured');
    const client = new OpenAI({ apiKey: rawKey });
    const chatMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const response = await client.chat.completions.create({ model: config.ai.openaiModel, max_tokens: tokens, messages: chatMessages });
    return { text: response.choices[0].message.content, model: config.ai.openaiModel, provider: 'openai' };
  }

  const rawKey = (companyAnthropicKey ? decrypt(companyAnthropicKey) : null) || config.ai.anthropicKey;
  if (!rawKey) throw new Error('Anthropic API key not configured');
  const client = new Anthropic({ apiKey: rawKey });
  const response = await client.messages.create({ model: config.ai.claudeModel, max_tokens: tokens, ...(system && { system }), messages });
  return { text: response.content[0].text, model: config.ai.claudeModel, provider: 'claude' };
}

module.exports = { callAI };
