import type { RequestHandler } from 'express';
import { paginatedResponse, singleResponse } from '../../http/responses.js';
import { requestMetadata, requireActor } from '../../shared/http/request-context.js';
import type { CheckInListQuery, CheckInParams, CreateCheckInBody } from './check-ins.schemas.js';
import type { CheckInsService } from './check-ins.service.js';

export class CheckInsController {
  constructor(private readonly service: CheckInsService) {}

  readonly listCheckIns: RequestHandler = async (req, res) => {
    const query = req.query as unknown as CheckInListQuery;
    const page = await this.service.list(requireActor(req), query);

    res
      .status(200)
      .json(paginatedResponse(page.items, { limit: query.limit, nextCursor: page.nextCursor }));
  };

  readonly createCheckIn: RequestHandler = async (req, res) => {
    const checkIn = await this.service.create(
      requireActor(req),
      req.body as CreateCheckInBody,
      requestMetadata(req),
    );

    res.status(201).json(singleResponse(checkIn));
  };

  readonly getCheckIn: RequestHandler = async (req, res) => {
    const { checkInId } = req.params as CheckInParams;
    const checkIn = await this.service.get(requireActor(req), checkInId);

    res.status(200).json(singleResponse(checkIn));
  };
}
