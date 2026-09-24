import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../supabase.js';
import { limitFor } from '../plans.js';

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

function sanitizeColor(hex) {
  if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) {
    return hex.trim().toLowerCase();
  }
  const defaults = ['#3ea6ff', '#ff4d4d', '#2ecc71', '#f7d794', '#a29bfe', '#ff7675', '#00cec9', '#fdcb6e'];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

const PREFERRED_PRIORITY = [
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash-latest'
];

async function getActiveTextModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (res.ok) {
      const data = await res.json();
      const models = data?.models || [];
      
      const textModels = models
        .filter(m => {
          const name = (m.name || '').toLowerCase();
          const methods = m.supportedGenerationMethods || [];
          const isGenerate = methods.includes('generateContent');
          const isExcluded = name.includes('tts') || name.includes('audio') || 
                             name.includes('embed') || name.includes('imagen') || 
                             name.includes('bidi') || name.includes('realtime') ||
                             name.includes('clip') || name.includes('transcribe');
          return isGenerate && !isExcluded;
        })
        .map(m => m.name.replace(/^models\//, ''));

      if (textModels.length > 0) {
        textModels.sort((a, b) => {
          let idxA = PREFERRED_PRIORITY.indexOf(a);
          let idxB = PREFERRED_PRIORITY.indexOf(b);
          if (idxA === -1) idxA = 999;
          if (idxB === -1) idxB = 999;
          return idxA - idxB;
        });
        return textModels;
      }
    }
  } catch (err) {
    console.warn('[AI] ListModels query failed, using fallback list');
  }
  return PREFERRED_PRIORITY;
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
    const userId = req.user.user_id || req.user.id || req.user.sub;

    // 1. معرفة خطة المستخدم والحد الأقصى المسموح به للمجلدات
    let plan = 'free';
    try {
      const { data: userProfile } = await supabase
        .from('users')
        .select('plan')
        .eq('id', userId)
        .maybeSingle();
      plan = userProfile?.plan || req.user.plan || 'free';
    } catch (_) {}

    const { folders_per_workspace: folderLimit } = limitFor(plan);
    const maxAllowed = Number.isFinite(folderLimit) ? folderLimit : 10;

    console.log(`[AI] Categorizing for user ${userId} (Plan: ${plan}, Max Folders: ${maxAllowed})`);

    // 2. توجيه الذكاء الاصطناعي لإنشاء عدد مجلدات مناسب لخطة المستخدم
    const folderCountInstruction = maxAllowed <= 3
      ? `IMPORTANT: You MUST create at most ${maxAllowed} broad, high-level categories (e.g., "Tech & Education", "Entertainment & Gaming", "Music & Lifestyle") to stay within the allowed limit of ${maxAllowed} folders.`
      : `Create between 4 and ${maxAllowed} logical categories (e.g., "Tech & Programming", "Gaming", "Music", "Education", "Sports", "News & Politics", "Entertainment", "Lifestyle").`;

    const systemInstruction = `
You are an expert YouTube subscription organizer.
Analyze the following list of YouTube channels and categorize them logically.
${folderCountInstruction}
- Write folder names in the requested language: "${language}".
- Assign a distinct HEX color for each folder (e.g. #3ea6ff, #ff4d4d, #2ecc71, #f7d794, #a29bfe, #ff7675, #00cec9, #fdcb6e).
- Every channel provided MUST be assigned to exactly one folder.

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

    const availableModels = await getActiveTextModels(apiKey);
    let geminiRes = null;
    let lastError = null;

    for (const model of availableModels) {
      try {
        console.log(`[AI] Attempting model: ${model}`);
        const response = await callGemini(model, apiKey, fullPrompt);
        if (response.ok) {
          geminiRes = response;
          console.log(`[AI] Successfully categorized using: ${model}`);
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
      return res.status(400).json({ error: 'gemini_error', message: lastError || 'All available Gemini models failed' });
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
      console.error('[AI JSON Parse Error]:', rawText);
      return res.status(500).json({ error: 'invalid_ai_json', message: 'Failed to parse AI JSON response' });
    }

    if (!result?.folders || !Array.isArray(result.folders)) {
      return res.status(500).json({ error: 'invalid_ai_structure', message: 'AI returned invalid folder structure' });
    }

    let cleanFolders = result.folders.map((f, idx) => ({
      name: String(f.name || `Folder ${idx + 1}`).slice(0, 90).trim(),
      color: sanitizeColor(f.color),
      channelIds: Array.isArray(f.channelIds) ? f.channelIds.filter(id => typeof id === 'string' && /^UC[\w-]{20,}$/.test(id)) : []
    })).filter(f => f.name.length > 0 && f.channelIds.length > 0);

    // 3. ضمان برمجي قاطع: دمج أي مجلدات زائدة لكي لا تتجاوز الحد المسموح للخطة
    if (cleanFolders.length > maxAllowed) {
      console.log(`[AI] Truncating & merging folders to fit plan limit (${cleanFolders.length} -> ${maxAllowed})`);
      const kept = cleanFolders.slice(0, maxAllowed - 1);
      const remaining = cleanFolders.slice(maxAllowed - 1);
      const mergedChannels = [...new Set(remaining.flatMap(f => f.channelIds))];
      
      const otherLabel = language.startsWith('ar') ? 'منوعات وقنوات أخرى' : 'General & Other';
      kept.push({
        name: otherLabel,
        color: '#a29bfe',
        channelIds: mergedChannels
      });
      cleanFolders = kept;
    }

    return res.json({ ok: true, folders: cleanFolders });
  } catch (err) {
    next(err);
  }
});

export default router;