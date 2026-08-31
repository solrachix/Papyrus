import { describe, expect, it, vi } from 'vitest';
import { MobilePerfProvider } from './MobilePerfContext';
import { createPerfSession } from './perfSession';

describe('MobilePerfProvider', () => {
  it('propagates one stable session to nested consumers', () => {
    const session = createPerfSession({ enabled: true, context: { fixture: 'large-100', runId: 'run-1', sampleId: 'sample-1', documentLoadId: 'doc-1' }, sink: vi.fn(), now: () => 1 });
    const element = MobilePerfProvider({ session, children: 'child' });
    expect(element.props.value).toBe(session);
    expect(element.props.children).toBe('child');
  });
});
