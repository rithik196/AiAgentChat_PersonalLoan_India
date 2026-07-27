/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini Client safely
let aiClient: GoogleGenAI | null = null;
const API_KEY = process.env.GEMINI_API_KEY;

if (API_KEY && API_KEY !== "MY_GEMINI_API_KEY" && API_KEY.trim() !== "") {
  try {
    aiClient = new GoogleGenAI({
      apiKey: API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini client successfully initialized server-side.");
  } catch (err) {
    console.error("Failed to initialize Gemini client on start:", err);
  }
} else {
  console.log("Starting server with high-quality simulated conversational fallback. Configure GEMINI_API_KEY in secrets for live AI.");
}

// 1. API: Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", aiEnabled: !!aiClient });
});

// 2. API: Assistant Chat Route
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, userProfile } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Missing or invalid 'messages' field." });
      return;
    }

    // High-quality backup assistant script if API key is not configured yet
    if (!aiClient) {
      const responseText = getSimulatedRayaReply(messages, userProfile);
      res.json({ text: responseText, simulated: true });
      return;
    }

    // Map client messages to Gemini API Structure (translating roles to 'user' & 'model')
    const geminiContents = messages.map((msg: any) => {
      const role = msg.sender === 'user' ? 'user' : 'model';
      return {
        role: role,
        parts: [{ text: msg.text }]
      };
    });

    const userProfileText = userProfile 
      ? `\nClient Profile context: Phone: ${userProfile.countryCode} ${userProfile.mobileNumber}, Preference: ${userProfile.financeType || 'Undecided'}, Amount Requested: SAR ${userProfile.amount.toLocaleString()} for ${userProfile.tenure} months.`
      : '';

    const systemInstruction = `You are RAYA, a premium, human-centric, highly professional conversational AI Digital Finance Assistant for a leading Shariah-compliant and Conventional banking institution in Saudi Arabia.
Your goal is to guide the customer through exploring or applying for a Personal Cash Finance product.
Keep your replies clean, warm, friendly, scannable, short to medium length (no longer than 3 paragraphs), and highly professional. Never be robotic.
Always address the user with honor, respect, and clear structure.

Key Product Facts:
- Min Salary: SAR 5,000 for Saudis, SAR 8,000 for Expats.
- Age: 18 - 60 years.
- Min Service: 1 month for Saudis, 3 months for Expats.
- Offers both:
  1. Shariah-Compliant Islamic Finance (contracts based on Murabaha or Tawarruq, approved by the Shariah Board, offering a fixed profit rate).
  2. Conventional Cash Finance.
- APR / Profit rates: Start from 3.25% fixed per annum (subject to client credit check).
- Max Tenure: Up to 60 months (5 years).
- Documents required: National ID / Iqama, Salary Certificate, and standard 3-month Bank Statement.

Conversational Guidance:
- If they ask about eligibility, guide them through the criteria.
- If they ask about Islamic or Conventional banking, explain that Shariah-compliant finance acts on Tawarruq/Murabaha where the bank trades commodities to generate cash for them cleanly with no interest, which is highly trusted in Riyadh and across KSA.
- Be encouraging but professional. Always maintain a premium advisor presence.
- Highlight that they can submit their final request anytime.${userProfileText}`;

    // Query Gemini
    const response = await aiClient.models.generateContent({
      model: "gemini-3.5-flash",
      contents: geminiContents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.75,
      }
    });

    const outputText = response.text || "I apologize, I processed your inquiry but could not construct a response text. How may I assist you further?";
    res.json({ text: outputText, simulated: false });

  } catch (error: any) {
    console.error("Gemini server error:", error);
    res.status(500).json({ 
      error: "Internal assistant error. Defaulting to fallback systems.", 
      details: error.message 
    });
  }
});

// Helper: Simulated Raya Dialog Flow if Gemini is offline/disabled
function getSimulatedRayaReply(messages: any[], userProfile: any): string {
  const lastUserMessage = messages[messages.length - 1]?.text?.toLowerCase() || '';

  // If user profile is provided, make responses profile-aware
  const pAmount = userProfile?.amount ? userProfile.amount : 150000;
  const pTenure = userProfile?.tenure ? userProfile.tenure : 36;
  const pType = userProfile?.financeType ? userProfile.financeType : 'Islamic Shariah';

  // Greeting
  if (messages.length <= 2) {
    return `Welcome indeed! I have successfully secured your session using your registered mobile number.

To deliver customized loan rates, could you tell me a little bit about what amount you are looking for, or if you prefer **Shariah-Compliant (Islamic) Finance** or **Conventional Finance** products? 

*(Tip: You can use the interactive calculator widget below to estimate details in real-time!)*`;
  }

  // Common keywords matching for simulated intelligence
  if (lastUserMessage.includes('shariah') || lastUserMessage.includes('islamic') || lastUserMessage.includes('halal') || lastUserMessage.includes('tawarruq') || lastUserMessage.includes('murabaha')) {
    return `Excellent choice. Our Shariah-compliant Islamic finance products are fully approved by an independent Shariah board. 

We structure this utilizing a **Tawarruq** (commodity trading) transaction. Instead of a standard interest-bearing loan, the bank buys high-liquidity commodities on your behalf and sells them to you at a transparent cost-plus-profit price on installments, generating clean, immediate cash for you.

Would you like to calculate your rates or proceed with eligibility?`;
  }

  if (lastUserMessage.includes('conventional') || lastUserMessage.includes('regular') || lastUserMessage.includes('interest')) {
    return `Understood. We offer Conventional Personal Finance at competitive, fixed flat rates starting from **3.25% p.a.**

This option is highly direct and provides customizable payment plans of up to 5 years (60 months) with flexible grace periods. 

Which finance amount or repayment tenure would suit your plans?`;
  }

  if (lastUserMessage.includes('eligibility') || lastUserMessage.includes('eligible') || lastUserMessage.includes('salary') || lastUserMessage.includes('income')) {
    return `To be fully eligible for our Cash Finance products, you need to meet these basic criteria:
    
1. **Minimum Salary:** SAR 5,000 per month (SAR 8,000 for non-Saudi expats).
2. **Age:** Between 18 and 60 years old at maturity.
3. **Service Tenure:** Minimum of 1 month in active employment (3 months for expats).

Does your current employment match these standard requirements? If so, we are ready to move forward!`;
  }

  if (lastUserMessage.includes('document') || lastUserMessage.includes('checklist') || lastUserMessage.includes('require')) {
    return `Applying for our finance product is documentation-lite! Since we are doing a fully digital journey, you will only need:
    
• **National ID card** (for Saudis) or **Iqama card** (for expats).
• **Certified Salary Certificate** showing net income, allowances, and joining date.
• **3-Month Active Bank Statement** reflecting salary credits.

Would you like to review credit estimation details or proceed directly to document submission?`;
  }

  if (lastUserMessage.includes('apply') || lastUserMessage.includes('submit') || lastUserMessage.includes('calculate') || lastUserMessage.includes('sar')) {
    return `Thank you for sharing your request details! I have captured your desire for **SAR ${pAmount.toLocaleString()}** over a **${pTenure}-month** period using beautiful **${pType}-Compliant** structure.

At our special promotional rate of **3.25%**, this corresponds to:
• **Monthly installment:** ~SAR ${Math.round((pAmount * 1.097) / pTenure).toLocaleString()}
• **Total Profit charge:** SAR ${Math.round(pAmount * 0.0325 * (pTenure/12)).toLocaleString()}
• **Status:** Highly Eligible for pre-approval!

Shall I prepare your instant digital offer letter for you?`;
  }

  // Friendly default catch-all prompt
  return `Thank you for choosing RAYA as your personal banking advisor. 

I can assist you with:
• Custom profit-rate & installment calculations.
• Detail checklists of documents.
• Verifying the difference between Shariah Tawarruq and Conventional loans.
• Launching your official application review.

What information can I clear up for you next?`;
}

// 3. Vite Middleware integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev server middleware mounted in Express.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Serving static production assets from /dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`RAYA Digital Assistant server booted on http://localhost:${PORT}`);
  });
}

startServer();
