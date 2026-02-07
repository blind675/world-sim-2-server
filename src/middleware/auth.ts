import { Request, Response, NextFunction } from 'express';

export const validateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    console.error('API_KEY not configured in environment variables');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  if (!apiKey) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }

  if (apiKey !== expectedApiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
};
