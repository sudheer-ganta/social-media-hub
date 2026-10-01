import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { uploadSignLimiter } from '../middleware/rate-limit.middleware';
import { cloudinaryService, CloudinaryUploadError } from '../services/cloudinary.service';

/**
 * Upload signing. Mounted at `/api/uploads`.
 *
 *   POST /api/uploads/sign   { resourceType: 'image' | 'video' }  →  signed params
 *
 * The browser uploads straight to Cloudinary (the bytes never pass through this
 * server) but only with parameters this route signed for the caller. See
 * `cloudinaryService.signUpload` for why that replaces an unsigned preset.
 */
const router = Router();

router.post('/sign', requireAuth, uploadSignLimiter, (req: Request, res: Response) => {
  const resourceType = req.body?.resourceType === 'video' ? 'video' : 'image';

  try {
    res.json(cloudinaryService.signUpload(req.user.id, resourceType));
  } catch (error) {
    if (error instanceof CloudinaryUploadError) {
      console.error('[uploads] cannot sign', error.detail ?? error.message);
      res.status(503).json({ error: error.message });
      return;
    }
    console.error('[uploads] sign failed', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
