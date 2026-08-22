import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getShopify } from "../shopify.server";

async function getAdminForRequest(shopify: ReturnType<typeof getShopify>, request: Request) {
  const { sessionToken, cors } = await shopify.authenticate.public.customerAccount(request);
  const dest = sessionToken.dest.includes("://")
    ? sessionToken.dest
    : `https://${sessionToken.dest}`;
  const shop = new URL(dest).hostname;
  const customerId = sessionToken.sub;
  const { admin } = await shopify.unauthenticated.admin(shop);
  return { admin, customerId, cors };
}

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { admin, customerId, cors } = await getAdminForRequest(shopify, request);

  const response = await admin.graphql(
    `#graphql
      query GetCustomerSubscriptions($customerId: ID!) {
        customer(id: $customerId) {
          subscriptionContracts(first: 20) {
            edges {
              node {
                id
                status
                lines(first: 5) {
                  edges { node { title } }
                }
              }
            }
          }
        }
      }`,
    { variables: { customerId } },
  );
  const json = await response.json();
  const contracts =
    json.data?.customer?.subscriptionContracts?.edges?.map((e: any) => ({
      id: e.node.id,
      status: e.node.status,
      productNames: e.node.lines.edges.map((le: any) => le.node.title),
    })) ?? [];

  return cors(new Response(JSON.stringify({ contracts }), {
    headers: { "Content-Type": "application/json" },
  }));
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const shopify = getShopify(context.cloudflare.env);
  const { admin, customerId, cors } = await getAdminForRequest(shopify, request);

  const formData = await request.formData();
  const intent = String(formData.get("intent"));
  const contractId = String(formData.get("contractId"));

  const json = (body: unknown) =>
    cors(new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    }));

  // Always verify the contract actually belongs to the authenticated customer
  // before mutating it — the client sends contractId, which could be tampered with.
  const ownerCheck = await admin.graphql(
    `#graphql
      query CheckSubscriptionContractOwner($id: ID!) {
        subscriptionContract(id: $id) {
          customer { id }
        }
      }`,
    { variables: { id: contractId } },
  );
  const ownerJson = await ownerCheck.json();
  const ownerId = ownerJson.data?.subscriptionContract?.customer?.id;
  if (!ownerId || ownerId !== customerId) {
    return json({ error: "Not authorized to manage this subscription." });
  }

  if (intent === "pause") {
    const res = await admin.graphql(
      `#graphql
        mutation PauseSubscriptionContract($id: ID!) {
          subscriptionContractPause(subscriptionContractId: $id, actor: CUSTOMER) {
            contract { id status }
            userErrors { field message }
          }
        }`,
      { variables: { id: contractId } },
    );
    const data = await res.json();
    return json({
      status: data.data?.subscriptionContractPause?.contract?.status,
      userErrors: data.data?.subscriptionContractPause?.userErrors ?? [],
    });
  }

  if (intent === "resume") {
    const res = await admin.graphql(
      `#graphql
        mutation ActivateSubscriptionContract($id: ID!) {
          subscriptionContractActivate(subscriptionContractId: $id, actor: CUSTOMER) {
            contract { id status }
            userErrors { field message }
          }
        }`,
      { variables: { id: contractId } },
    );
    const data = await res.json();
    return json({
      status: data.data?.subscriptionContractActivate?.contract?.status,
      userErrors: data.data?.subscriptionContractActivate?.userErrors ?? [],
    });
  }

  if (intent === "cancel") {
    const res = await admin.graphql(
      `#graphql
        mutation CancelSubscriptionContract($id: ID!) {
          subscriptionContractCancel(subscriptionContractId: $id, actor: CUSTOMER) {
            contract { id status }
            userErrors { field message }
          }
        }`,
      { variables: { id: contractId } },
    );
    const data = await res.json();
    return json({
      status: data.data?.subscriptionContractCancel?.contract?.status,
      userErrors: data.data?.subscriptionContractCancel?.userErrors ?? [],
    });
  }

  if (intent === "skip") {
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const cyclesRes = await admin.graphql(
      `#graphql
        query NextBillingCycle($contractId: ID!, $startDate: DateTime!, $endDate: DateTime!) {
          subscriptionBillingCycles(
            contractId: $contractId
            first: 1
            sortKey: CYCLE_INDEX
            billingCyclesDateRangeSelector: { startDate: $startDate, endDate: $endDate }
          ) {
            edges { node { cycleIndex skipped } }
          }
        }`,
      { variables: { contractId, startDate, endDate } },
    );
    const cyclesJson = await cyclesRes.json();
    const nextCycle = cyclesJson.data?.subscriptionBillingCycles?.edges?.[0]?.node;
    if (!nextCycle) {
      return json({
        userErrors: [{ field: [], message: "Couldn't find an upcoming delivery to skip." }],
      });
    }

    const res = await admin.graphql(
      `#graphql
        mutation SkipBillingCycle($contractId: ID!, $index: Int!) {
          subscriptionBillingCycleScheduleEdit(
            billingCycleInput: { contractId: $contractId, selector: { index: $index } }
            input: { skip: true, reason: BUYER_INITIATED }
          ) {
            billingCycle { cycleIndex skipped }
            userErrors { field message }
          }
        }`,
      { variables: { contractId, index: nextCycle.cycleIndex } },
    );
    const data = await res.json();
    return json({
      skipped: data.data?.subscriptionBillingCycleScheduleEdit?.billingCycle?.skipped,
      userErrors: data.data?.subscriptionBillingCycleScheduleEdit?.userErrors ?? [],
    });
  }

  return json({ error: "Unknown action." });
};
