import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";
import { getShopify, MONTHLY_PLAN } from "../shopify.server";
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

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { billing, admin } = await shopify.authenticate.admin(request);

  const billingCheck = await billing.check({
    plans: [MONTHLY_PLAN],
    isTest: true, // TODO: flip to false before public launch — dev/test stores reject real charges
  });

  if (!billingCheck.hasActivePayment) {
    return { subscribed: false, products: [], sellingPlanGroups: [] };
  }

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

  return { subscribed: true, products, sellingPlanGroups };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { billing, admin } = await shopify.authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_action");

  if (intent === "subscribe") {
    const requestUrl = new URL(request.url);
    const returnUrl = new URL(`${context.cloudflare.env.SHOPIFY_APP_URL}/app`);
    const shop = requestUrl.searchParams.get("shop");
    const host = requestUrl.searchParams.get("host");
    if (shop) returnUrl.searchParams.set("shop", shop);
    if (host) returnUrl.searchParams.set("host", host);

    await billing.request({
      plan: MONTHLY_PLAN,
      isTest: true, // TODO: flip to false before public launch — dev/test stores reject real charges
      returnUrl: returnUrl.toString(),
    });
    return null;
  }

  if (intent === "create_plan") {
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
  const selectedGroup = data.subscribed
    ? data.sellingPlanGroups.find((g) => g.id === selectedGroupId)
    : undefined;

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

  if (!data.subscribed) {
    return (
      <s-page heading="Subflow">
        <s-section heading="Start your 7-day free trial">
          <s-paragraph>
            Subflow lets you add "Subscribe & Save" options to your
            products in a few clicks — customers get a recurring discount,
            you get predictable repeat revenue. $9.99/month after your free
            trial, cancel anytime.
          </s-paragraph>
          <s-button
            variant="primary"
            onClick={() =>
              fetcher.submit({ _action: "subscribe" }, { method: "POST" })
            }
            {...(isSubmitting ? { loading: true } : {})}
          >
            Start free trial
          </s-button>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Subflow">
      <s-button slot="primary-action" command="--show" commandFor="create-plan-modal">
        Create plan
      </s-button>

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
        heading={selectedGroup?.name ?? "Plan details"}
      >
        {selectedGroup && (
          <s-stack direction="block" gap="base">
            <s-text>
              Created:{" "}
              {new Date(selectedGroup.createdAt).toLocaleDateString()}
            </s-text>
            <s-text>
              Discount:{" "}
              {selectedGroup.discountPercent !== null
                ? `${selectedGroup.discountPercent}%`
                : "—"}
            </s-text>
            <s-text>
              Delivery every:{" "}
              {selectedGroup.intervalDays !== null
                ? `${selectedGroup.intervalDays} days`
                : "—"}
            </s-text>
            <s-text>
              Products ({selectedGroup.productsCount}):{" "}
              {selectedGroup.productTitles.join(", ") || "—"}
            </s-text>
            <s-text>Active subscribers: {selectedGroup.activeSubscribers}</s-text>
            <s-text>
              Cancelled subscribers: {selectedGroup.cancelledSubscribers}
            </s-text>
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
