import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { getShopify, MONTHLY_PLAN } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

interface ProductOption {
  id: string;
  title: string;
}

interface SellingPlanGroupSummary {
  id: string;
  name: string;
  sellingPlansCount: number;
  activeSubscribers: number;
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
              sellingPlans(first: 10) {
                edges { node { id } }
              }
            }
          }
        }
      }`,
  );
  const groupsJson = await groupsResponse.json();
  const groups: Array<{ id: string; name: string; planIds: string[] }> =
    groupsJson.data?.sellingPlanGroups.edges.map((e: any) => ({
      id: e.node.id,
      name: e.node.name,
      planIds: e.node.sellingPlans.edges.map((se: any) => se.node.id),
    })) ?? [];

  // read_own_subscription_contracts is a protected scope pending Shopify's
  // approval — until then this query is denied, so fail soft to zero counts
  // instead of taking down the whole dashboard.
  const subscriberCountByPlanId = new Map<string, number>();
  try {
    const contractsResponse = await admin.graphql(
      `#graphql
        query GetActiveSubscriptionContracts {
          subscriptionContracts(first: 250, query: "status:active") {
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
    for (const edge of contractsJson.data?.subscriptionContracts?.edges ?? []) {
      for (const lineEdge of edge.node.lines.edges) {
        const planId = lineEdge.node.sellingPlanId;
        if (!planId) continue;
        subscriberCountByPlanId.set(
          planId,
          (subscriberCountByPlanId.get(planId) ?? 0) + 1,
        );
      }
    }
  } catch {
    // Scope not yet approved — subscriber counts show as 0 until it is.
  }

  const sellingPlanGroups: SellingPlanGroupSummary[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    sellingPlansCount: g.planIds.length,
    activeSubscribers: g.planIds.reduce(
      (sum, planId) => sum + (subscriberCountByPlanId.get(planId) ?? 0),
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
            name: `Subscribe & Save ${discountPercent}%`,
            merchantCode: `subscribe-save-${discountPercent}-${intervalDays}d`,
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
  const [discountPercent, setDiscountPercent] = useState("10");
  const [intervalDays, setIntervalDays] = useState("30");

  const isSubmitting = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data && "userErrors" in fetcher.data) {
      if (fetcher.data.userErrors.length === 0) {
        shopify.toast.show(
          fetcher.formData?.get("_action") === "delete_plan"
            ? "Subscription plan deleted"
            : "Subscription plan created",
        );
      } else {
        shopify.toast.show(fetcher.data.userErrors[0].message, {
          isError: true,
        });
      }
    }
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
      <s-section heading="Create a subscription plan">
        <s-paragraph>
          Pick a product, set a discount and delivery interval, and Subflow
          will add a "Subscribe & Save" option to it at checkout.
        </s-paragraph>
        <fetcher.Form method="POST">
          <input type="hidden" name="_action" value="create_plan" />
          <s-stack direction="block" gap="base">
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
            <s-button
              variant="primary"
              type="submit"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Create plan
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Your subscription plans">
        {data.sellingPlanGroups.length === 0 ? (
          <s-paragraph>No subscription plans created yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {data.sellingPlanGroups.map((g) => (
              <s-stack
                key={g.id}
                direction="inline"
                gap="base"
                alignItems="center"
              >
                <s-text>
                  {g.name} — {g.sellingPlansCount} plan(s) —{" "}
                  {g.activeSubscribers} active subscriber
                  {g.activeSubscribers === 1 ? "" : "s"}
                </s-text>
                <s-button
                  variant="tertiary"
                  tone="critical"
                  onClick={() =>
                    fetcher.submit(
                      { _action: "delete_plan", groupId: g.id },
                      { method: "POST" },
                    )
                  }
                >
                  Delete
                </s-button>
              </s-stack>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
