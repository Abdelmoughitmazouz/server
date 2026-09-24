````js
import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// ─────────────────────────────────────────────────────────────
// Request validation
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Default colors
// ─────────────────────────────────────────────────────────────

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
    '#00b894'
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

    // Try to find an unused default color
    for (const color of DEFAULT_COLORS) {
        if (!usedColors.has(color)) {
            usedColors.add(color);
            return color;
        }
    }

    // If all colors are used, generate a safe fallback
    const fallback =
        DEFAULT_COLORS[
            Math.floor(Math.random() * DEFAULT_COLORS.length)
        ];

    return fallback;
}

// ─────────────────────────────────────────────────────────────
// Preferred Gemini models
// ─────────────────────────────────────────────────────────────

const PREFERRED_PRIORITY = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.8-flash',
    'gemini-flash-lite-latest'
];

// ─────────────────────────────────────────────────────────────
// Models that should be retried
// ─────────────────────────────────────────────────────────────

const RETRYABLE_STATUS_CODES = new Set([
    429, // Too many requests
    500, // Internal server error
    502, // Bad gateway
    503, // Service unavailable
    504  // Gateway timeout
]);

// ─────────────────────────────────────────────────────────────
// Get active text-generation models
// ─────────────────────────────────────────────────────────────

async function getActiveTextModels(apiKey) {
    try {
        const url =
            `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;

        const res = await fetch(url);

        if (res.ok) {
            const data = await res.json();

            const models = data?.models || [];

            const textModels = models
                .filter((m) => {
                    const name = (m.name || '').toLowerCase();
                    const methods = m.supportedGenerationMethods || [];

                    const isGenerate =
                        methods.includes('generateContent');

                    const isExcluded =
                        name.includes('tts') ||
                        name.includes('audio') ||
                        name.includes('embed') ||
                        name.includes('imagen') ||
                        name.includes('bidi') ||
                        name.includes('realtime') ||
                        name.includes('clip') ||
                        name.includes('transcribe');

                    return isGenerate && !isExcluded;
                })
                .map((m) =>
                    String(m.name || '').replace(/^models\//, '')
                )
                .filter(Boolean);

            if (textModels.length > 0) {
                // Remove duplicates
                const uniqueModels = [...new Set(textModels)];

                // Sort according to our preferred priority
                uniqueModels.sort((a, b) => {
                    let idxA = PREFERRED_PRIORITY.indexOf(a);
                    let idxB = PREFERRED_PRIORITY.indexOf(b);

                    if (idxA === -1) idxA = 9999;
                    if (idxB === -1) idxB = 9999;

                    return idxA - idxB;
                });

                return uniqueModels;
            }
        }

        console.warn(
            '[AI] Google Models API returned no usable text models'
        );
    } catch (err) {
        console.warn(
            '[AI] ListModels query failed, using fallback list:',
            err?.message || err
        );
    }

    // Safe fallback.
    // No obsolete gemini-2.5-flash-lite here.
    return [...PREFERRED_PRIORITY];
}

// ─────────────────────────────────────────────────────────────
// Call Gemini
// ─────────────────────────────────────────────────────────────

async function callGemini(model, apiKey, prompt) {
    const encodedModel = encodeURIComponent(model);

    const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

    return fetch(url, {
        method: 'POST',

        headers: {
            'Content-Type': 'application/json'
        },

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
                temperature: 0.2
            }
        })
    });
}

// ─────────────────────────────────────────────────────────────
// Sleep helper
// ─────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// Call Gemini with retry/backoff
// ─────────────────────────────────────────────────────────────

async function callGeminiWithRetry(
    model,
    apiKey,
    prompt,
    maxRetries = 2
) {
    let lastResponse = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            console.log(
                `[AI] ${model} attempt ${attempt + 1}/${maxRetries + 1}`
            );

            const response = await callGemini(
                model,
                apiKey,
                prompt
            );

            lastResponse = response;

            // Success
            if (response.ok) {
                return response;
            }

            // Don't retry permanent/client errors
            if (!RETRYABLE_STATUS_CODES.has(response.status)) {
                return response;
            }

            // Last attempt
            if (attempt === maxRetries) {
                return response;
            }

            // Exponential backoff
            const delay =
                1000 * Math.pow(2, attempt);

            console.warn(
                `[AI] ${model} returned HTTP ${response.status}. ` +
                `Retrying in ${delay}ms...`
            );

            await sleep(delay);

        } catch (err) {
            console.warn(
                `[AI] ${model} network error on attempt ${attempt + 1}:`,
                err?.message || err
            );

            if (attempt === maxRetries) {
                throw err;
            }

            const delay =
                1000 * Math.pow(2, attempt);

            await sleep(delay);
        }
    }

    return lastResponse;
}

// ─────────────────────────────────────────────────────────────
// Extract JSON text from Gemini response
// ─────────────────────────────────────────────────────────────

function extractGeminiText(geminiData) {
    const parts =
        geminiData?.candidates?.[0]?.content?.parts || [];

    const textPart = parts.find(
        (part) => typeof part?.text === 'string'
    );

    if (!textPart?.text) {
        return null;
    }

    let rawText = textPart.text.trim();

    // Remove Markdown code fences if Gemini returns them
    rawText = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    return rawText;
}

// ─────────────────────────────────────────────────────────────
// Validate AI folder assignment
// ─────────────────────────────────────────────────────────────

function validateFolderAssignments(
    inputChannels,
    folders
) {
    const inputIds = new Set(
        inputChannels.map((channel) => channel.id)
    );

    const assignedIds = folders.flatMap(
        (folder) => folder.channelIds
    );

    const missing = [
        ...inputIds
    ].filter(
        (id) => !assignedIds.includes(id)
    );

    const unknown = assignedIds.filter(
        (id) => !inputIds.has(id)
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

// ─────────────────────────────────────────────────────────────
// POST /categorize
// ─────────────────────────────────────────────────────────────

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
        // Remove invalid / duplicate input channels
        // ─────────────────────────────────────────────

        const uniqueChannels = [];
        const seenChannelIds = new Set();

        for (const channel of channels) {
            if (
                typeof channel.id !== 'string' ||
                !/^UC[\w-]{20,}$/.test(channel.id)
            ) {
                continue;
            }

            if (seenChannelIds.has(channel.id)) {
                continue;
            }

            seenChannelIds.add(channel.id);

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
                message: 'No valid YouTube channels were provided'
            });
        }

        // ─────────────────────────────────────────────
        // AI prompt
        // ─────────────────────────────────────────────

        const systemInstruction = `
You are an expert YouTube subscription organizer.

Analyze the provided list of YouTube channels and categorize them
into 5 to 12 logical folders.

Examples:
- Tech & Programming
- Gaming
- Music
- Education
- Sports
- News & Politics
- Entertainment
- Lifestyle
- Science
- Business

Rules:

1. Write folder names in the requested language: "${language}".

2. Create between 5 and 12 folders when the number and variety
   of channels make that reasonable.

3. Every channel MUST be assigned to exactly ONE folder.

4. NEVER omit a channel.

5. NEVER assign the same channel to multiple folders.

6. NEVER invent channel IDs.

7. Use the exact channel IDs supplied in the input.

8. Give every folder a distinct HEX color.

9. Colors must be valid six-digit HEX values.

10. Return ONLY valid JSON.

Required JSON structure:

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

        const fullPrompt =
            `${systemInstruction}\n\n` +
            `Channels to categorize:\n` +
            JSON.stringify(uniqueChannels);

        // ─────────────────────────────────────────────
        // Get available models
        // ─────────────────────────────────────────────

        const availableModels =
            await getActiveTextModels(apiKey);

        console.log(
            '[AI] Available/prioritized models:',
            availableModels
        );

        let geminiRes = null;
        let lastError = null;

        // ─────────────────────────────────────────────
        // Try models
        // ─────────────────────────────────────────────

        for (const model of availableModels) {
            try {
                console.log(
                    `[AI] Attempting model: ${model}`
                );

                const response =
                    await callGeminiWithRetry(
                        model,
                        apiKey,
                        fullPrompt,
                        2
                    );

                if (response?.ok) {
                    geminiRes = response;

                    console.log(
                        `[AI] Successfully categorized using: ${model}`
                    );

                    break;
                }

                let errJson = {};

                try {
                    errJson =
                        await response.json();
                } catch (_) {
                    errJson = {};
                }

                lastError =
                    errJson?.error?.message ||
                    `HTTP ${response?.status || 'unknown'}`;

                console.warn(
                    `[AI] Model ${model} failed ` +
                    `(${response?.status}): ${lastError}`
                );

                // API key problems should stop immediately.
                if (
                    response?.status === 401 ||
                    response?.status === 403
                ) {
                    return res.status(401).json({
                        error: 'gemini_auth_error',
                        message:
                            lastError ||
                            'Gemini API key is invalid or unauthorized'
                    });
                }

            } catch (err) {
                lastError =
                    err?.message ||
                    'Unknown Gemini error';

                console.warn(
                    `[AI] Model ${model} threw an error:`,
                    lastError
                );
            }
        }

        // ─────────────────────────────────────────────
        // All models failed
        // ─────────────────────────────────────────────

        if (!geminiRes || !geminiRes.ok) {
            console.error(
                '[AI Error from Gemini]:',
                lastError
            );

            return res.status(503).json({
                error: 'gemini_error',
                message:
                    lastError ||
                    'All available Gemini models failed'
            });
        }

        // ─────────────────────────────────────────────
        // Parse Gemini response
        // ─────────────────────────────────────────────

        const geminiData =
            await geminiRes.json();

        const rawText =
            extractGeminiText(geminiData);

        if (!rawText) {
            return res.status(500).json({
                error: 'empty_ai_response',
                message:
                    'Gemini returned an empty response'
            });
        }

        // ─────────────────────────────────────────────
        // Parse JSON
        // ─────────────────────────────────────────────

        let result;

        try {
            result = JSON.parse(rawText);
        } catch (err) {
            console.error(
                '[AI JSON Parse Error]:',
                rawText
            );

            return res.status(500).json({
                error: 'invalid_ai_json',
                message:
                    'Failed to parse AI JSON response'
            });
        }

        // ─────────────────────────────────────────────
        // Validate basic structure
        // ─────────────────────────────────────────────

        if (
            !result ||
            !Array.isArray(result.folders)
        ) {
            return res.status(500).json({
                error: 'invalid_ai_structure',
                message:
                    'AI returned invalid folder structure'
            });
        }

        // ─────────────────────────────────────────────
        // Clean folders
        // ─────────────────────────────────────────────

        const usedColors = new Set();

        const cleanFolders =
            result.folders
                .map((folder, index) => {
                    const name =
                        String(
                            folder?.name ||
                            `Folder ${index + 1}`
                        )
                            .slice(0, 90)
                            .trim();

                    const color =
                        sanitizeColor(
                            folder?.color,
                            usedColors
                        );

                    const channelIds =
                        Array.isArray(
                            folder?.channelIds
                        )
                            ? [
                                ...new Set(
                                    folder.channelIds
                                        .filter(
                                            (id) =>
                                                typeof id === 'string' &&
                                                /^UC[\w-]{20,}$/.test(id)
                                        )
                                )
                            ]
                            : [];

                    return {
                        name,
                        color,
                        channelIds
                    };
                })
                .filter(
                    (folder) =>
                        folder.name.length > 0 &&
                        folder.channelIds.length > 0
                );

        // ─────────────────────────────────────────────
        // Validate folder count
        // ─────────────────────────────────────────────

        if (cleanFolders.length === 0) {
            return res.status(500).json({
                error: 'empty_ai_folders',
                message:
                    'AI did not return any valid folders'
            });
        }

        if (cleanFolders.length > 12) {
            console.warn(
                `[AI] AI returned ${cleanFolders.length} folders; ` +
                `expected maximum is 12`
            );
        }

        // ─────────────────────────────────────────────
        // Validate channel assignments
        // ─────────────────────────────────────────────

        const assignment =
            validateFolderAssignments(
                uniqueChannels,
                cleanFolders
            );

        if (!assignment.valid) {
            console.error(
                '[AI] Invalid channel assignment:',
                {
                    missing:
                        assignment.missing.length,
                    unknown:
                        assignment.unknown.length,
                    duplicates:
                        assignment.duplicates.length
                }
            );

            return res.status(500).json({
                error: 'invalid_ai_assignment',
                message:
                    'Gemini did not assign every channel exactly once',
                detail: {
                    missingCount:
                        assignment.missing.length,
                    duplicateCount:
                        assignment.duplicates.length,
                    unknownCount:
                        assignment.unknown.length
                }
            });
        }

        // ─────────────────────────────────────────────
        // Success
        // ─────────────────────────────────────────────

        console.log(
            `[AI] Successfully categorized ` +
            `${uniqueChannels.length} channels into ` +
            `${cleanFolders.length} folders`
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
````
