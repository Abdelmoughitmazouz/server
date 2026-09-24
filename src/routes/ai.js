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

// قائمة النماذج النصية الحديثة والمتوافقة مع Google Gemini API
const SUPPORTED_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash'
];

// دالة لاكتشاف النماذج النصية المفعلة في مفتاح المستخدم مع استبعاد نماذج الصوت/TTS
async function getAvailableTextModel(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const models = data?.models || [];

      // استبعاد نماذج الصوت والتضمين وتحديد النماذج النصية فقط
      const textModels = models.filter(m => {
        const name = m.name.toLowerCase();
        const isSupportedMethod = m.supportedGenerationMethods?.includes('generateContent');
        const isExcluded = name.includes('tts') || name.includes('audio') || name.includes('embedding') || name.includes('bidi');
        return isSupportedMethod && !isExcluded;
      });

      // تفضيل نماذج flash الحديثة
      const preferred = textModels.find(m => m.name.includes('3.6') || m.name.includes('3.5')) ||
                        textModels.find(m => m.name.includes('flash')) ||
                        textModels[0];

      if (preferred?.name) {
        return preferred.name.replace(/^models\//, '');
      }
    }
  } catch (_) {}
  return null;
}

async function callGemini(model, apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json'
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

    // 1. استعلام واكتشاف النموذج النصي النشط لمفتاح المستخدم
    const activeModel = await getAvailableTextModel(apiKey);
    const modelsToTry = [...new Set(activeModel ? [activeModel, ...SUPPORTED_MODELS] : SUPPORTED_MODELS)];

    let geminiRes = null;
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        console.log(`[AI] Calling Gemini model: ${model}`);
        const response = await callGemini(model, apiKey, fullPrompt);
        if (response.ok) {
          geminiRes = response;
          console.log(`[AI] Successfully categorized using model: ${model}`);
          break;
        }
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`[AI] Model ${model} failed (${response.status}): ${lastError}`);
      } catch (e) {
        lastError = e.message;
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      console.error('[AI Error from Gemini]:', lastError);
      return res.status(400).json({ error: 'gemini_error', message: lastError || 'Gemini API call failed' });
    }

    const geminiData = await geminiRes.json();
    let rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(500).json({ error: 'empty_ai_response', message: 'Gemini returned an empty response' });
    }

    // تنظيف علامات الـ Markdown إن وُجدت
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
      console.error('[AI JSON Parse Error]:', rawText);
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