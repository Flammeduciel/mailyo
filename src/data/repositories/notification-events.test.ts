import type { Database } from '@/data/db/database';
import {
  listRecentEvents,
  pruneEventsBefore,
  recordEvent,
} from '@/data/repositories/notification-events';
import { createMigratedDatabase } from '@/data/repositories/test-utils';
import type { NotificationEvent } from '@/domain/models';

function event(overrides: Partial<NotificationEvent> = {}): NotificationEvent {
  return {
    id: 'evt_1',
    messageId: 'msg_1',
    ruleId: null,
    notifiedAt: 1_000,
    result: 'notified',
    reason: 'matched',
    ...overrides,
  };
}

describe('notification-events repository', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createMigratedDatabase();
  });

  it('records and reads back events', async () => {
    await recordEvent(db, event());
    expect(await listRecentEvents(db, 0)).toEqual([event()]);
  });

  it('filters by notified_at and orders newest first', async () => {
    await recordEvent(db, event({ id: 'e1', notifiedAt: 1_000 }));
    await recordEvent(db, event({ id: 'e2', notifiedAt: 2_000 }));
    await recordEvent(db, event({ id: 'e3', notifiedAt: 3_000 }));

    const recent = await listRecentEvents(db, 2_000);
    expect(recent.map((e) => e.id)).toEqual(['e3', 'e2']);
  });

  it('prunes events before a cutoff', async () => {
    await recordEvent(db, event({ id: 'old', notifiedAt: 1_000 }));
    await recordEvent(db, event({ id: 'new', notifiedAt: 5_000 }));

    await pruneEventsBefore(db, 3_000);
    expect((await listRecentEvents(db, 0)).map((e) => e.id)).toEqual(['new']);
  });
});
