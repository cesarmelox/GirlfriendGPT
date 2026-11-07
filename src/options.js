// src/options.js

const DEFAULT_SYSTEM_PROMPT = `You are replying as the user in a WhatsApp conversation. Your job is to write short, natural replies that match the user's tone and style based on their previous message examples.

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

Always respond with valid JSON only. No markdown. No backticks. No extra text:
{
  "reply": "the message to send",
  "risk_level": "low | medium | high",
  "can_auto_send": true or false,
  "reason": "one line reason"
}`;

const $ = (id) => document.getElementById(id);
let activeProvider = 'openai';
let providerProfiles = {};

function rememberProvider() {
  providerProfiles[activeProvider] = {
    apiKey: $('apiKey').value.trim(),
    model: $('modelSelect').value.trim() || AI_PROVIDERS[activeProvider].defaultModel,
  };
}
function renderProvider() {
  const config = AI_PROVIDERS[activeProvider];
  const profile = providerProfiles[activeProvider] || {};
  $('apiKey').value = profile.apiKey || '';
  $('apiKey').placeholder = config.keyHint;
  $('modelSelect').value = profile.model || config.defaultModel;
  $('modelSuggestions').replaceChildren(...config.models.map(model => {
    const option = document.createElement('option');
    option.value = model;
    return option;
  }));
  $('providerHelp').textContent = config.help;
}
$('providerSelect').addEventListener('change', () => {
  rememberProvider();
  activeProvider = $('providerSelect').value;
  renderProvider();
});

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await storageGet([
    'provider', 'providerProfiles', 'apiKey', 'model', 'allowedChat', 'autoSend', 'safetyMode', 'debugMode',
    'systemPrompt', 'styleInstructions', 'styleSummary', 'styleExamples',
  ]);

  providerProfiles = { ...(data.providerProfiles || {}) };
  activeProvider = AI_PROVIDERS[data.provider] ? data.provider : 'openai';
  providerProfiles[activeProvider] = {
    apiKey: data.apiKey || '',
    model: data.model || AI_PROVIDERS[activeProvider].defaultModel,
  };
  $('providerSelect').value = activeProvider;
  renderProvider();
  $('allowedChat').value = data.allowedChat || '';
  $('autoSend').checked = !!data.autoSend;
  $('safetyMode').checked = data.safetyMode !== false; // default true
  $('debugMode').checked = !!data.debugMode;
  $('systemPrompt').value = data.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  $('styleInstructions').value = data.styleInstructions || '';

  updateAutoSendWarn(!!data.autoSend);

  if (data.styleSummary) {
    $('styleProfileStatus').style.display = 'block';
    $('styleProfilePill').textContent = `Style profile loaded ✓ (${(data.styleExamples || []).length} examples)`;
  }
}

// ─── AUTO-SEND WARNING ────────────────────────────────────────────────────────

$('autoSend').addEventListener('change', (e) => updateAutoSendWarn(e.target.checked));

function updateAutoSendWarn(on) {
  $('autoSendWarn').style.display = on ? 'block' : 'none';
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────

$('saveBtn').addEventListener('click', async () => {
  rememberProvider();
  const settings = {
    provider: activeProvider,
    providerProfiles,
    apiKey: $('apiKey').value.trim(),
    model: $('modelSelect').value.trim() || AI_PROVIDERS[activeProvider].defaultModel,
    allowedChat: $('allowedChat').value.trim(),
    autoSend: $('autoSend').checked,
    safetyMode: $('safetyMode').checked,
    debugMode: $('debugMode').checked,
    systemPrompt: $('systemPrompt').value.trim(),
    styleInstructions: $('styleInstructions').value.trim(),
  };

  await storageSet(settings);
  showToast('Settings saved ✓');
});

$('resetDefaultsBtn').addEventListener('click', () => {
  if (confirm('Reset system prompt to default?')) {
    $('systemPrompt').value = DEFAULT_SYSTEM_PROMPT;
    $('styleInstructions').value = '';
  }
});

// ─── CLEAR STYLE ─────────────────────────────────────────────────────────────

$('clearStyleBtn').addEventListener('click', async () => {
  if (!confirm('Clear all style training data? This removes the style summary and examples.')) return;
  await storageSet({ styleSummary: '', styleExamples: [] });
  $('styleProfileStatus').style.display = 'none';
  showToast('Style data cleared');
});

// ─── CHAT EXPORT UPLOAD ───────────────────────────────────────────────────────

$('uploadArea').addEventListener('click', () => $('chatFileInput').click());

$('uploadArea').addEventListener('dragover', (e) => {
  e.preventDefault();
  $('uploadArea').style.borderColor = '#00a884';
});

$('uploadArea').addEventListener('dragleave', () => {
  $('uploadArea').style.borderColor = '#3b4a54';
});

$('uploadArea').addEventListener('drop', (e) => {
  e.preventDefault();
  $('uploadArea').style.borderColor = '#3b4a54';
  const file = e.dataTransfer.files[0];
  if (file) handleFileUpload(file);
});

$('chatFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFileUpload(file);
});

let parsedChatData = null;

function handleFileUpload(file) {
  if (!file.name.endsWith('.txt')) {
    showUploadStatus('error', '❌ Please upload a .txt file exported from WhatsApp.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const rawText = e.target.result;
    try {
      const result = processChatExport(rawText, null);
      parsedChatData = { rawText, senders: result.senders, messageCount: result.messageCount };

      showUploadStatus('success',
        `✅ File loaded: ${result.messageCount} messages found.\n` +
        `Senders: ${result.senders.join(', ')}\n` +
        `Now select which sender is you.`
      );

      // Populate sender dropdown
      const sel = $('senderSelect');
      sel.innerHTML = '<option value="">— Select your name —</option>';
      for (const sender of result.senders) {
        const opt = document.createElement('option');
        opt.value = sender;
        opt.textContent = sender;
        sel.appendChild(opt);
      }

      $('senderSelectWrap').style.display = 'block';
    } catch (err) {
      showUploadStatus('error', '❌ Failed to parse chat file: ' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
}

$('buildStyleBtn').addEventListener('click', async () => {
  const myName = $('senderSelect').value;
  if (!myName) {
    alert('Please select which sender is you.');
    return;
  }

  if (!parsedChatData) {
    alert('Please upload a chat file first.');
    return;
  }

  try {
    const result = processChatExport(parsedChatData.rawText, myName);

    if (!result.styleSummary) {
      showUploadStatus('error', '❌ Could not find your messages. Make sure you selected the right sender.');
      return;
    }

    await storageSet({
      styleSummary: result.styleSummary,
      styleExamples: result.styleExamples,
    });

    showUploadStatus('success',
      `✅ Style profile built!\n` +
      `${result.styleExamples.length} example messages saved.\n` +
      `Style summary generated.`
    );

    $('styleProfileStatus').style.display = 'block';
    $('styleProfilePill').textContent = `Style profile loaded ✓ (${result.styleExamples.length} examples)`;
    $('senderSelectWrap').style.display = 'none';

    showToast('Style profile saved ✓');
  } catch (err) {
    showUploadStatus('error', '❌ Error: ' + err.message);
  }
});

// ─── UI HELPERS ───────────────────────────────────────────────────────────────

function showUploadStatus(type, msg) {
  const el = $('uploadStatus');
  el.className = `upload-status ${type}`;
  el.textContent = msg;
  el.style.display = 'block';
}

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

init();

// ─── CRYPTO ADDRESS COPY ──────────────────────────────────────────────────────
document.querySelectorAll('.crypto-address').forEach((el) => {
  el.addEventListener('click', async () => {
    const addr = el.getAttribute('data-addr');
    try {
      await navigator.clipboard.writeText(addr);
      const orig = el.textContent;
      el.textContent = '✓ Copied!';
      el.style.color = '#3fb950';
      setTimeout(() => {
        el.textContent = orig;
        el.style.color = '';
      }, 1800);
    } catch {
      // Fallback: select all text so user can copy manually
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }
  });
});
