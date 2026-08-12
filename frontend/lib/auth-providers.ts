export type AuthProviderId = 'oidc' | 'dev-credentials';

export interface AuthProviderEnvironment {
  oidcIssuerUrl?: string;
  devMode?: string;
  nodeEnv?: string;
}

export function selectAuthProviderIds(env: AuthProviderEnvironment): AuthProviderId[] {
  if (env.oidcIssuerUrl?.trim()) {
    return ['oidc'];
  }

  if (env.devMode === 'true') {
    return ['dev-credentials'];
  }

  return [];
}
