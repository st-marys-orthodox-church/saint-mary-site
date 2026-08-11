import Anthropic from '@anthropic-ai/sdk';
import type { FacebookPost } from '../utils/facebookPostsShared';
import { upsertFacebookPosts } from './facebookPostsStore';

type MetaAttachment = {
  description?: string;
  media?: {
    image?: {
      src?: string;
    };
  };
  media_type?: string;
  subattachments?: {
    data?: MetaAttachment[];
  };
  target?: {
    id?: string;
    url?: string;
  };
  title?: string;
  type?: string;
  unshimmed_url?: string;
  url?: string;
};

type MetaPost = {
  attachments?: {
    data?: MetaAttachment[];
  };
  created_time?: string;
  full_picture?: string;
  id: string;
  message?: string;
  permalink_url?: string;
  status_type?: string;
};

type MetaFeedResponse = {
  data?: MetaPost[];
};

type NormalizedFacebookPost = FacebookPost & {
  rawPayload: string;
  titlePromptContext: string;
};

const GRAPH_API_VERSION = 'v23.0';
const GRAPH_FIELDS = [
  'attachments{description,media,media_type,subattachments,target,title,type,unshimmed_url,url}',
  'created_time',
  'full_picture',
  'message',
  'permalink_url',
  'status_type',
].join(',');
const TITLE_MODEL = 'claude-opus-4-7';

const compactText = (value: string) => value.replace(/\s+/g, ' ').trim();
const stripUrls = (value: string) => value.replace(/https?:\/\/\S+/gi, '').trim();

const truncate = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}…`;

const cleanMessage = (value: string) => compactText(stripUrls(value));

const readAttachmentImage = (attachment: MetaAttachment | undefined): string => {
  if (!attachment) {
    return '';
  }

  return (
    attachment.media?.image?.src ??
    attachment.subattachments?.data?.[0]?.media?.image?.src ??
    attachment.url ??
    attachment.unshimmed_url ??
    ''
  );
};

const buildAttachmentText = (attachment: MetaAttachment | undefined) =>
  compactText([attachment?.title, attachment?.description].filter(Boolean).join('. '));

const isGenericShareText = (message: string) => {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage === '' ||
    lowerMessage.startsWith('shared ') ||
    lowerMessage.includes(' shared a post') ||
    lowerMessage.includes(' shared a memory') ||
    lowerMessage.includes('a distribuit') ||
    lowerMessage.includes('distribuit o postare') ||
    lowerMessage.includes('distribuit o amintire')
  );
};

const isRepost = (post: MetaPost, attachment: MetaAttachment | undefined, message: string) => {
  const attachmentType = (attachment?.type ?? attachment?.media_type ?? '').toLowerCase();
  const statusType = (post.status_type ?? '').toLowerCase();
  return (
    attachmentType.includes('share') || statusType === 'shared_story' || isGenericShareText(message)
  );
};

const deriveDisplayMessage = (
  post: MetaPost,
  attachment: MetaAttachment | undefined,
  message: string
) => {
  const normalizedMessage = cleanMessage(message);
  const attachmentText = buildAttachmentText(attachment);
  const repost = isRepost(post, attachment, normalizedMessage);

  if (repost && attachmentText) {
    return attachmentText;
  }

  if (normalizedMessage && !isGenericShareText(normalizedMessage)) {
    return normalizedMessage;
  }

  return attachmentText || normalizedMessage;
};

const deriveFallbackTitle = (displayMessage: string, attachment: MetaAttachment | undefined) => {
  const firstSentence = compactText(displayMessage.split(/[\n.!?]/)[0] ?? '');
  if (firstSentence) {
    return truncate(firstSentence, 70);
  }

  const preferred = compactText(attachment?.title ?? '');
  if (preferred) {
    return truncate(preferred, 70);
  }

  const fallbackDescription = compactText(attachment?.description ?? '');
  if (fallbackDescription) {
    return truncate(fallbackDescription, 70);
  }

  return 'Parish Update';
};

const deriveExcerpt = (displayMessage: string) => truncate(displayMessage, 180);

const isLivePost = (post: MetaPost, attachment: MetaAttachment | undefined, message: string) => {
  const haystack = [
    message,
    attachment?.title,
    attachment?.description,
    post.permalink_url,
    post.status_type,
    attachment?.type,
    attachment?.media_type,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    haystack.includes('was live') ||
    haystack.includes('went live') ||
    haystack.includes('live now') ||
    haystack.includes('live video') ||
    haystack.includes('live stream') ||
    haystack.includes('livestream') ||
    haystack.includes('în direct') ||
    haystack.includes('transmisiune live') ||
    post.status_type?.toLowerCase() === 'live_video'
  );
};

const buildTitlePromptContext = ({
  attachment,
  displayMessage,
  message,
  post,
  repost,
}: {
  attachment: MetaAttachment | undefined;
  displayMessage: string;
  message: string;
  post: MetaPost;
  repost: boolean;
}) =>
  JSON.stringify(
    {
      attachmentDescription: compactText(attachment?.description ?? ''),
      attachmentTitle: compactText(attachment?.title ?? ''),
      displayMessage,
      originalMessage: cleanMessage(message),
      postId: post.id,
      repost,
    },
    null,
    2
  );

const normalizePost = (post: MetaPost): NormalizedFacebookPost | null => {
  const attachment = post.attachments?.data?.[0];
  const rawMessage = post.message ?? '';
  const message = cleanMessage(rawMessage);

  if (isLivePost(post, attachment, message)) {
    return null;
  }

  const repost = isRepost(post, attachment, message);
  const displayMessage = deriveDisplayMessage(post, attachment, rawMessage);

  return {
    attachmentType: attachment?.media_type ?? attachment?.type ?? '',
    createdTime: post.created_time ?? new Date().toISOString(),
    excerpt: deriveExcerpt(displayMessage),
    facebookPostId: post.id,
    imageUrl: post.full_picture || readAttachmentImage(attachment),
    isLive: false,
    isRepost: repost,
    message: displayMessage,
    permalinkUrl: post.permalink_url ?? `https://www.facebook.com/${post.id}`,
    rawPayload: JSON.stringify(post),
    title: deriveFallbackTitle(displayMessage, attachment),
    titlePromptContext: buildTitlePromptContext({
      attachment,
      displayMessage,
      message: rawMessage,
      post,
      repost,
    }),
  };
};

const fetchFacebookPagePosts = async () => {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const limit = process.env.FACEBOOK_SYNC_PAGE_SIZE || '25';

  if (!pageId || !pageAccessToken) {
    throw new Error('Facebook Page credentials are not configured');
  }

  const params = new URLSearchParams({
    access_token: pageAccessToken,
    fields: GRAPH_FIELDS,
    limit,
  });

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${pageId}/posts?${params.toString()}`,
    {
      headers: { Accept: 'application/json' },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Facebook sync failed with status ${response.status}: ${errorText}`);
  }

  const payload = (await response.json()) as MetaFeedResponse;
  return payload.data ?? [];
};

const extractTextFromAnthropicResponse = (
  response: Awaited<ReturnType<Anthropic['messages']['create']>>
) => {
  if (!('content' in response)) {
    throw new Error('Unexpected streaming response while generating Facebook titles');
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Claude returned no text block');
  }

  return textBlock.text.trim();
};

const extractJsonArray = (value: string) => {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const content = fenced?.[1]?.trim() || value.trim();
  const startIndex = content.indexOf('[');
  const endIndex = content.lastIndexOf(']');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`No JSON array in AI response: ${value.slice(0, 300)}`);
  }

  return JSON.parse(content.slice(startIndex, endIndex + 1)) as Array<{
    id?: string;
    title?: string;
  }>;
};

const generateAiTitles = async (posts: NormalizedFacebookPost[]) => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || posts.length === 0) {
    return;
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: TITLE_MODEL,
    max_tokens: 2400,
    system: `You write polished homepage/news card headlines for church website posts.

Rules:
- Return ONLY a JSON array.
- Each item must be {"id":"...","title":"..."}.
- Title must be in the same language as the source content.
- Keep titles reverent, specific, and natural.
- Use 3 to 9 words when possible.
- Never mention Facebook, reposting, or "shared a post".
- Maximum 70 characters.
- If the post is about livestreaming or going live, title it normally only if the source material is not itself a livestream post.`,
    messages: [
      {
        role: 'user',
        content: `Create one concise title for each parish post.\n\n${JSON.stringify(
          posts.map((post) => ({
            context: JSON.parse(post.titlePromptContext),
            fallbackTitle: post.title,
            id: post.facebookPostId,
          })),
          null,
          2
        )}`,
      },
    ],
  });

  const items = extractJsonArray(extractTextFromAnthropicResponse(response));
  const byId = new Map(items.map((item) => [item.id, item.title]));

  for (const post of posts) {
    const candidate = byId.get(post.facebookPostId);
    if (!candidate) {
      continue;
    }

    const cleaned = truncate(compactText(candidate), 70);
    if (cleaned) {
      post.title = cleaned;
    }
  }
};

export const syncFacebookPosts = async () => {
  const remotePosts = await fetchFacebookPagePosts();
  const normalizedPosts = remotePosts
    .map(normalizePost)
    .filter((post): post is NormalizedFacebookPost => post !== null);

  await generateAiTitles(normalizedPosts);
  await upsertFacebookPosts(
    normalizedPosts.map(({ titlePromptContext: _titlePromptContext, ...post }) => post)
  );

  return {
    importedCount: normalizedPosts.length,
    skippedCount: remotePosts.length - normalizedPosts.length,
  };
};
