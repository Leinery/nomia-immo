import { Readable } from 'stream';
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';

import { ObjectPermission } from '../lib/objectAcl';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

function requireAuth(req: Request, res: Response, next: any) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: 'Nicht autorisiert' });
    return;
  }
  next();
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post(
  '/storage/uploads/request-url',
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
        }),
      );
    } catch (err) {
      console.error('Failed to generate upload URL', err);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 * Serves objects from PUBLIC_OBJECT_SEARCH_PATHS unconditionally.
 */
router.get(
  '/storage/public-objects/*path',
  async (req: Request, res: Response) => {
    const filePath = (req.params as any).path as string;
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const response = await objectStorageService.downloadObject(file);
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      Readable.fromWeb(response.body as any).pipe(res);
    } catch (err) {
      console.error('Failed to serve public object', err);
      res.status(500).json({ error: 'Failed to serve object' });
    }
  },
);

/**
 * GET /storage/objects/*
 * Serves private uploaded objects. Requires auth.
 */
router.get(
  '/storage/objects/*path',
  requireAuth,
  async (req: Request, res: Response) => {
    const objectPath = '/objects/' + (req.params as any).path;
    try {
      const file = await objectStorageService.getObjectEntityFile(objectPath);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile: file,
        requestedPermission: ObjectPermission.Read,
      });
      if (!canAccess) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const response = await objectStorageService.downloadObject(file);
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      Readable.fromWeb(response.body as any).pipe(res);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: 'Object not found' });
        return;
      }
      console.error('Failed to serve object', err);
      res.status(500).json({ error: 'Failed to serve object' });
    }
  },
);

export default router;
