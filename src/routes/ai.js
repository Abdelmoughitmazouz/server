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
      name: z.string()
    })
  ).min(1, 'No channels provided'),
  language: z.string().optional().default('en')
});

const DEFAULT_COLORS = [
  '#3ea6ff', '#ff4d4d', '#2ecc71', '#f7d794', '#a29bfe',
  '#ff7675', '#00cec9', '#fdcb6e', '#6c5ce7', '#e17055',
  '#0984e3', '#00b894', '#e84393', '#636e72', '#74b9ff',
  '#55efc4', '#ffeaa7', '#fab1a0', '#81ecec', '#dfe6e9',
  '#b2bec3', '#ff78cb', '#fd79a8', '#e056fd', '#686de0'
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

const PREFERRED_PRIORITY = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-2.0-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash'
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

// بناء البرومبت العميق مع مراعاة خطة المستخدم
function buildDeepPrompt(language, maxFolders) {
  const countInstruction = maxFolders <= 3
    ? `PLAN LIMITATION:
This user is on a plan with a strict limit of ${maxFolders} folders.
You MUST create AT MOST ${maxFolders} broad, high-level folders (e.g. "Tech & Education", "Gaming & Entertainment", "Music & Lifestyle").`
    : `NUMBER OF FOLDERS:
Create approximately 10 to 20 folders depending on the actual channel collection.
The exact number of folders should depend on the diversity of the subscriptions.
Do NOT force unrelated subjects into the same folder just to reduce the number of folders.
At the same time, do NOT create a separate folder for every individual channel.
A folder should contain multiple channels when those channels genuinely share the same subject or purpose.`;

  return `
You are an expert YouTube subscription organizer.

Your job is to deeply analyze the user's YouTube subscriptions and organize them into meaningful, specific, fine-grained folders.

IMPORTANT:
Do NOT create broad generic folders when the channels clearly belong to different subjects.

For example:
- Science MUST be separate from Education.
- Programming MUST be separate from general Technology when there are enough programming channels.
- Psychology MUST be separate from Health when there are enough psychology channels.
- Gaming MUST be separate from Entertainment.
- Music MUST be separate from Entertainment.
- History MUST be separate from Education when there are enough history channels.
- Language Learning MUST be separate from Education.
- DIY & Making MUST be separate from Technology.
- Business & Finance MUST be separate from Technology.
- Sports MUST always be separate from general Entertainment.
- News & Politics MUST be separate from general Entertainment.
- Travel MUST be separate from Lifestyle when there are enough travel channels.

${countInstruction}

Use the following taxonomy as guidance, but create additional categories when the channels clearly justify them:

SCIENCE:
- Science
- Astronomy & Space
- Biology
- Physics
- Chemistry
- Mathematics

EDUCATION:
- Education
- Study & Academic
- Language Learning
- Tutorials & How-To

TECHNOLOGY:
- Technology
- Programming & Software Development
- AI & Machine Learning
- Gadgets & Hardware
- Cybersecurity

KNOWLEDGE:
- History
- Geography
- Philosophy
- Psychology
- Science Communication

HEALTH:
- Health
- Fitness
- Nutrition
- Mental Wellness

BUSINESS:
- Business
- Finance & Investing
- Entrepreneurship

CREATIVE:
- Art & Design
- Photography
- Music
- Film & Movies

ENTERTAINMENT:
- Entertainment
- Comedy
- Pop Culture
- Podcasts

GAMING:
- Gaming
- Game Development
- Esports

LIFESTYLE:
- Lifestyle
- Food & Cooking
- Travel
- Fashion & Beauty
- DIY & Making
- Cars & Motors

SPORTS:
- Football
- Basketball
- Combat Sports
- Motorsport
- Other Sports

NEWS:
- News
- Politics
- Current Affairs

CATEGORY DECISION RULES:
1. Analyze the actual channel name and its apparent subject.
2. Prefer specific categories over broad categories.
3. If there are several channels about science, create "Science" separately.
4. If there are several channels about educational content, create "Education" separately.
5. Never merge Science and Education merely because both are related to learning.
6. Never merge Psychology and Health merely because psychology is related to mental health.
7. Never merge Programming and Technology if programming/software development has enough channels to justify its own folder.
8. Never merge Gaming with Entertainment.
9. Never merge Music with Entertainment.
10. Never merge Sports with Entertainment.
11. Never merge News with Politics unless the channels genuinely focus on both.
12. Do not create overly narrow folders containing only one channel unless the channel is clearly unique and cannot reasonably belong elsewhere.
13. Aim for useful folders that a user would actually want to browse.
14. Folder names must be concise and descriptive.
15. Folder names must be written in the requested language: "${language}".
16. Every input channel MUST be assigned to exactly ONE folder.
17. NEVER omit a channel.
18. NEVER duplicate a channel across folders.
19. NEVER invent channel IDs.
20. Use the exact channel IDs provided in the input.
21. Every folder must have a unique HEX color.
22. Return ONLY valid JSON.

Required output structure:
{
  "folders": [
    {
      "name": "Folder Name",
      "color": "#3ea6ff",
      "channelIds": [
        "UCxxxxxxxxxxxxxxxxxxxxxx"
      ]
    }
  ]
}

Remember:
The goal is to create a clean, intelligent, detailed organization of the user's subscriptions.
`;
}

// دالة التصحيح التلقائي لضمان التوافق مع قاعدة البيانات 100%
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

  // ضم أي قنوات نسيها النموذج
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

  // دمج المجلدات الزائدة فقط إن تجاوزت حد خطة المستخدم (3 للمجاني) لمنع خطأ folder_limit_exceeded
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
    const maxAllowed = Number.isFinite(folderLimit) ? folderLimit : 20;

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

    console.log(`[AI] Deep categorization started for ${uniqueChannels.length} channels (Plan: ${plan}, Limit: ${maxAllowed})`);

    const systemPrompt = buildDeepPrompt(language, maxAllowed);
    const fullPrompt = `${systemPrompt}\n\nCHANNELS TO CATEGORIZE:\n${JSON.stringify(uniqueChannels)}`;

    const availableModels = await getActiveTextModels(apiKey);
    let geminiRes = null;
    let lastError = null;

    for (const model of availableModels) {
      try {
        console.log(`[AI] Calling model: ${model}`);
        const response = await callGemini(model, apiKey, fullPrompt);
        if (response.ok) {
          geminiRes = response;
          console.log(`[AI] Success with model: ${model}`);
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

    const cleanFolders = autoRepairAssignments(uniqueChannels, result.folders, maxAllowed, language);

    console.log(`[AI] Successfully created ${cleanFolders.length} fine-grained folders.`);
    return res.json({ ok: true, folders: cleanFolders });
  } catch (err) {
    next(err);
  }
});

export default router;