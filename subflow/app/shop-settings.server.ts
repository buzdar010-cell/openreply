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

export interface OnboardingStatus {
  widgetDone: boolean;
  portalEditorDone: boolean;
  portalMenuDone: boolean;
  complete: boolean;
}

export async function getOnboardingStatus(db: D1Database, shop: string): Promise<OnboardingStatus> {
  const row = await db
    .prepare(
      `SELECT onboarding_widget_done, onboarding_portal_editor_done, onboarding_portal_menu_done, onboarding_complete
       FROM shop_settings WHERE shop = ?1`,
    )
    .bind(shop)
    .first<{
      onboarding_widget_done: number;
      onboarding_portal_editor_done: number;
      onboarding_portal_menu_done: number;
      onboarding_complete: number;
    }>();
  return {
    widgetDone: row?.onboarding_widget_done === 1,
    portalEditorDone: row?.onboarding_portal_editor_done === 1,
    portalMenuDone: row?.onboarding_portal_menu_done === 1,
    complete: row?.onboarding_complete === 1,
  };
}

const ONBOARDING_STEP_COLUMNS = {
  widget: "onboarding_widget_done",
  portalEditor: "onboarding_portal_editor_done",
  portalMenu: "onboarding_portal_menu_done",
} as const;

export type OnboardingStep = keyof typeof ONBOARDING_STEP_COLUMNS;

export async function markOnboardingStepDone(
  db: D1Database,
  shop: string,
  step: OnboardingStep,
): Promise<OnboardingStatus> {
  const column = ONBOARDING_STEP_COLUMNS[step];
  await db
    .prepare(
      `INSERT INTO shop_settings (shop, ${column}) VALUES (?1, 1)
       ON CONFLICT(shop) DO UPDATE SET ${column} = 1`,
    )
    .bind(shop)
    .run();

  const status = await getOnboardingStatus(db, shop);
  if (status.widgetDone && status.portalEditorDone && status.portalMenuDone && !status.complete) {
    await db
      .prepare(`UPDATE shop_settings SET onboarding_complete = 1 WHERE shop = ?1`)
      .bind(shop)
      .run();
    status.complete = true;
  }
  return status;
}
