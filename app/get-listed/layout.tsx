import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get listed — Assay",
  description:
    "Add a new Robinhood Chain launchpad to Assay's tracked set, or submit a correction to an existing entry. Reviewed by a human before anything goes public.",
};

export default function GetListedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
