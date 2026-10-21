import { App as ComponentGallery } from "@yaklabs/catalog";
import { usePaths } from "../runtime";

/** Browser title for the component lab. */
export function meta() {
  return [{ title: "Component lab" }];
}

/** The catalog's components, grouped like Storybook. */
export default function LabPage() {
  const { hrefTo } = usePaths();
  return <ComponentGallery home={hrefTo("/")} />;
}
