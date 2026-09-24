import express from 'express';
import cors from 'cors';
import { config } from './config.js';

// استيراد كافة المسارات
import authRouter from './routes/auth.js';
import devRouter from './routes/dev.js';
import foldersRouter from './routes/folders.js';
import meRouter from './routes/me.js';
import workspacesRouter from './routes/workspaces.js';
import aiRouter from './routes/ai.js';

const app = express();

// قائمة النطاقات المسموح بها
const allowedOrigins = [
  'https://www.folderstube.com',
  'https://folderstube.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3001',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-channel-id', 'x-extension-version', 'x-workspace-channel']
};

// تطبيق الـ CORS
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));

// مسار فحص الحالة Health Check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ربط مسارات الـ API
app.use('/api/auth', authRouter);
app.use('/api/me', meRouter);
app.use('/api/folders', foldersRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/dev', devRouter);

// معالج الأخطاء العام (Global Error Handler)
app.use((err, req, res, next) => {
  console.error('[server] unhandled error', {
    method: req.method,
    path: req.path,
    error: err.message || err,
    stack: err.stack,
  });

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'internal_server_error',
    ...(err.supabaseError ? { supabase_error: err.supabaseError } : {}),
  });
});

const PORT = config.port || 3001;

app.listen(PORT, () => {
  console.log(`[server] listening on :${PORT}`);
});

export default app;