import type { RequestHandler } from 'express';
import { paginatedResponse, singleResponse } from '../../http/responses.js';
import { requestMetadata, requireActor } from '../../shared/http/request-context.js';
import type {
  CreateRefundBody,
  CreateTransactionBody,
  TransactionListQuery,
  TransactionParams,
  UpdateTransactionBody,
} from './transactions.schemas.js';
import type { TransactionsService } from './transactions.service.js';

export class TransactionsController {
  constructor(private readonly service: TransactionsService) {}

  readonly listTransactions: RequestHandler = async (req, res) => {
    const query = req.query as unknown as TransactionListQuery;
    const page = await this.service.list(requireActor(req), query);

    res
      .status(200)
      .json(paginatedResponse(page.items, { limit: query.limit, nextCursor: page.nextCursor }));
  };

  readonly createTransaction: RequestHandler = async (req, res) => {
    const transaction = await this.service.create(
      requireActor(req),
      req.body as CreateTransactionBody,
      requestMetadata(req),
    );

    res.status(201).json(singleResponse(transaction));
  };

  readonly getTransaction: RequestHandler = async (req, res) => {
    const { transactionId } = req.params as TransactionParams;
    const transaction = await this.service.get(requireActor(req), transactionId);

    res.status(200).json(singleResponse(transaction));
  };

  readonly updateTransaction: RequestHandler = async (req, res) => {
    const { transactionId } = req.params as TransactionParams;
    const transaction = await this.service.updateStatus(
      requireActor(req),
      transactionId,
      req.body as UpdateTransactionBody,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(transaction));
  };

  readonly createRefund: RequestHandler = async (req, res) => {
    const { transactionId } = req.params as TransactionParams;
    const refund = await this.service.createRefund(
      requireActor(req),
      transactionId,
      req.body as CreateRefundBody,
      requestMetadata(req),
    );

    res.status(201).json(singleResponse(refund));
  };
}
