import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";

export const SESSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  shop TEXT NOT NULL,
  content TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_shop_idx ON sessions (shop);
`;

export class D1SessionStorage implements SessionStorage {
  constructor(private db: D1Database) {}

  async storeSession(session: Session): Promise<boolean> {
    const content = JSON.stringify(session.toPropertyArray());
    await this.db
      .prepare(
        `INSERT INTO sessions (id, shop, content) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET shop = ?2, content = ?3`,
      )
      .bind(session.id, session.shop, content)
      .run();
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const row = await this.db
      .prepare(`SELECT content FROM sessions WHERE id = ?1`)
      .bind(id)
      .first<{ content: string }>();
    if (!row) return undefined;
    return Session.fromPropertyArray(JSON.parse(row.content));
  }

  async deleteSession(id: string): Promise<boolean> {
    await this.db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(id).run();
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
    await this.db
      .prepare(`DELETE FROM sessions WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const { results } = await this.db
      .prepare(`SELECT content FROM sessions WHERE shop = ?1`)
      .bind(shop)
      .all<{ content: string }>();
    return results.map((row) => Session.fromPropertyArray(JSON.parse(row.content)));
  }
}
