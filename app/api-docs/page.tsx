import { operations } from "@/app/api/operations";
import { getIdentity } from "@/lib/identity";
import { openApiDocument } from "@/lib/openapi";
import { Reference } from "./reference";

export const dynamic = "force-dynamic";

export default async function ApiDocs() {
  await getIdentity();
  return <Reference document={openApiDocument(operations)} />;
}
