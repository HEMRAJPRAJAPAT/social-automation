import type { ResearchResult } from './ResearchResult.js';
import type { Script } from './Script.js';

export type PostStatus =
  | 'DRAFT'
  | 'RESEARCHING'
  | 'SCRIPTING'
  | 'VOICING'
  | 'SOURCING_MEDIA'
  | 'RENDERING'
  | 'READY'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED';

export interface Post {
  id: string;
  topicId: string;
  language: string;
  status: PostStatus;
  researchJson: ResearchResult | null;
  script: Script | null;
  captionText: string | null;
  hashtags: string[];
  igTitle: string | null;
  selectedVideoId: string | null;
  instagramMediaId: string | null;
  instagramContainerId: string | null;
  instagramPermalink: string | null;
  publishAttempts: number;
  lastPublishError: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewPost = Omit<
  Post,
  'id' | 'createdAt' | 'updatedAt' | 'publishAttempts' | 'hashtags'
> & {
  hashtags?: string[];
};
