//! Data access. Every user-facing article/feed query is scoped by user ID so
//! ownership is enforced in SQL rather than by a separate lookup.

use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::models::{Article, ArticleFilter, Feed, FetchResult, NewArticle, User};
use crate::text;

type Result<T> = std::result::Result<T, sqlx::Error>;

// ---------------------------------------------------------------- users ---

const USER_COLUMNS: &str = "id, email, password_hash, created_at, updated_at, role";

/// Inserts a user. The very first account becomes admin; the decision is made
/// under an advisory lock so two concurrent first sign-ups can't both win.
pub async fn create_user(
    pool: &PgPool,
    id: Uuid,
    email: &str,
    password_hash: &str,
    now: DateTime<Utc>,
) -> Result<String> {
    let mut tx = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(7314001)")
        .execute(&mut *tx)
        .await?;
    let role: String = sqlx::query_scalar(
        "INSERT INTO users (id, email, password_hash, created_at, role)
         VALUES ($1, $2, $3, $4, CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'admin' ELSE 'user' END)
         RETURNING role",
    )
    .bind(id)
    .bind(email)
    .bind(password_hash)
    .bind(now)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(role)
}

pub async fn user_by_email(pool: &PgPool, email: &str) -> Result<Option<User>> {
    let q = format!("SELECT {USER_COLUMNS} FROM users WHERE lower(email) = lower($1)");
    Ok(sqlx::query_as::<_, User>(&q)
        .bind(email)
        .fetch_optional(pool)
        .await?
        .map(User::with_admin_flag))
}

pub async fn user_exists(pool: &PgPool, email: &str) -> Result<bool> {
    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower($1))")
        .bind(email)
        .fetch_one(pool)
        .await
}

pub async fn count_users(pool: &PgPool) -> Result<i64> {
    sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await
}

pub async fn list_users(pool: &PgPool) -> Result<Vec<User>> {
    Ok(sqlx::query_as::<_, User>(
        "SELECT id, email, created_at, updated_at, role FROM users ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(User::with_admin_flag)
    .collect())
}

pub async fn delete_user(pool: &PgPool, id: Uuid) -> Result<()> {
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ------------------------------------------------------------- sessions ---

/// Only the SHA-256 of a session token is stored, so a database leak does not
/// hand out live sessions. Callers always pass the raw token.
pub fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

pub async fn create_session(
    pool: &PgPool,
    user_id: Uuid,
    token: &str,
    expires_at: DateTime<Utc>,
    user_agent: &str,
    ip: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO sessions (id, user_id, token, expires_at, created_at, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6)",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(hash_token(token))
    .bind(expires_at)
    .bind(user_agent)
    .bind(text::truncate_chars(ip, 45))
    .execute(pool)
    .await?;
    Ok(())
}

/// Resolves a raw session token to its user in one round trip.
pub async fn user_by_token(pool: &PgPool, token: &str) -> Result<Option<User>> {
    Ok(sqlx::query_as::<_, User>(
        "SELECT u.id, u.email, u.created_at, u.updated_at, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = $1 AND s.expires_at > NOW()",
    )
    .bind(hash_token(token))
    .fetch_optional(pool)
    .await?
    .map(User::with_admin_flag))
}

pub async fn delete_session(pool: &PgPool, token: &str) -> Result<()> {
    sqlx::query("DELETE FROM sessions WHERE token = $1")
        .bind(hash_token(token))
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_expired_sessions(pool: &PgPool) -> Result<u64> {
    Ok(sqlx::query("DELETE FROM sessions WHERE expires_at < NOW()")
        .execute(pool)
        .await?
        .rows_affected())
}

// ---------------------------------------------------------------- feeds ---

const FEED_COLUMNS: &str = "f.id, f.user_id, f.url, COALESCE(f.title, '') AS title, f.description,
    f.site_url, f.image_url, f.last_fetched_at, f.fetch_error, f.created_at, f.updated_at,
    f.etag, f.last_modified, f.error_count";

pub async fn create_feed(
    pool: &PgPool,
    id: Uuid,
    user_id: Uuid,
    url: &str,
    title: &str,
    site_url: Option<&str>,
) -> Result<Feed> {
    let q = format!(
        "WITH f AS (
            INSERT INTO feeds (id, user_id, url, title, site_url, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING *
         ) SELECT {FEED_COLUMNS} FROM f"
    );
    Ok(sqlx::query_as::<_, Feed>(&q)
        .bind(id)
        .bind(user_id)
        .bind(url)
        .bind(title)
        .bind(site_url)
        .fetch_one(pool)
        .await?
        .normalize())
}

pub async fn feed_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Feed>> {
    let q = format!("SELECT {FEED_COLUMNS} FROM feeds f WHERE f.id = $1");
    Ok(sqlx::query_as::<_, Feed>(&q)
        .bind(id)
        .fetch_optional(pool)
        .await?
        .map(Feed::normalize))
}

pub async fn feed_exists(pool: &PgPool, user_id: Uuid, url: &str) -> Result<bool> {
    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM feeds WHERE user_id = $1 AND url = $2)")
        .bind(user_id)
        .bind(url)
        .fetch_one(pool)
        .await
}

/// All feeds of a user with their unread counts (one aggregate over the
/// partial unread index instead of a COUNT per feed).
pub async fn feeds_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Feed>> {
    let q = format!(
        "SELECT {FEED_COLUMNS}, COALESCE(u.unread, 0) AS unread_count
         FROM feeds f
         LEFT JOIN (
             SELECT a.feed_id, COUNT(*) AS unread
             FROM articles a
             JOIN feeds uf ON uf.id = a.feed_id AND uf.user_id = $1
             WHERE NOT a.is_read
             GROUP BY a.feed_id
         ) u ON u.feed_id = f.id
         WHERE f.user_id = $1
         ORDER BY lower(f.title) ASC"
    );
    Ok(sqlx::query_as::<_, Feed>(&q)
        .bind(user_id)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(Feed::normalize)
        .collect())
}

pub async fn rename_feed(pool: &PgPool, id: Uuid, title: &str) -> Result<()> {
    sqlx::query("UPDATE feeds SET title = $2, updated_at = NOW() WHERE id = $1")
        .bind(id)
        .bind(title)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn delete_feed(pool: &PgPool, id: Uuid) -> Result<()> {
    sqlx::query("DELETE FROM feeds WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Feeds whose next fetch is due, never-fetched first.
pub async fn feeds_due(pool: &PgPool, limit: i64) -> Result<Vec<Feed>> {
    let q = format!(
        "SELECT {FEED_COLUMNS} FROM feeds f
         WHERE f.next_fetch_at IS NULL OR f.next_fetch_at <= NOW()
         ORDER BY f.next_fetch_at ASC NULLS FIRST
         LIMIT $1"
    );
    Ok(sqlx::query_as::<_, Feed>(&q)
        .bind(limit)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(Feed::normalize)
        .collect())
}

/// Records the outcome of a fetch in one statement. The title is only
/// replaced while it is still the placeholder URL.
pub async fn save_fetch_result(pool: &PgPool, id: Uuid, r: &FetchResult) -> Result<()> {
    sqlx::query(
        "UPDATE feeds SET
            last_fetched_at = $2,
            next_fetch_at   = $3,
            fetch_error     = NULLIF($4, ''),
            error_count     = $5,
            etag            = COALESCE(NULLIF($6, ''), etag),
            last_modified   = COALESCE(NULLIF($7, ''), last_modified),
            title       = CASE WHEN $8::text IS NOT NULL AND $8 <> '' AND (title IS NULL OR title = '' OR title = url)
                               THEN $8 ELSE title END,
            description = COALESCE($9, description),
            site_url    = COALESCE($10, site_url),
            image_url   = COALESCE($11, image_url)
         WHERE id = $1",
    )
    .bind(id)
    .bind(r.fetched_at)
    .bind(r.next_fetch_at)
    .bind(&r.error)
    .bind(r.error_count)
    .bind(&r.etag)
    .bind(&r.last_modified)
    .bind(&r.title)
    .bind(&r.description)
    .bind(&r.site_url)
    .bind(&r.image_url)
    .execute(pool)
    .await?;
    Ok(())
}

// ------------------------------------------------------------- articles ---

/// Light-weight columns for article lists: no full HTML, only an excerpt.
const LIST_COLUMNS: &str = "a.id, a.feed_id, a.title, COALESCE(a.url, '') AS url,
    COALESCE(a.excerpt, '') AS excerpt, COALESCE(a.ai_summary, '') AS ai_summary,
    COALESCE(a.author, '') AS author, COALESCE(a.image_url, '') AS image_url,
    a.published_at, a.sort_at, a.is_read, a.is_favorite, a.read_at, a.created_at,
    COALESCE(a.word_count, 0) AS word_count, COALESCE(f.title, '') AS feed_title";

fn with_reading_time(mut a: Article) -> Article {
    a.reading_time = text::reading_minutes(a.word_count);
    a
}

/// Which of the given GUIDs are already stored for a feed.
pub async fn existing_guids(pool: &PgPool, feed_id: Uuid, guids: &[String]) -> Result<Vec<String>> {
    if guids.is_empty() {
        return Ok(Vec::new());
    }
    sqlx::query_scalar("SELECT guid FROM articles WHERE feed_id = $1 AND guid = ANY($2)")
        .bind(feed_id)
        .bind(guids)
        .fetch_all(pool)
        .await
}

/// Inserts articles in one statement, ignoring GUIDs already present, and
/// returns how many rows were actually inserted.
pub async fn insert_articles(pool: &PgPool, feed_id: Uuid, items: &[NewArticle]) -> Result<u64> {
    if items.is_empty() {
        return Ok(0);
    }
    let mut ids = Vec::with_capacity(items.len());
    let mut guids = Vec::with_capacity(items.len());
    let mut titles = Vec::with_capacity(items.len());
    let mut urls = Vec::with_capacity(items.len());
    let mut contents = Vec::with_capacity(items.len());
    let mut summaries = Vec::with_capacity(items.len());
    let mut excerpts = Vec::with_capacity(items.len());
    let mut words = Vec::with_capacity(items.len());
    let mut authors = Vec::with_capacity(items.len());
    let mut images = Vec::with_capacity(items.len());
    let mut published = Vec::with_capacity(items.len());
    let mut created = Vec::with_capacity(items.len());
    for a in items {
        ids.push(a.id);
        guids.push(a.guid.clone());
        titles.push(a.title.clone());
        urls.push(a.url.clone());
        contents.push(a.content.clone());
        summaries.push(a.summary.clone());
        excerpts.push(a.excerpt.clone());
        words.push(a.word_count);
        authors.push(a.author.clone());
        images.push(a.image_url.clone());
        published.push(a.published_at);
        created.push(a.created_at);
    }
    let res = sqlx::query(
        "INSERT INTO articles (id, feed_id, guid, title, url, content, summary, excerpt, word_count,
                               author, image_url, published_at, created_at)
         SELECT t.id, $1, t.guid, t.title, t.url, t.content, t.summary, t.excerpt, t.word_count,
                t.author, t.image_url, t.published_at, t.created_at
         FROM UNNEST($2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
                     $8::text[], $9::int4[], $10::text[], $11::text[], $12::timestamptz[], $13::timestamptz[])
              AS t(id, guid, title, url, content, summary, excerpt, word_count, author, image_url,
                   published_at, created_at)
         ON CONFLICT (feed_id, guid) DO NOTHING",
    )
    .bind(feed_id)
    .bind(ids)
    .bind(guids)
    .bind(titles)
    .bind(urls)
    .bind(contents)
    .bind(summaries)
    .bind(excerpts)
    .bind(words)
    .bind(authors)
    .bind(images)
    .bind(published)
    .bind(created)
    .execute(pool)
    .await?;
    Ok(res.rows_affected())
}

/// A full article (including content) owned by the user.
pub async fn article_for_user(pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<Option<Article>> {
    let q = format!(
        "SELECT {LIST_COLUMNS}, COALESCE(a.content, '') AS content, COALESCE(a.summary, '') AS summary
         FROM articles a JOIN feeds f ON f.id = a.feed_id
         WHERE a.id = $1 AND f.user_id = $2"
    );
    let article = sqlx::query_as::<_, Article>(&q)
        .bind(id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
    Ok(article.map(|mut a| {
        if a.word_count == 0 {
            let src = if a.content.is_empty() {
                &a.summary
            } else {
                &a.content
            };
            a.word_count = text::word_count(&text::plain_text(src));
        }
        with_reading_time(a)
    }))
}

/// A page of the user's articles, newest first (keyset on (sort_at, id)).
pub async fn list_articles(pool: &PgPool, f: &ArticleFilter) -> Result<Vec<Article>> {
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(format!(
        "SELECT {LIST_COLUMNS} FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE f.user_id = "
    ));
    qb.push_bind(f.user_id);
    if let Some(feed_id) = f.feed_id {
        qb.push(" AND a.feed_id = ").push_bind(feed_id);
    }
    if f.unread_only {
        qb.push(" AND NOT a.is_read");
    }
    if f.favorites_only {
        qb.push(" AND a.is_favorite");
    }
    if let Some(c) = f.cursor {
        qb.push(" AND (a.sort_at, a.id) < (")
            .push_bind(c.sort_at)
            .push(", ")
            .push_bind(c.id)
            .push(")");
    }
    qb.push(" ORDER BY a.sort_at DESC, a.id DESC LIMIT ")
        .push_bind(f.limit);
    Ok(qb
        .build_query_as::<Article>()
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(with_reading_time)
        .collect())
}

/// Full-text search on the user's articles.
pub async fn search_articles(
    pool: &PgPool,
    user_id: Uuid,
    query: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<Article>> {
    let q = format!(
        "SELECT {LIST_COLUMNS}
         FROM articles a
         JOIN feeds f ON f.id = a.feed_id
         CROSS JOIN websearch_to_tsquery('french', $2) q
         WHERE f.user_id = $1 AND a.tsv @@ q
         ORDER BY ts_rank_cd(a.tsv, q) DESC, a.sort_at DESC
         LIMIT $3 OFFSET $4"
    );
    Ok(sqlx::query_as::<_, Article>(&q)
        .bind(user_id)
        .bind(query)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(with_reading_time)
        .collect())
}

/// Marks an owned article read/unread; false when not found.
pub async fn set_read(pool: &PgPool, id: Uuid, user_id: Uuid, read: bool) -> Result<bool> {
    Ok(sqlx::query(
        "UPDATE articles a
         SET is_read = $3, read_at = CASE WHEN $3 THEN NOW() ELSE NULL END
         FROM feeds f
         WHERE a.id = $1 AND f.id = a.feed_id AND f.user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .bind(read)
    .execute(pool)
    .await?
    .rows_affected()
        > 0)
}

/// Flips the favorite flag atomically; None when not found.
pub async fn toggle_favorite(pool: &PgPool, id: Uuid, user_id: Uuid) -> Result<Option<bool>> {
    sqlx::query_scalar(
        "UPDATE articles a SET is_favorite = NOT a.is_favorite
         FROM feeds f
         WHERE a.id = $1 AND f.id = a.feed_id AND f.user_id = $2
         RETURNING a.is_favorite",
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

pub async fn mark_feed_read(pool: &PgPool, feed_id: Uuid, user_id: Uuid) -> Result<u64> {
    Ok(sqlx::query(
        "UPDATE articles a SET is_read = true, read_at = NOW()
         FROM feeds f
         WHERE a.feed_id = $1 AND f.id = a.feed_id AND f.user_id = $2 AND NOT a.is_read",
    )
    .bind(feed_id)
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected())
}

pub async fn mark_all_read(pool: &PgPool, user_id: Uuid) -> Result<u64> {
    Ok(sqlx::query(
        "UPDATE articles SET is_read = true, read_at = NOW()
         WHERE feed_id IN (SELECT id FROM feeds WHERE user_id = $1) AND NOT is_read",
    )
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected())
}

pub async fn set_ai_summary(pool: &PgPool, id: Uuid, summary: &str) -> Result<()> {
    sqlx::query("UPDATE articles SET ai_summary = $2 WHERE id = $1")
        .bind(id)
        .bind(summary)
        .execute(pool)
        .await?;
    Ok(())
}

/// Removes non-favorite articles ingested before `threshold`.
pub async fn delete_old_articles(pool: &PgPool, threshold: DateTime<Utc>) -> Result<u64> {
    Ok(
        sqlx::query("DELETE FROM articles WHERE created_at < $1 AND NOT is_favorite")
            .bind(threshold)
            .execute(pool)
            .await?
            .rows_affected(),
    )
}

/// Pulls back publication dates that lie in the future (bad feed clocks):
/// they would otherwise pin an article at the top of every list.
pub async fn clamp_future_dates(pool: &PgPool) -> Result<u64> {
    Ok(sqlx::query(
        "UPDATE articles SET published_at = LEAST(created_at, NOW())
         WHERE published_at > NOW() + INTERVAL '5 minutes'",
    )
    .execute(pool)
    .await?
    .rows_affected())
}

#[derive(sqlx::FromRow)]
pub struct BackfillRow {
    pub id: Uuid,
    pub content: String,
    pub summary: String,
}

/// Legacy articles whose derived columns are still missing.
pub async fn pending_backfill(pool: &PgPool, limit: i64) -> Result<Vec<BackfillRow>> {
    sqlx::query_as(
        "SELECT id, COALESCE(content, '') AS content, COALESCE(summary, '') AS summary
         FROM articles WHERE word_count IS NULL LIMIT $1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
}

pub async fn update_derived(
    pool: &PgPool,
    id: Uuid,
    content: &str,
    summary: &str,
    excerpt: &str,
    words: i32,
) -> Result<()> {
    sqlx::query("UPDATE articles SET content = $2, summary = $3, excerpt = $4, word_count = $5 WHERE id = $1")
        .bind(id)
        .bind(non_empty(content))
        .bind(non_empty(summary))
        .bind(excerpt)
        .bind(words)
        .execute(pool)
        .await?;
    Ok(())
}

pub fn non_empty(s: &str) -> Option<&str> {
    (!s.is_empty()).then_some(s)
}

/// Runs against a real database when TEST_DATABASE_URL is set (skipped otherwise).
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn ingest_list_and_ownership() {
        let Ok(url) = std::env::var("TEST_DATABASE_URL") else {
            return;
        };
        let pool = crate::db::connect(&url).await.unwrap();
        crate::db::migrate(&pool, std::path::Path::new("migrations"))
            .await
            .unwrap();

        let now = Utc::now();
        let user = Uuid::new_v4();
        create_user(&pool, user, &format!("{user}@test.example"), "x", now)
            .await
            .unwrap();
        let feed = create_feed(
            &pool,
            Uuid::new_v4(),
            user,
            &format!("https://{user}.example/feed"),
            "T",
            None,
        )
        .await
        .unwrap();
        let item = |guid: &str, minutes: i64| NewArticle {
            id: Uuid::new_v4(),
            guid: guid.into(),
            title: format!("Titre {guid}"),
            url: Some("https://example.org/a".into()),
            content: Some("<p>Bonjour le monde</p>".into()),
            summary: None,
            excerpt: "Bonjour".into(),
            word_count: 3,
            author: None,
            image_url: None,
            published_at: Some(now - chrono::Duration::minutes(minutes)),
            created_at: now,
        };
        let items = vec![item("a", 3), item("b", 2), item("c", 1)];
        assert_eq!(insert_articles(&pool, feed.id, &items).await.unwrap(), 3);
        // Re-ingesting the same GUIDs is a no-op.
        assert_eq!(
            insert_articles(&pool, feed.id, &items[..2]).await.unwrap(),
            0
        );
        let known = existing_guids(&pool, feed.id, &["a".into(), "zz".into()])
            .await
            .unwrap();
        assert_eq!(known, vec!["a".to_string()]);

        let mut f = ArticleFilter {
            user_id: user,
            limit: 2,
            ..Default::default()
        };
        let page1 = list_articles(&pool, &f).await.unwrap();
        assert_eq!(
            page1.iter().map(|a| a.title.as_str()).collect::<Vec<_>>(),
            ["Titre c", "Titre b"]
        );
        let last = page1.last().unwrap();
        f.cursor = Some(crate::models::ArticleCursor {
            sort_at: last.sort_at,
            id: last.id,
        });
        let page2 = list_articles(&pool, &f).await.unwrap();
        assert_eq!(page2.len(), 1);
        assert_eq!(page2[0].title, "Titre a");

        let other = Uuid::new_v4();
        assert!(article_for_user(&pool, page2[0].id, other)
            .await
            .unwrap()
            .is_none());
        assert!(!set_read(&pool, page2[0].id, other, true).await.unwrap());
        assert!(set_read(&pool, page2[0].id, user, true).await.unwrap());
        assert_eq!(
            toggle_favorite(&pool, page2[0].id, user).await.unwrap(),
            Some(true)
        );
        assert_eq!(
            feeds_for_user(&pool, user).await.unwrap()[0].unread_count,
            2
        );
        assert_eq!(
            search_articles(&pool, user, "bonjour", 10, 0)
                .await
                .unwrap()
                .len(),
            3
        );

        delete_user(&pool, user).await.unwrap();
    }
}
