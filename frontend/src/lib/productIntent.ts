export type ProductId = "cash_finance" | "home_loan" | "personal_loan";

export interface ProductIntentResult {
  product?: ProductId;
  answer: string;
  shouldRoute: boolean;
}

function normalizeIntent(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function detectProduct(value: string): ProductId | undefined {
  if (
    value.includes("cash finance") ||
    value.includes("cash loan") ||
    value.includes("personal cash") ||
    value.includes("personal finance") ||
    value.includes("start cash") ||
    value === "cash"
  ) {
    return "cash_finance";
  }

  if (
    value.includes("home finance") ||
    value.includes("home loan") ||
    value.includes("house finance") ||
    value.includes("property finance") ||
    value.includes("mortgage")
  ) {
    return "home_loan";
  }

  if (
    value.includes("vehicle finance") ||
    value.includes("vehicle loan") ||
    value.includes("car finance") ||
    value.includes("car loan") ||
    value.includes("auto finance")
  ) {
    return "personal_loan";
  }

  return undefined;
}

function detectExplicitJourneyStart(value: string): ProductId | undefined {
  const product = detectProduct(value);
  if (!product) return undefined;

  const explicitJourneyPhrases = [
    "go with",
    "start",
    "begin",
    "open",
    "proceed with",
    "take me to",
    "launch",
    "lets do",
    "let us do",
    "i want to start",
    "i want to go with",
    "move to",
  ];

  const mentionsJourney = explicitJourneyPhrases.some((phrase) => value.includes(phrase));
  const mentionsJourneyWord = value.includes("journey") || value.includes("apply");

  return mentionsJourney || mentionsJourneyWord ? product : undefined;
}

function productInfo(product: ProductId): string {
  switch (product) {
    case "cash_finance":
      return "Cash Finance is for personal cash needs, like handling expenses or emergencies. If you want, I can also walk you through how the journey works.";
    case "home_loan":
      return "Home Finance is for property-related funding, like buying or supporting a home. I can explain the journey in simple terms if you'd like.";
    case "personal_loan":
      return "Vehicle Finance is for vehicle-related funding with flexible repayment options. I can tell you more or help you start whenever you are ready.";
    default:
      return "I can help you choose a finance journey. You can say Cash Finance, Home Finance, or Vehicle Finance.";
  }
}

function isQuestionLike(value: string): boolean {
  return (
    value.includes("what") ||
    value.includes("why") ||
    value.includes("how") ||
    value.includes("when") ||
    value.includes("where") ||
    value.includes("which") ||
    value.includes("who") ||
    value.includes("tell me") ||
    value.includes("explain") ||
    value.includes("difference") ||
    value.includes("compare") ||
    value.includes("help")
  );
}

export function resolveProductIntent(text: string): ProductIntentResult {
  const value = normalizeIntent(text);

  if (!value) {
    return {
      answer: "Please choose a finance type or ask me what each option means.",
      shouldRoute: false,
    };
  }

  if (
    value.includes("difference") ||
    value.includes("compare") ||
    value.includes("between") ||
    value.includes("which one") ||
    value.includes("explain")
  ) {
    return {
      answer:
        "Sure. Cash Finance is for personal cash needs, Home Finance is for property-related support, and Vehicle Finance is for vehicle financing. Tell me which one you want to hear more about.",
      shouldRoute: false,
    };
  }

  const product = detectProduct(value);
  if (product) {
    return {
      product,
      answer:
        product === "cash_finance"
          ? "Great, opening Cash Finance for you."
          : product === "home_loan"
            ? "Great, opening Home Finance for you."
            : "Great, opening Vehicle Finance for you.",
      shouldRoute: true,
    };
  }

  return {
    answer:
      "I can help you choose a finance journey. You can say Cash Finance, Home Finance, or Vehicle Finance. You can also ask what the difference is.",
    shouldRoute: false,
  };
}

export function resolveLandingVoiceIntent(text: string): ProductIntentResult {
  const value = normalizeIntent(text);

  if (!value) {
    return {
      answer: "Please ask me about Cash Finance, Home Finance, or Vehicle Finance, or tell me which journey you want to start.",
      shouldRoute: false,
    };
  }

  if (
    value.includes("difference") ||
    value.includes("compare") ||
    value.includes("between") ||
    value.includes("which one") ||
    value.includes("explain")
  ) {
    return {
      answer:
        "Sure. Cash Finance is for personal cash needs, Home Finance is for property-related needs, and Vehicle Finance is for vehicle-related funding. Tell me which one you would like to explore.",
      shouldRoute: false,
    };
  }

  const explicitProduct = detectExplicitJourneyStart(value);
  if (explicitProduct) {
    const routeLabel =
      explicitProduct === "cash_finance"
        ? "Cash Finance"
        : explicitProduct === "home_loan"
          ? "Home Finance"
          : "Vehicle Finance";
    return {
      product: explicitProduct,
      answer: `Great, I am opening ${routeLabel} for you.`,
      shouldRoute: true,
    };
  }

  const product = detectProduct(value);
  if (product) {
    return {
      product,
      answer: productInfo(product),
      shouldRoute: false,
    };
  }

  if (isQuestionLike(value)) {
    return {
      answer:
        "Of course. Ask me about Cash Finance, Home Finance, or Vehicle Finance, and I’ll explain it in a simple way before we start anything.",
      shouldRoute: false,
    };
  }

  return {
    answer:
      "I can help you understand the finance options or begin one when you're ready. Just ask me about Cash Finance, Home Finance, or Vehicle Finance.",
    shouldRoute: false,
  };
}
