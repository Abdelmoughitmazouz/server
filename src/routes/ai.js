import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../supabase.js';
import { limitFor } from '../plans.js';

const router = express.Router();
router.use(requireAuth);

const categorizeSchema = z.object({
  apiKey: z.string().min(5, 'Invalid Gemini API key'),
  channels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      handle: z.string().optional()
    })
  ).min(1, 'No channels provided'),
  language: z.string().optional().default('en')
});

const DEFAULT_COLORS = [
  '#3ea6ff', '#ff4d4d', '#2ecc71', '#f7d794', '#a29bfe',
  '#ff7675', '#00cec9', '#fdcb6e', '#6c5ce7', '#e17055',
  '#0984e3', '#00b894', '#e84393', '#636e72', '#74b9ff',
  '#55efc4', '#ffeaa7', '#fab1a0', '#81ecec', '#dfe6e9'
];

function sanitizeColor(hex, usedColors = new Set()) {
  if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) {
    const normalized = hex.trim().toLowerCase();
    if (!usedColors.has(normalized)) {
      usedColors.add(normalized);
      return normalized;
    }
  }
  for (const color of DEFAULT_COLORS) {
    if (!usedColors.has(color)) {
      usedColors.add(color);
      return color;
    }
  }
  return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}

// قائمة بأسرع نماذج Gemini المباشرة
const FAST_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-lite-latest',
  'gemini-1.5-flash'
];

const MODEL_TIMEOUT_MS = 14000; // 14 ثانية كحد أقصى لكل نموذج لتفادي مهلة Railway

async function callGemini(model, apiKey, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildFastPrompt(language, maxFolders) {
  const countInstruction = maxFolders <= 3
    ? `Create exactly ${maxFolders} broad, high-level categories (e.g. "Tech & Education", "Gaming & Entertainment", "Music & Lifestyle") to fit the strict 3-folder limit.`
    : `Create 6 to 12 distinct, logical folders (e.g. "Programming", "Technology", "Science", "Education", "Gaming", "Music", "Sports", "Business & Finance", "Entertainment", "Lifestyle", "News").`;

  return `
You are an expert YouTube subscription organizer.
Analyze the provided YouTube channels (using names and handles) and organize them into accurate folders.

CRITICAL ACCURACY RULES:
- Identify creators/brands by their real content (e.g., Fireship = Programming, MKBHD = Tech, PewDiePie/MrBeast = Entertainment/Gaming, Veritasium = Science, Real Madrid = Sports).
- Separate distinct genres: Programming ≠ Hardware Tech, Science ≠ General Schooling, Gaming ≠ Entertainment, Music ≠ Entertainment, Sports ≠ Entertainment.
- ${countInstruction}
- Folder names MUST be in language: "${language}".
- Every channel MUST be assigned to exactly ONE folder.
- Do NOT omit, duplicate, or alter channel IDs.

OUTPUT JSON ONLY:
{
  "folders": [
    {
      "name": "Folder Name",
      "color": "#3ea6ff",
      "channelIds": ["UCxxxx", "UCyyyy"]
    }
  ]
}
`;
}

function autoRepairAssignments(inputChannels, rawFolders, maxAllowed, language) {
  const inputIds = new Set(inputChannels.map(c => c.id));
  const assigned = new Set();
  const usedColors = new Set();
  let cleanFolders = [];

  for (const f of rawFolders || []) {
    if (!f || !f.name) continue;
    const validIds = [];
    for (const cid of (f.channelIds || [])) {
      if (typeof cid === 'string' && inputIds.has(cid) && !assigned.has(cid)) {
        assigned.add(cid);
        validIds.push(cid);
      }
    }
    if (validIds.length > 0) {
      cleanFolders.push({
        name: String(f.name).trim().slice(0, 90),
        color: sanitizeColor(f.color, usedColors),
        channelIds: validIds
      });
    }
  }

  const missingIds = inputChannels.filter(c => !assigned.has(c.id)).map(c => c.id);
  if (missingIds.length > 0) {
    if (cleanFolders.length > 0) {
      cleanFolders[0].channelIds.push(...missingIds);
    } else {
      cleanFolders.push({
        name: language.startsWith('ar') ? 'اشتراكات عامة' : 'General Subscriptions',
        color: '#3ea6ff',
        channelIds: missingIds
      });
    }
  }

  if (cleanFolders.length > maxAllowed) {
    const kept = cleanFolders.slice(0, maxAllowed - 1);
    const remaining = cleanFolders.slice(maxAllowed - 1);
    const mergedIds = [...new Set(remaining.flatMap(f => f.channelIds))];
    const otherLabel = language.startsWith('ar') ? 'منوعات واشتراكات أخرى' : 'General & Other';
    
    kept.push({
      name: otherLabel,
      color: sanitizeColor('#a29bfe', usedColors),
      channelIds: mergedIds
    });
    cleanFolders = kept;
  }

  return cleanFolders;
}

router.post('/categorize', async (req, res, next) => {
  try {
    const parsed = categorizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid request data', detail: parsed.error.issues });
    }

    const { apiKey, channels, language } = parsed.data;
    const userId = req.user.user_id || req.user.id || req.user.sub;

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
    const maxAllowed = Number.isFinite(folderLimit) ? folderLimit : 15;

    const uniqueChannels = [];
    const seenInputIds = new Set();
    for (const c of channels) {
      if (typeof c.id === 'string' && /^UC[\w-]{20,}$/.test(c.id) && !seenInputIds.has(c.id)) {
        seenInputIds.add(c.id);
        uniqueChannels.push({
          id: c.id,
          name: String(c.name || 'Channel').trim().slice(0, 100),
          handle: c.handle ? String(c.handle).trim().slice(0, 50) : undefined
        });
      }
    }

    if (uniqueChannels.length === 0) {
      return res.status(400).json({ error: 'no_valid_channels', message: 'No valid channels provided' });
    }

    console.log(`[AI] Fast categorization started for ${uniqueChannels.length} channels`);

    const systemPrompt = buildFastPrompt(language, maxAllowed);
    const fullPrompt = `${systemPrompt}\n\nCHANNELS:\n${JSON.stringify(uniqueChannels)}`;

    let geminiRes = null;
    let lastError = null;

    for (const model of FAST_MODELS) {
      try {
        console.log(`[AI] Calling fast model: ${model}`);
        const response = await callGemini(model, apiKey, fullPrompt);
        if (response.ok) {
          geminiRes = response;
          console.log(`[AI] Successfully categorized using: ${model}`);
          break;
        }
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson?.error?.message || `HTTP ${response.status}`;
      } catch (e) {
        lastError = e.name === 'AbortError' ? 'Model request timed out' : e.message;
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      console.error('[AI] All models failed:', lastError);
      return res.status(400).json({ error: 'gemini_error', message: lastError || 'Gemini API call failed' });
    }

    const geminiData = await geminiRes.json();
    let rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    rawText = rawText.trim();
    if (rawText.startsWith('```json')) {
      rawText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (_) {
      return res.status(500).json({ error: 'invalid_ai_json', message: 'Failed to parse AI JSON response' });
    }

    const cleanFolders = autoRepairAssignments(uniqueChannels, result.folders, maxAllowed, language);

    return res.json({ ok: true, folders: cleanFolders });
  } catch (err) {
    console.error('[AI Error]:', err);
    next(err);
  }
});

export default router;