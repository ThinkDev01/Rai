import { CognitoJwtVerifier } from 'aws-jwt-verify';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  AdminLinkProviderForUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import logger from '../../config/logger';
import type { AuthService, NormalizedAuthContext, ExternalIdentity } from './auth.service';

// All Cognito SDK calls funnel through this wrapper so every request/response
// (including errors) shows up in the backend terminal. Devops + we get the
// same view - never blind to a Cognito-side failure.
async function callCognito<T>(
  op: string,
  ctx: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  logger.info({ ...ctx, op, route: 'cognito-auth.service' }, `Cognito API call - start: ${op}`);
  try {
    const result = await fn();
    const ms = Date.now() - startedAt;
    logger.info({ ...ctx, op, ms, route: 'cognito-auth.service' }, `Cognito API call - success: ${op}`);
    return result;
  } catch (err) {
    const ms = Date.now() - startedAt;
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
    logger.error(
      {
        ...ctx,
        op,
        ms,
        errorName: e.name ?? 'UnknownError',
        errorMessage: e.message ?? String(err),
        httpStatus: e.$metadata?.httpStatusCode,
        awsRequestId: e.$metadata?.requestId,
        route: 'cognito-auth.service',
      },
      `Cognito API call - failed: ${op}`,
    );
    throw err;
  }
}

export class CognitoAuthService implements AuthService {
  private readonly userPoolId: string;
  private readonly verifier: ReturnType<typeof CognitoJwtVerifier.create>;
  private readonly cognito: CognitoIdentityProviderClient;

  // Env is validated + clients are built here (not at module load) so that merely
  // importing this file is side-effect-free. Tests inject MockAuthService via the
  // factory and never construct this class, so the Cognito env is only required
  // when the real provider is actually used.
  constructor() {
    const region = process.env['AWS_REGION'];
    const userPoolId = process.env['COGNITO_USER_POOL_ID'];
    const clientId = process.env['COGNITO_APP_CLIENT_ID'];

    if (!region || !userPoolId || !clientId) {
      throw new Error(
        'Cognito env not configured. Required: AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID',
      );
    }

    this.userPoolId = userPoolId;
    // ID tokens (not access tokens) are used as the API bearer in v2 - they carry email,
    // email_verified, identities, and custom:current_org_id needed for lazy-sync.
    // See docs/standards.md §8.
    this.verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId,
    });
    this.cognito = new CognitoIdentityProviderClient({ region });
  }

  async verifyAccessToken(token: string): Promise<NormalizedAuthContext> {
    return callCognito('verifyAccessToken', { userId: 'anonymous' }, async () => {
      const payload = await this.verifier.verify(token);
      const claims = payload as Record<string, unknown>;

      const rawEmailVerified = claims['email_verified'] === true || claims['email_verified'] === 'true';
      const identities       = extractIdentities(claims['identities']);

      // Federation implies email verification: Google and Microsoft both require
      // email ownership before authentication completes, so a federated sub
      // necessarily means the email was verified by the IdP. Cognito's default
      // attribute mapping leaves `email_verified=false` on federated users until
      // devops sets it explicitly - this normalization is a defense against that
      // misconfiguration. Native (USER_PASSWORD_AUTH) users retain Cognito's
      // verification state as-is.
      const hasFederatedIdentity = identities.some(
        (i) => i.providerName === 'Google' || i.providerName === 'Microsoft',
      );
      const emailVerified = rawEmailVerified || hasFederatedIdentity;

      // Name extraction - prefer `name` (set on native signup + most IdPs),
      // fall back to `given_name + family_name` (Microsoft sometimes only sets
      // these), otherwise null. Trim + collapse so we never store a blank.
      const nameClaim       = typeof claims['name']         === 'string' ? claims['name']         : '';
      const givenNameClaim  = typeof claims['given_name']   === 'string' ? claims['given_name']   : '';
      const familyNameClaim = typeof claims['family_name']  === 'string' ? claims['family_name']  : '';
      let name: string | null = nameClaim.trim();
      if (!name) {
        const combined = `${givenNameClaim.trim()} ${familyNameClaim.trim()}`.trim();
        name = combined || null;
      }

      return {
        externalAuthId: String(payload.sub),
        email: typeof claims['email'] === 'string' ? claims['email'] : '',
        emailVerified,
        name,
        currentOrgId: typeof claims['custom:current_org_id'] === 'string'
          ? (claims['custom:current_org_id'] as string)
          : null,
        identities,
      };
    });
  }

  async switchOrg(externalAuthId: string, newOrgId: string): Promise<void> {
    await callCognito('switchOrg', { externalAuthId, newOrgId }, () =>
      this.cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: this.userPoolId,
        Username: externalAuthId,
        UserAttributes: [{ Name: 'custom:current_org_id', Value: newOrgId }],
      })),
    );
  }

  async logoutAll(externalAuthId: string): Promise<void> {
    await callCognito('logoutAll', { externalAuthId }, () =>
      this.cognito.send(new AdminUserGlobalSignOutCommand({
        UserPoolId: this.userPoolId,
        Username: externalAuthId,
      })),
    );
  }

  async linkProvider(
    destExternalAuthId: string,
    sourceProviderName: 'Google' | 'Microsoft',
    sourceExternalAuthId: string,
  ): Promise<void> {
    await callCognito(
      'linkProvider',
      { destExternalAuthId, sourceProviderName, sourceExternalAuthId },
      () => this.cognito.send(new AdminLinkProviderForUserCommand({
        UserPoolId: this.userPoolId,
        DestinationUser: {
          ProviderName: 'Cognito',
          ProviderAttributeValue: destExternalAuthId,
        },
        SourceUser: {
          ProviderName: sourceProviderName,
          ProviderAttributeName: 'Cognito_Subject',
          ProviderAttributeValue: sourceExternalAuthId,
        },
      })),
    );
  }
}

// Cognito sometimes returns `identities` as a JSON string and sometimes as an array,
// depending on token type and IdP - accept both shapes.
function extractIdentities(raw: unknown): ExternalIdentity[] {
  if (Array.isArray(raw)) return raw.map(parseIdentity);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(parseIdentity);
    } catch {
      // malformed claim - treat as no federated identities
    }
  }
  return [];
}

function parseIdentity(raw: unknown): ExternalIdentity {
  const obj = (raw ?? {}) as Record<string, unknown>;
  return {
    providerName: typeof obj['providerName'] === 'string' ? obj['providerName'] : '',
    providerType: typeof obj['providerType'] === 'string' ? obj['providerType'] : '',
    userId: typeof obj['userId'] === 'string' ? obj['userId'] : '',
  };
}
