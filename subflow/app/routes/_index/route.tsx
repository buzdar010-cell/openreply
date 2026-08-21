import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Subflow</h1>
        <p className={styles.text}>
          Turn any product into a "Subscribe & Save" offer in a few clicks —
          give customers a recurring discount, and turn one-time buyers into
          predictable repeat revenue.
        </p>
        <Form className={styles.form} method="post" action="/auth/login">
          <label className={styles.label}>
            <span>Shop domain</span>
            <input className={styles.input} type="text" name="shop" />
            <span>e.g: my-shop-domain.myshopify.com</span>
          </label>
          <button className={styles.button} type="submit">
            Log in
          </button>
        </Form>
        <ul className={styles.list}>
          <li>
            <strong>Pick a product, set a discount.</strong> Choose a
            discount (5-20%) and a delivery interval (7-60 days) — no theme
            changes required.
          </li>
          <li>
            <strong>Simple, flat pricing.</strong> $9.99/month after a 7-day
            free trial. No per-subscriber fees, no hidden charges.
          </li>
        </ul>
      </div>
    </div>
  );
}
