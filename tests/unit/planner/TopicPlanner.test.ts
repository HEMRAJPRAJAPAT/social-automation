import { describe, expect, it } from 'vitest';

import { TopicPlanner } from '../../../src/planner/TopicPlanner.js';
import { FakeLlmProvider, makeContentSettings, makeFakeTopicRepository, makeTopic } from '../../mocks/fakes.js';

const settings = makeContentSettings();
const today = new Date('2026-01-15T00:00:00Z');

describe('TopicPlanner.planForToday', () => {
  it('reuses an already-planned topic for today without calling the LLM', async () => {
    const llm = new FakeLlmProvider();
    const existing = makeTopic({ id: 'topic-existing', title: 'Already Planned' });
    const topicRepository = makeFakeTopicRepository({
      findPlannedForDate: async () => existing,
    });

    const planner = new TopicPlanner(llm, topicRepository);
    const result = await planner.planForToday(settings, today);

    expect(result).toBe(existing);
    expect(llm.calls).toHaveLength(0);
  });

  it('generates and persists a new topic when none exists for today', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      title: 'A Brand New Topic About Testing',
      hook: 'Ever wondered how to test this?',
      summary: 'A summary that is long enough to pass validation checks easily.',
      keywords: ['testing', 'vitest', 'typescript'],
    });

    const topicRepository = makeFakeTopicRepository({
      findPlannedForDate: async () => null,
      findAllTitles: async () => [],
      findLastCategory: async () => null,
    });

    const planner = new TopicPlanner(llm, topicRepository);
    const result = await planner.planForToday(settings, today);

    expect(result.title).toBe('A Brand New Topic About Testing');
    expect(result.category).toBe('TUTORIAL'); // first in rotation when there's no history
    expect(topicRepository.create).toHaveBeenCalledTimes(1);
  });

  it('retries with a fresh idea when the first one is a near-duplicate of history', async () => {
    const llm = new FakeLlmProvider();
    llm.enqueueJson({
      title: '5 React Hooks You Should Know',
      hook: 'Hook one',
      summary: 'A summary that is long enough to pass validation checks easily.',
      keywords: ['react', 'hooks', 'javascript'],
    });
    llm.enqueueJson({
      title: 'Docker Compose for Absolute Beginners',
      hook: 'Hook two',
      summary: 'A totally different summary that is long enough to pass validation.',
      keywords: ['docker', 'compose', 'containers'],
    });

    const topicRepository = makeFakeTopicRepository({
      findPlannedForDate: async () => null,
      findAllTitles: async () => ['5 React Hooks You Should Know Today'],
      findLastCategory: async () => null,
    });

    const planner = new TopicPlanner(llm, topicRepository);
    const result = await planner.planForToday(settings, today);

    expect(result.title).toBe('Docker Compose for Absolute Beginners');
    expect(llm.calls).toHaveLength(2);
  });

  it('throws when every generated idea is a near-duplicate', async () => {
    const llm = new FakeLlmProvider();
    for (let i = 0; i < 4; i++) {
      llm.enqueueJson({
        title: '5 React Hooks You Should Know',
        hook: `Hook number ${i} for this attempt`,
        summary: 'A summary that is long enough to pass validation checks easily.',
        keywords: ['react', 'hooks', 'javascript'],
      });
    }

    const topicRepository = makeFakeTopicRepository({
      findPlannedForDate: async () => null,
      findAllTitles: async () => ['5 React Hooks You Should Know Today'],
      findLastCategory: async () => null,
    });

    const planner = new TopicPlanner(llm, topicRepository);
    await expect(planner.planForToday(settings, today)).rejects.toThrow(/unique topic/i);
  });
});
