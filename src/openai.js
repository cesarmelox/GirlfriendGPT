// Provider adapters used only by the extension service worker.
// Keys go to fixed official hosts, never to a user-supplied endpoint.
async function callAI(provider, apiKey, model, messages) {
  const config = AI_PROVIDERS[provider];
  if (!config) throw new Error('Provedor de IA desconhecido. Revise as configurações.');
  if (!apiKey?.trim()) throw new Error(`Configure a chave de API de ${config.label}.`);
  model = model?.trim() || config.defaultModel;
  let url, body, headers = { 'Content-Type': 'application/json' };
  if (provider === 'gemini') {
    const modelId = model.replace(/^models\//, '');
    if (!/^[a-zA-Z0-9._-]+$/.test(modelId)) throw new Error('ID do modelo Gemini inválido.');
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
    headers['x-goog-api-key'] = apiKey.trim();
    const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }],
      })),
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
    };
  } else {
    url = provider === 'grok' ? 'https://api.x.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = `Bearer ${apiKey.trim()}`;
    body = { model, messages, response_format: { type: 'json_object' } };
    // Preserve the previous OpenAI generation behavior. Grok uses model defaults.
    if (provider === 'openai') Object.assign(body, { max_tokens: 300, temperature: 0.85 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) {
      const tips = {
        400: 'Verifique o ID do modelo e os parâmetros aceitos.',
        401: 'Chave de API inválida ou sem autorização.',
        403: 'Sem acesso ao modelo ou serviço nesta conta/região.',
        404: 'Modelo não encontrado ou indisponível para sua conta.',
        429: 'Limite de uso ou créditos da API atingido. Tente novamente mais tarde.',
      };
      // Do not echo API error bodies: they can contain secrets or private chat text.
      throw new Error(`${config.label}: erro ${response.status}. ${tips[response.status] || 'Serviço indisponível. Tente novamente mais tarde.'}`);
    }
    const data = await response.json();
    let text;
    if (provider === 'gemini') {
      const candidate = data.candidates?.[0];
      if (!candidate || (candidate.finishReason && candidate.finishReason !== 'STOP')) {
        throw new Error('Gemini não concluiu a resposta (bloqueio ou limite de geração).');
      }
      text = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('');
    } else {
      const choice = data.choices?.[0];
      if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new Error(`${config.label}: resposta incompleta ou bloqueada.`);
      text = choice?.message?.content;
    }
    return parseAIReply(text, config.label);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`${config.label}: tempo de resposta excedido. Tente novamente.`);
    throw error;
  } finally { clearTimeout(timer); }
}
function parseAIReply(text, label) {
  if (typeof text !== 'string' || !text.trim()) throw new Error(`${label}: resposta vazia.`);
  let parsed;
  try { parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error(`${label}: a IA não retornou JSON válido. Nenhuma mensagem foi liberada para envio.`); }
  if (!parsed || typeof parsed.reply !== 'string') throw new Error(`${label}: formato de resposta inválido.`);
  const risk = ['low', 'medium', 'high'].includes(parsed.risk_level) ? parsed.risk_level : 'high';
  return {
    reply: parsed.reply,
    risk_level: risk,
    can_auto_send: parsed.can_auto_send === true && risk === 'low' && !!parsed.reply.trim(),
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}
// Compatibility with older callers.
async function callOpenAI(apiKey, model, messages) { return callAI('openai', apiKey, model, messages); }
if (typeof module !== 'undefined') module.exports = { callAI, callOpenAI, parseAIReply };
