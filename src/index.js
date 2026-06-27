import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import foldersRoutes from './routes/folders.js';
import devRoutes from './routes/dev.js';

const app = express();

app.use((req,res,next)=>{
    console.log("[GLOBAL]",req.method,req.originalUrl);
    next();
});

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

if (config.devTokenEnabled) {
  app.use('/api/dev', devRoutes);
  console.warn('[server] /api/dev/token is ENABLED — auth bypass for testing. Never run in production.');
}

app.use((err, req, res, _next) => {
  console.error('[server] unhandled error', {
    method: req.method,
    path: req.path,
    error: err.message || String(err),
    stack: err.stack?.split('\n').slice(0, 6).join('\n'),
    ...(err.supabaseError ? { supabase_error: err.supabaseError } : {}),
  });
  const status = err?.status || 500;
  res.status(status).json({
    error: err.message || 'internal_error',
    ...(err.supabaseError ? { supabase_error: err.supabaseError } : {}),
    ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack.split('\n').slice(0, 3) } : {}),
  });
});

app.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
});

export default app;
