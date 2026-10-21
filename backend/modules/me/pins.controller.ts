import type { Response } from 'express';
import logger from '../../config/logger';
import {
  PIN_LIMIT,
  targetExistsInOrg,
  countPinsOfKind,
  isPinned,
  insertPin,
  deletePin,
  type PinKind,
} from './pins.model';
import type { AuthenticatedRequest, ApiResponse } from '../../types/common.types';
import { param } from '../../types/common.types';

// ── Personal pins — PUT/DELETE /api/v1/me/pins/{projects|tickets}/:id ────────
//
// Pins are a *me* resource: each user pins their own quick-access projects +
// tickets, surfaced as `isPinned` flags on the projects list + My Work feed.
// The toggle is split into two handler factories (pin / unpin) shared by both
// kinds — the route fixes `kind` so it's never request-controlled.

const ROUTE = '/api/v1/me/pins/:kind/:id';

const LABEL: Record<PinKind, string> = { project: 'project', ticket: 'ticket' };

/** PUT — add a pin. Validates id, org-scoped existence, and the per-type cap. */
function makePinHandler(kind: PinKind) {
  return async function pinHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user!;
    const { org_id } = req.context!;
    const entityId = parseInt(param(req, 'id'), 10);

    logger.info(
      { route: ROUTE, method: 'PUT', userId: user.id, orgId: org_id, kind, entityId },
      'Pin - start',
    );

    if (Number.isNaN(entityId)) {
      logger.warn({ route: ROUTE, userId: user.id, orgId: org_id, kind, rawId: param(req, 'id') }, 'Pin - invalid id');
      res.status(400).json({ success: false, data: {}, error: `Invalid ${LABEL[kind]} id` } satisfies ApiResponse);
      return;
    }

    try {
      // Already pinned → idempotent success. Cheap check that also skips the
      // limit gate so re-pinning an existing pin never trips the cap.
      if (await isPinned(user.id, org_id, kind, entityId)) {
        logger.info({ route: ROUTE, userId: user.id, orgId: org_id, kind, entityId }, 'Pin - already pinned (no-op)');
        res.status(200).json({ success: true, data: { pinned: true }, error: '' } satisfies ApiResponse);
        return;
      }

      if (!(await targetExistsInOrg(org_id, kind, entityId))) {
        logger.info(
          { route: ROUTE, userId: user.id, orgId: org_id, kind, entityId },
          'Pin - target not found in org',
        );
        res.status(404).json({ success: false, data: {}, error: `${LABEL[kind]} not found` } satisfies ApiResponse);
        return;
      }

      const count = await countPinsOfKind(user.id, org_id, kind);
      if (count >= PIN_LIMIT) {
        logger.info(
          { route: ROUTE, userId: user.id, orgId: org_id, kind, count },
          'Pin - limit reached',
        );
        res.status(422).json({
          success: false,
          data: {},
          error: `You can pin up to ${PIN_LIMIT} ${LABEL[kind]}s. Unpin one first.`,
        } satisfies ApiResponse);
        return;
      }

      await insertPin(user.id, org_id, kind, entityId);

      logger.info({ route: ROUTE, userId: user.id, orgId: org_id, kind, entityId }, 'Pin - success');
      res.status(200).json({ success: true, data: { pinned: true }, error: '' } satisfies ApiResponse);
    } catch (err) {
      logger.error(
        { route: ROUTE, userId: user.id, orgId: org_id, kind, entityId, error: (err as Error).message },
        'Pin - DB error',
      );
      res.status(500).json({ success: false, data: {}, error: `Could not pin ${LABEL[kind]}` } satisfies ApiResponse);
    }
  };
}

/** DELETE — remove a pin. Missing pin is treated as success (idempotent). */
function makeUnpinHandler(kind: PinKind) {
  return async function unpinHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = req.user!;
    const { org_id } = req.context!;
    const entityId = parseInt(param(req, 'id'), 10);

    logger.info(
      { route: ROUTE, method: 'DELETE', userId: user.id, orgId: org_id, kind, entityId },
      'Unpin - start',
    );

    if (Number.isNaN(entityId)) {
      logger.warn({ route: ROUTE, userId: user.id, orgId: org_id, kind, rawId: param(req, 'id') }, 'Unpin - invalid id');
      res.status(400).json({ success: false, data: {}, error: `Invalid ${LABEL[kind]} id` } satisfies ApiResponse);
      return;
    }

    try {
      const removed = await deletePin(user.id, org_id, kind, entityId);
      logger.info({ route: ROUTE, userId: user.id, orgId: org_id, kind, entityId, removed }, 'Unpin - success');
      res.status(200).json({ success: true, data: { pinned: false }, error: '' } satisfies ApiResponse);
    } catch (err) {
      logger.error(
        { route: ROUTE, userId: user.id, orgId: org_id, kind, entityId, error: (err as Error).message },
        'Unpin - DB error',
      );
      res.status(500).json({ success: false, data: {}, error: `Could not unpin ${LABEL[kind]}` } satisfies ApiResponse);
    }
  };
}

export const pinProject   = makePinHandler('project');
export const unpinProject = makeUnpinHandler('project');
export const pinTicket    = makePinHandler('ticket');
export const unpinTicket  = makeUnpinHandler('ticket');
