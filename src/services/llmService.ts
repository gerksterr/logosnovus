import { 
  LLMConfig, 
  QueryResult, 
  LLMProviderType, 
  CustomProviderConfig, 
  TranslationChatMessage,
  LLMModelBlueprint 
} from '../types';
import { cleanCopiedReaderText } from '../utils/textUtils';
import { getStoredLLMModelBlueprints, getLLMConfig } from './storageService';

/**
 * Resolves the effective LLMConfig to use for a given modelBlueprintId.
 * If modelBlueprintId matches a stored LLMModelBlueprint, returns its configuration.
 * Otherwise falls back to global active LLMConfig.
 */
export function resolveLLMConfigForBlueprint(
  modelBlueprintId?: string,
  fallbackConfig?: LLMConfig
): { config: LLMConfig; modelBlueprintName?: string; modelBlueprintId?: string } {
  const defaultFallback = fallbackConfig || getLLMConfig();
  if (!modelBlueprintId) {
    return { config: defaultFallback };
  }

  const storedModels = getStoredLLMModelBlueprints();
  const matched = storedModels.find((m) => m.id === modelBlueprintId);
  if (!matched) {
    return { config: defaultFallback };
  }

  const resolvedConfig: LLMConfig = {
    provider: matched.provider || defaultFallback.provider || 'built-in-gemini',
    modelName: matched.modelName || defaultFallback.modelName || 'gemini-3.7-flash',
    customApiKey: matched.customApiKey || defaultFallback.customApiKey,
    customBaseUrl: matched.customBaseUrl || defaultFallback.customBaseUrl,
    requestJsonTemplate: matched.requestJsonTemplate || defaultFallback.requestJsonTemplate,
    customProviders: defaultFallback.customProviders,
    activeCustomProviderId: defaultFallback.activeCustomProviderId,
  };

  return {
    config: resolvedConfig,
    modelBlueprintName: matched.name,
    modelBlueprintId: matched.id,
  };
}

/**
 * Returns the default template-based JSON request structure for a provider/model.
 */
export function getDefaultRequestJsonTemplate(provider: LLMProviderType, modelName: string): string {
  if (provider === 'built-in-gemini' || provider === 'custom-gemini') {
    return JSON.stringify(
      {
        model: "{model}",
        contents: [
          {
            role: "user",
            parts: [{ text: "{prompt}" }]
          }
        ],
        generationConfig: {
          temperature: 0.3
        }
      },
      null,
      2
    );
  } else {
    return JSON.stringify(
      {
        model: "{model}",
        messages: [
          {
            role: "system",
            content: "{systemInstruction}"
          },
          {
            role: "user",
            content: "{prompt}"
          }
        ],
        stream: true,
        temperature: 0.3
      },
      null,
      2
    );
  }
}

/**
 * Replaces placeholders in custom JSON call template with variable values.
 */
export function buildRequestPayloadFromTemplate(
  template: string,
  vars: { prompt: string; model: string; systemInstruction?: string; targetText?: string; type?: string }
): any {
  if (!template || !template.trim()) return null;
  try {
    let str = template;
    str = str.replace(/\{prompt\}/g, JSON.stringify(vars.prompt || '').slice(1, -1));
    str = str.replace(/\{model\}/g, vars.model || '');
    str = str.replace(/\{systemInstruction\}/g, JSON.stringify(vars.systemInstruction || 'You are an expert language etymologist and literary translator.').slice(1, -1));
    str = str.replace(/\{targetText\}/g, JSON.stringify(vars.targetText || '').slice(1, -1));
    str = str.replace(/\{type\}/g, vars.type || '');
    return JSON.parse(str);
  } catch (err) {
    console.warn('Could not parse requestJsonTemplate:', err);
    return null;
  }
}

/**
 * Replaces placeholders in prompt template.
 * For word queries: {word}
 * For passage queries: {text}
 */
export function buildQueryPrompt(
  template: string,
  target: string,
  type: 'word' | 'passage'
): string {
  const cleanedTarget = cleanCopiedReaderText(target).trim();
  if (type === 'word') {
    return template.replace(/\{word\}/gi, cleanedTarget);
  } else {
    return template.replace(/\{text\}/gi, cleanedTarget);
  }
}

/**
 * Execute LLM query with real-time streaming chunks and halt/abort support
 */
export async function executeLLMQueryStream(
  prompt: string,
  config: LLMConfig,
  onChunk: (accumulatedText: string) => void,
  systemInstruction?: string,
  signal?: AbortSignal,
  customRequestPayload?: any
): Promise<QueryResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      text: '',
      providerUsed: config.provider || 'built-in-gemini',
      modelUsed: config.modelName || 'gemini-3.7-flash',
      error: 'Offline Mode: You are currently offline. New AI queries require an internet connection, but all your stored texts and deciphered annotations remain accessible!',
    };
  }

  const effectiveConfig: LLMConfig = {
    ...config,
    customRequestPayload: customRequestPayload !== undefined ? customRequestPayload : config.customRequestPayload,
  };

  const provider = effectiveConfig.provider || 'built-in-gemini';

  try {
    // Check if provider is a custom provider configured by user
    const matchedCustomProvider = effectiveConfig.customProviders?.find(
      (cp) => cp.id === provider || cp.id === effectiveConfig.activeCustomProviderId
    );

    if (matchedCustomProvider) {
      const mergedConfig: LLMConfig = {
        ...effectiveConfig,
        provider: matchedCustomProvider.name,
        customApiKey: matchedCustomProvider.apiKey || effectiveConfig.customApiKey,
        modelName: effectiveConfig.modelName || matchedCustomProvider.defaultModel,
        customBaseUrl: matchedCustomProvider.baseUrl,
        requestJsonTemplate: matchedCustomProvider.requestJsonTemplate || effectiveConfig.requestJsonTemplate,
      };

      return await streamOpenAICompatible(
        matchedCustomProvider.baseUrl,
        mergedConfig,
        prompt,
        onChunk,
        systemInstruction,
        matchedCustomProvider.name,
        signal,
        matchedCustomProvider.customHeaders
      );
    }

    switch (provider) {
      case 'built-in-gemini':
        return await streamBuiltInGemini(
          prompt,
          effectiveConfig.modelName || 'gemini-3.7-flash',
          onChunk,
          systemInstruction,
          signal,
          effectiveConfig.maxTokens,
          effectiveConfig.temperature,
          effectiveConfig.customRequestPayload
        );

      case 'custom-gemini':
        return await streamCustomGemini(
          prompt,
          effectiveConfig,
          onChunk,
          systemInstruction,
          signal
        );

      case 'groq':
        return await streamOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          effectiveConfig,
          prompt,
          onChunk,
          systemInstruction,
          'Groq',
          signal
        );

      case 'openrouter':
        return await streamOpenAICompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          effectiveConfig,
          prompt,
          onChunk,
          systemInstruction,
          'OpenRouter',
          signal
        );

      case 'custom-openai':
        return await streamOpenAICompatible(
          effectiveConfig.customBaseUrl || 'https://api.openai.com/v1/chat/completions',
          effectiveConfig,
          prompt,
          onChunk,
          systemInstruction,
          'Custom OpenAI Provider',
          signal
        );

      default:
        // If unrecognized string, check if customBaseUrl is set, otherwise default to built-in gemini
        if (effectiveConfig.customBaseUrl) {
          return await streamOpenAICompatible(
            effectiveConfig.customBaseUrl,
            effectiveConfig,
            prompt,
            onChunk,
            systemInstruction,
            provider || 'Custom Provider',
            signal
          );
        }
        return await streamBuiltInGemini(
          prompt,
          'gemini-3.7-flash',
          onChunk,
          systemInstruction,
          signal,
          effectiveConfig.maxTokens,
          effectiveConfig.temperature,
          effectiveConfig.customRequestPayload
        );
    }
  } catch (err: any) {
    if (err.name === 'AbortError' || signal?.aborted) {
      return {
        text: '',
        providerUsed: provider,
        modelUsed: config.modelName || 'unknown',
        error: undefined, // Graceful halt
      };
    }
    console.error(`LLM Query Stream error (${provider}):`, err);
    let errorMsg = err.message || 'An unexpected error occurred during streaming.';
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      errorMsg = 'Offline Mode: Device is offline. Please reconnect to run new AI queries.';
    } else if (errorMsg.includes('Failed to fetch')) {
      errorMsg = 'Network connection issue or provider endpoint unreachable. Please verify your custom base URL or API settings.';
    }
    return {
      text: '',
      providerUsed: provider,
      modelUsed: config.modelName || 'unknown',
      error: errorMsg,
    };
  }
}

/**
 * Non-streaming fallback wrapper
 */
export async function executeLLMQuery(
  prompt: string,
  config: LLMConfig,
  systemInstruction?: string,
  signal?: AbortSignal
): Promise<QueryResult> {
  let finalResult = '';
  return await executeLLMQueryStream(
    prompt,
    config,
    (chunk) => {
      finalResult = chunk;
    },
    systemInstruction,
    signal
  );
}

/**
 * Stream Built-in Gemini via server /api/query-stream
 */
async function streamBuiltInGemini(
  prompt: string,
  model: string,
  onChunk: (text: string) => void,
  systemInstruction?: string,
  signal?: AbortSignal,
  maxOutputTokens?: number,
  temperature?: number,
  customRequestPayload?: any
): Promise<QueryResult> {
  const effectiveModel = model || 'gemini-3.7-flash';
  const response = await fetch('/api/query-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: effectiveModel,
      systemInstruction,
      maxOutputTokens,
      temperature,
      customRequestPayload,
    }),
    signal,
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || `Server stream error (${response.status})`);
  }

  if (!response.body) {
    throw new Error('No response stream returned from server.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulatedText = '';
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') break;
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.chunk) {
            accumulatedText += parsed.chunk;
            onChunk(accumulatedText);
          }
        } catch {
          // ignore parse glitch
        }
      }
    }
  }

  return {
    text: accumulatedText || 'No text output returned.',
    providerUsed: 'Built-in Gemini Server',
    modelUsed: effectiveModel,
    rawRequestPayload: { prompt, model: effectiveModel, systemInstruction, maxOutputTokens, temperature },
    rawResponsePayload: { accumulatedTextLength: accumulatedText.length, sampleText: accumulatedText.slice(0, 500) },
  };
}

/**
 * Stream Direct Custom Gemini
 */
async function streamCustomGemini(
  prompt: string,
  config: LLMConfig,
  onChunk: (text: string) => void,
  systemInstruction?: string,
  signal?: AbortSignal
): Promise<QueryResult> {
  if (!config.customApiKey) {
    throw new Error('Custom Gemini API key is missing. Please enter your API key in Settings.');
  }

  const model = config.modelName || 'gemini-3.7-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${config.customApiKey}`;

  let requestBody: any = null;
  if (config.customRequestPayload) {
    try {
      requestBody = typeof config.customRequestPayload === 'string'
        ? JSON.parse(config.customRequestPayload)
        : JSON.parse(JSON.stringify(config.customRequestPayload));
    } catch (err) {
      console.warn('Failed to parse customRequestPayload in streamCustomGemini:', err);
    }
  } else if (config.requestJsonTemplate) {
    requestBody = buildRequestPayloadFromTemplate(config.requestJsonTemplate, {
      prompt,
      model,
      systemInstruction,
    });
  }

  if (!requestBody) {
    requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
    };
    if (systemInstruction) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    const genConfig: any = {};
    if (config.maxTokens) genConfig.maxOutputTokens = config.maxTokens;
    if (config.temperature !== undefined) genConfig.temperature = config.temperature;
    if (Object.keys(genConfig).length > 0) {
      requestBody.generationConfig = genConfig;
    }
  } else {
    if (config.maxTokens && (!requestBody.generationConfig || !requestBody.generationConfig.maxOutputTokens)) {
      requestBody.generationConfig = {
        ...(requestBody.generationConfig || {}),
        maxOutputTokens: config.maxTokens,
      };
    }
    if (config.temperature !== undefined && (!requestBody.generationConfig || requestBody.generationConfig.temperature === undefined)) {
      requestBody.generationConfig = {
        ...(requestBody.generationConfig || {}),
        temperature: config.temperature,
      };
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gemini API status ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulatedText = '';
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(dataStr);
          const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunkText) {
            accumulatedText += chunkText;
            onChunk(accumulatedText);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    text: accumulatedText || 'No completion returned.',
    providerUsed: 'Custom Gemini Direct',
    modelUsed: model,
    rawRequestPayload: requestBody,
    rawResponsePayload: { accumulatedTextLength: accumulatedText.length },
  };
}

/**
 * Stream OpenAI Compatible Endpoint (Groq, OpenRouter, Custom OpenAI, Ollama, LM Studio, etc.)
 */
async function streamOpenAICompatible(
  endpointUrl: string,
  config: LLMConfig,
  prompt: string,
  onChunk: (text: string) => void,
  systemInstruction?: string,
  providerLabel: string = 'OpenAI Compatible',
  signal?: AbortSignal,
  customHeaders?: Record<string, string>
): Promise<QueryResult> {
  const apiKey = config.customApiKey || '';
  const modelName = config.modelName || 'gpt-4o-mini';

  if (!endpointUrl || !endpointUrl.trim()) {
    throw new Error('Custom provider base URL is required. Please specify a valid endpoint URL.');
  }

  let requestBodyObj: any = null;
  if (config.customRequestPayload) {
    try {
      requestBodyObj = typeof config.customRequestPayload === 'string'
        ? JSON.parse(config.customRequestPayload)
        : JSON.parse(JSON.stringify(config.customRequestPayload));
    } catch (err) {
      console.warn('Failed to parse customRequestPayload in streamOpenAICompatible:', err);
    }
  } else if (config.requestJsonTemplate) {
    requestBodyObj = buildRequestPayloadFromTemplate(config.requestJsonTemplate, {
      prompt,
      model: modelName,
      systemInstruction,
    });
  }

  if (!requestBodyObj) {
    const messages: { role: string; content: string }[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    requestBodyObj = {
      model: modelName,
      messages,
      temperature: config.temperature ?? 0.3,
      stream: true,
    };
    if (config.maxTokens) {
      requestBodyObj.max_tokens = config.maxTokens;
    }
  } else {
    // If requestBodyObj is provided, ensure max_tokens is applied if set in config and not explicitly defined
    if (config.maxTokens && requestBodyObj.max_tokens === undefined && requestBodyObj.maxOutputTokens === undefined) {
      requestBodyObj.max_tokens = config.maxTokens;
    }
    if (requestBodyObj.stream === undefined) {
      requestBodyObj.stream = true;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  if (providerLabel === 'OpenRouter' || endpointUrl.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://ai.studio';
    headers['X-Title'] = 'Symbolic Text Decipher';
  }

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBodyObj),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || data.message || `${providerLabel} error status ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body returned.');
  }

  const contentType = response.headers.get('content-type') || '';
  
  // Handle non-streamed JSON response (if server ignores stream=true e.g. some local endpoints)
  if (contentType.includes('application/json') && !contentType.includes('text/event-stream')) {
    const json = await response.json();
    const content =
      json.choices?.[0]?.message?.content ||
      json.choices?.[0]?.text ||
      json.response ||
      json.text ||
      JSON.stringify(json);
    onChunk(content);
    return {
      text: content,
      providerUsed: providerLabel,
      modelUsed: modelName,
      rawRequestPayload: requestBodyObj,
      rawResponsePayload: json,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulatedText = '';
  let buffer = '';

  while (true) {
    if (signal?.aborted) {
      reader.cancel();
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6).trim();
        if (dataStr === '[DONE]') break;
        try {
          const parsed = JSON.parse(dataStr);
          const deltaObj = parsed.choices?.[0]?.delta;
          // Capture standard content as well as reasoning or thinking deltas
          const deltaChunk =
            deltaObj?.content ??
            deltaObj?.reasoning ??
            deltaObj?.thinking ??
            deltaObj?.reasoning_content ??
            parsed.choices?.[0]?.text ??
            parsed.response;

          if (deltaChunk) {
            accumulatedText += deltaChunk;
            onChunk(accumulatedText);
          }
        } catch {
          // ignore stream chunk parse errors
        }
      } else if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        // Ollama raw NDJSON streaming support
        try {
          const parsed = JSON.parse(trimmed);
          const chunk = parsed.message?.content || parsed.response;
          if (chunk) {
            accumulatedText += chunk;
            onChunk(accumulatedText);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    text: accumulatedText || 'No completion content returned.',
    providerUsed: providerLabel,
    modelUsed: modelName,
    rawRequestPayload: requestBodyObj,
    rawResponsePayload: { accumulatedTextLength: accumulatedText.length, endpointUrl },
  };
}

/**
 * Tests connection with current LLM configuration
 */
export async function testLLMConnection(config: LLMConfig): Promise<{ success: boolean; message: string }> {
  try {
    const res = await executeLLMQuery(
      'Respond with a single short word: "Connected".',
      config,
      'You are a connection test responder.'
    );
    if (res.error) {
      return { success: false, message: res.error };
    }
    return { success: true, message: `Connected successfully! Model responded: "${res.text.trim().slice(0, 50)}"` };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Connection failed' };
  }
}

/**
 * Multi-turn Interactive Translation Chat Stream
 * Allows user to converse with the LLM specifically regarding a generated translation,
 * asking for grammatical nuances, historical context, alternative renderings, etc.
 */
export async function executeTranslationChatStream(
  arg1: any,
  arg2: any,
  arg3: any,
  arg4?: any,
  arg5?: any,
  arg6?: any
): Promise<QueryResult> {
  let targetText = '';
  let translationResult = '';
  let messages: TranslationChatMessage[] = [];
  let config: LLMConfig = getLLMConfig();
  let onChunk: (chunk: string) => void = () => {};
  let systemInstruction = '';
  let signal: AbortSignal | undefined = undefined;

  // Case A: (messages, context, config, onChunk, signal)
  if (Array.isArray(arg1)) {
    messages = arg1;
    if (typeof arg2 === 'object' && arg2 !== null) {
      targetText = arg2.targetText || '';
      translationResult = arg2.translationResult || '';
    }
    if (arg3 && typeof arg3 === 'object') config = arg3;
    if (typeof arg4 === 'function') onChunk = arg4;
    if (arg5 instanceof AbortSignal) signal = arg5;
  }
  // Case B: (targetText, displayedText, chatMessages, config, onChunk, signal)
  else if (typeof arg1 === 'string' && typeof arg2 === 'string' && Array.isArray(arg3)) {
    targetText = arg1;
    translationResult = arg2;
    messages = arg3;
    if (arg4 && typeof arg4 === 'object') config = arg4;
    if (typeof arg5 === 'function') onChunk = arg5;
    if (arg6 instanceof AbortSignal) signal = arg6;
  }
  // Case C: (calqueText, userMsg, config, conversationHistory, onChunk, systemInstruction)
  else if (typeof arg1 === 'string' && typeof arg2 === 'string' && typeof arg3 === 'object' && !Array.isArray(arg3)) {
    translationResult = arg1;
    const userPrompt = arg2;
    config = arg3;
    const prevConversation: TranslationChatMessage[] = Array.isArray(arg4) ? arg4 : [];
    if (typeof arg5 === 'function') onChunk = arg5;
    if (typeof arg6 === 'string') systemInstruction = arg6;
    else if (arg6 instanceof AbortSignal) signal = arg6;

    messages = [
      ...prevConversation,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userPrompt,
        timestamp: new Date().toISOString(),
      },
    ];
  }

  const defaultSys = `You are a distinguished philologist, comparative linguist, and mystical/literary hermeneutics scholar.
The user is studying the following text and its deciphering/translation:
[TARGET SOURCE/CALQUE TEXT]:
"""${targetText || translationResult}"""
${translationResult && targetText ? `\n[TRANSLATION RESULT]:\n"""${translationResult}"""` : ''}

Instructions:
- Provide rigorous, precise, insightful, and accessible explanations.
- If asked about morphology, roots, or separable verbs, break them down clearly.
- If asked about symbolic, esoteric, or contextual meaning, illuminate them with historical fidelity.
- Be concise yet thorough.`;

  const effectiveSys = systemInstruction ? `${defaultSys}\n\n[ADDITIONAL INSTRUCTIONS]:\n${systemInstruction}` : defaultSys;

  // Format conversation history for single prompt stream
  let conversationPrompt = '';
  if (messages.length === 1) {
    conversationPrompt = messages[0].content;
  } else {
    conversationPrompt = messages
      .map((m) => `${m.role === 'user' ? 'User Question' : 'Scholar Assistant'}: ${m.content}`)
      .join('\n\n');
  }

  return executeLLMQueryStream(
    conversationPrompt || 'Hello, I have a question about this translation.',
    config,
    onChunk,
    effectiveSys,
    signal
  );
}

