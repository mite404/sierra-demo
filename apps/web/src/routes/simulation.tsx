import { SimulationLab } from "../components/simulation-lab";

/** Demo document metadata, without a product-affiliation claim. */
export function meta() {
  return [{ title: "Sierra Agent QA Lab | Independent educational demo" }];
}

/** The standalone lesson does not mount the inherited workspace lifecycle. */
export default function Simulation() {
  return <SimulationLab />;
}
