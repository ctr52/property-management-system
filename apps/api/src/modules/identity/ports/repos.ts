import type { Organization, Session, User } from '../domain/types';

export type OrgRepo = {
  readonly save: (org: Organization) => Promise<void>;
};

export type UserRepo = {
  readonly getByEmail: (email: string) => Promise<User | null>;
  readonly getById: (id: string) => Promise<User | null>;
  readonly listByOrg: (orgId: string) => Promise<User[]>;
  readonly save: (user: User) => Promise<void>;
};

export type SessionRepo = {
  readonly save: (session: Session) => Promise<void>;
  readonly getById: (id: string) => Promise<Session | null>;
  readonly delete: (id: string) => Promise<void>;
};
