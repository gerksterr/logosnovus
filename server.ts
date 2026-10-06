import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // Initialize Gemini AI Client lazily or if key available
  const getGeminiAi = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not configured.");
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  // API Health Check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // API Query Endpoint for Gemini (Non-streaming fallback)
  app.post("/api/query", async (req, res) => {
    try {
      const { prompt, systemInstruction, model = "gemini-3.7-flash", maxOutputTokens, temperature, customRequestPayload } = req.body;

      if (!prompt && !customRequestPayload) {
        return res.status(400).json({ error: "Prompt is required." });
      }

      const ai = getGeminiAi();
      const validModel = model && typeof model === "string" ? model : "gemini-3.7-flash";

      const geminiConfig: any = {};
      let effectiveContents: any = prompt;

      if (systemInstruction) geminiConfig.systemInstruction = systemInstruction;
      if (maxOutputTokens) geminiConfig.maxOutputTokens = Number(maxOutputTokens);
      if (temperature !== undefined && temperature !== null) geminiConfig.temperature = Number(temperature);

      if (customRequestPayload) {
        try {
          const parsed = typeof customRequestPayload === 'string' ? JSON.parse(customRequestPayload) : customRequestPayload;
          if (parsed.contents) effectiveContents = parsed.contents;
          if (parsed.generationConfig) {
            if (parsed.generationConfig.maxOutputTokens) geminiConfig.maxOutputTokens = Number(parsed.generationConfig.maxOutputTokens);
            if (parsed.generationConfig.temperature !== undefined) geminiConfig.temperature = Number(parsed.generationConfig.temperature);
          }
          if (parsed.maxOutputTokens) geminiConfig.maxOutputTokens = Number(parsed.maxOutputTokens);
          if (parsed.max_tokens) geminiConfig.maxOutputTokens = Number(parsed.max_tokens);
          if (parsed.systemInstruction) geminiConfig.systemInstruction = parsed.systemInstruction;
        } catch (parseErr) {
          console.warn("Could not parse customRequestPayload:", parseErr);
        }
      }

      const response = await ai.models.generateContent({
        model: validModel,
        contents: effectiveContents,
        config: Object.keys(geminiConfig).length > 0 ? geminiConfig : undefined,
      });

      const text = response.text || "No response generated.";
      return res.json({ text });
    } catch (error: any) {
      console.error("Server API query error:", error);
      return res.status(500).json({
        error: error.message || "An error occurred while querying the AI model.",
      });
    }
  });

  // API Streaming Query Endpoint for Gemini
  app.post("/api/query-stream", async (req, res) => {
    try {
      const { prompt, systemInstruction, model = "gemini-3.7-flash", maxOutputTokens, temperature, customRequestPayload } = req.body;

      if (!prompt && !customRequestPayload) {
        return res.status(400).json({ error: "Prompt is required." });
      }

      const ai = getGeminiAi();
      const validModel = model && typeof model === "string" ? model : "gemini-3.7-flash";

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }

      const geminiConfig: any = {};
      let effectiveContents: any = prompt;

      if (systemInstruction) geminiConfig.systemInstruction = systemInstruction;
      if (maxOutputTokens) geminiConfig.maxOutputTokens = Number(maxOutputTokens);
      if (temperature !== undefined && temperature !== null) geminiConfig.temperature = Number(temperature);

      if (customRequestPayload) {
        try {
          const parsed = typeof customRequestPayload === 'string' ? JSON.parse(customRequestPayload) : customRequestPayload;
          if (parsed.contents) effectiveContents = parsed.contents;
          if (parsed.generationConfig) {
            if (parsed.generationConfig.maxOutputTokens) geminiConfig.maxOutputTokens = Number(parsed.generationConfig.maxOutputTokens);
            if (parsed.generationConfig.temperature !== undefined) geminiConfig.temperature = Number(parsed.generationConfig.temperature);
          }
          if (parsed.maxOutputTokens) geminiConfig.maxOutputTokens = Number(parsed.maxOutputTokens);
          if (parsed.max_tokens) geminiConfig.maxOutputTokens = Number(parsed.max_tokens);
          if (parsed.systemInstruction) geminiConfig.systemInstruction = parsed.systemInstruction;
        } catch (parseErr) {
          console.warn("Could not parse customRequestPayload in stream:", parseErr);
        }
      }

      const responseStream = await ai.models.generateContentStream({
        model: validModel,
        contents: effectiveContents,
        config: Object.keys(geminiConfig).length > 0 ? geminiConfig : undefined,
      });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      console.error("Server API query-stream error:", error);
      if (!res.headersSent) {
        return res.status(500).json({
          error: error.message || "An error occurred while streaming from AI model.",
        });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
