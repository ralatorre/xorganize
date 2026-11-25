import type { CapturedPost } from './normalise';

/**
 * The posts most recently seen in any timeline, kept in memory only.
 *
 * When the user bookmarks or likes a post, the site's request names it only
 * by id. This is where the rest of the post comes from.
 */
export class SeenPosts {
  private readonly posts = new Map<string, CapturedPost>();

  constructor(private readonly limit = 1000) {}

  add(post: CapturedPost): void {
    this.posts.delete(post.id); // re-inserting moves it to the newest position
    this.posts.set(post.id, post);
    if (this.posts.size > this.limit) {
      const oldest = this.posts.keys().next().value;
      if (oldest !== undefined) this.posts.delete(oldest);
    }
  }

  get(id: string): CapturedPost | undefined {
    return this.posts.get(id);
  }

  get size(): number {
    return this.posts.size;
  }
}
