import type { Request, Response } from 'express';
import { createSandbox, isValidSandboxId, resetSandbox, sandboxExists, sandboxUrl } from '../services/sandboxService';
import { HttpError } from '../middleware/errors';

/** Creates a private copy of the Brewly demo site that fixes can be applied to. */
export async function create(_req: Request, res: Response) {
  const sandbox = await createSandbox();
  res.status(201).json({ sandboxId: sandbox.id, url: sandbox.url });
}

export async function reset(req: Request<{ id: string }>, res: Response) {
  const { id } = req.params;
  if (!isValidSandboxId(id) || !(await sandboxExists(id))) throw new HttpError(404, 'Sandbox not found');
  await resetSandbox(id);
  res.json({ sandboxId: id, url: sandboxUrl(id), reset: true });
}
