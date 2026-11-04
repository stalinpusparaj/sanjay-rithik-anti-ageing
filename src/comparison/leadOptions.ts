/** Choices shared by the lead forms, so every form offers the same concerns. */
export const CONCERN_OPTIONS = [
  "Fine lines",
  "Wrinkles",
  "Loss of firmness",
  "Dullness",
  "Pigmentation",
  "Dark circles",
  "Texture / pores",
  "Loss of facial volume",
  "Overall ageing",
  "Acne",
  "Scars",
  "Hair loss",
  "Sensitive skin",
  "Something else",
  "I'm not sure",
];

export const TIME_OPTIONS = ["Morning (10 am–2:30 pm)", "Evening (6–9:30 pm)"];

/** Indian mobile, with or without +91, ignoring spaces and dashes. */
export const isIndianMobile = (phone: string) => /^(?:91)?[6-9]\d{9}$/.test(phone.replace(/[\s()+-]/g, ""));
