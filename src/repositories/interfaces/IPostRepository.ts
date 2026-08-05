import type { NewPost, Post, PostStatus } from '../../entities/Post.js';

export interface IPostRepository {
  create(post: NewPost): Promise<Post>;
  findById(id: string): Promise<Post | null>;
  update(id: string, patch: Partial<Post>): Promise<Post>;
  setStatus(id: string, status: PostStatus, error?: string | null): Promise<Post>;
  recentCaptionHooks(limit: number): Promise<string[]>;
}
