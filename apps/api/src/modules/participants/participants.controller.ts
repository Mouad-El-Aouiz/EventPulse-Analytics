import type { RequestHandler } from 'express';
import { paginatedResponse, singleResponse } from '../../http/responses.js';
import { requestMetadata, requireActor } from '../../shared/http/request-context.js';
import type {
  CreateParticipantBody,
  MergeParticipantsBody,
  ParticipantListQuery,
  ParticipantParams,
  ParticipantRegistrationsQuery,
  UpdateParticipantBody,
} from './participants.schemas.js';
import type { ParticipantsService } from './participants.service.js';

export class ParticipantsController {
  constructor(private readonly service: ParticipantsService) {}

  readonly listParticipants: RequestHandler = async (req, res) => {
    const query = req.query as unknown as ParticipantListQuery;
    const page = await this.service.list(requireActor(req), query);

    res
      .status(200)
      .json(paginatedResponse(page.items, { limit: query.limit, nextCursor: page.nextCursor }));
  };

  readonly createParticipant: RequestHandler = async (req, res) => {
    const participant = await this.service.create(
      requireActor(req),
      req.body as CreateParticipantBody,
    );

    res.status(201).json(singleResponse(participant));
  };

  readonly getParticipant: RequestHandler = async (req, res) => {
    const { participantId } = req.params as ParticipantParams;
    const participant = await this.service.get(requireActor(req), participantId);

    res.status(200).json(singleResponse(participant));
  };

  readonly updateParticipant: RequestHandler = async (req, res) => {
    const { participantId } = req.params as ParticipantParams;
    const participant = await this.service.update(
      requireActor(req),
      participantId,
      req.body as UpdateParticipantBody,
    );

    res.status(200).json(singleResponse(participant));
  };

  readonly deleteParticipant: RequestHandler = async (req, res) => {
    const { participantId } = req.params as ParticipantParams;
    await this.service.remove(requireActor(req), participantId, requestMetadata(req));

    res.status(204).send();
  };

  readonly mergeParticipants: RequestHandler = async (req, res) => {
    const participant = await this.service.merge(
      requireActor(req),
      req.body as MergeParticipantsBody,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(participant));
  };

  readonly anonymizeParticipant: RequestHandler = async (req, res) => {
    const { participantId } = req.params as ParticipantParams;
    const participant = await this.service.anonymize(
      requireActor(req),
      participantId,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(participant));
  };

  readonly eraseParticipant: RequestHandler = async (req, res) => {
    const { participantId } = req.params as ParticipantParams;
    await this.service.erase(requireActor(req), participantId, requestMetadata(req));

    res.status(204).send();
  };

  readonly listParticipantRegistrations: RequestHandler = async (req, res) => {
    const { participantId } = req.params as ParticipantParams;
    const query = req.query as unknown as ParticipantRegistrationsQuery;
    const page = await this.service.listRegistrations(requireActor(req), participantId, query);

    res
      .status(200)
      .json(paginatedResponse(page.items, { limit: query.limit, nextCursor: page.nextCursor }));
  };
}
