// Shared provider metadata. Models can also be entered manually in Settings.
const AI_PROVIDERS = {
  openai: {
    label: 'OpenAI', defaultModel: 'gpt-4o', keyHint: 'sk-...',
    models: ['gpt-4o', 'gpt-4o-mini'],
    help: 'OpenAI: use a chave da plataforma de API e um modelo habilitado na sua conta.',
  },
  grok: {
    label: 'xAI (Grok)', defaultModel: 'grok-4.7', keyHint: 'xai-...',
    models: ['grok-4.7'],
    help: 'Grok: crie uma chave no console da xAI. A assinatura do aplicativo Grok não substitui créditos de API.',
  },
  gemini: {
    label: 'Google Gemini', defaultModel: 'gemini-flash-latest', keyHint: 'AIza...',
    models: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    help: 'Gemini: use uma chave do Google AI Studio (Gemini Developer API).',
  },
};
if (typeof module !== 'undefined') module.exports = { AI_PROVIDERS };
