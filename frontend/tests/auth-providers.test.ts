import { describe, expect, it } from 'vitest';

import { selectAuthProviderIds } from '@/lib/auth-providers';

describe('selectAuthProviderIds', () => {
  it('uses only OIDC when an issuer is configured', () => {
    expect(
      selectAuthProviderIds({
        oidcIssuerUrl: 'https://idp.example/dex',
        devMode: 'true',
        nodeEnv: 'development',
      })
    ).toEqual(['oidc']);
  });

  it('allows development credentials only when explicitly enabled', () => {
    expect(
      selectAuthProviderIds({
        devMode: 'true',
        nodeEnv: 'development',
      })
    ).toEqual(['dev-credentials']);
  });

  it('does not infer development credentials from NODE_ENV', () => {
    expect(
      selectAuthProviderIds({
        devMode: 'false',
        nodeEnv: 'development',
      })
    ).toEqual([]);
  });
});
