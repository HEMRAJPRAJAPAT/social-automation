import { beforeEach, describe, expect, it, vi } from 'vitest';

const scheduleMock = vi.fn();
const validateMock = vi.fn();
const stopMock = vi.fn();

vi.mock('node-cron', () => ({
  default: {
    validate: validateMock,
    schedule: scheduleMock,
  },
}));

const { DailyReelScheduler } = await import('../../../src/scheduler/DailyReelScheduler.js');
const { makeContentSettings } = await import('../../mocks/fakes.js');

beforeEach(() => {
  scheduleMock.mockReset();
  validateMock.mockReset();
  stopMock.mockReset();
  scheduleMock.mockReturnValue({ stop: stopMock });
  validateMock.mockReturnValue(true);
});

describe('DailyReelScheduler', () => {
  it('schedules one cron job per active setting with its own cron/timezone', () => {
    const orchestrator = { runForSetting: vi.fn() };
    const scheduler = new DailyReelScheduler(orchestrator as never);
    const settingsList = [
      makeContentSettings({ id: 's1', cronExpression: '0 9 * * *', timezone: 'UTC' }),
      makeContentSettings({ id: 's2', cronExpression: '0 12 * * *', timezone: 'America/New_York' }),
    ];

    scheduler.start(settingsList);

    expect(scheduleMock).toHaveBeenCalledTimes(2);
    expect(scheduleMock).toHaveBeenCalledWith('0 9 * * *', expect.any(Function), { timezone: 'UTC' });
    expect(scheduleMock).toHaveBeenCalledWith('0 12 * * *', expect.any(Function), {
      timezone: 'America/New_York',
    });
  });

  it('skips a setting with an invalid cron expression instead of throwing', () => {
    validateMock.mockReturnValue(false);
    const orchestrator = { runForSetting: vi.fn() };
    const scheduler = new DailyReelScheduler(orchestrator as never);

    expect(() => scheduler.start([makeContentSettings({ cronExpression: 'not a cron' })])).not.toThrow();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('runOnce delegates to the orchestrator for the given setting', async () => {
    const orchestrator = { runForSetting: vi.fn(async () => ({ executionId: 'e1', status: 'SUCCEEDED' })) };
    const scheduler = new DailyReelScheduler(orchestrator as never);
    const settings = makeContentSettings();

    await scheduler.runOnce(settings);

    expect(orchestrator.runForSetting).toHaveBeenCalledWith(settings);
  });

  it('stop() stops every scheduled task', () => {
    const orchestrator = { runForSetting: vi.fn() };
    const scheduler = new DailyReelScheduler(orchestrator as never);
    scheduler.start([makeContentSettings()]);

    scheduler.stop();

    expect(stopMock).toHaveBeenCalledTimes(1);
  });
});
