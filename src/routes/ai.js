import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

const categorizeSchema = z.object({
  apiKey: z.string().min(10, 'Invalid Gemini API key'),
  channels: z.array(z.object({
    id: z.string(),
    name: z.string()
  })).min(1, 'No channels provided'),
  language: z.string().optional().default('en')
});

router.post('/categorize', async (req, res, next) => {
  try {
    const parsed = categorizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }

    const { apiKey, channels, language } = parsed.data;

    const systemInstruction = `
You are an expert YouTube subscription organizer.
Your task is to analyze the list of YouTube channel names and categorize them into 5 to 12 logical, clean folders (e.g., "Tech & Programming", "Gaming", "Music", "Education", "Sports", "News & Politics", "Entertainment", "Lifestyle", "Religion").
- Choose folder names in the requested language: "${language}".
- Assign a distinct, beautiful HEX color code for each folder (e.g., "#3ea6ff", "#ff4d4d", "#2ecc71", "#f7d794", "#a29bfe", "#ff7675", "#00cec9", "#fdcb6e").
- Every channel provided in the input MUST be assigned to exactly one most appropriate folder.

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

    const userPrompt = `Categorize these YouTube channels:\n` + JSON.stringify(channels, null, 2);

    const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemInstruction + '\n\n' + userPrompt }] }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      const msg = errData?.error?.message || `Gemini API returned error: ${geminiRes.status}`;
      return res.status(400).json({ error: 'gemini_error', message: msg });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(500).json({ error: 'empty_ai_response' });
    }

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (_) {
      return res.status(500).json({ error: 'invalid_ai_json' });
    }

    if (!result?.folders || !Array.isArray(result.folders)) {
      return res.status(500).json({ error: 'invalid_ai_structure' });
    }

    return res.json({ ok: true, folders: result.folders });
  } catch (err) {
    next(err);
  }
});

export default router;