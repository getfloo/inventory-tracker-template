"use client";

import { useEffect, useRef } from "react";
import { SwaggerUIBundle } from "swagger-ui-dist";
import "swagger-ui-dist/swagger-ui.css";
import type { openApiDocument } from "@/lib/openapi";

// swagger-ui-dist is Swagger UI prebuilt with its dependencies. swagger-ui-react
// hands its OpenAPI 3.1 resolver to Next's bundler, which breaks it.
export function Reference({ document }: { document: ReturnType<typeof openApiDocument> }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    SwaggerUIBundle({ spec: document, domNode: container.current });
  }, [document]);
  return <div ref={container} />;
}
