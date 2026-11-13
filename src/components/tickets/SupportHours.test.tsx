// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupportStatus } from '@/utils/supportHours';

/** Строка о часах работы и «когда ответят» у тикета — днём и ночью. */

vi.mock('react-i18next', async () =>
  (await import('@/components/admin/reachability/testUtils')).i18nMock(),
);

import { ExpectedReply, SupportHoursNotice, TypicalReplyHint } from './SupportHours';

const open: SupportStatus = {
  hours_enabled: true,
  open_now: true,
  start_hour: 10,
  end_hour: 22,
  timezone: 'Europe/Moscow',
  reply_minutes: 25,
  opens_at: null,
};
const closed: SupportStatus = { ...open, open_now: false, opens_at: '2026-11-03T07:00:00Z' };

afterEach(cleanup);

describe('SupportHours', () => {
  it('днём — «на связи» и режим работы', () => {
    render(<SupportHoursNotice status={open} />);
    expect(screen.getByText('Поддержка на связи')).toBeTruthy();
    expect(screen.getByText(/ежедневно с 10:00 до 22:00 \(МСК\)/)).toBeTruthy();
    expect(screen.queryByText(/не работает/)).toBeNull();
  });

  it('ночью — «не работает» и «ответим после 10:00»', () => {
    render(<SupportHoursNotice status={closed} />);
    expect(screen.getByText('Сейчас поддержка не работает')).toBeTruthy();
    expect(screen.getByText(/ответим после 10:00/)).toBeTruthy();
  });

  it('одинаковые часы начала и конца — круглосуточно', () => {
    render(<SupportHoursNotice status={{ ...open, start_hour: 0, end_hour: 24 }} />);
    expect(screen.getByText(/круглосуточно/)).toBeTruthy();
  });

  it('выключенные часы ничего не показывают', () => {
    const { container } = render(<SupportHoursNotice status={{ ...open, hours_enabled: false }} />);
    expect(container.textContent).toBe('');
  });

  it('подсказка в форме: днём — среднее время ответа, ночью — после открытия', () => {
    render(<TypicalReplyHint status={open} />);
    expect(screen.getByText(/Среднее время ответа — 25 мин$/)).toBeTruthy();
    cleanup();
    render(<TypicalReplyHint status={{ ...closed, reply_minutes: 90 }} />);
    expect(screen.getByText(/после 10:00 \(МСК\), обычно в течение ~1,5 ч/)).toBeTruthy();
  });

  it('у тикета: остаток днём, «совсем скоро», если срок прошёл', () => {
    const soon = new Date(Date.now() + 18 * 60_000).toISOString();
    render(<ExpectedReply expectedAt={soon} status={open} />);
    expect(screen.getByText(/примерно через ~20 мин/)).toBeTruthy();
    cleanup();
    render(
      <ExpectedReply expectedAt={new Date(Date.now() - 60_000).toISOString()} status={open} />,
    );
    expect(screen.getByText(/совсем скоро/)).toBeTruthy();
  });
});
