export interface ResearchFact {
  point: string;
  detail: string;
  source: 'model-knowledge' | 'provided-context';
}

export interface ResearchExample {
  title: string;
  description: string;
}

export interface ResearchResult {
  topicTitle: string;
  keyPoints: string[];
  facts: ResearchFact[];
  examples: ResearchExample[];
  latestDevelopments: string[];
  suggestedAngle: string;
}
