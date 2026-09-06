export type ThemeCompatibility =
  | { status: "compatible"; sectionId: string | null }
  | { status: "incompatible" }
  | { status: "unknown" };

// Any admin GraphQL client with a .graphql() method shaped like the one
// returned by shopify.authenticate.admin() / shopify.unauthenticated.admin().
interface AdminGraphqlClient {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

/**
 * Reads the live theme's default product.json template to determine whether
 * it's an Online Store 2.0 theme (required for app blocks to work at all)
 * and, if so, finds the main product-info section id so the widget can be
 * targeted there instead of appended to the bottom of the page.
 *
 * A missing templates/product.json means a legacy pre-2.0 theme (e.g.
 * Debut) — those can never support app blocks, confirmed via direct testing.
 */
export async function checkThemeCompatibility(admin: AdminGraphqlClient): Promise<ThemeCompatibility> {
  try {
    const themeResponse = await admin.graphql(
      `#graphql
        query GetMainThemeProductTemplate {
          themes(first: 1, roles: [MAIN]) {
            nodes {
              files(filenames: ["templates/product.json"]) {
                nodes {
                  body {
                    ... on OnlineStoreThemeFileBodyText {
                      content
                    }
                    ... on OnlineStoreThemeFileBodyBase64 {
                      contentBase64
                    }
                  }
                }
              }
            }
          }
        }`,
    );
    const themeJson: any = await themeResponse.json();
    const body = themeJson.data?.themes?.nodes?.[0]?.files?.nodes?.[0]?.body;
    const fileContent: string | null =
      body?.content ?? (body?.contentBase64 ? atob(body.contentBase64) : null);

    if (!fileContent) {
      return { status: "incompatible" };
    }

    const jsonText = fileContent.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "");
    const template = JSON.parse(jsonText);
    const order: string[] = template.order ?? [];
    const sections = template.sections ?? {};
    const excludeKeywords = ["recommend", "related", "complementary", "header", "footer", "announcement"];
    const sectionId =
      order.find((id) => {
        const type = String(sections[id]?.type ?? "").toLowerCase();
        return type.includes("product") && !excludeKeywords.some((kw) => type.includes(kw));
      }) ?? null;

    return { status: "compatible", sectionId };
  } catch (err) {
    console.error("checkThemeCompatibility failed", err);
    return { status: "unknown" };
  }
}
