import { err, ok, type Result } from 'neverthrow';
import type {
  AttachListingInput,
  CreateListingInput,
  ListingLinkView,
  Platform,
} from '@pms/shared';
import { type AppError, conflictError, notFoundError } from '../../../shared/errors';
import type { IdGen } from '../../../shared/ports';
import { deriveSyncStatus } from '../domain/sync-status';
import type { ListingLink, PublishFeedbackMode } from '../domain/types';
import type { AdapterRegistry, ChannelAccountRepo, ListingLinkRepo, PropertyLookup } from '../ports/repos';

export type ManageListingsDeps = {
  readonly listings: ListingLinkRepo;
  readonly accounts: ChannelAccountRepo;
  readonly properties: PropertyLookup;
  readonly registry: AdapterRegistry;
  readonly idGen: IdGen;
};

/** Ревизия контента у только что заведённой связи. */
const INITIAL_REVISION = 1;

const toView =
  (deps: ManageListingsDeps) =>
  (link: ListingLink): ListingLinkView => {
    const feedback: PublishFeedbackMode =
      deps.registry.get(link.platform)?.capabilities.publishFeedback ?? 'none';
    return {
      id: link.id,
      propertyId: link.propertyId,
      platform: link.platform,
      mode: link.mode,
      externalId: link.externalId,
      platformListingId: link.platformListingId,
      syncStatus: deriveSyncStatus(link, feedback),
      phase: link.phase,
      desiredRevision: link.desiredRevision,
      appliedRevision: link.appliedRevision,
      lastPushedAt: link.lastPushedAt,
      lastConfirmedAt: link.lastConfirmedAt,
      lastError: link.lastError,
    };
  };

const hasActiveAccount = async (
  accounts: ChannelAccountRepo,
  orgId: string,
  platform: Platform,
): Promise<boolean> => {
  const list = await accounts.listByOrg(orgId);
  return list.some((a) => a.platform === platform && a.status === 'active');
};

/** Общие проверки перед созданием связи. */
const guard = async (
  deps: ManageListingsDeps,
  orgId: string,
  propertyId: string,
  platform: Platform,
): Promise<AppError | null> => {
  if (!(await deps.properties.exists(orgId, propertyId))) {
    return notFoundError('Объект не найден');
  }
  if (!(await hasActiveAccount(deps.accounts, orgId, platform))) {
    return conflictError(`Площадка ${platform} не подключена`);
  }
  if (await deps.listings.getByPropertyPlatform(orgId, propertyId, platform)) {
    return conflictError('Объявление для этой площадки уже привязано');
  }
  return null;
};

/** Создать объявление через нашу платформу (managed → попадёт в фид). */
export const createManagedListing =
  (deps: ManageListingsDeps) =>
  async (orgId: string, input: CreateListingInput): Promise<Result<ListingLinkView, AppError>> => {
    const problem = await guard(deps, orgId, input.propertyId, input.platform);
    if (problem) return err(problem);

    const link: ListingLink = {
      id: deps.idGen(),
      orgId,
      propertyId: input.propertyId,
      platform: input.platform,
      mode: 'managed',
      externalId: input.propertyId,
      platformListingId: null,
      phase: 'queued',
      desiredRevision: INITIAL_REVISION,
      pushedRevision: null,
      appliedRevision: null,
      lastPushedAt: null,
      lastConfirmedAt: null,
      lastError: null,
    };
    await deps.listings.save(link);
    return ok(toView(deps)(link));
  };

/** Привязать существующее объявление (attached → только маппинг). */
export const attachListing =
  (deps: ManageListingsDeps) =>
  async (orgId: string, input: AttachListingInput): Promise<Result<ListingLinkView, AppError>> => {
    const problem = await guard(deps, orgId, input.propertyId, input.platform);
    if (problem) return err(problem);

    const link: ListingLink = {
      id: deps.idGen(),
      orgId,
      propertyId: input.propertyId,
      platform: input.platform,
      mode: 'attached',
      externalId: input.propertyId,
      platformListingId: input.platformListingId,
      // Привязанное объявление уже живёт на площадке независимо — считаем актуальным.
      phase: 'applied',
      desiredRevision: INITIAL_REVISION,
      pushedRevision: INITIAL_REVISION,
      appliedRevision: INITIAL_REVISION,
      lastPushedAt: null,
      lastConfirmedAt: null,
      lastError: null,
    };
    await deps.listings.save(link);
    return ok(toView(deps)(link));
  };

export const listPropertyListings =
  (deps: ManageListingsDeps) =>
  async (orgId: string, propertyId: string): Promise<ListingLinkView[]> => {
    const links = await deps.listings.listByProperty(orgId, propertyId);
    return links.map(toView(deps));
  };

export const removeListing =
  (deps: ManageListingsDeps) =>
  async (orgId: string, id: string): Promise<Result<{ removed: true }, AppError>> => {
    await deps.listings.remove(orgId, id);
    return ok({ removed: true });
  };
