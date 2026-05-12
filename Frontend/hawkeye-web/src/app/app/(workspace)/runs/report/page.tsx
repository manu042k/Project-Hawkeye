"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function Redirect() {
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const id = searchParams.get("id");
    router.replace(id ? `/app/artifacts/${id}` : "/app/artifacts");
  }, [searchParams, router]);
  return null;
}

export default function RunReportPage() {
  return <Suspense><Redirect /></Suspense>;
}
