import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect, useFetcher, useLoaderData } from "react-router";
import { useEffect, useState } from "react";
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
    const url = new URL(request.url);
    throw redirect(`/app${url.search}`);
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

  const steps = [
    {
      key: "widget",
      done: status.widgetDone,
      title: "Add the subscribe widget to your theme",
      youtubeId: null as string | null,
      actionLabel: "Open theme editor",
      actionHref: widgetLink,
      intent: "mark_widget_done",
      instructions: [
        'Tap "Open theme editor" below — it opens your theme editor on one of your products.',
        'Scroll down the page until you see "Add block" (usually near the price and "Add to cart" button).',
        'Tap "Add block".',
        'A panel opens with two tabs: "Blocks" and "Apps". Tap "Apps".',
        'Find "Subflow: Subscribe & Save" in the list and tap it — it gets added automatically.',
        'Tap "Save" in the top-right corner.',
      ],
    },
    {
      key: "portalEditor",
      done: status.portalEditorDone,
      title: "Register the customer subscriptions page",
      youtubeId: null as string | null,
      actionLabel: "Open checkout & accounts settings",
      actionHref: checkoutEditorLink,
      intent: "mark_portal_editor_done",
      instructions: [
        'Tap "Open checkout & accounts settings" below.',
        'Find the "Configurations" card near the top and tap "Edit" on it — this opens the checkout & accounts editor.',
        'Look for an "Apps" tab or button in that editor.',
        'Find "Subflow" → "customer-portal" in the list and tap the "+" next to it.',
        "A pop-up will ask to add it to the account menu — accept it.",
      ],
    },
    {
      key: "portalMenu",
      done: status.portalMenuDone,
      title: "Add the Subscriptions link to the customer account menu",
      youtubeId: null as string | null,
      actionLabel: "Open menus",
      actionHref: menuLink,
      intent: "mark_portal_menu_done",
      instructions: [
        'Tap "Open menus" below.',
        'Find "Customer account main menu" in the list and tap it.',
        'Tap "Add menu item".',
        'Type "Subscriptions" as the label.',
        'For the link type, choose "Apps".',
        'Select "Subflow", then the customer-portal page.',
        'Tap "Save" (and save the menu again if prompted).',
        "This step is required separately from step 2 — without it, customers have no way to find the page.",
      ],
    },
  ];

  return (
    <OnboardingWizard
      steps={steps}
      complete={status.complete}
      isSubmitting={isSubmitting}
      onConfirmStep={(intent) => fetcher.submit({ _action: intent }, { method: "POST" })}
    />
  );
}

interface WizardStep {
  key: string;
  done: boolean;
  title: string;
  youtubeId: string | null;
  actionLabel: string;
  actionHref: string;
  intent: string;
  instructions: string[];
}

function OnboardingWizard({
  steps,
  complete,
  isSubmitting,
  onConfirmStep,
}: {
  steps: WizardStep[];
  complete: boolean;
  isSubmitting: boolean;
  onConfirmStep: (intent: string) => void;
}) {
  const firstIncomplete = steps.findIndex((s) => !s.done);
  const [currentIndex, setCurrentIndex] = useState(
    firstIncomplete === -1 ? steps.length - 1 : firstIncomplete,
  );
  const currentStep = steps[currentIndex];
  const [checked, setChecked] = useState(currentStep.done);

  useEffect(() => {
    setChecked(steps[currentIndex]?.done ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const isLastStep = currentIndex === steps.length - 1;

  function handleNext() {
    if (!currentStep.done && checked) {
      onConfirmStep(currentStep.intent);
    }
    if (!isLastStep) {
      setCurrentIndex((i) => i + 1);
    }
  }

  if (complete) {
    return (
      <s-page heading="Set up Subflow">
        <s-banner tone="success" heading="All set!">
          <s-paragraph>
            All three steps are confirmed. Your dashboard is unlocked.
          </s-paragraph>
          <s-button variant="primary" href="/app">
            Go to dashboard
          </s-button>
        </s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading="Set up Subflow">
      <s-paragraph tone="neutral">
        Step {currentIndex + 1} of {steps.length}
      </s-paragraph>

      <s-section heading={currentStep.title}>
        <s-box
          background="subdued"
          borderRadius="base"
          blockSize="360px"
          overflow="hidden"
        >
          {currentStep.youtubeId ? (
            <iframe
              width="100%"
              height="360"
              src={`https://www.youtube.com/embed/${currentStep.youtubeId}`}
              title={currentStep.title}
              style={{ border: 0, display: "block" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <s-stack
              direction="block"
              gap="small"
              blockSize="360px"
              justifyContent="center"
              alignItems="center"
            >
              <s-text tone="neutral">Video walkthrough coming soon</s-text>
            </s-stack>
          )}
        </s-box>

        <s-ordered-list>
          {currentStep.instructions.map((line, i) => (
            <s-list-item key={i}>{line}</s-list-item>
          ))}
        </s-ordered-list>

        <s-button variant="primary" href={currentStep.actionHref} target="_blank">
          {currentStep.actionLabel}
        </s-button>

        <s-checkbox
          checked={checked}
          label="I've completed this step"
          onChange={(e: any) => setChecked(e.currentTarget.checked)}
        />

        <s-stack direction="inline" gap="small">
          {currentIndex > 0 && (
            <s-button variant="secondary" onClick={() => setCurrentIndex((i) => i - 1)}>
              Back
            </s-button>
          )}
          <s-button
            variant="primary"
            disabled={!checked}
            onClick={handleNext}
            {...(isSubmitting ? { loading: true } : {})}
          >
            {isLastStep ? "Finish" : "Next"}
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}
