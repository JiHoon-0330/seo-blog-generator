import { getStatus } from "~/lib/status.server";

export function loader() {
  return Response.json(getStatus());
}
