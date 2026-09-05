import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  HeadersFunction,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { getShopify, GROWTH_PLAN, SCALE_PLAN, PLAN_TIERS } from "../shopify.server";
import { getBillingStatus } from "../billing.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { billing, admin } = await shopify.authenticate.admin(request);
  const status = await getBillingStatus(admin, billing);
  return { ...status, tiers: PLAN_TIERS };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { billing } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan"));
  if (plan !== GROWTH_PLAN && plan !== SCALE_PLAN) {
    return { userErrors: [{ field: ["plan"], message: "Invalid plan." }] };
  }

  const requestUrl = new URL(request.url);
  const returnUrl = new URL(`${context.cloudflare.env.SHOPIFY_APP_URL}/app/billing`);
  const shop = requestUrl.searchParams.get("shop");
  const host = requestUrl.searchParams.get("host");
  if (shop) returnUrl.searchParams.set("shop", shop);
  if (host) returnUrl.searchParams.set("host", host);

  await billing.request({
    plan,
    isTest: true, // TODO: flip to false before public launch — dev/test stores reject real charges
    returnUrl: returnUrl.toString(),
  });
  return null;
};

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const isSubmitting = fetcher.state === "submitting";

  return (
    <s-page heading="Billing">
      {data.needsUpgrade && (
        <s-banner
          tone="warning"
          heading={
            data.nextTier?.billingPlanName
              ? `You've outgrown the ${data.currentTier.label} plan`
              : "You've outgrown the Scale plan"
          }
        >
          <s-paragraph>
            {data.totalActiveSubscribers} active subscribers, above your{" "}
            {data.currentTier.label} plan's {data.currentTier.maxSubscribers}
            -subscriber limit. Creating new plans is paused until you
            upgrade — your existing subscribers keep working as normal.
          </s-paragraph>
          {data.nextTier?.billingPlanName ? (
            <s-button
              variant="primary"
              tone="critical"
              onClick={() =>
                fetcher.submit(
                  { plan: data.nextTier!.billingPlanName! },
                  { method: "POST" },
                )
              }
              {...(isSubmitting ? { loading: true } : {})}
            >
              Upgrade to {data.nextTier.label} — ${data.nextTier.price}/month
            </s-button>
          ) : (
            <s-text>
              Contact us to discuss an Enterprise plan for stores over 1,000
              subscribers.
            </s-text>
          )}
        </s-banner>
      )}

      <s-section heading="Current plan">
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
          <s-box background="subdued" padding="base" borderRadius="base">
            <s-stack direction="block" gap="small-100">
              <s-text color="subdued">Plan</s-text>
              <s-heading>
                {data.currentTier.label}
                {data.currentTier.price ? ` — $${data.currentTier.price}/mo` : ""}
              </s-heading>
            </s-stack>
          </s-box>
          <s-box background="subdued" padding="base" borderRadius="base">
            <s-stack direction="block" gap="small-100">
              <s-text color="subdued">Subscribers</s-text>
              <s-heading>
                {data.totalActiveSubscribers} / {data.currentTier.maxSubscribers}
              </s-heading>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Plans & pricing">
        <s-stack direction="block" gap="base">
          {data.tiers.map((tier) => {
            const isCurrent = tier.key === data.currentTier.key;
            const isUpgrade =
              tier.billingPlanName !== null &&
              tier.maxSubscribers > data.currentTier.maxSubscribers;
            return (
              <s-box
                key={tier.key}
                background={isCurrent ? "strong" : "subdued"}
                padding="large"
                borderRadius="large"
                borderWidth={isCurrent ? "large" : "small"}
                borderColor={isCurrent ? "strong" : "subdued"}
              >
                <s-stack direction="block" gap="small">
                  <s-stack
                    direction="inline"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      {isCurrent && (
                        <s-icon type="check-circle-filled" tone="success" />
                      )}
                      <s-heading>{tier.label}</s-heading>
                    </s-stack>
                    <s-text type="strong">
                      {tier.key === "enterprise"
                        ? "Contact us"
                        : `$${tier.price ?? 0}/mo`}
                    </s-text>
                  </s-stack>
                  <s-text color="subdued">
                    {tier.maxSubscribers === Infinity
                      ? "1,000+"
                      : `Up to ${tier.maxSubscribers}`}{" "}
                    subscribers
                  </s-text>
                  {isCurrent && <s-badge tone="success">Your current plan</s-badge>}
                  {isUpgrade && (
                    <s-button
                      variant="primary"
                      inlineSize="fill"
                      onClick={() =>
                        fetcher.submit(
                          { plan: tier.billingPlanName! },
                          { method: "POST" },
                        )
                      }
                      {...(isSubmitting ? { loading: true } : {})}
                    >
                      Upgrade to {tier.label}
                    </s-button>
                  )}
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>
      </s-section>

      <s-section heading="Cancel your plan">
        <s-paragraph>
          You can cancel or change your Subflow plan any time from your
          Shopify billing settings — go to Settings → Billing in your
          Shopify admin.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
