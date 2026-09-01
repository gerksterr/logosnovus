import { LLMConfig, QueryResult, LLMProviderType, CustomProviderConfig } from '../types';
import { cleanCopiedReaderText } from '../utils/textUtils';

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
  signal?: AbortSignal
): Promise<QueryResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      text: '',
      providerUsed: config.provider || 'built-in-gemini',
      modelUsed: config.modelName || 'gemini-3.7-flash',
      error: 'Offline Mode: You are currently offline. New AI queries require an internet connection, but all your stored texts and deciphered annotations remain accessible!',
    };
  }

  const provider = config.provider || 'built-in-gemini';

  try {
    // Check if provider is a custom provider configured by user
    const matchedCustomProvider = config.customProviders?.find(
      (cp) => cp.id === provider || cp.id === config.activeCustomProviderId
    );

    if (matchedCustomProvider) {
      const mergedConfig: LLMConfig = {
        ...config,
        provider: matchedCustomProvider.name,
        customApiKey: matchedCustomProvider.apiKey || config.customApiKey,
        modelName: config.modelName || matchedCustomProvider.defaultModel,
        customBaseUrl: matchedCustomProvider.baseUrl,
        requestJsonTemplate: matchedCustomProvider.requestJsonTemplate || config.requestJsonTemplate,
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
          config.modelName || 'gemini-3.7-flash',
          onChunk,
          systemInstruction,
          signal
        );

      case 'custom-gemini':
        return await streamCustomGemini(
          prompt,
          config,
          onChunk,
          systemInstruction,
          signal
        );

      case 'groq':
        return await streamOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          config,
          prompt,
          onChunk,
          systemInstruction,
          'Groq',
          signal
        );

      case 'openrouter':
        return await streamOpenAICompatible(
          'https://openrouter.ai/api/v1/chat/completions',
          config,
          prompt,
          onChunk,
          systemInstruction,
          'OpenRouter',
          signal
        );

      case 'custom-openai':
        return await streamOpenAICompatible(
          config.customBaseUrl || 'https://api.openai.com/v1/chat/completions',
          config,
          prompt,
          onChunk,
          systemInstruction,
          'Custom OpenAI Provider',
          signal
        );

      default:
        // If unrecognized string, check if customBaseUrl is set, otherwise default to built-in gemini
        if (config.customBaseUrl) {
          return await streamOpenAICompatible(
            config.customBaseUrl,
            config,
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
          signal
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
  signal?: AbortSignal
): Promise<QueryResult> {
  const effectiveModel = model || 'gemini-3.7-flash';
  const response = await fetch('/api/query-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: effectiveModel, systemInstruction }),
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
    rawRequestPayload: { prompt, model: effectiveModel, systemInstruction },
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
  if (config.requestJsonTemplate) {
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
  if (config.requestJsonTemplate) {
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
      temperature: 0.3,
      stream: true,
    };
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
 * Test Connection for a provider configuration
 */
export async function testLLMConnection(config: LLMConfig): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const res = await executeLLMQuery(
      'Respond with the single word "CONNECTED" to confirm connectivity.',
      config,
      'You are a connectivity test assistant.'
    );
    if (res.error) {
      return { success: false, message: res.error };
    }
    return { success: true, message: `Connected successfully via ${res.providerUsed} (${res.modelUsed})!` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection test failed.' };
  }
}

