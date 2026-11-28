import type { RequestHandler } from 'express';
import { paginatedResponse, singleResponse } from '../../http/responses.js';
import { requireActor } from '../../shared/http/request-context.js';
import type { RefundListQuery, RefundParams } from './refunds.schemas.js';
import type { RefundsService } from './refunds.service.js';

export class RefundsController {
  constructor(private readonly service: RefundsService) {}

  readonly listRefunds: RequestHandler = async (req, res) => {
    const query = req.query as unknown as RefundListQuery;
    const page = await this.service.list(requireActor(req), query);

    res
      .status(200)
      .json(paginatedResponse(page.items, { limit: query.limit, nextCursor: page.nextCursor }));
  };

  readonly getRefund: RequestHandler = async (req, res) => {
    const { refundId } = req.params as RefundParams;
    const refund = await this.service.get(requireActor(req), refundId);

    res.status(200).json(singleResponse(refund));
  };
}
