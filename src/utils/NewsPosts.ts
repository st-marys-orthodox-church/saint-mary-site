export type NewsPost = {
  createdAt: string;
  excerpt: string;
  externalUrl?: string;
  id: string;
  imageUrl?: string;
  message: string;
  title: string;
};

export const getNewsPostPath = (id: string) => `/stiri-evenimente/${encodeURIComponent(id)}`;

// Hand-authored parish news and event posts. Newest first is not required —
// listNewsPosts() sorts by createdAt. Use YYYY-MM-DD for createdAt.
export const newsPosts: NewsPost[] = [];

export const listNewsPosts = (limit?: number): NewsPost[] => {
  const sorted = [...newsPosts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
};

export const getNewsPostById = (id: string): NewsPost | null =>
  newsPosts.find((post) => post.id === id) ?? null;
