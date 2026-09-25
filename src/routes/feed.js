import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

const feedSchema = z.object({
  channelIds: z.array(z.string().regex(/^UC[\w-]{20,}$/)).min(1).max(200)
});

// كاش في ذاكرة السيرفر لمدة 5 دقائق لتقليل استهلاك الشبكة وسرعة الاستجابة
const rssMemoryCache = new Map();
const CACHE_TTL = 1000 * 60 * 5; // 5 دقائق

function extractXmlTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

async function fetchSingleChannelRss(channelId) {
  const cached = rssMemoryCache.get(channelId);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.videos;
  }

  try {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (!res.ok) return [];

    const xml = await res.text();
    const entryMatches = xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];
    const entries = entryMatches.slice(0, 15);

    const channelName = extractXmlTag(xml, 'name') || extractXmlTag(xml, 'title') || 'Channel';

    const videos = entries.map(entry => {
      const videoId = extractXmlTag(entry, 'yt:videoId') || extractXmlTag(entry, 'id').split(':').pop();
      const title = extractXmlTag(entry, 'title');
      const linkMatch = entry.match(/<link[^>]+href="([^"]+)"/i);
      const link = linkMatch ? linkMatch[1] : `https://www.youtube.com/watch?v=${videoId}`;
      const publishedStr = extractXmlTag(entry, 'published');
      const published = publishedStr ? new Date(publishedStr).getTime() : Date.now();
      const thumbMatch = entry.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
      const thumbnail = thumbMatch ? thumbMatch[1] : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

      const isShort = link.includes('/shorts/') || title.toLowerCase().includes('#shorts');

      return {
        id: videoId,
        title,
        link,
        published,
        thumbnail,
        channelId,
        channelName,
        isShort
      };
    });

    rssMemoryCache.set(channelId, { time: Date.now(), videos });
    return videos;
  } catch (err) {
    console.warn(`[Feed RSS] Failed for ${channelId}:`, err.message);
    return [];
  }
}

router.post('/rss', async (req, res, next) => {
  try {
    const parsed = feedSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'bad_request', detail: parsed.error.issues });
    }

    const { channelIds } = parsed.data;

    // جلب القنوات بالتوازي في السيرفر بسرعة فائقة
    const promises = channelIds.map(id => fetchSingleChannelRss(id));
    const results = await Promise.all(promises);

    const allVideos = results.flat().sort((a, b) => b.published - a.published);

    return res.json({ ok: true, videos: allVideos });
  } catch (err) {
    next(err);
  }
});

export default router;