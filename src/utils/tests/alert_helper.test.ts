// Mock @grafana/runtime BEFORE importing the module under test.
// `getAppEvents` is called once at module load, so we return a stable object
// whose `publish` defers to a mock function we can swap/read in tests.
jest.mock('@grafana/runtime', () => ({
  getAppEvents: () => ({
    publish: (...args: any[]) => (globalThis as any).__publishMock(...args),
  }),
}));

const publishMock = jest.fn();
(globalThis as any).__publishMock = publishMock;

import { showAlert } from '../alert_helper';

describe('showAlert error classification', () => {
  beforeEach(() => {
    publishMock.mockClear();
  });

  function lastPayload(): { type: string; payload: [string, string] } {
    expect(publishMock).toHaveBeenCalledTimes(1);
    return publishMock.mock.calls[0][0];
  }

  it('classifies SNMP device metric "is not valid" as actionable legacy notice', () => {
    showAlert({
      status: 400,
      data: { error: 'Value ktappprotocol__snmp_device_metrics__INT64_00 is not valid' },
    });
    const event = lastPayload();
    expect(event.type).toBe('alert-error');
    const [title, message] = event.payload;
    expect(title).toBe('Legacy SNMP device metric unavailable');
    expect(message).toContain('ktappprotocol__snmp_device_metrics__INT64_00');
    expect(message).toMatch(/legacy kproxy SNMP/);
    expect(message).toMatch(/deprecated/);
    expect(message).toMatch(/Kentik NMS/);
  });

  it('classifies SNMP interface metric "is not valid" as actionable legacy notice', () => {
    showAlert({
      status: 400,
      data: { error: 'Value ktappprotocol__snmp__INT64_04 is not valid' },
    });
    const [title, message] = lastPayload().payload;
    expect(title).toBe('Legacy SNMP interface metric unavailable');
    expect(message).toContain('ktappprotocol__snmp__INT64_04');
    expect(message).toMatch(/legacy kproxy SNMP/);
    expect(message).toMatch(/deprecated/);
    expect(message).toMatch(/Kentik NMS/);
  });

  it('classifies other ktappprotocol telemetry generically', () => {
    showAlert({
      status: 400,
      data: { error: 'Value ktappprotocol__dns__STR_00 is not valid' },
    });
    const [title, message] = lastPayload().payload;
    expect(title).toBe('dns telemetry unavailable');
    expect(message).toContain('ktappprotocol__dns__STR_00');
    expect(message).toMatch(/dns telemetry/);
  });

  it('passes through plain-flow "is not valid" as raw API error (likely a real bug)', () => {
    showAlert({
      status: 400,
      data: { error: 'Value bytes is not valid' },
    });
    const [title, message] = lastPayload().payload;
    expect(title).toBe('Kentik API Error');
    expect(message).toContain('Value bytes is not valid');
    expect(message).toContain('(400)');
  });

  it('falls back to status + raw message for unrelated errors', () => {
    showAlert({
      status: 502,
      statusText: 'Bad Gateway',
      data: { error: 'upstream connect error' },
    });
    const [title, message] = lastPayload().payload;
    expect(title).toBe('Kentik API Error');
    expect(message).toBe('(502) Bad Gateway: upstream connect error');
  });

  it('handles string errors', () => {
    showAlert('Network timeout');
    const [title, message] = lastPayload().payload;
    expect(title).toBe('Kentik API Error');
    expect(message).toContain('Network timeout');
  });

  it('handles errors with err field instead of data.error', () => {
    showAlert({ err: 'Value ktappprotocol__snmp__INT64_05 is not valid' });
    const [title, message] = lastPayload().payload;
    expect(title).toBe('Legacy SNMP interface metric unavailable');
    expect(message).toContain('INT64_05');
  });
});
