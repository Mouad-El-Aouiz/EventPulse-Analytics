import type { RequestHandler } from 'express';
import { paginatedResponse, singleResponse } from '../../http/responses.js';
import { requestMetadata, requireActor } from '../../shared/http/request-context.js';
import type {
  CreateRegistrationBody,
  RegistrationListQuery,
  RegistrationParams,
  UpdateRegistrationBody,
} from './registrations.schemas.js';
import type { RegistrationsService } from './registrations.service.js';

export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  readonly listRegistrations: RequestHandler = async (req, res) => {
    const query = req.query as unknown as RegistrationListQuery;
    const page = await this.service.list(requireActor(req), query);

    res
      .status(200)
      .json(paginatedResponse(page.items, { limit: query.limit, nextCursor: page.nextCursor }));
  };

  readonly createRegistration: RequestHandler = async (req, res) => {
    const registration = await this.service.create(
      requireActor(req),
      req.body as CreateRegistrationBody,
    );

    res.status(201).json(singleResponse(registration));
  };

  readonly getRegistration: RequestHandler = async (req, res) => {
    const { registrationId } = req.params as RegistrationParams;
    const registration = await this.service.get(requireActor(req), registrationId);

    res.status(200).json(singleResponse(registration));
  };

  readonly updateRegistration: RequestHandler = async (req, res) => {
    const { registrationId } = req.params as RegistrationParams;
    const registration = await this.service.update(
      requireActor(req),
      registrationId,
      req.body as UpdateRegistrationBody,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(registration));
  };

  readonly confirmRegistration: RequestHandler = async (req, res) => {
    const { registrationId } = req.params as RegistrationParams;
    const registration = await this.service.confirm(requireActor(req), registrationId);

    res.status(200).json(singleResponse(registration));
  };

  readonly cancelRegistration: RequestHandler = async (req, res) => {
    const { registrationId } = req.params as RegistrationParams;
    const registration = await this.service.cancel(
      requireActor(req),
      registrationId,
      requestMetadata(req),
    );

    res.status(200).json(singleResponse(registration));
  };

  readonly deleteRegistration: RequestHandler = async (req, res) => {
    const { registrationId } = req.params as RegistrationParams;
    await this.service.remove(requireActor(req), registrationId, requestMetadata(req));

    res.status(204).send();
  };
}
