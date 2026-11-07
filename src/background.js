// src/background.js
// MV3 Service Worker
// Handles OpenAI API calls and coordinates between popup/content scripts.

importScripts('storage.js', 'providers.js', 'openai.js', 'promptBuilder.js');

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_REPLY') {
    handleGenerateReply(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message || String(err) }));
    return true; // Keep channel open for async
  }

  if (message.type === 'GET_STATUS') {
    getStatus().then(sendResponse).catch(() => sendResponse({ status: 'error' }));
    return true;
  }

  if (message.type === 'SET_SETTING') {
    setSetting(message.key, message.value)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

// ─── GENERATE REPLY ───────────────────────────────────────────────────────────

async function handleGenerateReply(payload) {
  const settings = await getSettings();

  // Safety checks
  if (!settings.apiKey) {
    return { error: 'No API key configured. Please set it in the extension settings.' };
  }

  if (!settings.enabled) {
    return { error: 'Assistant is disabled.' };
  }

  if (settings.paused) {
    return { error: 'Assistant is paused.' };
  }

  const {
    incomingMessage,
    recentContext,
    chatTitle,
  } = payload;

  // Verify chat matches allowed chat
  const allowedChat = settings.allowedChat?.trim().toLowerCase();
  const currentChat = chatTitle?.trim().toLowerCase();

  if (!allowedChat) {
    return { error: 'No allowed chat configured. Set it in settings.' };
  }

  if (!currentChat || !currentChat.includes(allowedChat) && !allowedChat.includes(currentChat)) {
    return { error: `Chat mismatch: "${chatTitle}" is not the allowed chat.` };
  }

  // Safety mode keyword check
  if (settings.safetyMode && containsSensitiveKeyword(incomingMessage)) {
    return {
      reply: '',
      risk_level: 'high',
      can_auto_send: false,
      reason: 'Safety mode: message contains sensitive keyword. Review manually.',
      blocked: true,
    };
  }

  // Build prompt
  const messages = buildPromptMessages({
    systemPrompt: settings.systemPrompt || '',
    styleInstructions: settings.styleInstructions || '',
    styleSummary: settings.styleSummary || '',
    styleExamples: settings.styleExamples || [],
    incomingMessage,
    recentContext: recentContext || [],
  });

  // Call the selected provider
  const result = await callAI(settings.provider || 'openai', settings.apiKey, settings.model, messages);

  // Override can_auto_send if safety mode blocks
  if (settings.safetyMode && result.risk_level !== 'low') {
    result.can_auto_send = false;
  }

  // Never auto-send if the setting is OFF
  if (!settings.autoSend) {
    result.can_auto_send = false;
  }

  return result;
}

// ─── STATUS ───────────────────────────────────────────────────────────────────

async function getStatus() {
  const settings = await getSettings();
  if (!settings.apiKey) return { status: 'missing_key' };
  if (!settings.enabled) return { status: 'disabled' };
  if (settings.paused) return { status: 'paused' };
  return { status: 'active', allowedChat: settings.allowedChat };
}
