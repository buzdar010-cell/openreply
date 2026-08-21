import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";
import {
  getShopify,
  GROWTH_PLAN,
  SCALE_PLAN,
  PLAN_TIERS,
  tierForSubscriberCount,
  type PlanTier,
} from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

interface ProductOption {
  id: string;
  title: string;
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

async function getBillingStatus(admin: any, billing: any) {
  // read_own_subscription_contracts is a protected scope pending Shopify's
  // approval — until then this query is denied, so fail soft to zero
  // instead of blocking the merchant from using the app.
  let totalActiveSubscribers = 0;
  try {
    const contractsResponse = await admin.graphql(
      `#graphql
        query GetActiveSubscriptionContractCount {
          subscriptionContracts(first: 250, query: "status:active") {
            edges { node { id } }
          }
        }`,
    );
    const contractsJson = await contractsResponse.json();
    totalActiveSubscribers =
      contractsJson.data?.subscriptionContracts?.edges?.length ?? 0;
  } catch {
    // Scope not yet approved — treat as 0 until it is.
  }

  const billingCheck = await billing.check({
    plans: [GROWTH_PLAN, SCALE_PLAN],
    isTest: true, // TODO: flip to false before public launch — dev/test stores reject real charges
  });
  const activeNames = new Set(
    (billingCheck.appSubscriptions ?? []).map((s: any) => s.name),
  );
  let currentTier: PlanTier = PLAN_TIERS[0];
  if (activeNames.has(SCALE_PLAN)) currentTier = PLAN_TIERS[2];
  else if (activeNames.has(GROWTH_PLAN)) currentTier = PLAN_TIERS[1];

  const needsUpgrade = totalActiveSubscribers > currentTier.maxSubscribers;
  const nextTier = needsUpgrade
    ? tierForSubscriberCount(totalActiveSubscribers)
    : null;

  return { totalActiveSubscribers, currentTier, needsUpgrade, nextTier };
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { billing, admin } = await shopify.authenticate.admin(request);

  const { totalActiveSubscribers, currentTier, needsUpgrade, nextTier } =
    await getBillingStatus(admin, billing);

  const productsResponse = await admin.graphql(
    `#graphql
      query GetProducts {
        products(first: 20, sortKey: TITLE) {
          edges {
            node { id title }
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

  return {
    products,
    sellingPlanGroups,
    totalActiveSubscribers,
    currentTier,
    needsUpgrade,
    nextTier,
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { billing, admin } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_action");

  if (intent === "upgrade") {
    const plan = String(formData.get("plan"));
    if (plan !== GROWTH_PLAN && plan !== SCALE_PLAN) {
      return { userErrors: [{ field: ["plan"], message: "Invalid plan." }] };
    }

    const requestUrl = new URL(request.url);
    const returnUrl = new URL(`${context.cloudflare.env.SHOPIFY_APP_URL}/app`);
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
    <s-page heading="Subflow">
      <s-button slot="primary-action" command="--show" commandFor="create-plan-modal">
        Create plan
      </s-button>

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
                  { _action: "upgrade", plan: data.nextTier!.billingPlanName! },
                  { method: "POST" },
                )
              }
              {...(isSubmitting && submittingAction === "upgrade"
                ? { loading: true }
                : {})}
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

      <s-section heading="Plan">
        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
          <s-text>
            {data.currentTier.label}
            {data.currentTier.price ? ` — $${data.currentTier.price}/month` : ""}
          </s-text>
          <s-badge {...(data.needsUpgrade ? { tone: "warning" } : {})}>
            {data.totalActiveSubscribers} / {data.currentTier.maxSubscribers}{" "}
            subscribers
          </s-badge>
        </s-stack>
      </s-section>

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
