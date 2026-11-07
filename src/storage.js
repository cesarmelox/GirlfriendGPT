// src/storage.js
// Centralized storage access for chrome.storage.local

const DEFAULT_SETTINGS = {
  enabled: false,
  paused: false,
  autoSend: false,
  safetyMode: true,
  allowedChat: '',
  provider: 'openai',
  providerProfiles: {},
  apiKey: '',
  model: 'gpt-4o',
  systemPrompt: `You are replying as the user in a WhatsApp conversation. Your job is to write short, natural replies that match the user's tone and style based on their previous message examples.

Rules:
- Reply in whatever language and style the conversation is in.
- Keep it natural like WhatsApp texting.
- Do not sound like an AI.
- Do not over-explain.
- Do not be poetic.
- Do not be too romantic unless the conversation already has that tone.
- Do not invent plans, promises, emotions, locations, excuses, or facts.
- Do not say anything the user did not provide.
- If unsure, reply with a safe short message.
- Keep most replies under 20 words.
- Match the user's style from the examples.
- Avoid corporate or formal language.
- Use emojis only if the user usually uses emojis.
- If the incoming message is serious, emotional, conflict-related, about trust, jealousy, family, money, commitment, or future plans, set risk_level to high and can_auto_send to false.

Always respond with valid JSON only, no markdown, no backticks:
{
  "reply": "the WhatsApp message to insert",
  "risk_level": "low | medium | high",
  "can_auto_send": true or false,
  "reason": "short reason"
}`,
  styleInstructions: '',
  styleSummary: '',
  styleExamples: [],
  debugMode: false,
};

const SENSITIVE_KEYWORDS = [
  'trust', 'jealous', 'lying', 'future', 'marriage',
  'engagement', 'money', 'family', 'break up',
  'serious', 'we need to talk', 'betrayed',
];

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...data });
    });
  });
}

async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set(settings, resolve);
  });
}

async function getSetting(key) {
  const settings = await getSettings();
  return settings[key];
}

async function setSetting(key, value) {
  return saveSettings({ [key]: value });
}

async function resetSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      chrome.storage.local.set(DEFAULT_SETTINGS, resolve);
    });
  });
}

function containsSensitiveKeyword(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// Export for use in other modules (MV3 service worker / content script)
if (typeof module !== 'undefined') {
  module.exports = { getSettings, saveSettings, getSetting, setSetting, resetSettings, containsSensitiveKeyword, DEFAULT_SETTINGS, SENSITIVE_KEYWORDS };
}
