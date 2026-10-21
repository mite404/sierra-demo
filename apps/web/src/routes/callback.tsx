export function meta() {
  return [{ title: "Signing you in" }];
}

/** Where WorkOS sends visitors back; the provider in root.tsx finishes the sign-in. */
export default function CallbackPage() {
  return <p className="p-4 text-soft-ink">Signing you in…</p>;
}
