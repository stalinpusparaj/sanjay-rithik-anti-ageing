import { createFileRoute } from "@tanstack/react-router";
import { Comparison } from "@/comparison/Comparison";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Natural Anti-Ageing Consultation in Karur | Sanjay Rithik Hospital" },
    { name: "description", content: "Look refreshed, not overdone. Free doctor-led anti-ageing consultation with Dr. S. Kiruthika at Sanjay Rithik Hospital, Karur. Understand your options first." },
    { property: "og:title", content: "Dermatology Care in Karur | Sanjay Rithik Hospital" },
    { property: "og:description", content: "Want to look refreshed, not overdone? Meet a dermatologist in Karur and understand realistic anti-ageing options first." },
  ] }),
  component: Comparison,
});
