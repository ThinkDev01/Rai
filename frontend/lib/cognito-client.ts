'use client';

// Auth provider dispatcher — the SINGLE public auth surface for the app.
//
// Reads NEXT_PUBLIC_AUTH_PROVIDER (baked at build):
//   - 'aws'    → Cognito via cognito-client-aws.ts (direct cognito-idp HTTPS,
//                no Amplify SDK) — production default.
//   - 'manual' → our backend's DB-backed auth via manual-auth-client.ts
//                (HS256 JWT + Resend email codes). No AWS needed.
//
// Both implementations expose the SAME names, shapes and error names
// (Cognito-style), so pages, the api interceptor and the auth store never
// know which provider is active.

import { ENV } from './env';
import * as aws from './cognito-client-aws';
import * as manual from './manual-auth-client';

const useManual = ENV.AUTH_PROVIDER === 'manual' || ENV.AUTH_PROVIDER === 'custom';
const impl = useManual ? manual : aws;

export type { CognitoTokens, SignInResult, SignUpResult } from './manual-auth-client';

export const getTokens                = impl.getTokens;
export const signIn                   = impl.signIn;
export const signOut                  = impl.signOut;
export const signUp                   = impl.signUp;
export const confirmSignUp            = impl.confirmSignUp;
export const resendSignUpCode         = impl.resendSignUpCode;
export const changePassword           = impl.changePassword;
export const forgotPassword           = impl.forgotPassword;
export const confirmForgotPassword    = impl.confirmForgotPassword;
export const getIdToken               = impl.getIdToken;
export const refreshTokens            = impl.refreshTokens;
export const parseIdTokenClaims       = impl.parseIdTokenClaims;
export const getStoredIdTokenSub      = impl.getStoredIdTokenSub;
export const isFederatedUser          = impl.isFederatedUser;
export const federatedProvider        = impl.federatedProvider;
export const startFederatedSignIn     = impl.startFederatedSignIn;
export const completeFederatedSignIn  = impl.completeFederatedSignIn;
export const consumePostLoginRedirect = impl.consumePostLoginRedirect;
export const isFederationConfigured   = useManual ? manual.isFederationConfigured : aws.isFederationConfigured;