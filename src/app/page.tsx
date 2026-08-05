import WorkbenchApp from "@/App";
import { isSklandFeatureEnabled } from "@/deployment";

export default function Page() {
  return <WorkbenchApp sklandEnabled={isSklandFeatureEnabled()} />;
}
