import { renderHook, waitFor } from '@testing-library/react';
import { getBackendSrv } from '@grafana/runtime';
import { useInstanceSettings } from './useInstanceSettings';

jest.mock('@grafana/runtime', () => ({ getBackendSrv: jest.fn() }));

describe('useInstanceSettings', () => {
  const get = jest.fn();
  beforeEach(() => {
    get.mockReset();
    (getBackendSrv as jest.Mock).mockReturnValue({ get });
  });

  it('is off and makes no call without a uid', () => {
    const { result } = renderHook(() => useInstanceSettings(undefined));
    expect(result.current.allowClearTextJWTForwarding).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it('reflects the backend setting', async () => {
    get.mockResolvedValue({ allowClearTextJWTForwarding: true });
    const { result } = renderHook(() => useInstanceSettings('abc'));
    await waitFor(() => expect(result.current.allowClearTextJWTForwarding).toBe(true));
    expect(get.mock.calls[0][0]).toBe('/api/datasources/uid/abc/resources/instance-settings');
  });

  it('stays off when the backend says off', async () => {
    get.mockResolvedValue({ allowClearTextJWTForwarding: false });
    const { result } = renderHook(() => useInstanceSettings('abc'));
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current.allowClearTextJWTForwarding).toBe(false);
  });

  it('stays off when the call fails', async () => {
    get.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useInstanceSettings('abc'));
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(result.current.allowClearTextJWTForwarding).toBe(false);
  });
});
