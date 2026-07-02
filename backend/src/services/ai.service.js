const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { toFile } = require('openai');
const fs = require('fs');
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
// gpt-image-1 sizes differ from dall-e-3's — map the legacy values
const GPT_IMAGE_SIZES = { '1024x1024': '1024x1024', '1024x1792': '1024x1536', '1792x1024': '1536x1024' };

function mapOpenAIImageError(err) {
  if (err.status === 401) return operational('OpenAI API key is invalid or revoked — update it in Settings > AI Config', 400);
  if (err.code === 'content_policy_violation' || err.code === 'moderation_blocked') return operational('The image description was rejected by OpenAI content policy — please rephrase it', 400);
  if (err.code === 'billing_hard_limit_reached' || err.status === 429) return operational('OpenAI quota or billing limit reached — check your OpenAI account billing', 402);
  return operational(`Image generation failed: ${err.message}`, err.status && err.status < 500 ? err.status : 502);
}

// Returns { buffer } — a PNG Buffer ready to write to disk.
async function generateImage({ prompt, companyOpenaiKey, size = '1024x1024' }) {
  const rawKey = (companyOpenaiKey ? decrypt(companyOpenaiKey) : null) || config.ai.openaiKey;
  if (!rawKey) throw operational('AI image generation requires an OpenAI API key — add one in Settings > AI Config', 400);

  const client = new OpenAI({ apiKey: rawKey });

  // Newer OpenAI keys only have gpt-image-1 (returns base64); older keys may
  // only have dall-e-3 (returns a temporary URL). Try gpt-image-1 first and
  // fall back when the model isn't available on this key.
  try {
    const response = await client.images.generate({
      model: 'gpt-image-1',
      prompt,
      size: GPT_IMAGE_SIZES[size] || '1024x1024',
      n: 1,
    });
    const b64 = response?.data?.[0]?.b64_json;
    if (!b64) throw operational('OpenAI returned no image — please try again', 502);
    return { buffer: Buffer.from(b64, 'base64') };
  } catch (err) {
    const modelMissing = err.status === 400 || err.status === 403 || err.status === 404;
    if (!(modelMissing && /model|does not exist|not found|verified/i.test(err.message || ''))) {
      throw err.isOperational ? err : mapOpenAIImageError(err);
    }
  }

  // Fallback: dall-e-3
  try {
    const response = await client.images.generate({
      model: 'dall-e-3',
      prompt,
      size,
      n: 1,
      quality: 'standard',
      response_format: 'b64_json',
    });
    const b64 = response?.data?.[0]?.b64_json;
    if (!b64) throw operational('OpenAI returned no image — please try again', 502);
    return { buffer: Buffer.from(b64, 'base64') };
  } catch (err) {
    throw err.isOperational ? err : mapOpenAIImageError(err);
  }
}

// Mark an error as safe to show to the client (errorHandler hides non-operational messages)
function operational(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}

// Edits an existing image with a prompt via gpt-image-1 (dall-e-3 has no
// comparable prompt-based edit). Returns { buffer } — the edited PNG.
async function editImage({ prompt, imagePath, companyOpenaiKey }) {
  const rawKey = (companyOpenaiKey ? decrypt(companyOpenaiKey) : null) || config.ai.openaiKey;
  if (!rawKey) throw operational('AI image editing requires an OpenAI API key — add one in Settings > AI Config', 400);
  if (!fs.existsSync(imagePath)) throw operational('Original image file not found on the server', 404);

  const client = new OpenAI({ apiKey: rawKey });
  try {
    const response = await client.images.edit({
      model: 'gpt-image-1',
      image: await toFile(fs.createReadStream(imagePath), 'image.png', { type: 'image/png' }),
      prompt,
      n: 1,
    });
    const b64 = response?.data?.[0]?.b64_json;
    if (!b64) throw operational('OpenAI returned no image — please try again', 502);
    return { buffer: Buffer.from(b64, 'base64') };
  } catch (err) {
    throw err.isOperational ? err : mapOpenAIImageError(err);
  }
}

module.exports = { callAI, generateImage, editImage };
