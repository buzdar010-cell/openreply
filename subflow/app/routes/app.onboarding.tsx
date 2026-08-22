import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { getShopify } from "../shopify.server";
import {
  getOnboardingStatus,
  markOnboardingStepDone,
  type OnboardingStep,
} from "../shop-settings.server";
import { checkThemeCompatibility } from "../theme-compatibility.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { admin, session } = await shopify.authenticate.admin(request);
  const db = context.cloudflare.env.DB;

  const status = await getOnboardingStatus(db, session.shop);
  if (status.complete) {
    throw redirect("/app");
  }

  const themeCompatibility = await checkThemeCompatibility(admin);

  let productHandle: string | null = null;
  if (themeCompatibility.status === "compatible") {
    const productsResponse = await admin.graphql(
      `#graphql
        query GetOnboardingProducts {
          products(first: 20, sortKey: TITLE) {
            edges { node { title handle } }
          }
        }`,
    );
    const productsJson: any = await productsResponse.json();
    const products: Array<{ title: string; handle: string }> =
      productsJson.data?.products?.edges?.map((e: any) => e.node) ?? [];

    const groupsResponse = await admin.graphql(
      `#graphql
        query GetOnboardingSellingPlanGroups {
          sellingPlanGroups(first: 20) {
            edges {
              node {
                products(first: 10) {
                  edges { node { title } }
                }
              }
            }
          }
        }`,
    );
    const groupsJson: any = await groupsResponse.json();
    const productTitlesWithPlans = new Set<string>(
      (groupsJson.data?.sellingPlanGroups?.edges ?? []).flatMap((e: any) =>
        e.node.products.edges.map((pe: any) => pe.node.title),
      ),
    );

    productHandle =
      products.find((p) => productTitlesWithPlans.has(p.title))?.handle ??
      products[0]?.handle ??
      null;
  }

  return {
    status,
    themeStatus: themeCompatibility.status,
    sectionId: themeCompatibility.status === "compatible" ? themeCompatibility.sectionId : null,
    productHandle,
    shop: session.shop,
    apiKey: context.cloudflare.env.SHOPIFY_API_KEY,
  };
};

const STEP_INTENTS: Record<string, OnboardingStep> = {
  mark_widget_done: "widget",
  mark_portal_editor_done: "portalEditor",
  mark_portal_menu_done: "portalMenu",
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { session } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("_action"));

  const step = STEP_INTENTS[intent];
  if (!step) {
    return { status: await getOnboardingStatus(context.cloudflare.env.DB, session.shop) };
  }

  const status = await markOnboardingStepDone(context.cloudflare.env.DB, session.shop, step);
  return { status };
};

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const status = fetcher.data?.status ?? data.status;
  const isSubmitting = fetcher.state === "submitting";
  const submittingIntent = fetcher.formData?.get("_action");

  function markDone(intent: string) {
    fetcher.submit({ _action: intent }, { method: "POST" });
  }

  if (data.themeStatus === "incompatible") {
    return (
      <s-page heading="Set up Subflow">
        <s-banner tone="critical" heading="Your theme doesn't support subscription widgets">
          <s-paragraph>
            Your current theme is an older ("vintage") theme that doesn't
            support the block system Subflow needs to show the Subscribe
            &amp; Save option on your product pages. This isn't something we
            — or any app — can work around; it's a limitation of the theme
            itself.
          </s-paragraph>
          <s-paragraph>
            The fix: switch to any free Online Store 2.0 theme (Dawn,
            Horizon, Refresh, and others all work), then reload this page.
          </s-paragraph>
        </s-banner>
        <s-button variant="primary" href={`https://${data.shop}/admin/themes`} target="_blank">
          Browse themes
        </s-button>
      </s-page>
    );
  }

  if (data.themeStatus === "unknown") {
    return (
      <s-page heading="Set up Subflow">
        <s-banner tone="warning" heading="Couldn't check your theme">
          <s-paragraph>
            We couldn't verify your theme's compatibility just now — this is
            usually temporary. Reload this page to try again.
          </s-paragraph>
        </s-banner>
      </s-page>
    );
  }

  const widgetLink = data.productHandle
    ? `https://${data.shop}/admin/themes/current/editor?previewPath=${encodeURIComponent(`/products/${data.productHandle}`)}${
        data.sectionId
          ? `&addAppBlockId=${data.apiKey}/subscribe_and_save&target=sectionId:${data.sectionId}`
          : ""
      }`
    : `https://${data.shop}/admin/themes/current/editor`;

  const checkoutEditorLink = `https://${data.shop}/admin/settings/checkout`;
  const menuLink = `https://${data.shop}/admin/menus`;

  return (
    <s-page heading="Set up Subflow">
      <s-paragraph>
        Three one-time steps before your dashboard unlocks — these make sure
        customers actually see and can manage subscriptions once you start
        selling.
      </s-paragraph>

      <s-section heading={`${status.widgetDone ? "✓" : "1."} Add the subscribe widget to your theme`}>
        <s-paragraph>
          Tap the button below to open your theme editor on one of your
          products, then: <b>Add block → Apps → Subflow: Subscribe &amp; Save → Save</b>.
        </s-paragraph>
        <s-stack direction="inline" gap="small">
          <s-button variant="primary" href={widgetLink} target="_blank">
            Open theme editor
          </s-button>
          <s-button
            variant="secondary"
            onClick={() => markDone("mark_widget_done")}
            {...(isSubmitting && submittingIntent === "mark_widget_done" ? { loading: true } : {})}
          >
            {status.widgetDone ? "Done ✓" : "I've done this"}
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading={`${status.portalEditorDone ? "✓" : "2."} Register the customer subscriptions page`}>
        <s-paragraph>
          Tap the button below, then: <b>Customize → Apps tab → Subflow → customer-portal → tap +</b>.
          A prompt to add it to the account menu will appear — accept it.
        </s-paragraph>
        <s-stack direction="inline" gap="small">
          <s-button variant="primary" href={checkoutEditorLink} target="_blank">
            Open checkout &amp; accounts settings
          </s-button>
          <s-button
            variant="secondary"
            onClick={() => markDone("mark_portal_editor_done")}
            {...(isSubmitting && submittingIntent === "mark_portal_editor_done" ? { loading: true } : {})}
          >
            {status.portalEditorDone ? "Done ✓" : "I've done this"}
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading={`${status.portalMenuDone ? "✓" : "3."} Add the Subscriptions link to the customer account menu`}>
        <s-paragraph>
          This step is separate from step 2 and both are required — without
          this, customers have no way to find the page. Tap the button
          below, then: <b>Add menu item → label it "Subscriptions" → link type Apps → pick Subflow → Save</b>.
        </s-paragraph>
        <s-stack direction="inline" gap="small">
          <s-button variant="primary" href={menuLink} target="_blank">
            Open menus
          </s-button>
          <s-button
            variant="secondary"
            onClick={() => markDone("mark_portal_menu_done")}
            {...(isSubmitting && submittingIntent === "mark_portal_menu_done" ? { loading: true } : {})}
          >
            {status.portalMenuDone ? "Done ✓" : "I've done this"}
          </s-button>
        </s-stack>
      </s-section>

      {status.complete && (
        <s-banner tone="success" heading="All set!">
          <s-paragraph>Your dashboard is unlocked.</s-paragraph>
          <s-button variant="primary" href="/app">
            Go to dashboard
          </s-button>
        </s-banner>
      )}
    </s-page>
  );
}
