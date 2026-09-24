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

function sanitizeColor(hex, usedColors = new Set()) {
  const defaults = [
    '#3ea6ff', '#ff4d4d', '#2ecc71', '#f7d794', '#a29bfe',
    '#ff7675', '#00cec9', '#fdcb6e', '#6c5ce7', '#e17055',
    '#0984e3', '#00b894', '#e84393', '#636e72', '#74b9ff'
  ];

  if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim())) {
    const normalized = hex.trim().toLowerCase();
    if (!usedColors.has(normalized)) {
      usedColors.add(normalized);
      return normalized;
    }
  }

  for (const c of defaults) {
    if (!usedColors.has(c)) {
      usedColors.add(c);
      return c;
    }
  }
  return defaults[Math.floor(Math.random() * defaults.length)];
}

const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash-latest'
];

async function callGemini(model, apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.15
      }
    })
  });
}

// دالة التصحيح التلقائي لضمان وجود 100% من القنوات بدون أي تكرار
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

  // إضافة القنوات التي نسيها الذكاء الاصطناعي
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

  // دمج المجلدات إن كانت تتجاوز حد الخطة (مثلاً 3 للخطة المجانية)
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

    // معرفة الخطة والحد الأقصى
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
        uniqueChannels.push({ id: c.id, name: String(c.name || 'Channel').trim().slice(0, 150) });
      }
    }

    if (uniqueChannels.length === 0) {
      return res.status(400).json({ error: 'no_valid_channels', message: 'No valid channels provided' });
    }

    const countRule = maxAllowed <= 3
      ? `Create at most ${maxAllowed} broad categories (e.g. "Tech & Education", "Gaming & Entertainment", "Music & Lifestyle") to fit the ${maxAllowed} folders limit.`
      : `Create 5 to ${maxAllowed} specific, clean categories based on the channels.`;

    const systemInstruction = `
You are an expert YouTube subscription organizer.
Analyze the following list of YouTube channels and categorize them into logical folders.
${countRule}
- Folder names MUST be in language: "${language}".
- Assign a distinct HEX color for each folder (e.g. #3ea6ff, #ff4d4d, #2ecc71, #f7d794, #a29bfe).
- Every channel MUST be assigned to one folder.

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

    const fullPrompt = `${systemInstruction}\n\nCHANNELS TO CATEGORIZE:\n${JSON.stringify(uniqueChannels)}`;

    let geminiRes = null;
    let lastError = null;

    for (const model of GEMINI_MODELS) {
      try {
        console.log(`[AI] Calling model: ${model}`);
        const response = await callGemini(model, apiKey, fullPrompt);
        if (response.ok) {
          geminiRes = response;
          console.log(`[AI] Success with: ${model}`);
          break;
        }
        const errJson = await response.json().catch(() => ({}));
        lastError = errJson?.error?.message || `HTTP ${response.status}`;
        console.warn(`[AI] ${model} failed (${response.status}): ${lastError}`);
      } catch (e) {
        lastError = e.message;
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
      return res.status(500).json({ error: 'invalid_ai_json', message: 'Failed to parse AI JSON' });
    }

    // تصحيح التوزيع ومعالجة أي نقص أو تكرار تلقائياً
    const cleanFolders = autoRepairAssignments(uniqueChannels, result.folders, maxAllowed, language);

    return res.json({ ok: true, folders: cleanFolders });
  } catch (err) {
    next(err);
  }
});

export default router;