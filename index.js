const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ================== CONFIG ==================
const VERIFY_TOKEN = "my_verify_token"; // same token in Meta webhook
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// ================== SESSION STORE ==================
let sessions = {};

// ================== WEBHOOK VERIFY ==================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ================== WEBHOOK RECEIVE ==================
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from; // phone number
    const text = message.text?.body?.trim().toLowerCase();
    const name = value?.contacts?.[0]?.profile?.name || "";

    if (!sessions[from]) {
      sessions[from] = { step: "MENU", name };
    }

    const s = sessions[from];
    let reply = "";

    // BACK option
    if (text === "0") {
      s.step = "MENU";
    }

    switch (s.step) {

      // ============== MENU ==============
      case "MENU":
        reply =
`🥛 *Welcome to Bala Milk Dairy*

Please choose an option:
1️⃣ Buffalo Milk – ₹100/L
2️⃣ Cow Milk – ₹120/L
3️⃣ Paneer – ₹600/Kg
4️⃣ Ghee – ₹1000/Kg
5️⃣ Daily Milk Subscription
6️⃣ Enquiry Only

Reply with option number.`;
        s.step = "PRODUCT";
        break;

      // ============== PRODUCT ==============
      case "PRODUCT":
        if (text === "6") {
          reply = "✍️ Please type your enquiry.\n\n0️⃣ Back";
          s.step = "ENQUIRY";
          break;
        }

        const products = {
          "1": "Buffalo Milk – ₹100/L",
          "2": "Cow Milk – ₹120/L",
          "3": "Paneer – ₹600/Kg",
          "4": "Ghee – ₹1000/Kg",
          "5": "Daily Milk Subscription"
        };

        if (!products[text]) {
          reply = "❌ Invalid option.\n\n0️⃣ Back";
          break;
        }

        s.product = products[text];
        reply =
`🧾 *${products[text]}*

Thank you for selecting.
Our team will process your order shortly.

🙏`;
        delete sessions[from]; // END FLOW
        break;

      // ============== ENQUIRY ==============
      case "ENQUIRY":
        reply =
`🙏 Thank you for contacting *Bala Milk Dairy*.

We have received your enquiry and will get back to you shortly.`;
        delete sessions[from];
        break;
    }

    await sendMessage(from, reply);
    res.sendStatus(200);

  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

// ================== SEND MESSAGE ==================
async function sendMessage(to, body) {
  await axios.post(
    WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ================== SERVER ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
