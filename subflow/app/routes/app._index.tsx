import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";
import { getShopify } from "../shopify.server";
import { getBillingStatus } from "../billing.server";
import {
  isNavSetupDismissed,
  dismissNavSetup,
  isWidgetSetupDismissed,
  dismissWidgetSetup,
} from "../shop-settings.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

interface ProductOption {
  id: string;
  title: string;
  handle: string;
}

interface SellingPlanGroupSummary {
  id: string;
  name: string;
  createdAt: string;
  discountPercent: number | null;
  intervalDays: number | null;
  productsCount: number;
  productTitles: string[];
  activeSubscribers: number;
  cancelledSubscribers: number;
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { billing, admin, session } = await shopify.authenticate.admin(request);
  const showNavSetupBanner = !(await isNavSetupDismissed(
    context.cloudflare.env.DB,
    session.shop,
  ));
  const showWidgetSetupBanner = !(await isWidgetSetupDismissed(
    context.cloudflare.env.DB,
    session.shop,
  ));

  const { totalActiveSubscribers, currentTier, needsUpgrade, nextTier } =
    await getBillingStatus(admin, billing);

  const productsResponse = await admin.graphql(
    `#graphql
      query GetProducts {
        products(first: 20, sortKey: TITLE) {
          edges {
            node { id title handle }
          }
        }
      }`,
  );
  const productsJson = await productsResponse.json();
  const products: ProductOption[] =
    productsJson.data?.products.edges.map((e: any) => e.node) ?? [];

  const groupsResponse = await admin.graphql(
    `#graphql
      query GetSellingPlanGroups {
        sellingPlanGroups(first: 20) {
          edges {
            node {
              id
              name
              createdAt
              productsCount { count }
              products(first: 10) {
                edges { node { title } }
              }
              sellingPlans(first: 10) {
                edges {
                  node {
                    id
                    billingPolicy {
                      ... on SellingPlanRecurringBillingPolicy {
                        intervalCount
                      }
                    }
                    pricingPolicies {
                      ... on SellingPlanFixedPricingPolicy {
                        adjustmentValue {
                          ... on SellingPlanPricingPolicyPercentageValue {
                            percentage
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
  );
  const groupsJson = await groupsResponse.json();
  const groups: Array<{
    id: string;
    name: string;
    createdAt: string;
    productsCount: number;
    productTitles: string[];
    planIds: string[];
    discountPercent: number | null;
    intervalDays: number | null;
  }> =
    groupsJson.data?.sellingPlanGroups.edges.map((e: any) => {
      const firstPlan = e.node.sellingPlans.edges[0]?.node;
      return {
        id: e.node.id,
        name: e.node.name,
        createdAt: e.node.createdAt,
        productsCount: e.node.productsCount?.count ?? 0,
        productTitles: e.node.products.edges.map((pe: any) => pe.node.title),
        planIds: e.node.sellingPlans.edges.map((se: any) => se.node.id),
        discountPercent:
          firstPlan?.pricingPolicies?.[0]?.adjustmentValue?.percentage ?? null,
        intervalDays: firstPlan?.billingPolicy?.intervalCount ?? null,
      };
    }) ?? [];

  // read_own_subscription_contracts is a protected scope pending Shopify's
  // approval — until then this query is denied, so fail soft to zero counts
  // instead of taking down the whole dashboard.
  const activeCountByPlanId = new Map<string, number>();
  const cancelledCountByPlanId = new Map<string, number>();
  try {
    const contractsResponse = await admin.graphql(
      `#graphql
        query GetSubscriptionContractCounts {
          active: subscriptionContracts(first: 250, query: "status:active") {
            edges {
              node {
                lines(first: 5) {
                  edges { node { sellingPlanId } }
                }
              }
            }
          }
          cancelled: subscriptionContracts(first: 250, query: "status:cancelled") {
            edges {
              node {
                lines(first: 5) {
                  edges { node { sellingPlanId } }
                }
              }
            }
          }
        }`,
    );
    const contractsJson = await contractsResponse.json();
    const tally = (edges: any[], map: Map<string, number>) => {
      for (const edge of edges ?? []) {
        for (const lineEdge of edge.node.lines.edges) {
          const planId = lineEdge.node.sellingPlanId;
          if (!planId) continue;
          map.set(planId, (map.get(planId) ?? 0) + 1);
        }
      }
    };
    tally(contractsJson.data?.active?.edges, activeCountByPlanId);
    tally(contractsJson.data?.cancelled?.edges, cancelledCountByPlanId);
  } catch {
    // Scope not yet approved — subscriber counts show as 0 until it is.
  }

  const sellingPlanGroups: SellingPlanGroupSummary[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    createdAt: g.createdAt,
    discountPercent: g.discountPercent,
    intervalDays: g.intervalDays,
    productsCount: g.productsCount,
    productTitles: g.productTitles,
    activeSubscribers: g.planIds.reduce(
      (sum, planId) => sum + (activeCountByPlanId.get(planId) ?? 0),
      0,
    ),
    cancelledSubscribers: g.planIds.reduce(
      (sum, planId) => sum + (cancelledCountByPlanId.get(planId) ?? 0),
      0,
    ),
  }));

  const productWithPlanTitles = new Set(
    groups.flatMap((g) => g.productTitles),
  );
  const widgetSetupProductHandle =
    products.find((p) => productWithPlanTitles.has(p.title))?.handle ??
    products[0]?.handle ??
    null;

  return {
    products,
    sellingPlanGroups,
    totalActiveSubscribers,
    currentTier,
    needsUpgrade,
    nextTier,
    showNavSetupBanner,
    showWidgetSetupBanner,
    shop: session.shop,
    apiKey: context.cloudflare.env.SHOPIFY_API_KEY,
    widgetSetupProductHandle,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { billing, admin, session } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_action");

  if (intent === "dismiss_nav_setup") {
    await dismissNavSetup(context.cloudflare.env.DB, session.shop);
    return null;
  }

  if (intent === "dismiss_widget_setup") {
    await dismissWidgetSetup(context.cloudflare.env.DB, session.shop);
    return null;
  }

  if (intent === "create_plan") {
    const { needsUpgrade, currentTier, nextTier } = await getBillingStatus(
      admin,
      billing,
    );
    if (needsUpgrade) {
      return {
        userErrors: [
          {
            field: [],
            message:
              nextTier && nextTier.billingPlanName
                ? `You're over your ${currentTier.label} plan's ${currentTier.maxSubscribers}-subscriber limit. Upgrade to ${nextTier.label} to create more plans.`
                : `You're over the Scale plan's 1,000-subscriber limit. Contact us to discuss an Enterprise plan.`,
          },
        ],
      };
    }

    const productIds = formData.getAll("productIds").map(String);
    const discountPercent = Number(formData.get("discountPercent"));
    const intervalDays = Number(formData.get("intervalDays"));
    const planName =
      String(formData.get("planName") || "").trim() ||
      `Subscribe & Save ${discountPercent}%`;

    if (productIds.length === 0) {
      return {
        userErrors: [
          { field: ["productIds"], message: "Pick at least one product." },
        ],
      };
    }

    const response = await admin.graphql(
      `#graphql
        mutation CreateSellingPlanGroup(
          $input: SellingPlanGroupInput!
          $resources: SellingPlanGroupResourceInput
        ) {
          sellingPlanGroupCreate(input: $input, resources: $resources) {
            sellingPlanGroup { id name }
            userErrors { field message }
          }
        }`,
      {
        variables: {
          input: {
            name: planName,
            merchantCode: `subscribe-save-${discountPercent}-${intervalDays}d-${Date.now()}`,
            options: ["Delivery every"],
            sellingPlansToCreate: [
              {
                name: `Every ${intervalDays} days`,
                category: "SUBSCRIPTION",
                options: [`${intervalDays} days`],
                billingPolicy: {
                  recurring: { interval: "DAY", intervalCount: intervalDays },
                },
                deliveryPolicy: {
                  recurring: { interval: "DAY", intervalCount: intervalDays },
                },
                pricingPolicies: [
                  {
                    fixed: {
                      adjustmentType: "PERCENTAGE",
                      adjustmentValue: { percentage: discountPercent },
                    },
                  },
                ],
              },
            ],
          },
          resources: { productIds },
        },
      },
    );
    const json = await response.json();
    const userErrors = json.data?.sellingPlanGroupCreate?.userErrors ?? [];
    return { userErrors };
  }

  if (intent === "delete_plan") {
    const groupId = String(formData.get("groupId"));
    const response = await admin.graphql(
      `#graphql
        mutation DeleteSellingPlanGroup($id: ID!) {
          sellingPlanGroupDelete(id: $id) {
            deletedSellingPlanGroupId
            userErrors { field message }
          }
        }`,
      { variables: { id: groupId } },
    );
    const json = await response.json();
    const userErrors = json.data?.sellingPlanGroupDelete?.userErrors ?? [];
    return { userErrors };
  }

  return null;
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const modalRef = useRef<any>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const detailModalRef = useRef<any>(null);
  const dismissModalRef = useRef<any>(null);
  const widgetDismissModalRef = useRef<any>(null);
  const [discountPercent, setDiscountPercent] = useState("10");
  const [intervalDays, setIntervalDays] = useState("30");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const isSubmitting = fetcher.state === "submitting";
  const submittingAction = fetcher.formData?.get("_action");
  const selectedGroup = data.sellingPlanGroups.find(
    (g) => g.id === selectedGroupId,
  );

  useEffect(() => {
    if (fetcher.data && "userErrors" in fetcher.data) {
      if (fetcher.data.userErrors.length === 0) {
        shopify.toast.show(
          submittingAction === "delete_plan"
            ? "Subscription plan deleted"
            : "Subscription plan created",
        );
        if (submittingAction === "create_plan") {
          modalRef.current?.hideOverlay();
        }
        if (submittingAction === "delete_plan") {
          detailModalRef.current?.hideOverlay();
          setSelectedGroupId(null);
        }
      } else {
        shopify.toast.show(fetcher.data.userErrors[0].message, {
          isError: true,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Plans">
      <s-button slot="primary-action" command="--show" commandFor="create-plan-modal">
        Create plan
      </s-button>

      {data.showNavSetupBanner && (
        <s-banner tone="info" heading="Let customers find their subscriptions">
          <s-paragraph>
            One-time setup so customers can pause, skip, or cancel their
            own subscriptions. Tap "Open menu settings" below, then:
          </s-paragraph>
          <s-ordered-list>
            <s-list-item>Tap "Customer account main menu"</s-list-item>
            <s-list-item>Tap "Add menu item"</s-list-item>
            <s-list-item>Type any label, like "Subscriptions"</s-list-item>
            <s-list-item>Under link type, choose "Apps"</s-list-item>
            <s-list-item>Pick the option with "Subflow" in the name</s-list-item>
            <s-list-item>Tap "Save"</s-list-item>
          </s-ordered-list>
          <s-stack direction="inline" gap="small">
            <s-button
              variant="primary"
              href={`https://${data.shop}/admin/menus`}
              target="_blank"
            >
              Open menu settings
            </s-button>
            <s-button
              variant="secondary"
              command="--show"
              commandFor="confirm-nav-dismiss-modal"
            >
              I've done this
            </s-button>
          </s-stack>
        </s-banner>
      )}

      <s-modal
        ref={dismissModalRef}
        id="confirm-nav-dismiss-modal"
        heading="Confirm setup is done"
      >
        <s-paragraph>
          This reminder won't show again after you confirm. If the menu
          item wasn't actually added, customers will have no way to reach
          their subscriptions page to pause, skip, or cancel — they'll
          need to contact you directly instead.
        </s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={() => {
            fetcher.submit(
              { _action: "dismiss_nav_setup" },
              { method: "POST" },
            );
            dismissModalRef.current?.hideOverlay();
          }}
        >
          Yes, I've added it
        </s-button>
        <s-button
          slot="secondary-actions"
          command="--hide"
          commandFor="confirm-nav-dismiss-modal"
        >
          Cancel
        </s-button>
      </s-modal>

      {data.showWidgetSetupBanner && (
        <s-banner tone="info" heading="Show the Subscribe & Save option at checkout">
          <s-paragraph>
            One-time setup so customers actually see the subscribe option
            on your product pages. Tap "Open theme editor" below — it opens
            your theme editor on one of your products.
          </s-paragraph>
          <s-ordered-list>
            <s-list-item>
              In the editor, click "Add block" (in the product page section)
            </s-list-item>
            <s-list-item>Choose "Apps", then "Subflow: Subscribe & Save"</s-list-item>
            <s-list-item>Click "Save" in the top right</s-list-item>
          </s-ordered-list>
          <s-stack direction="inline" gap="small">
            <s-button
              variant="primary"
              href={
                data.widgetSetupProductHandle
                  ? `https://${data.shop}/admin/themes/current/editor?previewPath=${encodeURIComponent(`/products/${data.widgetSetupProductHandle}`)}`
                  : `https://${data.shop}/admin/themes/current/editor`
              }
              target="_blank"
            >
              Open theme editor
            </s-button>
            <s-button
              variant="secondary"
              command="--show"
              commandFor="confirm-widget-dismiss-modal"
            >
              I've done this
            </s-button>
          </s-stack>
        </s-banner>
      )}

      <s-modal
        ref={widgetDismissModalRef}
        id="confirm-widget-dismiss-modal"
        heading="Confirm setup is done"
      >
        <s-paragraph>
          This reminder won't show again after you confirm. If the widget
          wasn't actually saved to your theme, customers won't see a
          subscribe option on your products at all — they'll only be able
          to buy one-time.
        </s-paragraph>
        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={() => {
            fetcher.submit(
              { _action: "dismiss_widget_setup" },
              { method: "POST" },
            );
            widgetDismissModalRef.current?.hideOverlay();
          }}
        >
          Yes, I've added it
        </s-button>
        <s-button
          slot="secondary-actions"
          command="--hide"
          commandFor="confirm-widget-dismiss-modal"
        >
          Cancel
        </s-button>
      </s-modal>

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
          <s-link href="/app/billing">
            {data.nextTier?.billingPlanName
              ? `Upgrade to ${data.nextTier.label} — $${data.nextTier.price}/month`
              : "Contact us about an Enterprise plan"}
          </s-link>
        </s-banner>
      )}

      <s-modal ref={modalRef} id="create-plan-modal" heading="Create a subscription plan">
        <s-paragraph>
          Pick a product, set a discount and delivery interval, and Subflow
          will add a "Subscribe & Save" option to it at checkout.
        </s-paragraph>
        <fetcher.Form method="POST" id="create-plan-form" ref={formRef}>
          <input type="hidden" name="_action" value="create_plan" />
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Plan name"
              name="planName"
              placeholder={`Subscribe & Save ${discountPercent}%`}
            />
            <s-box>
              <s-text>Products (select one or more)</s-text>
              <s-stack direction="block" gap="small">
                {data.products.map((p) => (
                  <s-checkbox key={p.id} name="productIds" value={p.id} label={p.title} />
                ))}
              </s-stack>
            </s-box>
            <s-select
              label="Discount"
              name="discountPercent"
              value={discountPercent}
              onChange={(e: any) => setDiscountPercent(e.target.value)}
            >
              <s-option value="5">5%</s-option>
              <s-option value="10">10%</s-option>
              <s-option value="15">15%</s-option>
              <s-option value="20">20%</s-option>
            </s-select>
            <s-select
              label="Delivery every"
              name="intervalDays"
              value={intervalDays}
              onChange={(e: any) => setIntervalDays(e.target.value)}
            >
              <s-option value="7">7 days</s-option>
              <s-option value="14">14 days</s-option>
              <s-option value="30">30 days</s-option>
              <s-option value="60">60 days</s-option>
            </s-select>
          </s-stack>
        </fetcher.Form>
        <s-button
          slot="primary-action"
          variant="primary"
          onClick={() => formRef.current?.requestSubmit()}
          {...(isSubmitting && submittingAction === "create_plan"
            ? { loading: true }
            : {})}
        >
          Create plan
        </s-button>
        <s-button slot="secondary-actions" command="--hide" commandFor="create-plan-modal">
          Cancel
        </s-button>
      </s-modal>

      <s-section heading="Your subscription plans">
        {data.sellingPlanGroups.length === 0 ? (
          <s-paragraph>
            No subscription plans yet — tap "Create plan" above to add your
            first "Subscribe & Save" offer.
          </s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Plan name</s-table-header>
              <s-table-header listSlot="secondary" format="numeric">
                Active subscribers
              </s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.sellingPlanGroups.map((g) => (
                <s-table-row key={g.id} clickDelegate={`plan-link-${g.id}`}>
                  <s-table-cell>
                    <s-link
                      id={`plan-link-${g.id}`}
                      onClick={() => {
                        setSelectedGroupId(g.id);
                        detailModalRef.current?.showOverlay();
                      }}
                    >
                      {g.name}
                    </s-link>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge {...(g.activeSubscribers > 0 ? { tone: "success" } : {})}>
                      {g.activeSubscribers}
                    </s-badge>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-modal
        ref={detailModalRef}
        id="plan-detail-modal"
        heading="Plan details"
      >
        {selectedGroup && (
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="none">
              <s-box paddingBlock="small-100">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-text color="subdued">Name</s-text>
                  <s-text type="strong">{selectedGroup.name}</s-text>
                </s-stack>
              </s-box>
              <s-divider />

              <s-box paddingBlock="small-100">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-text color="subdued">Created</s-text>
                  <s-text type="strong">
                    {new Date(selectedGroup.createdAt).toLocaleDateString()}
                  </s-text>
                </s-stack>
              </s-box>
              <s-divider />

              <s-box paddingBlock="small-100">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-text color="subdued">Discount</s-text>
                  <s-badge tone="success">
                    {selectedGroup.discountPercent !== null
                      ? `${selectedGroup.discountPercent}% off`
                      : "—"}
                  </s-badge>
                </s-stack>
              </s-box>
              <s-divider />

              <s-box paddingBlock="small-100">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-text color="subdued">Delivery every</s-text>
                  <s-text type="strong">
                    {selectedGroup.intervalDays !== null
                      ? `${selectedGroup.intervalDays} days`
                      : "—"}
                  </s-text>
                </s-stack>
              </s-box>
              <s-divider />

              <s-box paddingBlock="small-100">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-text color="subdued">Active subscribers</s-text>
                  <s-badge {...(selectedGroup.activeSubscribers > 0 ? { tone: "success" } : {})}>
                    {selectedGroup.activeSubscribers}
                  </s-badge>
                </s-stack>
              </s-box>
              <s-divider />

              <s-box paddingBlock="small-100">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                  <s-text color="subdued">Cancelled subscribers</s-text>
                  <s-badge {...(selectedGroup.cancelledSubscribers > 0 ? { tone: "critical" } : {})}>
                    {selectedGroup.cancelledSubscribers}
                  </s-badge>
                </s-stack>
              </s-box>
            </s-stack>

            <s-box
              background="subdued"
              padding="base"
              borderRadius="base"
            >
              <s-stack direction="block" gap="small">
                <s-text color="subdued">
                  Products ({selectedGroup.productsCount})
                </s-text>
                <s-stack direction="inline" gap="small-200">
                  {selectedGroup.productTitles.length > 0 ? (
                    selectedGroup.productTitles.map((title) => (
                      <s-badge key={title}>{title}</s-badge>
                    ))
                  ) : (
                    <s-text>—</s-text>
                  )}
                </s-stack>
              </s-stack>
            </s-box>
          </s-stack>
        )}
        {selectedGroup && (
          <s-button
            slot="primary-action"
            variant="primary"
            tone="critical"
            {...(isSubmitting &&
            submittingAction === "delete_plan" &&
            fetcher.formData?.get("groupId") === selectedGroup.id
              ? { loading: true }
              : {})}
            onClick={() =>
              fetcher.submit(
                { _action: "delete_plan", groupId: selectedGroup.id },
                { method: "POST" },
              )
            }
          >
            Delete plan
          </s-button>
        )}
        <s-button slot="secondary-actions" command="--hide" commandFor="plan-detail-modal">
          Close
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
