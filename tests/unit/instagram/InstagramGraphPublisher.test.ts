import axios, { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InstagramGraphPublisher } from '../../../src/instagram/InstagramGraphPublisher.js';
import { makeFakeApiLogRepository } from '../../mocks/fakes.js';

function graphFailure(status: number, error: Record<string, unknown>): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: { error },
  });
}

function makePublisher(): InstagramGraphPublisher {
  return new InstagramGraphPublisher(
    'token',
    'ig-account-1',
    'v20.0',
    makeFakeApiLogRepository(),
    1,
    1,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InstagramGraphPublisher.verifyCredentials', () => {
  it('passes when Meta accepts the token', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { id: 'ig-account-1' } });

    await expect(makePublisher().verifyCredentials()).resolves.toBeUndefined();
  });

  it('fails with a renew instruction when the token has expired', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(
      graphFailure(400, {
        code: 190,
        type: 'OAuthException',
        message: 'Error validating access token: Session has expired on Saturday, 03-Oct-26',
      }),
    );

    await expect(makePublisher().verifyCredentials()).rejects.toThrow(
      /Session has expired.*INSTAGRAM_ACCESS_TOKEN/s,
    );
  });

  it('fails when the token lacks permission for the account', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(
      graphFailure(403, { code: 10, type: 'OAuthException', message: 'Permission denied' }),
    );

    await expect(makePublisher().verifyCredentials()).rejects.toThrow(/Permission denied/);
  });

  it('does not block the run on a network blip that says nothing about the token', async () => {
    const networkError = new AxiosError('socket hang up', 'ECONNRESET');
    vi.spyOn(axios, 'get').mockRejectedValue(networkError);

    await expect(makePublisher().verifyCredentials()).resolves.toBeUndefined();
  });

  it('does not block the run when Meta itself is having a 5xx moment', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(
      graphFailure(500, {
        code: 2,
        type: 'OAuthException',
        message: 'Service temporarily unavailable',
      }),
    );

    await expect(makePublisher().verifyCredentials()).resolves.toBeUndefined();
  });
});
