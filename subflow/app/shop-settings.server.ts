export async function isNavSetupDismissed(db: D1Database, shop: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT nav_setup_dismissed FROM shop_settings WHERE shop = ?1`)
    .bind(shop)
    .first<{ nav_setup_dismissed: number }>();
  return row?.nav_setup_dismissed === 1;
}

export async function dismissNavSetup(db: D1Database, shop: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO shop_settings (shop, nav_setup_dismissed) VALUES (?1, 1)
       ON CONFLICT(shop) DO UPDATE SET nav_setup_dismissed = 1`,
    )
    .bind(shop)
    .run();
}

export async function isWidgetSetupDismissed(db: D1Database, shop: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT widget_setup_dismissed FROM shop_settings WHERE shop = ?1`)
    .bind(shop)
    .first<{ widget_setup_dismissed: number }>();
  return row?.widget_setup_dismissed === 1;
}

export async function dismissWidgetSetup(db: D1Database, shop: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO shop_settings (shop, widget_setup_dismissed) VALUES (?1, 1)
       ON CONFLICT(shop) DO UPDATE SET widget_setup_dismissed = 1`,
    )
    .bind(shop)
    .run();
}
