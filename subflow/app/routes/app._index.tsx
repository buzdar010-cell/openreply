import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useState } from "react";
import { authenticate, MONTHLY_PLAN } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

interface ProductOption {
  id: string;
  title: string;
}

interface SellingPlanGroupSummary {
  id: string;
  name: string;
  sellingPlansCount: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, admin } = await authenticate.admin(request);

  const billingCheck = await billing.check({
    plans: [MONTHLY_PLAN],
    isTest: process.env.NODE_ENV !== "production",
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
              sellingPlans(first: 5) {
                edges { node { id } }
              }
            }
          }
        }
      }`,
  );
  const groupsJson = await groupsResponse.json();
  const sellingPlanGroups: SellingPlanGroupSummary[] =
    groupsJson.data?.sellingPlanGroups.edges.map((e: any) => ({
      id: e.node.id,
      name: e.node.name,
      sellingPlansCount: e.node.sellingPlans.edges.length,
    })) ?? [];

  return { subscribed: true, products, sellingPlanGroups };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("_action");

  if (intent === "subscribe") {
    await billing.request({
      plan: MONTHLY_PLAN,
      isTest: process.env.NODE_ENV !== "production",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app`,
    });
    return null;
  }

  if (intent === "create_plan") {
    const productId = String(formData.get("productId"));
    const discountPercent = Number(formData.get("discountPercent"));
    const intervalDays = Number(formData.get("intervalDays"));

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
          resources: { productIds: [productId] },
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
            <s-select label="Product" name="productId">
              {data.products.map((p) => (
                <s-option key={p.id} value={p.id}>
                  {p.title}
                </s-option>
              ))}
            </s-select>
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
                  {g.name} — {g.sellingPlansCount} plan(s)
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
