import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  alt = "Hawkeye",
  priority,
}: {
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <Image
        src="/colored-logo.png"
        alt={alt}
        width={40}
        height={40}
        priority={priority}
        className="block h-auto w-full dark:hidden"
      />
      <Image
        src="/transparent-logo.png"
        alt={alt}
        width={40}
        height={40}
        priority={priority}
        className="hidden h-auto w-full dark:block"
      />
    </span>
  );
}

