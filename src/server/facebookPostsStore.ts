import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import type { InStatement, Row } from '@libsql/client';
import Database from 'better-sqlite3';
import type { FacebookPost } from '../utils/facebookPostsShared';

type FacebookPostRow = {
  attachment_type: string | null;
  created_time: string;
  excerpt: string;
  facebook_post_id: string;
  image_url: string | null;
  is_live: number;
  is_repost: number;
  message: string;
  permalink_url: string;
  title: string;
};

type StoredFacebookPost = FacebookPost & {
  rawPayload: string;
};

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'facebook-posts.db');

let localDbInstance: Database.Database | null = null;
let remoteClientInstance: ReturnType<typeof createClient> | null = null;
let remoteSchemaPromise: Promise<void> | null = null;

const resolveLocalDbPath = () => process.env.FACEBOOK_POSTS_DB_PATH || DEFAULT_DB_PATH;

const resolveRemoteDbUrl = () => {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (tursoUrl) {
    return tursoUrl;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl?.startsWith('libsql:') || databaseUrl?.startsWith('https://')) {
    return databaseUrl;
  }

  return '';
};

const ensureDbDirectory = (dbPath: string) => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
};

const LOCAL_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS facebook_posts (
    facebook_post_id TEXT PRIMARY KEY,
    created_time TEXT NOT NULL,
    permalink_url TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    message TEXT NOT NULL,
    image_url TEXT,
    attachment_type TEXT,
    is_live INTEGER NOT NULL DEFAULT 0,
    is_repost INTEGER NOT NULL DEFAULT 0,
    raw_payload TEXT NOT NULL,
    synced_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_facebook_posts_created_time
  ON facebook_posts (created_time DESC);
`;

const REMOTE_SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS facebook_posts (
    facebook_post_id TEXT PRIMARY KEY,
    created_time TEXT NOT NULL,
    permalink_url TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    message TEXT NOT NULL,
    image_url TEXT,
    attachment_type TEXT,
    is_live INTEGER NOT NULL DEFAULT 0,
    is_repost INTEGER NOT NULL DEFAULT 0,
    raw_payload TEXT NOT NULL,
    synced_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_facebook_posts_created_time
    ON facebook_posts (created_time DESC)`,
];

const getLocalDb = () => {
  if (localDbInstance) {
    return localDbInstance;
  }

  const dbPath = resolveLocalDbPath();
  ensureDbDirectory(dbPath);
  localDbInstance = new Database(dbPath);
  localDbInstance.pragma('journal_mode = WAL');
  localDbInstance.exec(LOCAL_SCHEMA_SQL);
  return localDbInstance;
};

const getRemoteClient = async () => {
  if (!remoteClientInstance) {
    const url = resolveRemoteDbUrl();
    if (!url) {
      return null;
    }

    remoteClientInstance = createClient({
      authToken: process.env.TURSO_AUTH_TOKEN,
      url,
    });
  }

  if (!remoteSchemaPromise) {
    remoteSchemaPromise = (async () => {
      for (const statement of REMOTE_SCHEMA_SQL) {
        await remoteClientInstance?.execute(statement);
      }
    })();
  }

  await remoteSchemaPromise;
  return remoteClientInstance;
};

const mapRow = (row: FacebookPostRow): FacebookPost => ({
  attachmentType: row.attachment_type ?? '',
  createdTime: row.created_time,
  excerpt: row.excerpt,
  facebookPostId: row.facebook_post_id,
  imageUrl: row.image_url ?? '',
  isLive: row.is_live === 1,
  isRepost: row.is_repost === 1,
  message: row.message,
  permalinkUrl: row.permalink_url,
  title: row.title,
});

const readRowString = (row: Row, key: keyof FacebookPostRow) => {
  const value = row[key];
  if (typeof value === 'string') {
    return value;
  }

  return value == null ? '' : String(value);
};

const readRowNumber = (row: Row, key: keyof FacebookPostRow) => {
  const value = row[key];
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  return Number(value ?? 0);
};

const mapRemoteRow = (row: Row): FacebookPost =>
  mapRow({
    attachment_type:
      row.attachment_type == null ? null : readRowString(row, 'attachment_type').trim(),
    created_time: readRowString(row, 'created_time'),
    excerpt: readRowString(row, 'excerpt'),
    facebook_post_id: readRowString(row, 'facebook_post_id'),
    image_url: row.image_url == null ? null : readRowString(row, 'image_url').trim(),
    is_live: readRowNumber(row, 'is_live'),
    is_repost: readRowNumber(row, 'is_repost'),
    message: readRowString(row, 'message'),
    permalink_url: readRowString(row, 'permalink_url'),
    title: readRowString(row, 'title'),
  });

const getSelectSql = (whereClause = '', limitClause = 'LIMIT ?') => `
  SELECT
    facebook_post_id,
    created_time,
    permalink_url,
    title,
    excerpt,
    message,
    image_url,
    attachment_type,
    is_live,
    is_repost
  FROM facebook_posts
  WHERE is_live = 0${whereClause}
  ORDER BY datetime(created_time) DESC
  ${limitClause}
`;

export const listFacebookPosts = async (limit = 24): Promise<FacebookPost[]> => {
  const remoteClient = await getRemoteClient();

  if (remoteClient) {
    const result = await remoteClient.execute({
      args: [limit],
      sql: getSelectSql(),
    });
    return result.rows.map(mapRemoteRow);
  }

  const rows = getLocalDb().prepare(getSelectSql()).all(limit) as FacebookPostRow[];

  return rows.map(mapRow);
};

export const getFacebookPostById = async (facebookPostId: string): Promise<FacebookPost | null> => {
  const remoteClient = await getRemoteClient();

  if (remoteClient) {
    const result = await remoteClient.execute({
      args: [facebookPostId],
      sql: getSelectSql(' AND facebook_post_id = ?', 'LIMIT 1'),
    });

    return result.rows[0] ? mapRemoteRow(result.rows[0]) : null;
  }

  const row = getLocalDb()
    .prepare(getSelectSql(' AND facebook_post_id = ?', 'LIMIT 1'))
    .get(facebookPostId) as FacebookPostRow | undefined;

  return row ? mapRow(row) : null;
};

export const getFacebookPostCount = async () => {
  const remoteClient = await getRemoteClient();

  if (remoteClient) {
    const result = await remoteClient.execute('SELECT COUNT(*) AS count FROM facebook_posts');
    const countValue = result.rows[0]?.count;
    return typeof countValue === 'bigint' ? Number(countValue) : Number(countValue ?? 0);
  }

  const row = getLocalDb().prepare('SELECT COUNT(*) AS count FROM facebook_posts').get() as {
    count: number;
  };
  return row.count;
};

const UPSERT_SQL = `
  INSERT INTO facebook_posts (
    facebook_post_id,
    created_time,
    permalink_url,
    title,
    excerpt,
    message,
    image_url,
    attachment_type,
    is_live,
    is_repost,
    raw_payload,
    synced_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(facebook_post_id) DO UPDATE SET
    created_time = excluded.created_time,
    permalink_url = excluded.permalink_url,
    title = excluded.title,
    excerpt = excluded.excerpt,
    message = excluded.message,
    image_url = excluded.image_url,
    attachment_type = excluded.attachment_type,
    is_live = excluded.is_live,
    is_repost = excluded.is_repost,
    raw_payload = excluded.raw_payload,
    synced_at = excluded.synced_at
`;

const mapPostToArgs = (post: StoredFacebookPost, syncedAt: string) => [
  post.facebookPostId,
  post.createdTime,
  post.permalinkUrl,
  post.title,
  post.excerpt,
  post.message,
  post.imageUrl || null,
  post.attachmentType || null,
  post.isLive ? 1 : 0,
  post.isRepost ? 1 : 0,
  post.rawPayload,
  syncedAt,
];

export const upsertFacebookPosts = async (posts: StoredFacebookPost[]) => {
  if (posts.length === 0) {
    return;
  }

  const syncedAt = new Date().toISOString();
  const remoteClient = await getRemoteClient();

  if (remoteClient) {
    const statements: InStatement[] = posts.map((post) => ({
      args: mapPostToArgs(post, syncedAt),
      sql: UPSERT_SQL,
    }));

    await remoteClient.batch(statements, 'write');
    return;
  }

  const db = getLocalDb();
  const statement = db.prepare(`
    INSERT INTO facebook_posts (
      facebook_post_id,
      created_time,
      permalink_url,
      title,
      excerpt,
      message,
      image_url,
      attachment_type,
      is_live,
      is_repost,
      raw_payload,
      synced_at
    ) VALUES (
      @facebookPostId,
      @createdTime,
      @permalinkUrl,
      @title,
      @excerpt,
      @message,
      @imageUrl,
      @attachmentType,
      @isLive,
      @isRepost,
      @rawPayload,
      @syncedAt
    )
    ON CONFLICT(facebook_post_id) DO UPDATE SET
      created_time = excluded.created_time,
      permalink_url = excluded.permalink_url,
      title = excluded.title,
      excerpt = excluded.excerpt,
      message = excluded.message,
      image_url = excluded.image_url,
      attachment_type = excluded.attachment_type,
      is_live = excluded.is_live,
      is_repost = excluded.is_repost,
      raw_payload = excluded.raw_payload,
      synced_at = excluded.synced_at
  `);

  const transaction = db.transaction((items: StoredFacebookPost[]) => {
    for (const post of items) {
      statement.run({
        ...post,
        attachmentType: post.attachmentType || null,
        imageUrl: post.imageUrl || null,
        isLive: post.isLive ? 1 : 0,
        isRepost: post.isRepost ? 1 : 0,
        syncedAt,
      });
    }
  });

  transaction(posts);
};
