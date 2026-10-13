const functions = require("firebase-functions");
const cors = require("cors")({ origin: true });
const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.secureAIProxy = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Sirf POST request allow karni hai
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST requests allowed" });
    }

    const { provider, endpoint, payload } = req.body;

    try {
      // 1. GEMINI KA LOGIC
      if (provider === "gemini") {
        const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);
        const model = genAI.getGenerativeModel(payload.modelConfig);
        const chat = model.startChat({ history: payload.history });
        const result = await chat.sendMessage(payload.messageParts);
        
        return res.status(200).json({ text: result.response.text() });
      } 
      
      // 2. BAAKI SABHI APIS KA LOGIC (Groq, Mistral, OpenRouter, GitHub)
      else {
        let apiKey = "";
        if (provider === "github") apiKey = process.env.VITE_GITHUB_TOKEN;
        else if (provider === "mistral") apiKey = process.env.VITE_MISTRAL_API_KEY;
        else if (provider === "groq") apiKey = process.env.VITE_GROQ_API_KEY;
        else if (provider === "openrouter") apiKey = process.env.VITE_OPENROUTER_API_KEY;

        const headers = {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        };

        // OpenRouter ki extra requirements
        if (provider === "openrouter") {
          headers["HTTP-Referer"] = "https://aivoxpro.co.in";
          headers["X-Title"] = "Aivox Pro";
        }

        // Backend se API call karna
        const response = await fetch(endpoint, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload.body)
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error?.message || `API failed with status ${response.status}`);
        }

        return res.status(200).json(data);
      }
    } catch (error) {
      console.error("Backend Proxy Error:", error.message);
      return res.status(500).json({ error: error.message });
    }
  });
});