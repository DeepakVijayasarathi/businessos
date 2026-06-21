const axios = require('axios');
const config = require('../config');

const MSG91_BASE_URL = 'https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message';

/**
 * Sends a plain text WhatsApp message via the company's configured provider.
 * `phone` is the Meta phone-number-ID or the MSG91 integrated number, and
 * `apiKey` is the Meta permanent token or the MSG91 authkey — both stored
 * in the same Company.whatsappPhone/whatsappApiKey fields regardless of
 * provider, since each provider only needs one credential pair.
 */
async function sendText({ provider, apiKey, phone, to, message }) {
  if (provider === 'msg91') return sendTextMsg91({ apiKey, phone, to, message });
  return sendTextMeta({ apiKey, phone, to, message });
}

async function sendTemplate({ provider, apiKey, phone, to, templateName, templateLanguage }) {
  if (provider === 'msg91') return sendTemplateMsg91({ apiKey, phone, to, templateName, templateLanguage });
  return sendTemplateMeta({ apiKey, phone, to, templateName, templateLanguage });
}

// ── Meta WhatsApp Cloud API ──────────────────────────────────────────────

async function sendTextMeta({ apiKey, phone, to, message }) {
  const response = await axios.post(
    `${config.whatsapp.apiUrl}/${phone}/messages`,
    { messaging_product: 'whatsapp', to, type: 'text', text: { body: message } },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return { messageId: response.data?.messages?.[0]?.id };
}

async function sendTemplateMeta({ apiKey, phone, to, templateName, templateLanguage }) {
  const response = await axios.post(
    `${config.whatsapp.apiUrl}/${phone}/messages`,
    { messaging_product: 'whatsapp', to, type: 'template', template: { name: templateName, language: { code: templateLanguage || 'en' } } },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  return { messageId: response.data?.messages?.[0]?.id };
}

// ── MSG91 WhatsApp API (v5) ───────────────────────────────────────────────
// Implemented from MSG91's published API documentation, not verified
// against a live account — confirm the exact payload shape in the MSG91
// dashboard before relying on this in production; third-party APIs change.

async function sendTextMsg91({ apiKey, phone, to, message }) {
  const response = await axios.post(
    `${MSG91_BASE_URL}/bulk/`,
    {
      integrated_number: phone,
      content_type: 'text',
      payload: { to, type: 'text', text: { body: message } },
    },
    { headers: { authkey: apiKey, 'Content-Type': 'application/json' } }
  );
  return { messageId: response.data?.data?.[0]?.message_id || response.data?.request_id };
}

async function sendTemplateMsg91({ apiKey, phone, to, templateName, templateLanguage }) {
  const response = await axios.post(
    `${MSG91_BASE_URL}/bulk/`,
    {
      integrated_number: phone,
      content_type: 'template',
      payload: {
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage || 'en', policy: 'deterministic' },
          to_and_components: [{ to: [to] }],
        },
      },
    },
    { headers: { authkey: apiKey, 'Content-Type': 'application/json' } }
  );
  return { messageId: response.data?.data?.[0]?.message_id || response.data?.request_id };
}

module.exports = { sendText, sendTemplate };
