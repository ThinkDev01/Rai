// Re-exports for convenience. v1's RegisterBody / LoginBody / AuthTokenPayload are gone
// - those flows live in Amplify on the frontend now.

export type { NormalizedAuthContext, ExternalIdentity, AuthService } from './auth.service';
export type { UserRow, MembershipRow } from './auth.model';
