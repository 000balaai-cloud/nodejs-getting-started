const express = require("express");
const axios = require("axios");
console.log("TOKEN LENGTH:", process.env.WHATSAPP_TOKEN?.length);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =========================
   SESSION STORAGE
========================= */
let sessions = {};

/* =========================
   AXIOS CONFIG (VERY IMPORTANT)
========================= */
const axiosConfig = {
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`
  }
};

/* =========================
   VERIFY WEBHOOK (META)
========================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* =========================
   RECEIVE MESSAGES
========================= */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text =
      message.text?.body ||
      message.interactive?.button_reply?.id ||
      "";

    console.log("📩 Incoming:", text);

    if (!sessions[from]) {
      sessions[from] = { step: "MENU" };
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    const s = sessions[from];

    /* =========================
       BACK BUTTON
    ========================= */
    if (text === "BACK") {
      s.step = "MENU";
      await sendMainMenu(from);
      return res.sendStatus(200);
    }

    /* =========================
       FLOW LOGIC
    ========================= */
    switch (s.step) {
      case "MENU":
        if (text === "ORDER") {
          s.step = "PRODUCT";
          await sendProductMenu(from);
        }
        break;

      case "PRODUCT":
        s.product = text;
        s.step = "QTY";
        await sendQuantityMenu(from, text);
        break;

      case "QTY":
        s.quantity = text;
        s.step = "CONFIRM";
        await sendConfirmation(from, s);
        break;

      case "CONFIRM":
        await sendText(
          from,
          "✅ *Thank you for ordering from Bala Milk Dairy!* 🥛\n\nOur team will contact you shortly."
        );
        delete sessions[from];
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook Error:", err.response?.data || err.message);
    res.sendStatus(200);
  }
});

/* =========================
   SEND MAIN MENU
========================= */
async function sendMainMenu(to) {
  await axios.post(
    process.env.WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "🥛 *Welcome to Bala Milk Dairy*\n\nPlease choose an option:"
        },
        action: {
          buttons: [
            {
              type: "reply",
              reply: { id: "ORDER", title: "🛒 Place Order" }
            }
          ]
        }
      }
    },
    axiosConfig
  );
}

/* =========================
   PRODUCT MENU
========================= */
async function sendProductMenu(to) {
  await axios.post(
    process.env.WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: "🧾 *Select Product*"
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "Buffalo Milk ₹100/L", title: "Buffalo Milk" } },
            { type: "reply", reply: { id: "Cow Milk ₹120/L", title: "Cow Milk" } },
            { type: "reply", reply: { id: "BACK", title: "⬅️ Back" } }
          ]
        }
      }
    },
    axiosConfig
  );
}

/* =========================
   QUANTITY MENU
========================= */
async function sendQuantityMenu(to, product) {
  await axios.post(
    process.env.WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text: `📦 *${product}*\n\nChoose quantity:`
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "1L", title: "1 Litre" } },
            { type: "reply", reply: { id: "2L", title: "2 Litres" } },
            { type: "reply", reply: { id: "BACK", title: "⬅️ Back" } }
          ]
        }
      }
    },
    axiosConfig
  );
}

/* =========================
   CONFIRMATION
========================= */
async function sendConfirmation(to, s) {
  await axios.post(
    process.env.WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text:
            `🧾 *Order Summary*\n\n` +
            `Product: ${s.product}\n` +
            `Quantity: ${s.quantity}\n\n` +
            `Confirm order?`
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "CONFIRM", title: "✅ Confirm" } },
            { type: "reply", reply: { id: "BACK", title: "⬅️ Back" } }
          ]
        }
      }
    },
    axiosConfig
  );
}

/* =========================
   SIMPLE TEXT MESSAGE
========================= */
async function sendText(to, text) {
  await axios.post(
    process.env.WHATSAPP_API_URL,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    },
    axiosConfig
  );
}

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
