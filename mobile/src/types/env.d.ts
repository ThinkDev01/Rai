// Type declarations for variables read from `.env` via react-native-dotenv.
declare module '@env' {
  export const API_URL: string;
  export const COGNITO_USER_POOL_ID: string;
  export const COGNITO_APP_CLIENT_ID: string;
  export const AWS_REGION: string;
  export const COGNITO_DOMAIN: string;
  export const OAUTH_REDIRECT_URL: string;
  export const DEEPLINK_SCHEME: string;
  export const WEB_URL: string;
  export const WEB_HOST: string;
  export const APP_ENV: string;
  export const SENTRY_DSN: string;
}
