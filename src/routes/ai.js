import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════
// REQUEST VALIDATION
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// FOLDER COLORS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_COLORS = [
    '#3ea6ff',
    '#ff4d4d',
    '#2ecc71',
    '#f7d794',
    '#a29bfe',
    '#ff7675',
    '#00cec9',
    '#fdcb6e',
    '#6c5ce7',
    '#e17055',
    '#0984e3',
    '#00b894',
    '#e84393',
    '#636e72',
    '#74b9ff',
    '#55efc4',
    '#ffeaa7',
    '#fab1a0',
    '#81ecec',
    '#dfe6e9'
];

function sanitizeColor(hex, usedColors = new Set()) {
    if (
        typeof hex === 'string' &&
        /^#[0-9a-fA-F]{6}$/.test(hex.trim())
    ) {
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

    const fallback =
        DEFAULT_COLORS[
            Math.floor(Math.random() * DEFAULT_COLORS.length)
        ];

    return fallback;
}

// ═══════════════════════════════════════════════════════════════
// FAST GEMINI MODEL FALLBACK
// ═══════════════════════════════════════════════════════════════
//
// IMPORTANT:
// We intentionally do NOT call Google's /models endpoint before
// every categorization request. That adds another network request
// and makes the organizer slower.
//
// If a model returns 404, 503, 429, etc., we immediately move to
// the next model.
// ═══════════════════════════════════════════════════════════════

const GEMINI_MODELS = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-flash-lite-latest'
];

// ═══════════════════════════════════════════════════════════════
// REQUEST TIMEOUT
// ═══════════════════════════════════════════════════════════════

const GEMINI_TIMEOUT_MS = 20000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// GEMINI REQUEST
// ═══════════════════════════════════════════════════════════════

async function callGemini(model, apiKey, prompt) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, GEMINI_TIMEOUT_MS);

    try {
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models/` +
            `${encodeURIComponent(model)}:generateContent?key=` +
            `${encodeURIComponent(apiKey)}`;

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
                        parts: [
                            {
                                text: prompt
                            }
                        ]
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

// ═══════════════════════════════════════════════════════════════
// DEEP CATEGORIZATION PROMPT
// ═══════════════════════════════════════════════════════════════

function buildPrompt(language) {
    return `
You are an expert YouTube subscription organizer.

Your task is to deeply analyze a user's YouTube subscriptions and organize
them into intelligent, specific, useful folders.

The goal is NOT to minimize the number of folders.

The goal is to create a clean and detailed organization that reflects the
actual subjects of the channels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All folder names MUST be written in this language:

"${language}"

Channel IDs must remain EXACTLY unchanged.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NUMBER OF FOLDERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Create approximately 10 to 20 folders when the subscription collection
contains enough diversity to justify them.

Do NOT force the collection into only 5 or 6 broad folders.

However:

- Do NOT create one folder per channel.
- Do NOT create extremely narrow folders containing only one channel
  unless the channel is genuinely unique.
- Group channels together when they clearly share the same subject.

The number of folders should depend on the actual channels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT SEPARATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These subjects should normally be separated when there are enough
channels to justify separate folders:

SCIENCE ≠ EDUCATION

Science channels should go into a Science folder.

General educational/tutorial channels should go into Education.

Do NOT combine them simply because both involve learning.

Examples:

Science
Education
Astronomy & Space
Physics
Biology
Mathematics

should be considered separate possibilities.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECHNOLOGY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Separate technical subjects when there are enough channels.

Possible categories:

Technology
Programming & Software
AI & Machine Learning
Cybersecurity
Gadgets & Hardware
Tech News
Web Development
Game Development

Do NOT put every technology-related channel into one giant
"Technology" folder if the subscriptions clearly contain distinct
technical subjects.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KNOWLEDGE & HUMANITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

History
Geography
Philosophy
Psychology
Science
Education
Documentaries
Culture

Psychology should normally be separate from Health when there are
enough psychology channels.

History should normally be separate from general Education when there
are enough history channels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEALTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

Health
Fitness
Nutrition
Psychology
Mental Wellness
Medicine

Do not automatically merge Psychology with Health.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Language learning deserves its own category when there are multiple
language-learning channels.

Possible categories:

Language Learning
English Learning
French Learning
Spanish Learning
Other Languages

Do not automatically put language-learning channels into Education.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUSINESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

Business
Finance & Investing
Entrepreneurship
Marketing
Economics

Keep Business and Finance separate when there are enough channels.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATIVE CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

Art & Design
Photography
Music
Film & Movies
Animation
Writing
Creative Production

Music should normally be separate from general Entertainment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENTERTAINMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

Entertainment
Comedy
Pop Culture
Movies
TV
Podcasts
Celebrity & Culture

Do not merge Gaming into Entertainment when gaming channels are
clearly present.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GAMING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

Gaming
Game Reviews
Game Development
Esports
Gaming News

Gaming should normally be separate from Entertainment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LIFESTYLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

Lifestyle
Food & Cooking
Travel
Fashion & Beauty
DIY & Making
Home & Organization
Cars & Motors

Do not merge DIY & Making into Technology simply because some DIY
channels use technology.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPORTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

Sports
Football
Basketball
Combat Sports
Motorsport
Tennis
Fitness

If one sport has enough channels, it can have its own folder.

Sports should not be merged into Entertainment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Possible categories:

News
Politics
Current Affairs
World News
Technology News

Do not automatically merge News and Politics unless the channels
actually cover both subjects.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHANNEL ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Analyze each channel based on:

1. Channel name
2. Clear keywords in the channel name
3. Apparent primary subject
4. The relationship between channels
5. Whether the channel belongs to a specialized topic

Use the PRIMARY subject of the channel.

Do not guess extremely specific subjects without evidence.

If a channel is ambiguous, place it in the most reasonable broader
category rather than inventing a specialized category.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERY IMPORTANT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. EVERY input channel MUST be assigned.

2. Each channel MUST appear in exactly ONE folder.

3. NEVER omit a channel.

4. NEVER duplicate a channel across folders.

5. NEVER invent a channel ID.

6. Use the EXACT channel IDs from the input.

7. Folder names must be concise and meaningful.

8. Folder names MUST use the requested language.

9. Every folder MUST have a valid HEX color.

10. Folder colors should be distinct.

11. Prefer specific categories when the data supports them.

12. Do not create broad combined folders such as:
    "Science & Education"
    when Science and Education can reasonably be separated.

13. Do not create broad combined folders such as:
    "Psychology & Health"
    when Psychology and Health can reasonably be separated.

14. Do not create:
    "Tech & DIY"
    when Technology and DIY are clearly different groups.

15. Do not create:
    "Entertainment & Gaming"
    when Gaming has enough channels to stand alone.

16. Do not create:
    "Music & Entertainment"
    when Music has enough channels to stand alone.

17. Do not create:
    "Sports & Entertainment"
    when Sports has enough channels to stand alone.

18. The organization should be useful for browsing subscriptions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON.

No Markdown.

No explanation.

No comments.

No code fences.

Use exactly this structure:

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

// ═══════════════════════════════════════════════════════════════
// EXTRACT GEMINI TEXT
// ═══════════════════════════════════════════════════════════════

function extractGeminiText(data) {
    const parts =
        data?.candidates?.[0]?.content?.parts || [];

    const textPart = parts.find(
        part => typeof part?.text === 'string'
    );

    if (!textPart?.text) {
        return null;
    }

    let text = textPart.text.trim();

    // Safety cleanup in case Gemini ignores the JSON-only instruction.
    text = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    return text;
}

// ═══════════════════════════════════════════════════════════════
// VALIDATE ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════

function validateAssignments(inputChannels, folders) {
    const inputIds = new Set(
        inputChannels.map(channel => channel.id)
    );

    const assignedIds = folders.flatMap(
        folder => folder.channelIds
    );

    const assignedSet = new Set(assignedIds);

    const missing = [...inputIds].filter(
        id => !assignedSet.has(id)
    );

    const unknown = assignedIds.filter(
        id => !inputIds.has(id)
    );

    const seen = new Set();
    const duplicates = [];

    for (const id of assignedIds) {
        if (seen.has(id)) {
            duplicates.push(id);
        }

        seen.add(id);
    }

    return {
        valid:
            missing.length === 0 &&
            unknown.length === 0 &&
            duplicates.length === 0,

        missing,
        unknown,
        duplicates
    };
}

// ═══════════════════════════════════════════════════════════════
// CLEAN AI FOLDERS
// ═══════════════════════════════════════════════════════════════

function cleanAIResult(result, inputChannels) {
    const usedColors = new Set();

    const inputIds = new Set(
        inputChannels.map(channel => channel.id)
    );

    if (!result || !Array.isArray(result.folders)) {
        return [];
    }

    const folders = [];

    for (let index = 0; index < result.folders.length; index++) {
        const folder = result.folders[index];

        if (!folder || typeof folder !== 'object') {
            continue;
        }

        const name =
            String(
                folder.name ||
                `Folder ${index + 1}`
            )
                .trim()
                .slice(0, 90);

        if (!name) {
            continue;
        }

        const rawIds =
            Array.isArray(folder.channelIds)
                ? folder.channelIds
                : [];

        const channelIds = [
            ...new Set(
                rawIds.filter(
                    id =>
                        typeof id === 'string' &&
                        inputIds.has(id) &&
                        /^UC[\w-]{20,}$/.test(id)
                )
            )
        ];

        if (channelIds.length === 0) {
            continue;
        }

        const color = sanitizeColor(
            folder.color,
            usedColors
        );

        folders.push({
            name,
            color,
            channelIds
        });
    }

    return folders;
}

// ═══════════════════════════════════════════════════════════════
// POST /categorize
// ═══════════════════════════════════════════════════════════════

router.post('/categorize', async (req, res, next) => {
    try {
        // ─────────────────────────────────────────────
        // Validate request
        // ─────────────────────────────────────────────

        const parsed =
            categorizeSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({
                error: 'bad_request',
                message: 'Invalid request data',
                detail: parsed.error.issues
            });
        }

        const {
            apiKey,
            channels,
            language
        } = parsed.data;

        // ─────────────────────────────────────────────
        // Clean input channels
        // ─────────────────────────────────────────────

        const uniqueChannels = [];
        const seenInputIds = new Set();

        for (const channel of channels) {
            if (
                typeof channel.id !== 'string' ||
                !/^UC[\w-]{20,}$/.test(channel.id)
            ) {
                continue;
            }

            if (seenInputIds.has(channel.id)) {
                continue;
            }

            seenInputIds.add(channel.id);

            uniqueChannels.push({
                id: channel.id,
                name:
                    typeof channel.name === 'string'
                        ? channel.name.trim().slice(0, 200)
                        : 'Channel'
            });
        }

        if (uniqueChannels.length === 0) {
            return res.status(400).json({
                error: 'no_valid_channels',
                message:
                    'No valid YouTube channels were provided'
            });
        }

        console.log(
            `[AI] Deep categorization started for ` +
            `${uniqueChannels.length} channels`
        );

        // ─────────────────────────────────────────────
        // Build prompt
        // ─────────────────────────────────────────────

        const systemInstruction =
            buildPrompt(language);

        const fullPrompt =
            systemInstruction +
            '\n\n' +
            'CHANNELS TO CATEGORIZE:\n' +
            JSON.stringify(uniqueChannels);

        // ─────────────────────────────────────────────
        // FAST MODEL FALLBACK
        // ─────────────────────────────────────────────

        let geminiRes = null;
        let lastError = null;

        for (const model of GEMINI_MODELS) {
            try {
                console.log(
                    `[AI] Trying model: ${model}`
                );

                const startTime = Date.now();

                const response =
                    await callGemini(
                        model,
                        apiKey,
                        fullPrompt
                    );

                const elapsed =
                    Date.now() - startTime;

                console.log(
                    `[AI] ${model} responded in ${elapsed}ms ` +
                    `(HTTP ${response.status})`
                );

                // ─────────────────────────────────
                // SUCCESS
                // ─────────────────────────────────

                if (response.ok) {
                    geminiRes = response;

                    console.log(
                        `[AI] Successfully categorized using: ${model}`
                    );

                    break;
                }

                // ─────────────────────────────────
                // Read error
                // ─────────────────────────────────

                let errorData = {};

                try {
                    errorData =
                        await response.json();
                } catch (_) {
                    errorData = {};
                }

                lastError =
                    errorData?.error?.message ||
                    `HTTP ${response.status}`;

                console.warn(
                    `[AI] ${model} failed ` +
                    `(${response.status}): ${lastError}`
                );

                // ─────────────────────────────────
                // AUTH ERRORS
                // ─────────────────────────────────

                if (
                    response.status === 401 ||
                    response.status === 403
                ) {
                    return res.status(401).json({
                        error: 'gemini_auth_error',
                        message:
                            lastError ||
                            'Invalid or unauthorized Gemini API key'
                    });
                }

                // ─────────────────────────────────
                // FAST FALLBACK
                // ─────────────────────────────────
                //
                // No retry here.
                //
                // 503 → next model immediately
                // 429 → next model immediately
                // 404 → next model immediately
                // 400 → next model immediately
                // etc.
                //
                // This is intentionally fast.
                // ─────────────────────────────────

            } catch (error) {
                lastError =
                    error?.name === 'AbortError'
                        ? `Model ${model} timed out after ${GEMINI_TIMEOUT_MS}ms`
                        : (
                            error?.message ||
                            'Unknown Gemini error'
                        );

                console.warn(
                    `[AI] ${model} failed: ${lastError}`
                );

                // Immediately continue to next model.
            }
        }

        // ═════════════════════════════════════════════
        // ALL MODELS FAILED
        // ═════════════════════════════════════════════

        if (!geminiRes || !geminiRes.ok) {
            console.error(
                '[AI] All Gemini models failed:',
                lastError
            );

            return res.status(503).json({
                error: 'gemini_error',
                message:
                    lastError ||
                    'All available Gemini models failed'
            });
        }

        // ═════════════════════════════════════════════
        // READ GEMINI RESPONSE
        // ═════════════════════════════════════════════

        const geminiData =
            await geminiRes.json();

        const rawText =
            extractGeminiText(geminiData);

        if (!rawText) {
            console.error(
                '[AI] Gemini returned no text'
            );

            return res.status(500).json({
                error: 'empty_ai_response',
                message:
                    'Gemini returned an empty response'
            });
        }

        // ═════════════════════════════════════════════
        // PARSE JSON
        // ═════════════════════════════════════════════

        let result;

        try {
            result = JSON.parse(rawText);
        } catch (error) {
            console.error(
                '[AI] JSON parse failed:',
                rawText
            );

            return res.status(500).json({
                error: 'invalid_ai_json',
                message:
                    'Failed to parse Gemini JSON response'
            });
        }

        // ═════════════════════════════════════════════
        // CLEAN RESULT
        // ═════════════════════════════════════════════

        const cleanFolders =
            cleanAIResult(
                result,
                uniqueChannels
            );

        if (cleanFolders.length === 0) {
            return res.status(500).json({
                error: 'empty_ai_folders',
                message:
                    'Gemini returned no valid folders'
            });
        }

        // ═════════════════════════════════════════════
        // VALIDATE ASSIGNMENTS
        // ═════════════════════════════════════════════

        const assignment =
            validateAssignments(
                uniqueChannels,
                cleanFolders
            );

        if (!assignment.valid) {
            console.error(
                '[AI] Invalid channel assignment:',
                {
                    totalChannels:
                        uniqueChannels.length,

                    folders:
                        cleanFolders.length,

                    missing:
                        assignment.missing.length,

                    duplicates:
                        assignment.duplicates.length,

                    unknown:
                        assignment.unknown.length
                }
            );

            return res.status(500).json({
                error: 'invalid_ai_assignment',

                message:
                    'Gemini did not assign every channel exactly once',

                detail: {
                    totalChannels:
                        uniqueChannels.length,

                    folders:
                        cleanFolders.length,

                    missingCount:
                        assignment.missing.length,

                    duplicateCount:
                        assignment.duplicates.length,

                    unknownCount:
                        assignment.unknown.length
                }
            });
        }

        // ═════════════════════════════════════════════
        // FINAL SUCCESS
        // ═════════════════════════════════════════════

        console.log(
            `[AI] Deep categorization complete: ` +
            `${uniqueChannels.length} channels → ` +
            `${cleanFolders.length} folders`
        );

        console.log(
            '[AI] Folders:',
            cleanFolders.map(folder => ({
                name: folder.name,
                channels: folder.channelIds.length
            }))
        );

        return res.json({
            ok: true,
            folders: cleanFolders
        });

    } catch (err) {
        console.error(
            '[AI Categorization Error]:',
            err
        );

        next(err);
    }
});

export default router;