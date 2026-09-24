import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

const categorizeSchema = z.object({
  apiKey: z.string().min(5, 'Invalid Gemini API key'),
  channels: z.array(z.object({
    id: z.string(),
    name: z.string()
  })).min(1, 'No channels provided'),
  language: z.string().optional().default('en')
});

// استعلام تلقائي من Google لجلب النماذج المتاحة لهذا المفتاح
async function discoverModels(apiKey) {
  for (const ver of ['v1beta', 'v1']) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/${ver}/models?key=${apiKey}`);
      if (res.ok) {
        const data = await res.json();
        const models = (data?.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => ({
            name: m.name.replace(/^models\//, ''),
            version: ver
          }));
        if (models.length > 0) return models;
      }
    } catch (_) {}
  }
  return [];
}

const FALLBACK_CANDIDATES = [
  { name: 'gemini-2.0-flash', version: 'v1beta' },
  { name: 'gemini-2.5-flash', version: 'v1beta' },
  { name: 'gemini-1.5-flash-latest', version: 'v1beta' },
  { name: 'gemini-1.5-flash', version: 'v1' },
  { name: 'gemini-1.5-flash', version: 'v1beta' },
  { name: 'gemini-1.5-flash-001', version: 'v1beta' },
  { name: 'gemini-1.5-flash-002', version: 'v1beta' },
  { name: 'gemini-1.5-pro', version: 'v1beta' },
  { name: 'gemini-pro', version: 'v1' }
];

async function callGemini(version, model, apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${apiKey}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    })
  });
}

router.post('/categorize', async (req, res, next) => {
  try {
    const parsed = categorizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid request data', detail: parsed.error.issues });
    }

    const { apiKey, channels, language } = parsed.data;

    const systemInstruction = `
You are an expert YouTube subscription organizer.
Analyze the following list of YouTube channels and categorize them into 5 to 12 logical folders (e.g., "Tech & Programming", "Gaming", "Music", "Education", "Sports", "News & Politics", "Entertainment", "Lifestyle").
- Write folder names in the requested language: "${language}".
- Assign a distinct HEX color for each folder (e.g. #3ea6ff, #ff4d4d, #2ecc71, #f7d794, #a29bfe, #ff7675, #00cec9, #fdcb6e).
- Every channel MUST be assigned to exactly one folder.

Return ONLY a valid JSON object matching this schema:
{
  "folders": [
    {
      "name": "Folder Name",
      "color": "#HEX_COLOR",
      "channelIds": ["UCxxxx", "UCyyyy"]
    }
  ]
}
`;

    const fullPrompt = `${systemInstruction}\n\nChannels to categorize:\n${JSON.stringify(channels)}`;

    // 1. اكتشاف النماذج المتاحة من حساب Google
    const discovered = await discoverModels(apiKey);
    const modelsToTry = discovered.length > 0 ? discovered : FALLBACK_CANDIDATES;

    let geminiRes = null;
    let lastError = null;

    for (const item of modelsToTry) {
      try {
        console.log(`[AI] Attempting ${item.version}/models/${item.name}`);
        const response = await callGemini(item.version, item.name, apiKey, fullPrompt);
        if (response.ok) {
          geminiRes = response;
          console.log(`[AI] Success with ${item.version}/models/${item.name}`);
          break;
        }
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`[AI] ${item.name} failed: ${lastError}`);
      } catch (e) {
        lastError = e.message;
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      console.error('[AI Error from Gemini]:', lastError);
      return res.status(400).json({ error: 'gemini_error', message: lastError || 'All Gemini models failed' });
    }

    const geminiData = await geminiRes.json();
    let rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(500).json({ error: 'empty_ai_response', message: 'Gemini returned an empty response' });
    }

    rawText = rawText.trim();
    if (rawText.startsWith('```json')) {
      rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'invalid_ai_json', message: 'Failed to parse AI JSON response' });
    }

    if (!result?.folders || !Array.isArray(result.folders)) {
      return res.status(500).json({ error: 'invalid_ai_structure', message: 'AI returned invalid folder structure' });
    }

    return res.json({ ok: true, folders: result.folders });
  } catch (err) {
    next(err);
  }
});

export default router;