/**
 * The sidebar's tag list (DESIGN, 3): a `/` in a name shows the tag inside a
 * group, so `dev/rust` and `dev/typescript` sit under `dev`. Names are stored
 * flat; this is display only.
 */

import type { PostId, TagId, TagSuggestion } from '@/src/db/types';
import { tagKey } from '@/src/tags/names';

export const GROUP_SEPARATOR = '/';

export interface TagNode {
  /**
   * Unique among all nodes: the normalised path, such as `dev/rust`. A second
   * tag with the same path adds `;` and its ID; tag names cannot hold `;`.
   */
  key: string;
  /** The last part of the path, as first written. */
  label: string;
  /** The tag with exactly this path. A group may have none. */
  tag?: TagSuggestion;
  children: TagNode[];
}

/** Groups and tags, each level sorted by label. */
export function tagTree(tags: readonly TagSuggestion[]): TagNode[] {
  const roots: TagNode[] = [];
  for (const tag of tags) {
    const parts = pathOf(tag.name);
    let level = roots;
    let parent = roots;
    let node: TagNode | undefined;
    for (const [depth, part] of parts.entries()) {
      const key = parts
        .slice(0, depth + 1)
        .map(tagKey)
        .join(GROUP_SEPARATOR);
      node = level.find((candidate) => candidate.key === key);
      if (!node) {
        node = { key, label: part, children: [] };
        level.push(node);
      }
      parent = level;
      level = node.children;
    }
    if (!node) continue;
    if (!node.tag) node.tag = tag;
    // Names can differ only around a separator, as `a/b` and `a / b` do. The
    // first keeps the place; the other is shown beside it under its full name.
    else parent.push({ key: `${node.key};${tag.id}`, label: tag.name, tag, children: [] });
  }
  sortLevel(roots);
  return roots;
}

/** The name's parts, without empty ones: `/dev//rust/` is `dev`, `rust`. */
function pathOf(name: string): string[] {
  const parts = name
    .split(GROUP_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  return parts.length > 0 ? parts : [name];
}

const labels = new Intl.Collator('en-US', { sensitivity: 'base', numeric: true });

function sortLevel(level: TagNode[]): void {
  level.sort((a, b) => labels.compare(a.label, b.label) || a.key.localeCompare(b.key));
  for (const node of level) sortLevel(node.children);
}

/** Every tag at or under a node, in the order the sidebar lists them. */
export function tagsIn(node: TagNode): TagId[] {
  return [...(node.tag ? [node.tag.id] : []), ...node.children.flatMap(tagsIn)];
}

/**
 * How many posts each group without a tag of its own holds: the posts that
 * carry any tag under it, each counted once. By node key.
 */
export function groupCounts(
  tree: readonly TagNode[],
  tagged: ReadonlyMap<TagId, ReadonlySet<PostId>>,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: TagNode) => {
    if (node.children.length === 0) return;
    if (!node.tag) {
      const posts = new Set<PostId>();
      for (const id of tagsIn(node)) for (const post of tagged.get(id) ?? []) posts.add(post);
      counts.set(node.key, posts.size);
    }
    node.children.forEach(visit);
  };
  tree.forEach(visit);
  return counts;
}
