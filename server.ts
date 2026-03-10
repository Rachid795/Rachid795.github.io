import express from 'express';
import { createServer as createViteServer } from 'vite';

const app = express();
app.use(express.json());

// API Routes
app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    let platform = 'Unknown';
    let title = 'Unknown Video';
    let thumbnail = '';

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      platform = 'YouTube';
      try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (oembed.ok) {
          const data = await oembed.json();
          title = data.title;
          thumbnail = data.thumbnail_url;
        }
      } catch (e) {
        console.error('YouTube oEmbed error', e);
      }
    } else if (url.includes('tiktok.com')) {
      platform = 'TikTok';
      try {
        const oembed = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`);
        if (oembed.ok) {
          const data = await oembed.json();
          title = data.title;
          thumbnail = data.thumbnail_url;
        }
      } catch (e) {
        console.error('TikTok oEmbed error', e);
      }
    } else if (url.includes('instagram.com')) {
      platform = 'Instagram';
      title = 'Instagram Video';
      thumbnail = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80'; // placeholder
    } else {
      platform = 'Other';
    }

    const qualities = ['4K', '1080p', '720p', '480p', '360p', 'Audio Only'];

    res.json({ title, thumbnail, platform, qualities });
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: 'Failed to analyze video' });
  }
});

app.post('/api/download', async (req, res) => {
  try {
    const { url, quality } = req.body;
    if (!url || !quality) {
      res.status(400).json({ error: 'URL and quality are required' });
      return;
    }

    const formatMap: Record<string, string> = {
      '4K': '4k',
      '1080p': '1080',
      '720p': '720',
      '480p': '480',
      '360p': '360',
      'Audio Only': 'mp3',
    };

    const format = formatMap[quality] || '720';

    // Step 1: Init download
    const initRes = await fetch(`https://loader.to/ajax/download.php?format=${format}&url=${encodeURIComponent(url)}`);
    if (!initRes.ok) {
      res.status(500).json({ error: 'Failed to initialize download from loader.to' });
      return;
    }
    const initData = await initRes.json();

    if (!initData.id) {
      res.status(500).json({ error: 'Failed to initialize download' });
      return;
    }

    const id = initData.id;

    // Step 2 & 3: Poll progress
    let attempts = 0;
    const maxAttempts = 60; // 2 mins (60 * 2s)
    
    while (attempts < maxAttempts) {
      const progressRes = await fetch(`https://loader.to/ajax/progress.php?id=${id}`);
      if (!progressRes.ok) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      const progressData = await progressRes.json();

      if (progressData.success === 1) {
        res.json({ downloadUrl: progressData.download_url });
        return;
      }

      if (progressData.success === 0 && progressData.text && progressData.text.toLowerCase().includes('error')) {
         res.status(500).json({ error: progressData.text });
         return;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    res.status(504).json({ error: 'Download timed out' });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to process download' });
  }
});

// Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
