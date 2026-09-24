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

const GEMINI_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-flash-lite-latest',
    'gemini-2.0-flash'
];

const GEMINI_TIMEOUT_MS = 25000;

async function callGemini(model, apiKey, prompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, GEMINI_TIMEOUT_MS);

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        return await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.15
                }
            })
        });
    } finally {
        clearTimeout(timeout);
    }
}

function buildPrompt(language, maxFolders) {
    const countRule = maxFolders <= 3
        ? `CRITICAL PLAN LIMIT: You MUST create at most ${maxFolders} broad, high-level categories (e.g. "Tech & Education", "Gaming & Entertainment", "Music & Lifestyle") because the user's account allows a maximum of ${maxFolders} folders.`
        : `Create approximately 10 to 20 folders when the subscription collection contains enough diversity to justify them. Do NOT force the collection into only 5 or 6 broad folders.`;

    return `
You are an expert YouTube subscription organizer.

Your task is to deeply analyze a user's YouTube subscriptions and organize them into intelligent, specific, useful folders.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All folder names MUST be written in this language: "${language}"
Channel IDs must remain EXACTLY unchanged.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NUMBER OF FOLDERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${countRule}
- Group channels together when they clearly share the same subject.
- The number of folders should depend on the actual channels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATEGORIES SEPARATION GUIDELINES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Science ≠ Education (separate when possible).
2. Technology: Programming, Gadgets, AI, Web Dev.
3. Humanities: History, Philosophy, Psychology, Documentaries.
4. Health: Fitness, Nutrition, Medicine, Wellness.
5. Languages: Separate language learning when multiple channels exist.
6. Business: Finance, Entrepreneurship, Marketing, Economics.
7. Creative: Art, Photography, Music, Film, Animation.
8. Entertainment: Comedy, Pop Culture, Movies, TV, Podcasts.
9. Gaming: Game Reviews, Esports, Game Dev.
10. Lifestyle: Food, Travel, Fashion, DIY, Home, Cars.
11. Sports: Football, Basketball, Motorsport, Combat Sports.
12. News: Politics, Current Affairs, World News.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERY IMPORTANT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. EVERY input channel MUST be assigned.
2. Each channel MUST appear in exactly ONE folder.
3. NEVER omit a channel.
4. NEVER duplicate a channel across folders.
5. NEVER invent a channel ID.
6. Use the EXACT channel IDs from the input.
7. Folder names must be concise, meaningful, and in "${language}".
8. Every folder MUST have a valid HEX color.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON matching this structure:
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
`;
}

function extractGeminiText(data) {
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(part => typeof part?.text === 'string');
    if (!textPart?.text) return null;

    let text = textPart.text.trim();
    text = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    return text;
}

function cleanAIResult(result, inputChannels) {
    const usedColors = new Set();
    const inputIds = new Set(inputChannels.map(channel => channel.id));

    if (!result || !Array.isArray(result.folders)) return [];

    const folders = [];
    for (let index = 0; index < result.folders.length; index++) {
        const folder = result.folders[index];
        if (!folder || typeof folder !== 'object') continue;

        const name = String(folder.name || `Folder ${index + 1}`).trim().slice(0, 90);
        if (!name) continue;

        const rawIds = Array.isArray(folder.channelIds) ? folder.channelIds : [];
        const channelIds = [
            ...new Set(
                rawIds.filter(id => typeof id === 'string' && inputIds.has(id) && /^UC[\w-]{20,}$/.test(id))
            )
        ];

        if (channelIds.length === 0) continue;
        const color = sanitizeColor(folder.color, usedColors);

        folders.push({ name, color, channelIds });
    }
    return folders;
}

function validateAssignments(inputChannels, folders) {
    const inputIds = new Set(inputChannels.map(channel => channel.id));
    const assignedIds = folders.flatMap(folder => folder.channelIds);
    const assignedSet = new Set(assignedIds);

    const missing = [...inputIds].filter(id => !assignedSet.has(id));
    const unknown = assignedIds.filter(id => !inputIds.has(id));

    const seen = new Set();
    const duplicates = [];
    for (const id of assignedIds) {
        if (seen.has(id)) duplicates.push(id);
        seen.add(id);
    }

    return {
        valid: missing.length === 0 && unknown.length === 0 && duplicates.length === 0,
        missing,
        unknown,
        duplicates
    };
}

router.post('/categorize', async (req, res, next) => {
    try {
        const parsed = categorizeSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                error: 'bad_request',
                message: 'Invalid request data',
                detail: parsed.error.issues
            });
        }

        const { apiKey, channels, language } = parsed.data;
        const userId = req.user.user_id || req.user.id || req.user.sub;

        // التحقق من خطة المستخدم والحد الأقصى للمجلدات
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

        for (const channel of channels) {
            if (typeof channel.id !== 'string' || !/^UC[\w-]{20,}$/.test(channel.id)) continue;
            if (seenInputIds.has(channel.id)) continue;
            seenInputIds.add(channel.id);
            uniqueChannels.push({
                id: channel.id,
                name: typeof channel.name === 'string' ? channel.name.trim().slice(0, 200) : 'Channel'
            });
        }

        if (uniqueChannels.length === 0) {
            return res.status(400).json({
                error: 'no_valid_channels',
                message: 'No valid YouTube channels were provided'
            });
        }

        console.log(`[AI] Categorization started: ${uniqueChannels.length} channels (Plan: ${plan}, Limit: ${maxAllowed})`);

        const systemInstruction = buildPrompt(language, maxAllowed);
        const fullPrompt = `${systemInstruction}\n\nCHANNELS TO CATEGORIZE:\n${JSON.stringify(uniqueChannels)}`;

        let geminiRes = null;
        let lastError = null;

        for (const model of GEMINI_MODELS) {
            try {
                console.log(`[AI] Trying model: ${model}`);
                const startTime = Date.now();
                const response = await callGemini(model, apiKey, fullPrompt);
                const elapsed = Date.now() - startTime;
                console.log(`[AI] ${model} responded in ${elapsed}ms (HTTP ${response.status})`);

                if (response.ok) {
                    geminiRes = response;
                    console.log(`[AI] Successfully categorized using: ${model}`);
                    break;
                }

                let errorData = {};
                try {
                    errorData = await response.json();
                } catch (_) {}

                lastError = errorData?.error?.message || `HTTP ${response.status}`;
                console.warn(`[AI] ${model} failed (${response.status}): ${lastError}`);

                if (response.status === 401 || response.status === 403) {
                    return res.status(401).json({
                        error: 'gemini_auth_error',
                        message: lastError || 'Invalid or unauthorized Gemini API key'
                    });
                }
            } catch (error) {
                lastError = error?.name === 'AbortError'
                    ? `Model ${model} timed out after ${GEMINI_TIMEOUT_MS}ms`
                    : (error?.message || 'Unknown Gemini error');
                console.warn(`[AI] ${model} failed: ${lastError}`);
            }
        }

        if (!geminiRes || !geminiRes.ok) {
            console.error('[AI] All Gemini models failed:', lastError);
            return res.status(503).json({
                error: 'gemini_error',
                message: lastError || 'All available Gemini models failed'
            });
        }

        const geminiData = await geminiRes.json();
        const rawText = extractGeminiText(geminiData);

        if (!rawText) {
            return res.status(500).json({
                error: 'empty_ai_response',
                message: 'Gemini returned an empty response'
            });
        }

        let result;
        try {
            result = JSON.parse(rawText);
        } catch (error) {
            return res.status(500).json({
                error: 'invalid_ai_json',
                message: 'Failed to parse Gemini JSON response'
            });
        }

        let cleanFolders = cleanAIResult(result, uniqueChannels);

        if (cleanFolders.length === 0) {
            return res.status(500).json({
                error: 'empty_ai_folders',
                message: 'Gemini returned no valid folders'
            });
        }

        // إذا كان الحساب مجانياً وتجاوز المجلدات 3، يتم دمج الزائد تلقائياً لمنع خطأ قاعدة البيانات
        if (cleanFolders.length > maxAllowed) {
            console.log(`[AI] Merging folders to fit plan limit (${cleanFolders.length} -> ${maxAllowed})`);
            const kept = cleanFolders.slice(0, maxAllowed - 1);
            const remaining = cleanFolders.slice(maxAllowed - 1);
            const mergedChannelIds = [...new Set(remaining.flatMap(f => f.channelIds))];
            
            const otherLabel = language.startsWith('ar') ? 'منوعات وقنوات أخرى' : 'General & Other';
            kept.push({
                name: otherLabel,
                color: '#a29bfe',
                channelIds: mergedChannelIds
            });
            cleanFolders = kept;
        }

        const assignment = validateAssignments(uniqueChannels, cleanFolders);
        if (!assignment.valid) {
            // في حال نسيت Gemini قناة، نضمها للمجلد الأول لضمان وجود 100% من القنوات
            if (assignment.missing.length > 0 && cleanFolders.length > 0) {
                cleanFolders[0].channelIds.push(...assignment.missing);
            }
        }

        return res.json({
            ok: true,
            folders: cleanFolders
        });

    } catch (err) {
        console.error('[AI Categorization Error]:', err);
        next(err);
    }
});

export default router;