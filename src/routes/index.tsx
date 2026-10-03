import { createFileRoute } from "@tanstack/react-router";
import { Comparison } from "@/comparison/Comparison";
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Free Skin Consultation for Lines and Dull Skin in Karur | Sanjay Rithik Hospital" },
    { name: "description", content: "Want to look fresh and still look like yourself? Free consultation with Dr. S. Kiruthika at Sanjay Rithik Hospital, Karur, about lines, dull skin or skin that feels less firm. Understand what may help and what it may cost before you decide." },
    { property: "og:title", content: "Look Fresh and Still Like Yourself · Skin Doctor in Karur" },
    { property: "og:description", content: "Want to look fresh and still look like yourself? Talk to a skin doctor in Karur and understand what may help before you decide." },
  ] }),
  component: Comparison,
});
