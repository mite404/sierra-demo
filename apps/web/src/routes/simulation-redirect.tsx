import { redirect } from "react-router";

/** Old application links lead to the lesson, never the inherited canvas. */
export function clientLoader() {
  return redirect("/");
}
