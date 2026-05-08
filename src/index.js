import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import foldersRoutes from './routes/folders.js';

const app = express();
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin.startsWith('chrome-extension://')) return cb(null, true);
    if (config.allowedOrigins.includes(origin)) return cb(null, true);
    console.error('[CORS] denied origin:', origin);
    cb(new Error('cors_denied'));
  },
  credentials: true,
  maxAge: 600,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

app.use(express.json({ limit: '64kb' }));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/me', meRoutes);
app.use('/api/folders', foldersRoutes);

app.use((err, req, res, _next) => {
  if (err?.status) return res.status(err.status).json({ error: err.message });
  console.error('[server] unhandled', err);
  res.status(500).json({ error: 'internal_error' });
});

app.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
});

export default app;

