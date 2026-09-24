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

// قائمة النماذج الفعالة والأسرع في Google Gemini
const ACTIVE_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash'
];

function sanitizeColor(hex) {
  if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) {
    return hex.trim().toLowerCase();
  }
  const defaults = ['#3ea6ff', '#ff4d4d', '#2ecc71', '#f7d794', '#a29bfe', '#ff7675', '#00cec9', '#fdcb6e'];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

async function callGemini(model, apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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

    let geminiRes = null;
    let lastError = null;

    for (const model of ACTIVE_MODELS) {
      try {
        console.log(`[AI] Calling Gemini model: ${model}`);
        const response = await callGemini(model, apiKey, fullPrompt);
        if (response.ok) {
          geminiRes = response;
          console.log(`[AI] Success with ${model}`);
          break;
        }
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson?.error?.message || `HTTP ${response.status}`;
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

    // تنقية وتصحيح الألوان والأسماء لضمان قبولها في Supabase بدون أخطاء
    const cleanFolders = result.folders.map((f, idx) => ({
      name: String(f.name || `Folder ${idx + 1}`).slice(0, 90).trim(),
      color: sanitizeColor(f.color),
      channelIds: Array.isArray(f.channelIds) ? f.channelIds.filter(id => typeof id === 'string' && /^UC[\w-]{20,}$/.test(id)) : []
    })).filter(f => f.name.length > 0 && f.channelIds.length > 0);

    return res.json({ ok: true, folders: cleanFolders });
  } catch (err) {
    next(err);
  }
});

export default router;