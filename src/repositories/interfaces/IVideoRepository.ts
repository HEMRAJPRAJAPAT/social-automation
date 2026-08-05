import type { RenderedVideo } from '../../entities/RenderedVideo.js';

export interface VideoRecord extends RenderedVideo {
  id: string;
  postId: string;
}

export interface IVideoRepository {
  create(postId: string, video: RenderedVideo): Promise<VideoRecord>;
  markSelected(videoId: string, postId: string): Promise<VideoRecord>;
  findByPostId(postId: string): Promise<VideoRecord[]>;
}
